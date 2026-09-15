import process from "node:process";
import {
  getHeader,
  initFirebaseAdmin,
  mapMercadoPagoStatus,
  mercadoPagoRequest,
  parseExternalReference,
  sanitize,
  validateMercadoPagoSignature,
} from "./_mercadopago.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido" });

  const body = req.body || {};
  const dataId = req.query?.["data.id"] || req.query?.data_id || body?.data?.id;
  const notificationType = req.query?.type || body?.type;
  const xSignature = getHeader(req, "x-signature");
  const xRequestId = getHeader(req, "x-request-id");
  const webhookSecret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;

  if (!validateMercadoPagoSignature({ xSignature, xRequestId, dataId, secret: webhookSecret })) {
    return res.status(401).json({ error: "Assinatura inválida" });
  }

  if (notificationType && notificationType !== "payment") {
    return res.status(200).json({ ignored: true });
  }

  if (!dataId) {
    return res.status(400).json({ error: "data.id ausente" });
  }

  try {
    const db = initFirebaseAdmin();
    const payment = await mercadoPagoRequest(`/v1/payments/${encodeURIComponent(String(dataId))}`, {
      method: "GET",
    });

    const parsedReference = parseExternalReference(payment.external_reference);
    if (!parsedReference) {
      console.warn("Pagamento Mercado Pago sem external_reference reconhecível:", payment.id);
      return res.status(200).json({ ignored: true });
    }

    const { eventPin: rawEventPin, entryEmail } = parsedReference;
    let eventRef = db.collection("events").doc(rawEventPin);
    let eventSnap = await eventRef.get();

    if (!eventSnap.exists && rawEventPin.toUpperCase() !== rawEventPin) {
      const upperRef = db.collection("events").doc(rawEventPin.toUpperCase());
      const upperSnap = await upperRef.get();
      if (upperSnap.exists) {
        eventRef = upperRef;
        eventSnap = upperSnap;
      }
    }

    if (!eventSnap.exists && rawEventPin.toLowerCase() !== rawEventPin) {
      const lowerRef = db.collection("events").doc(rawEventPin.toLowerCase());
      const lowerSnap = await lowerRef.get();
      if (lowerSnap.exists) {
        eventRef = lowerRef;
        eventSnap = lowerSnap;
      }
    }

    if (!eventSnap.exists) {
      const querySnap = await db.collection("events").where("pin", "==", rawEventPin).limit(1).get();
      if (!querySnap.empty) {
        eventRef = querySnap.docs[0].ref;
        eventSnap = querySnap.docs[0];
      }
    }

    if (!eventSnap.exists) {
      console.warn("Evento não encontrado no webhook:", { rawEventPin, entryEmail, paymentId: payment.id });
      return res.status(200).json({ ignored: true });
    }

    const eventPin = eventRef.id;
    let entryRef = eventRef.collection("entries").doc(entryEmail);
    let entrySnap = await entryRef.get();

    if (!entrySnap.exists) {
      const entryQuery = await eventRef.collection("entries").where("email", "==", entryEmail).limit(1).get();
      if (!entryQuery.empty) {
        entryRef = entryQuery.docs[0].ref;
        entrySnap = entryQuery.docs[0];
      }
    }

    if (!entrySnap.exists) {
      console.warn("Inscrição não encontrada para pagamento Mercado Pago:", { eventPin, entryEmail, paymentId: payment.id });
      return res.status(200).json({ ignored: true });
    }

    const entry = entrySnap.data();
    const dueAmount = Number(entry.dueAmount ?? 0);
    const transactionAmount = Number(payment.transaction_amount ?? 0);
    const expectedPending = Math.max(0, dueAmount - Number(entry.paidAmount ?? 0));
    const amountIsCompatible = dueAmount <= 0 || transactionAmount <= dueAmount || Math.abs(transactionAmount - expectedPending) < 0.01;
    const statusMap = mapMercadoPagoStatus(payment.status);
    const existingPayments = Array.isArray(entry.payments) ? entry.payments : [];
    const providerPaymentId = String(payment.id);
    const paymentItemId = `mp-${providerPaymentId}`;
    const alreadyRecorded = existingPayments.some(
      (item) => item.id === paymentItemId || String(item.providerPaymentId || "") === providerPaymentId,
    );

    const nextPayments = [...existingPayments];
    if (statusMap.shouldRecordPayment && amountIsCompatible && !alreadyRecorded) {
      nextPayments.push({
        id: paymentItemId,
        date: payment.date_approved ? new Date(payment.date_approved).getTime() : Date.now(),
        amount: transactionAmount,
        provider: "mercadopago",
        providerPaymentId,
        status: payment.status,
        receiptFileName: `Pix Mercado Pago #${providerPaymentId}`,
      });
    }

    const paidAmount = nextPayments.reduce((total, item) => total + Number(item.amount || 0), 0);
    const nextPaymentStatus = amountIsCompatible ? statusMap.paymentStatus : "Pendente";
    const checkoutStatus = amountIsCompatible ? statusMap.checkoutStatus : "pending";

    await entryRef.set(sanitize({
      payments: nextPayments,
      paidAmount,
      paymentStatus: nextPaymentStatus,
      mercadoPagoCheckout: {
        ...(entry.mercadoPagoCheckout || {}),
        provider: "mercadopago",
        lastPaymentId: providerPaymentId,
        status: checkoutStatus,
        amount: transactionAmount || entry.mercadoPagoCheckout?.amount,
        externalReference: payment.external_reference,
        updatedAt: Date.now(),
      },
      mercadoPagoLastPayment: {
        id: providerPaymentId,
        status: payment.status,
        statusDetail: payment.status_detail,
        amount: transactionAmount,
        paymentMethodId: payment.payment_method_id,
        paymentTypeId: payment.payment_type_id,
        dateApproved: payment.date_approved || null,
        updatedAt: Date.now(),
        amountIsCompatible,
      },
    }), { merge: true });

    const webhookId = String(body.id || `${providerPaymentId}-${Date.now()}`).replace(/[^\w.-]/g, "_");
    await db
      .collection("events")
      .doc(eventPin)
      .collection("payment_webhooks")
      .doc(webhookId)
      .set(sanitize({
        provider: "mercadopago",
        paymentId: providerPaymentId,
        status: payment.status,
        action: body.action || null,
        type: body.type || notificationType || "payment",
        externalReference: payment.external_reference,
        entryEmail,
        amount: transactionAmount,
        amountIsCompatible,
        receivedAt: Date.now(),
      }), { merge: true });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Erro no webhook Mercado Pago:", error);
    return res.status(error.status || 500).json({
      error: error.message || "Erro interno ao processar webhook",
    });
  }
}

