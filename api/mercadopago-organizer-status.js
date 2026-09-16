import { initFirebaseAdmin } from "./_mercadopago.js";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Método não permitido" });

  try {
    const email = String(req.query.email || "").toLowerCase().trim();
    if (!email) {
      return res.status(400).json({ error: "Parâmetro 'email' é obrigatório" });
    }

    const db = initFirebaseAdmin();
    const userSnap = await db.collection("users").doc(email).get();

    if (!userSnap.exists) {
      return res.status(200).json({ connected: false });
    }

    const userData = userSnap.data() || {};
    const hasToken = !!userData.mercadoPagoAccessToken;

    return res.status(200).json({
      connected: hasToken,
      userId: userData.mercadoPagoUserId || null,
      connectedAt: userData.mercadoPagoConnectedAt || null,
      expiresAt: userData.mercadoPagoTokenExpiresAt || null,
    });
  } catch (err) {
    console.error("Erro ao verificar status Mercado Pago do organizador:", err);
    return res.status(500).json({ error: err.message });
  }
}
