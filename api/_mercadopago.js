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

export function getMercadoPagoClient() {
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!accessToken) throw new Error("MERCADO_PAGO_ACCESS_TOKEN não configurado");
  return new MercadoPagoConfig({ accessToken });
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

