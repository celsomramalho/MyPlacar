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

const isAdminEventNotif = (comm) => {
  const nType = (comm.notificationType || "").toLowerCase();
  const title = (comm.title || "").toLowerCase();
  const content = (comm.content || "").toLowerCase();

  return (
    nType === "event_registration_created" ||
    nType === "event_payment_created" ||
    nType === "registration_deleted" ||
    nType === "match_delete_request" ||
    title.includes("nova inscrição no evento") ||
    title.includes("novo pagamento no evento") ||
    title.includes("exclusão de inscrição") ||
    title.includes("remoção de partida") ||
    content.includes("realizou inscrição no evento") ||
    content.includes("registrou um pagamento de") ||
    content.includes("teve a inscrição cancelada")
  );
};

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

    // Agrupar por chave de duplicidade com distinção segura
    const groups = new Map();

    for (const comm of autoEventDocs) {
      let key;
      if (isAdminEventNotif(comm)) {
        // Notificações administrativas de evento (enviadas a admin e co-admins)
        // Agrupa cópias irmãs com o mesmo evento e ação/conteúdo
        const regId = comm.registrationId || "";
        const payId = comm.paymentId || "";
        key = `ADMIN|||${comm.eventPin || ""}|||${(comm.title || "").trim()}|||${(comm.content || "").trim()}|||${regId}|||${payId}`;
      } else {
        // Notificações pessoais do atleta (ex: Inscrição Recebida, Inscrição Confirmada, etc.)
        // O destinatário (targetUserId/PIN/Email) DEVE fazer parte da chave!
        // Assim, NUNCA apagamos avisos de atletas diferentes.
        const recipient = (comm.targetUserId || comm.targetUserPin || comm.targetUserEmail || "").trim().toUpperCase();
        key = `USER|||${comm.eventPin || ""}|||${recipient}|||${(comm.title || "").trim()}|||${(comm.content || "").trim()}`;
      }

      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(comm);
    }

    const duplicateGroups = [...groups.values()].filter(g => g.length > 1);

    const report = [];
    let totalToDelete = 0;
    let totalDeleted = 0;
    let totalErrors = 0;

    for (const group of duplicateGroups) {
      const isGroupAdminNotif = isAdminEventNotif(group[0]);

      let keep;
      let toDelete = [];

      if (isGroupAdminNotif) {
        // Para avisos de admin: prefere o documento com targetUserId === 'admin'
        const adminDoc = group.find(d => d.targetUserId === "admin");
        if (adminDoc) {
          keep = adminDoc;
          toDelete = group.filter(d => d.id !== adminDoc.id);
        } else {
          group.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
          keep = group[0];
          toDelete = group.slice(1);
        }

        // Preserva os PINs dos coadmins no documento mantido
        const coAdminPins = Array.from(new Set(
          group
            .map(d => (d.targetUserId || d.targetUserPin || "").trim().toUpperCase())
            .filter(p => p && p !== "ADMIN")
        ));

        if (!isDryRun && coAdminPins.length > 0) {
          try {
            await db.collection("communications").doc(keep.id).set({
              targetUserPins: coAdminPins,
            }, { merge: true });
          } catch (e) {
            console.warn("Erro ao mesclar coAdminPins:", e);
          }
        }
      } else {
        // Para avisos de atleta: mantém o mais antigo e apaga as repetições do mesmo atleta
        group.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        keep = group[0];
        toDelete = group.slice(1);
      }

      totalToDelete += toDelete.length;

      const groupReport = {
        type: isGroupAdminNotif ? "ADMIN_EVENT_NOTIF" : "USER_ATHLETE_NOTIF",
        kept: {
          id: keep.id,
          title: keep.title,
          authorName: keep.authorName,
          targetUserId: keep.targetUserId,
          createdAt: keep.createdAt,
        },
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
      summary: {
        adminEventDuplicateGroups: duplicateGroups.filter(g => isAdminEventNotif(g[0])).length,
        userAthleteDuplicateGroups: duplicateGroups.filter(g => !isAdminEventNotif(g[0])).length,
      },
      report: report.map(r => ({
        type: r.type,
        title: r.kept.title,
        keptId: r.kept.id,
        target: r.kept.targetUserId,
        countToDelete: r.wouldDelete ? r.wouldDelete.length : r.deleted.length,
      })),
    });
  } catch (err) {
    console.error("Cleanup error:", err);
    return res.status(500).json({ error: err.message });
  }
}
