import crypto from "node:crypto";
import { getBaseUrl, getMercadoPagoAppCredentials } from "./_mercadopago.js";

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
    const adminEmail = String(req.query.adminEmail || "").toLowerCase().trim();
    if (!adminEmail) {
      return res.status(400).json({ error: "Parâmetro 'adminEmail' é obrigatório" });
    }

    const { clientId, clientSecret } = getMercadoPagoAppCredentials();
    if (!clientId || !clientSecret) {
      return res.status(500).json({
        error: "Credenciais do App Mercado Pago não configuradas. Configure MERCADO_PAGO_APP_CLIENT_ID e MERCADO_PAGO_APP_CLIENT_SECRET.",
      });
    }

    const baseUrl = getBaseUrl(req);
    const redirectUri = `${baseUrl}/api/mercadopago-oauth-callback`;

    // Gera state assinado com HMAC contendo o email e timestamp
    const timestamp = Date.now();
    const payload = `${adminEmail}:${timestamp}`;
    const signature = crypto.createHmac("sha256", clientSecret).update(payload).digest("hex");
    const state = Buffer.from(JSON.stringify({ email: adminEmail, ts: timestamp, sig: signature })).toString("base64url");

    const authUrl = `https://auth.mercadopago.com/authorization?client_id=${encodeURIComponent(
      clientId,
    )}&response_type=code&platform_id=mp&state=${encodeURIComponent(state)}&redirect_uri=${encodeURIComponent(
      redirectUri,
    )}`;

    if (req.headers.accept?.includes("application/json") || req.query.format === "json") {
      return res.status(200).json({ url: authUrl, redirectUri });
    }

    return res.redirect(302, authUrl);
  } catch (err) {
    console.error("Erro ao gerar URL de autorização OAuth:", err);
    return res.status(500).json({ error: "Erro interno ao iniciar autorização", details: err.message });
  }
}
