import process from "node:process";
import admin from "firebase-admin";

if (!admin.apps.length) {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (serviceAccountJson) {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(serviceAccountJson)) });
  }
}

function sanitize(value) {
  if (value === undefined || value === null) return value;
  if (Array.isArray(value)) return value.map(sanitize).filter((item) => item !== undefined);
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && typeof item !== "function").map(([key, item]) => [key, sanitize(item)]));
  }
  return value;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido" });
  if (!admin.apps.length) return res.status(500).json({ error: "Firebase Admin não inicializado" });

  const { eventPin, entry, adminEmail } = req.body || {};
  if (!eventPin || !entry?.email || !adminEmail) return res.status(400).json({ error: "Dados da inscrição incompletos" });

  try {
    const db = admin.firestore();
    const userDoc = await db.collection("users").doc(adminEmail.toLowerCase().trim()).get();
    const isAdmin = (userDoc.exists && userDoc.data()?.isAdmin === true) || adminEmail.toLowerCase().trim() === "celsomramalho@gmail.com";
    if (!isAdmin) return res.status(403).json({ error: "Acesso negado: usuário não é administrador" });

    await db.collection("events").doc(eventPin).collection("entries").doc(entry.email.toLowerCase().trim()).set(sanitize(entry));
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Erro ao salvar inscrição:", error);
    return res.status(500).json({ error: `Erro interno: ${error.message}` });
  }
}
