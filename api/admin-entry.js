import process from "node:process";
import admin from "firebase-admin";

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

function sanitize(value) {
  if (value === undefined || value === null) return value;
  if (Array.isArray(value)) return value.map(sanitize).filter((item) => item !== undefined);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined && typeof item !== "function")
        .map(([key, item]) => [key, sanitize(item)])
    );
  }
  return value;
}

/**
 * Valida se o usuário tem privilégios de administrador global ou do evento
 */
async function checkAdminAuthorization(db, adminEmail, eventPin) {
  const cleanAdminEmail = (adminEmail || "").toLowerCase().trim();
  if (!cleanAdminEmail) return false;

  const userDoc = await db.collection("users").doc(cleanAdminEmail).get();
  const isGlobalAdmin = (userDoc.exists && userDoc.data()?.isAdmin === true) || cleanAdminEmail === "celsomramalho@gmail.com";
  if (isGlobalAdmin) return true;

  if (eventPin) {
    const eventDoc = await db.collection("events").doc(eventPin).get();
    if (eventDoc.exists) {
      const eventData = eventDoc.data();
      const userPin = userDoc.exists && userDoc.data()?.pin ? String(userDoc.data().pin).toUpperCase().trim() : "";
      const coAdminPins = (eventData?.coAdminPins || []).map((p) => String(p).toUpperCase().trim());
      if (userPin && coAdminPins.includes(userPin) && eventData?.active === true) {
        return true;
      }
    }
  }

  return false;
}

