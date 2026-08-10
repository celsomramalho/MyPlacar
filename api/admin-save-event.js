import process from "node:process";
import admin from "firebase-admin";

// Inicializa o Firebase Admin se ainda não foi inicializado
if (!admin.apps.length) {
  try {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!serviceAccountJson) {
      throw new Error("A variável de ambiente FIREBASE_SERVICE_ACCOUNT não está configurada.");
    }
    const serviceAccount = JSON.parse(serviceAccountJson);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } catch (error) {
    console.error("Erro ao inicializar Firebase Admin:", error);
  }
}

/**
 * Remove campos undefined/função recursivamente para garantir
 * que o objeto seja estritamente serializável pelo Firestore Admin SDK.
 */
function sanitize(value) {
  if (value === undefined || value === null) return value;
  if (Array.isArray(value)) {
    return value.map(sanitize).filter((v) => v !== undefined);
  }
  if (typeof value === "object") {
    const cleaned = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined && typeof v !== "function") {
        cleaned[k] = sanitize(v);
      }
    }
    return cleaned;
  }
  return value;
}

/**
 * API Route: POST /api/admin-save-event
 * Body: { event: TournamentEvent, adminPin: string }
 * Salva um evento no Firestore usando o Firebase Admin SDK (bypassa as regras de segurança).
 * Segurança: valida que adminPin pertence a um usuário isAdmin = true no Firestore.
 */
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido" });

  if (!admin.apps.length) {
    return res.status(500).json({ error: "Firebase Admin não inicializado" });
  }

  const { event, adminEmail } = req.body || {};

  if (!event || !event.pin || !event.name) {
    return res.status(400).json({ error: "Dados do evento inválidos ou incompletos" });
  }

  if (!adminEmail) {
    return res.status(400).json({ error: "adminEmail obrigatório" });
  }

  try {
    const db = admin.firestore();

    // Validar que o usuário é realmente admin no Firestore
    const userDoc = await db.collection("users").doc(adminEmail.toLowerCase().trim()).get();
    const isAdminUser =
      (userDoc.exists && userDoc.data()?.isAdmin === true) ||
      adminEmail.toLowerCase().trim() === "celsomramalho@gmail.com";

    if (!isAdminUser) {
      return res.status(403).json({ error: "Acesso negado: usuário não é administrador" });
    }

    // Remover entries do documento principal (salvo em subcoleção)
    const { entries: _entries, ...eventWithoutEntries } = event;

    const sanitized = sanitize({
      ...eventWithoutEntries,
      createdAt: event.createdAt || Date.now(),
    });

    await db.collection("events").doc(event.pin).set(sanitized, { merge: true });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Erro ao salvar evento:", err);
    return res.status(500).json({ error: `Erro interno: ${err.message}` });
  }
}
