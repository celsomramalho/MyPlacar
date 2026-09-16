import crypto from "node:crypto";
import process from "node:process";
import admin from "firebase-admin";

export function initFirebaseAdmin() {
  if (admin.apps.length) return admin.firestore();

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountJson) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT não configurado");
  }

  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(serviceAccountJson)),
  });

  return admin.firestore();
}

export function sanitize(value) {
  if (value === undefined || value === null) return value;
  if (Array.isArray(value)) return value.map(sanitize).filter((item) => item !== undefined);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined && typeof item !== "function")
        .map(([key, item]) => [key, sanitize(item)]),
    );
  }
  return value;
}

export function getBaseUrl(req) {
  const configured = process.env.APP_BASE_URL || process.env.VITE_APP_BASE_URL;
  if (configured) return configured.replace(/\/$/, "");

  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  if (!host) throw new Error("Não foi possível determinar a URL base da aplicação");
  return `${proto}://${host}`.replace(/\/$/, "");
}

import { MercadoPagoConfig } from "mercadopago";

export function getMercadoPagoAppCredentials() {
  const clientId = process.env.MERCADO_PAGO_APP_CLIENT_ID || process.env.MERCADO_PAGO_CLIENT_ID;
  const clientSecret = process.env.MERCADO_PAGO_APP_CLIENT_SECRET || process.env.MERCADO_PAGO_CLIENT_SECRET;
  return { clientId, clientSecret };
}

export function getMercadoPagoClient(customAccessToken) {
  const accessToken = customAccessToken || process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!accessToken) throw new Error("Token de acesso do Mercado Pago não configurado");
  return new MercadoPagoConfig({ accessToken });
}

export async function refreshMercadoPagoToken(refreshToken) {
  const { clientId, clientSecret } = getMercadoPagoAppCredentials();
  if (!clientId || !clientSecret) {
    throw new Error("Credenciais do App Mercado Pago (CLIENT_ID / CLIENT_SECRET) não configuradas");
  }

  const params = new URLSearchParams({
    client_secret: clientSecret,
    client_id: clientId,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const response = await fetch("https://api.mercadopago.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Falha ao renovar token Mercado Pago: ${errText}`);
  }

  return response.json();
}

export async function getOrganizerMercadoPagoToken(db, organizerEmail) {
  if (!db || !organizerEmail) return null;
  const cleanEmail = String(organizerEmail).toLowerCase().trim();
  if (!cleanEmail) return null;

  try {
    const userRef = db.collection("users").doc(cleanEmail);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return null;

    const userData = userSnap.data() || {};
    let accessToken = userData.mercadoPagoAccessToken;
    const refreshToken = userData.mercadoPagoRefreshToken;
    const expiresAt = userData.mercadoPagoTokenExpiresAt;

    if (!accessToken) return null;

    // Se o token estiver prestes a expirar (menos de 2 horas) e tiver refreshToken, renova
    const now = Date.now();
    const twoHours = 2 * 60 * 60 * 1000;
    if (expiresAt && expiresAt - now < twoHours && refreshToken) {
      try {
        console.log(`[OAuth] Renovando token Mercado Pago para ${cleanEmail}...`);
        const tokenData = await refreshMercadoPagoToken(refreshToken);
        accessToken = tokenData.access_token;
        const newExpiresAt = Date.now() + (tokenData.expires_in || 15552000) * 1000;
        await userRef.update({
          mercadoPagoAccessToken: accessToken,
          mercadoPagoRefreshToken: tokenData.refresh_token || refreshToken,
          mercadoPagoUserId: String(tokenData.user_id || userData.mercadoPagoUserId || ""),
          mercadoPagoTokenExpiresAt: newExpiresAt,
          mercadoPagoUpdatedAt: Date.now(),
        });
        console.log(`[OAuth] Token renovado com sucesso para ${cleanEmail}`);
      } catch (refreshErr) {
        console.warn(`[OAuth] Erro ao tentar renovar token MP para ${cleanEmail}, usando token existente:`, refreshErr.message);
      }
    }

    return {
      accessToken,
      userId: userData.mercadoPagoUserId,
    };
  } catch (err) {
    console.error(`[OAuth] Erro ao buscar dados Mercado Pago do organizador ${cleanEmail}:`, err);
    return null;
  }
}

export function getHeader(req, name) {
  const lower = name.toLowerCase();
  return req.headers[lower] || req.headers[name] || "";
}

export function validateMercadoPagoSignature({ xSignature, xRequestId, dataId, secret }) {
  if (!secret) return true;
  if (!xSignature || !dataId) return false;

  const parts = Object.fromEntries(
    String(xSignature)
      .split(",")
      .map((part) => part.trim().split("="))
      .filter(([key, value]) => key && value),
  );
  const ts = parts.ts;
  const received = parts.v1;
  if (!ts || !received) return false;

  let manifest = "";
  if (dataId) manifest += `id:${String(dataId).toLowerCase()};`;
  if (xRequestId) manifest += `request-id:${xRequestId};`;
  manifest += `ts:${ts};`;

  const expected = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(String(received), "hex");
  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

export function mapMercadoPagoStatus(status) {
  if (status === "approved") {
    return { paymentStatus: "Confirmado", checkoutStatus: "approved", shouldRecordPayment: true };
  }
  if (["rejected"].includes(status)) {
    return { paymentStatus: "Recusado", checkoutStatus: "rejected", shouldRecordPayment: false };
  }
  if (["cancelled", "refunded", "charged_back"].includes(status)) {
    return { paymentStatus: "Cancelado", checkoutStatus: status, shouldRecordPayment: false };
  }
  return { paymentStatus: "Pendente", checkoutStatus: "pending", shouldRecordPayment: false };
}

export function parseExternalReference(reference) {
  const [eventPin, ...emailParts] = String(reference || "").split(":");
  const entryEmail = emailParts.join(":");
  if (!eventPin || !entryEmail) return null;
  return {
    eventPin: eventPin.trim(),
    entryEmail: entryEmail.toLowerCase().trim(),
  };
}

