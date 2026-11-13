/**
 * API Route TEMPORÁRIA — Cleanup de avisos duplicados
 * DELETE após uso.
 *
 * Uso: GET /api/cleanup-duplicate-comms?secret=MYPLACAR_CLEANUP_2026
 *      GET /api/cleanup-duplicate-comms?secret=MYPLACAR_CLEANUP_2026&confirm=true  (deleta de verdade)
 */
import process from "node:process";
import admin from "firebase-admin";

const CLEANUP_SECRET = "MYPLACAR_CLEANUP_2026";

if (!admin.apps.length) {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (serviceAccountJson) {
    try {
      admin.initializeApp({ credential: admin.credential.cert(JSON.parse(serviceAccountJson)) });
    } catch (e) {
      console.error("Erro ao inicializar Firebase Admin:", e);
    }
  }
}

const isAutoEvent = (comm) =>
  Boolean(comm.eventPin) ||
  Boolean(comm.notificationType && comm.notificationType !== "pre_registration") ||
  Boolean(comm.paymentId) ||
  (comm.authorId === "system" && Boolean(comm.eventPin));

export default async function handler(req, res) {
  const { secret, confirm } = req.query;

  if (secret !== CLEANUP_SECRET) {
    return res.status(403).json({ error: "Acesso negado." });
  }

  const isDryRun = confirm !== "true";

  try {
    const db = admin.firestore();
    const snapshot = await db.collection("communications").get();
    const allDocs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    const autoEventDocs = allDocs.filter(isAutoEvent);

    // Agrupar por chave de duplicidade
    const groups = new Map();
    for (const comm of autoEventDocs) {
      const regId = comm.registrationId || "";
      const payId = comm.paymentId || "";
      const key = [
        comm.eventPin || "",
        (comm.title || "").trim(),
        (comm.content || "").trim(),
        regId,
        payId,
      ].join("|||");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(comm);
    }

    const duplicateGroups = [...groups.values()].filter(g => g.length > 1);

    const report = [];
    let totalToDelete = 0;
    let totalDeleted = 0;
    let totalErrors = 0;

    for (const group of duplicateGroups) {
      group.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      const [keep, ...toDelete] = group;
      totalToDelete += toDelete.length;

      const groupReport = {
        kept: { id: keep.id, title: keep.title, authorName: keep.authorName, createdAt: keep.createdAt },
        deleted: [],
        errors: [],
      };

      if (!isDryRun) {
        for (const dup of toDelete) {
          try {
            await db.collection("communications").doc(dup.id).delete();
            totalDeleted++;
            groupReport.deleted.push(dup.id);
          } catch (err) {
            totalErrors++;
            groupReport.errors.push({ id: dup.id, error: err.message });
          }
        }
      } else {
        groupReport.wouldDelete = toDelete.map(d => ({
          id: d.id,
          targetUserId: d.targetUserId,
          createdAt: d.createdAt,
        }));
      }

      report.push(groupReport);
    }

    return res.status(200).json({
      dryRun: isDryRun,
      totalDocuments: allDocs.length,
      autoEventDocs: autoEventDocs.length,
      duplicateGroups: duplicateGroups.length,
      totalToDelete,
      totalDeleted: isDryRun ? 0 : totalDeleted,
      totalErrors: isDryRun ? 0 : totalErrors,
      report,
    });
  } catch (err) {
    console.error("Cleanup error:", err);
    return res.status(500).json({ error: err.message });
  }
}
