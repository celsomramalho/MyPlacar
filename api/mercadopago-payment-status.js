import { Payment } from "mercadopago";
import {
  getMercadoPagoClient,
  initFirebaseAdmin,
  mapMercadoPagoStatus,
  parseExternalReference,
  sanitize,
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

  try {
    const { paymentId, eventPin, email } = req.query || {};
    if (!paymentId || !eventPin || !email) {
      return res.status(400).json({ error: "paymentId, eventPin e email são obrigatórios" });
    }

    const client = getMercadoPagoClient();
    const payment = await new Payment(client).get({ id: paymentId });

    if (!payment || !payment.id) {
      return res.status(404).json({ error: "Pagamento não encontrado" });
    }

    const { paymentStatus } = mapMercadoPagoStatus(payment.status);

    // Se aprovado, atualiza o Firestore
    if (payment.status === "approved") {
      try {
        const db = initFirebaseAdmin();
        const rawPin = String(eventPin).trim();
        const cleanEmail = String(email).toLowerCase().trim();

        let eventRef = db.collection("events").doc(rawPin);
        let eventSnap = await eventRef.get();
        if (!eventSnap.exists) {
          const q = await db.collection("events").where("pin", "==", rawPin).limit(1).get();
          if (!q.empty) { eventRef = q.docs[0].ref; eventSnap = q.docs[0]; }
        }

        if (eventSnap.exists) {
          let entryRef = eventRef.collection("entries").doc(cleanEmail);
          let entrySnap = await entryRef.get();
          if (!entrySnap.exists) {
            const eq = await eventRef.collection("entries").where("email", "==", cleanEmail).limit(1).get();
            if (!eq.empty) { entryRef = eq.docs[0].ref; entrySnap = eq.docs[0]; }
          }
          if (entrySnap.exists) {
            const entry = entrySnap.data();
            const txAmount = Number(payment.transaction_amount || 0);
            const existing = Array.isArray(entry.payments) ? entry.payments : [];
            const alreadyRecorded = existing.some((p) => String(p.providerPaymentId) === String(payment.id));

            const updates = {
              paymentStatus: "Confirmado",
              paidAmount: (Number(entry.paidAmount ?? 0) + (alreadyRecorded ? 0 : txAmount)) || txAmount,
              mercadoPagoCheckout: {
                ...(entry.mercadoPagoCheckout || {}),
                status: "approved",
                updatedAt: Date.now(),
              },
            };

            if (!alreadyRecorded && txAmount > 0) {
              updates.payments = [
                ...existing,
                sanitize({
                  id: `mp-${payment.id}`,
                  amount: txAmount,
                  date: Date.now(),
                  provider: "mercadopago",
                  providerPaymentId: String(payment.id),
                  receiptFileName: `Pix Mercado Pago #${payment.id}`,
                }),
              ];
            }

            await entryRef.set(sanitize(updates), { merge: true });
          }
        }
      } catch (dbErr) {
        console.warn("Erro ao atualizar Firestore no polling:", dbErr?.message);
      }
    }

    return res.status(200).json({
      paymentId: String(payment.id),
      status: payment.status || "pending",
      paymentStatus,
    });
  } catch (error) {
    console.error("Erro ao consultar pagamento MP:", error?.message);
    const status = typeof error?.status === "number" ? error.status : 500;
    return res.status(status).json({ error: error?.message || "Erro ao consultar pagamento" });
  }
}