/**
 * POST /api/admin-entry
 *
 * Endpoint unificado para gerenciar inscrições no painel admin (economiza slots serverless do Vercel Hobby):
 * - action === 'save' | default (quando tem entry): salva a inscrição
 * - action === 'delete': exclui a inscrição da subcoleção, histórico e duplas
 * - action === 'fix-ids': detecta e renumera IDs duplicados
 */
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido" });
  if (!admin.apps.length) return res.status(500).json({ error: "Firebase Admin não inicializado" });

  const body = req.body || {};
  const { action, eventPin, adminEmail } = body;

  if (!eventPin || !adminEmail) {
    return res.status(400).json({ error: "eventPin e adminEmail são obrigatórios" });
  }

  try {
    const db = admin.firestore();
    const isAuthorized = await checkAdminAuthorization(db, adminEmail, eventPin);
    if (!isAuthorized) {
      return res.status(403).json({ error: "Acesso negado: usuário não é administrador deste evento" });
    }

    // ───────────────────────────────────────────────
    // 1. ACTION: DELETE
    // ───────────────────────────────────────────────
    if (action === "delete" || (!action && body.entryEmail && !body.entry)) {
      const { entryEmail, entryPin } = body;
      if (!entryEmail && !entryPin) {
        return res.status(400).json({ error: "entryEmail ou entryPin obrigatório para exclusão" });
      }

      const cleanEmail = entryEmail ? entryEmail.toLowerCase().trim() : null;
      const cleanPin = entryPin ? entryPin.toUpperCase().trim() : null;
      const entriesRef = db.collection("events").doc(eventPin).collection("entries");
      const docsToDelete = new Set();

      if (cleanEmail) docsToDelete.add(cleanEmail);
      if (cleanPin) docsToDelete.add(cleanPin);

      if (cleanEmail) {
        const snapByEmail = await entriesRef.where("email", "==", cleanEmail).get();
        snapByEmail.forEach((d) => docsToDelete.add(d.id));
      }
      if (cleanPin) {
        const snapByPin = await entriesRef.where("pin", "==", cleanPin).get();
        snapByPin.forEach((d) => docsToDelete.add(d.id));
      }

      const batch = db.batch();
      for (const docId of docsToDelete) {
        batch.delete(entriesRef.doc(docId));
      }

      if (cleanEmail) {
        const userRegRef = db.collection("user_registrations").doc(cleanEmail).collection("events").doc(eventPin);
        batch.delete(userRegRef);
      }

      await batch.commit();

      // Limpa duplas em event.pairs se o participante excluído estiver escalado
      try {
        const eventDocRef = db.collection("events").doc(eventPin);
        const eventSnap = await eventDocRef.get();
        if (eventSnap.exists) {
          const currentPairs = eventSnap.data()?.pairs;
          if (Array.isArray(currentPairs) && currentPairs.length > 0) {
            const updatedPairs = currentPairs.filter((p) => {
              const p1Pin = p.p1?.pin?.toUpperCase().trim();
              const p2Pin = p.p2?.pin?.toUpperCase().trim();
              const p1Email = p.p1?.email?.toLowerCase().trim();
              const p2Email = p.p2?.email?.toLowerCase().trim();

              if (cleanPin && (p1Pin === cleanPin || p2Pin === cleanPin)) return false;
              if (cleanEmail && (p1Email === cleanEmail || p2Email === cleanEmail)) return false;
              return true;
            });

            if (updatedPairs.length !== currentPairs.length) {
              await eventDocRef.update({ pairs: updatedPairs });
            }
          }
        }
      } catch (pairErr) {
        console.warn("Aviso ao limpar pairs após exclusão:", pairErr);
      }

      return res.status(200).json({ success: true, deletedDocs: Array.from(docsToDelete) });
    }

    // ───────────────────────────────────────────────
    // 2. ACTION: FIX-IDS
    // ───────────────────────────────────────────────
    if (action === "fix-ids") {
      const snap = await db.collection("events").doc(eventPin).collection("entries").get();
      if (snap.empty) return res.status(200).json({ message: "Nenhuma entry encontrada", fixes: [] });

      const entries = snap.docs.map((d) => ({ _docId: d.id, ...d.data() }));
      const sorted = [...entries].sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));

      const idCount = {};
      for (const e of sorted) {
        const id = Number(e.registrationId);
        if (!isNaN(id) && id > 0) {
          idCount[id] = (idCount[id] || 0) + 1;
        }
      }

      const safeIds = new Set(Object.keys(idCount).filter((k) => idCount[k] === 1).map(Number));
      const maxSafeId = safeIds.size > 0 ? Math.max(...safeIds) : 0;
      let nextSeq = maxSafeId + 1;
      const getNextAvailableId = () => {
        while (safeIds.has(nextSeq)) nextSeq++;
        safeIds.add(nextSeq);
        return nextSeq++;
      };

      const fixes = [];
      const batch = db.batch();

      for (const entry of sorted) {
        const id = Number(entry.registrationId);
        const isDuplicate = idCount[id] > 1;
        const isMissing = isNaN(id) || id <= 0;

        if (isMissing || isDuplicate) {
          if (isDuplicate) {
            idCount[id]--;
            if (idCount[id] >= 1) {
              const newId = getNextAvailableId();
              const ref = db.collection("events").doc(eventPin).collection("entries").doc(entry._docId);
              batch.update(ref, { registrationId: newId });
              fixes.push({
                email: entry._docId,
                name: entry.name || entry.nickname || entry._docId,
                oldId: entry.registrationId,
                newId,
              });
            }
          } else {
            const newId = getNextAvailableId();
            const ref = db.collection("events").doc(eventPin).collection("entries").doc(entry._docId);
            batch.update(ref, { registrationId: newId });
            fixes.push({
              email: entry._docId,
              name: entry.name || entry.nickname || entry._docId,
              oldId: entry.registrationId ?? null,
              newId,
            });
          }
        }
      }

      if (fixes.length > 0) {
        await batch.commit();
      }

      return res.status(200).json({
        message: fixes.length > 0 ? `${fixes.length} inscrição(ões) corrigida(s)` : "Nenhuma correção necessária",
        fixes,
      });
    }

    // ───────────────────────────────────────────────
    // 3. ACTION: SAVE (default)
    // ───────────────────────────────────────────────
    const { entry } = body;
    if (!entry || !entry.email) {
      return res.status(400).json({ error: "Dados da inscrição incompletos para salvamento" });
    }

    await db
      .collection("events")
      .doc(eventPin)
      .collection("entries")
      .doc(entry.email.toLowerCase().trim())
      .set(sanitize(entry));

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Erro na rota /api/admin-entry:", error);
    return res.status(500).json({ error: `Erro interno: ${error.message}` });
  }
}
