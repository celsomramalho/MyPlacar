import crypto from "node:crypto";
import {
  getBaseUrl,
  getMercadoPagoAppCredentials,
  initFirebaseAdmin,
} from "./_mercadopago.js";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Método não permitido" });

  const baseUrl = getBaseUrl(req);

  try {
    const { code, state, error: mpError, error_description } = req.query;

    if (mpError) {
      console.warn("Mercado Pago OAuth retornou erro:", { mpError, error_description });
      return res.redirect(302, `${baseUrl}/?mp_error=${encodeURIComponent(error_description || mpError)}`);
    }

    if (!code || !state) {
      return res.status(400).send("Parâmetros 'code' e 'state' são obrigatórios");
    }

    const { clientId, clientSecret } = getMercadoPagoAppCredentials();
    if (!clientId || !clientSecret) {
      return res.status(500).send("Credenciais do App Mercado Pago não configuradas no servidor.");
    }

    // Decodifica e valida state
    let stateData = null;
    try {
      const decoded = Buffer.from(String(state), "base64url").toString("utf-8");
      stateData = JSON.parse(decoded);
    } catch (parseErr) {
      console.error("Falha ao decodificar state:", parseErr);
      return res.status(400).send("State inválido ou corrompido");
    }

    const { email: adminEmail, ts, sig } = stateData || {};
    if (!adminEmail || !ts || !sig) {
      return res.status(400).send("State incompleto");
    }

    // Valida integridade do HMAC
    const payload = `${adminEmail}:${ts}`;
    const expectedSig = crypto.createHmac("sha256", clientSecret).update(payload).digest("hex");
    if (sig !== expectedSig) {
      return res.status(403).send("Assinatura de segurança do state inválida");
    }

    // Troca authorization_code por credenciais
    const redirectUri = `${baseUrl}/api/mercadopago-oauth-callback`;
    const tokenParams = new URLSearchParams({
      client_secret: clientSecret,
      client_id: clientId,
      grant_type: "authorization_code",
      code: String(code),
      redirect_uri: redirectUri,
    });

    const tokenResponse = await fetch("https://api.mercadopago.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenParams.toString(),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error("Erro na troca de token do Mercado Pago:", tokenData);
      const errMsg = tokenData.message || tokenData.error || "Falha ao obter token Mercado Pago";
      return res.redirect(302, `${baseUrl}/?mp_error=${encodeURIComponent(errMsg)}`);
    }

    const cleanEmail = adminEmail.toLowerCase().trim();
    const db = initFirebaseAdmin();
    const expiresAt = Date.now() + (tokenData.expires_in || 15552000) * 1000;

    await db.collection("users").doc(cleanEmail).set(
      {
        mercadoPagoAccessToken: tokenData.access_token,
        mercadoPagoRefreshToken: tokenData.refresh_token || null,
        mercadoPagoUserId: String(tokenData.user_id || ""),
        mercadoPagoPublicKey: tokenData.public_key || null,
        mercadoPagoConnectedAt: Date.now(),
        mercadoPagoTokenExpiresAt: expiresAt,
      },
      { merge: true },
    );

    console.log(`[OAuth] Conta Mercado Pago conectada com sucesso para ${cleanEmail} (MP User ID: ${tokenData.user_id})`);

    return res.redirect(302, `${baseUrl}/?mp_connected=1&email=${encodeURIComponent(cleanEmail)}`);
  } catch (err) {
    console.error("Exceção no callback OAuth:", err);
    return res.redirect(302, `${baseUrl}/?mp_error=${encodeURIComponent(err.message)}`);
  }
}
