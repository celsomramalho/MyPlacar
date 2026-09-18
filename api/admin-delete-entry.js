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

/**
 * POST /api/admin-delete-entry
 *
 * Exclui com privilégios de administrador uma inscrição de um evento:
 * - Remove da subcoleção /events/{eventPin}/entries/{entryEmail}
 * - Remove de /user_registrations/{entryEmail}/events/{eventPin}
 * - Remove o participante de duplas formadas em event.pairs se houver
 */
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido" });
  if (!admin.apps.length) return res.status(500).json({ error: "Firebase Admin não inicializado" });

  const { eventPin, entryEmail, entryPin, adminEmail } = req.body || {};
  if (!eventPin || (!entryEmail && !entryPin) || !adminEmail) {
    return res.status(400).json({ error: "Dados para exclusão incompletos" });
  }

  try {
    const db = admin.firestore();
    const cleanAdminEmail = adminEmail.toLowerCase().trim();

    // Validação de admin
    const userDoc = await db.collection("users").doc(cleanAdminEmail).get();
    const isGlobalAdmin = (userDoc.exists && userDoc.data()?.isAdmin === true) || cleanAdminEmail === "celsomramalho@gmail.com";

    // Checa se é co-admin do evento caso não seja admin global
    let isAuthorized = isGlobalAdmin;
    if (!isAuthorized) {
      const eventDoc = await db.collection("events").doc(eventPin).get();
      if (eventDoc.exists) {
        const eventData = eventDoc.data();
        const userPin = userDoc.exists && userDoc.data()?.pin ? String(userDoc.data().pin).toUpperCase().trim() : "";
        const coAdminPins = ((eventData?.coAdminPins) || []).map(p => String(p).toUpperCase().trim());
        if (userPin && coAdminPins.includes(userPin) && eventData?.active === true) {
          isAuthorized = true;
        }
      }
    }

    if (!isAuthorized) {
      return res.status(403).json({ error: "Acesso negado: usuário não é administrador deste evento" });
    }

    const cleanEmail = entryEmail ? entryEmail.toLowerCase().trim() : null;
    const cleanPin = entryPin ? entryPin.toUpperCase().trim() : null;

    // 1. Excluir da subcoleção /events/{eventPin}/entries
    const entriesRef = db.collection("events").doc(eventPin).collection("entries");
    const docsToDelete = new Set();

    if (cleanEmail) {
      docsToDelete.add(cleanEmail);
    }
    if (cleanPin) {
      docsToDelete.add(cleanPin);
    }

    // Busca também por campos caso o ID do documento seja diferente do e-mail
    if (cleanEmail) {
      const snapByEmail = await entriesRef.where("email", "==", cleanEmail).get();
      snapByEmail.forEach(d => docsToDelete.add(d.id));
    }
    if (cleanPin) {
      const snapByPin = await entriesRef.where("pin", "==", cleanPin).get();
      snapByPin.forEach(d => docsToDelete.add(d.id));
    }

    const batch = db.batch();
    for (const docId of docsToDelete) {
      batch.delete(entriesRef.doc(docId));
    }

    // 2. Excluir de /user_registrations/{cleanEmail}/events/{eventPin}
    if (cleanEmail) {
      const userRegRef = db.collection("user_registrations").doc(cleanEmail).collection("events").doc(eventPin);
      batch.delete(userRegRef);
    }

    await batch.commit();

    // 3. Atualizar pairs no evento se o participante estava em alguma dupla
    try {
      const eventDocRef = db.collection("events").doc(eventPin);
      const eventSnap = await eventDocRef.get();
      if (eventSnap.exists) {
        const currentPairs = eventSnap.data()?.pairs;
        if (Array.isArray(currentPairs) && currentPairs.length > 0) {
          const updatedPairs = currentPairs.filter(p => {
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
      console.warn("Aviso ao limpar pairs após exclusão de inscrição:", pairErr);
    }

    return res.status(200).json({ success: true, deletedDocs: Array.from(docsToDelete) });
  } catch (error) {
    console.error("Erro ao excluir inscrição via Admin API:", error);
    return res.status(500).json({ error: `Erro interno ao excluir inscrição: ${error.message}` });
  }
}
