import process from "node:process";
import admin from "firebase-admin";

if (!admin.apps.length) {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (serviceAccountJson) {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(serviceAccountJson)) });
  }
}

/**
 * POST /api/admin-fix-registration-ids
 *
 * Recebe { eventPin, adminEmail } e:
 * 1. Carrega todas as entries da subcoleção
 * 2. Detecta duplicatas de registrationId
 * 3. Reatribui IDs sequenciais (ordenados por joinedAt) para qualquer entry
 *    que esteja sem ID ou com ID duplicado
 * 4. Salva apenas os documentos que precisaram de correção
 *
 * Retorna a lista de correções aplicadas.
 */
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido" });
  if (!admin.apps.length) return res.status(500).json({ error: "Firebase Admin não inicializado" });

  const { eventPin, adminEmail } = req.body || {};
  if (!eventPin || !adminEmail) return res.status(400).json({ error: "eventPin e adminEmail são obrigatórios" });

  try {
    const db = admin.firestore();

    // Verifica se é admin
    const userDoc = await db.collection("users").doc(adminEmail.toLowerCase().trim()).get();
    const isAdmin =
      (userDoc.exists && userDoc.data()?.isAdmin === true) ||
      adminEmail.toLowerCase().trim() === "celsomramalho@gmail.com";
    if (!isAdmin) return res.status(403).json({ error: "Acesso negado: usuário não é administrador" });

    // Busca todas as entries
    const snap = await db.collection("events").doc(eventPin).collection("entries").get();
    if (snap.empty) return res.status(200).json({ message: "Nenhuma entry encontrada", fixes: [] });

    const entries = snap.docs.map((d) => ({ _docId: d.id, ...d.data() }));

    // Ordena por joinedAt para manter ordem cronológica
    const sorted = [...entries].sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));

    // Detecta IDs existentes e duplicatas
    const idCount = {};
    for (const e of sorted) {
      const id = Number(e.registrationId);
      if (!isNaN(id) && id > 0) {
        idCount[id] = (idCount[id] || 0) + 1;
      }
    }

    // Monta conjunto de IDs "seguros" (aparece exatamente uma vez)
    const safeIds = new Set(Object.keys(idCount).filter((k) => idCount[k] === 1).map(Number));

    // Determina o maior ID seguro para iniciar sequência
    const maxSafeId = safeIds.size > 0 ? Math.max(...safeIds) : 0;

    // Entries que precisam de ID novo: sem ID ou com ID duplicado
    let nextSeq = maxSafeId + 1;
    const getNextAvailableId = () => {
      while (safeIds.has(nextSeq)) {
        nextSeq++;
      }
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
        // Se é duplicata, só corrige a SEGUNDA ocorrência (a primeira fica com o ID original)
        if (isDuplicate) {
          idCount[id]--; // reduz contagem — a próxima ocorrência deste ID também será corrigida
          if (idCount[id] >= 1) {
            // Ainda tem duplicata, corrige esta entry
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
  } catch (error) {
    console.error("Erro ao corrigir registrationIds:", error);
    return res.status(500).json({ error: "Erro interno", details: String(error) });
  }
}
