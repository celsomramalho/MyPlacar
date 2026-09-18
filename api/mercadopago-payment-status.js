import { Payment } from "mercadopago";
import {
  getMercadoPagoClient,
  getOrganizerMercadoPagoToken,
  initFirebaseAdmin,
  mapMercadoPagoStatus,
  parseExternalReference,
  sanitize,
} from "./_mercadopago.js";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
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

    const db = initFirebaseAdmin();
    const rawPin = String(eventPin).trim();
    const cleanEmail = String(email).toLowerCase().trim();

    // Busca o evento para checar se é gerido por organizador com token próprio
    let eventRef = db.collection("events").doc(rawPin);
    let eventSnap = await eventRef.get();
    if (!eventSnap.exists) {
      const q = await db.collection("events").where("pin", "==", rawPin).limit(1).get();
      if (!q.empty) { eventRef = q.docs[0].ref; eventSnap = q.docs[0]; }
    }

    const eventData = eventSnap.exists ? eventSnap.data() : null;
    let organizerData = null;
    if (eventData?.organizerEmail) {
      organizerData = await getOrganizerMercadoPagoToken(db, eventData.organizerEmail);
    }

    // 1. Checa primeiro no Firestore se a inscrição já está confirmada pelo webhook
    let entryRef = null;
    let entrySnap = null;
    if (eventSnap.exists) {
      entryRef = eventRef.collection("entries").doc(cleanEmail);
      entrySnap = await entryRef.get();
      if (!entrySnap.exists) {
        const eq = await eventRef.collection("entries").where("email", "==", cleanEmail).limit(1).get();
        if (!eq.empty) { entryRef = eq.docs[0].ref; entrySnap = eq.docs[0]; }
      }
    }

    if (entrySnap?.exists) {
      const entryData = entrySnap.data() || {};
      const isConfirmed = entryData.paymentStatus === "Confirmado" || entryData.paymentStatus === "Pago";
      const hasPayment = Array.isArray(entryData.payments) && entryData.payments.some(
        (p) => String(p.providerPaymentId) === String(paymentId) || String(p.id) === `mp-${paymentId}`
      );

      if (isConfirmed || hasPayment) {
        return res.status(200).json({
          paymentId: String(paymentId),
          status: "approved",
          paymentStatus: "Confirmado",
          source: "firestore",
        });
      }
    }

    // 2. Tenta buscar o pagamento com o token do organizador, se falhar ou não tiver tenta com o global
    let payment = null;
    try {
      const primaryClient = organizerData?.accessToken
        ? getMercadoPagoClient(organizerData.accessToken)
        : getMercadoPagoClient();
      payment = await new Payment(primaryClient).get({ id: paymentId });
    } catch (primaryErr) {
      if (organizerData?.accessToken) {
        // Fallback para token global
        const fallbackClient = getMercadoPagoClient();
        payment = await new Payment(fallbackClient).get({ id: paymentId });
      } else {
        throw primaryErr;
      }
    }

    if (!payment || !payment.id) {
      return res.status(404).json({ error: "Pagamento não encontrado" });
    }

    // Se o paymentId específico ainda não estiver aprovado, busca se algum Pix referente a esta inscrição foi aprovado
    if (payment.status !== "approved") {
      try {
        const clientToUse = organizerData?.accessToken
          ? getMercadoPagoClient(organizerData.accessToken)
          : getMercadoPagoClient();
        const cleanPin = eventRef.id;
        const refsToSearch = Array.from(new Set([`${cleanPin}:${cleanEmail}`, `${rawPin}:${cleanEmail}`]));

        for (const ref of refsToSearch) {
          const searchResult = await new Payment(clientToUse).search({
            options: {
              external_reference: ref,
              sort: "date_created",
              criteria: "desc",
            },
          });
          const approved = (searchResult?.results || []).find((p) => p.status === "approved");
          if (approved) {
            payment = approved;
            break;
          }
        }
      } catch (searchErr) {
        console.warn("Aviso na busca por external_reference:", searchErr?.message);
      }
    }

    const { paymentStatus } = mapMercadoPagoStatus(payment.status);

    // Se aprovado, atualiza o Firestore
    if (payment.status === "approved") {
      try {

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
