import { Payment } from "mercadopago";
import {
  getBaseUrl,
  getMercadoPagoClient,
  getOrganizerMercadoPagoToken,
  initFirebaseAdmin,
  sanitize,
} from "./_mercadopago.js";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido" });

  try {
    const { eventPin, entryEmail, deviceId } = req.body || {};
    const rawPin = String(eventPin || "").trim();
    const cleanEntryEmail = String(entryEmail || "").toLowerCase().trim();
    const cleanDeviceId = deviceId ? String(deviceId).trim() : null;
    if (!rawPin || !cleanEntryEmail) {
      return res.status(400).json({ error: "Evento e inscrição são obrigatórios" });
    }

    const db = initFirebaseAdmin();

    // Busca o evento por ID exato, maiúsculo ou minúsculo
    let eventRef = db.collection("events").doc(rawPin);
    let eventSnap = await eventRef.get();

    if (!eventSnap.exists && rawPin.toUpperCase() !== rawPin) {
      const upperRef = db.collection("events").doc(rawPin.toUpperCase());
      const upperSnap = await upperRef.get();
      if (upperSnap.exists) { eventRef = upperRef; eventSnap = upperSnap; }
    }

    if (!eventSnap.exists && rawPin.toLowerCase() !== rawPin) {
      const lowerRef = db.collection("events").doc(rawPin.toLowerCase());
      const lowerSnap = await lowerRef.get();
      if (lowerSnap.exists) { eventRef = lowerRef; eventSnap = lowerSnap; }
    }

    if (!eventSnap.exists) {
      const querySnap = await db.collection("events").where("pin", "==", rawPin).limit(1).get();
      if (!querySnap.empty) { eventRef = querySnap.docs[0].ref; eventSnap = querySnap.docs[0]; }
    }

    if (!eventSnap.exists) {
      console.warn("Evento não encontrado no Firestore:", { rawPin, cleanEntryEmail });
      return res.status(404).json({ error: `Evento com PIN '${rawPin}' não encontrado no banco de dados.` });
    }

    const cleanEventPin = eventRef.id;
    let entryRef = eventRef.collection("entries").doc(cleanEntryEmail);
    let entrySnap = await entryRef.get();

    if (!entrySnap.exists) {
      const entryQuery = await eventRef.collection("entries").where("email", "==", cleanEntryEmail).limit(1).get();
      if (!entryQuery.empty) { entryRef = entryQuery.docs[0].ref; entrySnap = entryQuery.docs[0]; }
    }

    if (!entrySnap.exists) {
      console.warn("Inscrição não encontrada no Firestore:", { cleanEventPin, cleanEntryEmail });
      return res.status(404).json({ error: `Inscrição para o e-mail '${cleanEntryEmail}' não encontrada neste evento.` });
    }

    const event = eventSnap.data();
    const entry = entrySnap.data();
    if (event.active === false) return res.status(409).json({ error: "Evento inativo" });
    if (event.paymentType !== "mercadopago") {
      return res.status(409).json({ error: "Este evento não está configurado para pagamento automático" });
    }

    const dueAmount = Number(entry.dueAmount ?? event.registrationFee ?? 0);
    const paidAmount = Number(entry.paidAmount ?? 0);
    const amount = Number(Math.max(0, dueAmount - paidAmount).toFixed(2));
    if (!amount || amount <= 0) {
      return res.status(409).json({ error: "Esta inscrição não possui valor pendente" });
    }

    const baseUrl = getBaseUrl(req);
    const externalReference = `${cleanEventPin}:${cleanEntryEmail}`;
    
    // Descrição enriquecida com número da inscrição e e-mail para fácil conciliação no extrato do Mercado Pago
    const regNumber = entry.registrationId != null
      ? `#${String(entry.registrationId).padStart(4, "0")}`
      : "";
    const regPrefix = regNumber ? `Inscrição ${regNumber}` : "Inscrição";
    const eventTitle = event.name || cleanEventPin;
    const description = `${regPrefix} - ${eventTitle} (${cleanEntryEmail})`.slice(0, 250);

    // Pix expira em 24 horas
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // Verifica se o evento possui um organizador com conta Mercado Pago conectada
    const organizerEmail = event.organizerEmail ? String(event.organizerEmail).toLowerCase().trim() : null;
    let organizerData = null;
    if (organizerEmail) {
      organizerData = await getOrganizerMercadoPagoToken(db, organizerEmail);
    }

    // Taxa da plataforma (default 10%)
    const feePercent = typeof event.marketplaceFeePercent === "number" ? Math.max(0, event.marketplaceFeePercent) : 10;
    const applicationFee = organizerData ? Number(Math.max(0, (amount * (feePercent / 100))).toFixed(2)) : 0;

    // Cliente MP: usa o token do organizador (split marketplace) ou o token global (modo legado)
    const client = organizerData?.accessToken
      ? getMercadoPagoClient(organizerData.accessToken)
      : getMercadoPagoClient();

    const paymentPayload = {
      transaction_amount: amount,
      description,
      payment_method_id: "pix",
      date_of_expiration: expiresAt,
      payer: {
        email: cleanEntryEmail,
      },
      external_reference: externalReference,
      notification_url: `${baseUrl}/api/mercadopago-webhook`,
      metadata: {
        event_pin: cleanEventPin,
        entry_email: cleanEntryEmail,
        registration_id: entry.registrationId ?? null,
        payer_name: entry.name || entry.nickname || null,
        organizer_email: organizerEmail || null,
        marketplace_fee_percent: feePercent,
        application_fee: applicationFee,
      },
    };

    // Parâmetro do split de marketplace no Checkout Transparente
    if (organizerData?.accessToken && applicationFee > 0) {
      paymentPayload.application_fee = applicationFee;
    }

    // Header oficial do Mercado Pago para Identificador de Dispositivo Antifraude (Device ID)
    const requestOptions = {};
    if (cleanDeviceId) {
      requestOptions.customHeaders = {
        "X-Meli-Session-Id": cleanDeviceId,
      };
      paymentPayload.metadata.device_id = cleanDeviceId;
    }

    console.log(
      `[Pix] Criando cobrança para ${cleanEntryEmail} no evento ${cleanEventPin}. Modo: ${
        organizerData ? `Marketplace (Organizador: ${organizerEmail}, fee: R$ ${applicationFee})` : "Global (Legado)"
      }${cleanDeviceId ? ` [Device ID: ${cleanDeviceId.slice(0, 10)}...]` : ""}`
    );

    // Checkout Transparente: cria pagamento Pix diretamente
    const payment = await new Payment(client).create({
      body: paymentPayload,
      requestOptions,
    });

    const txData = payment.point_of_interaction?.transaction_data ?? {};
    const qrCode = txData.qr_code ?? null;
    const qrCodeBase64 = txData.qr_code_base64 ?? null;

    if (!qrCode) {
      console.error("Resposta MP sem QR Code:", JSON.stringify(payment));
      return res.status(502).json({ error: "Mercado Pago não retornou o QR Code do Pix." });
    }

    const checkout = {
      provider: "mercadopago",
      paymentId: String(payment.id),
      qrCode,
      qrCodeBase64,
      externalReference,
      amount,
      applicationFee: applicationFee || null,
      marketplaceFeePercent: feePercent,
      organizerEmail: organizerEmail || null,
      paymentMethod: "pix",
      status: payment.status || "pending",
      expiresAt,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await entryRef.set(sanitize({
      mercadoPagoCheckout: checkout,
      paymentStatus: entry.paymentStatus === "Confirmado" || entry.paymentStatus === "Isento"
        ? entry.paymentStatus
        : "Pendente",
    }), { merge: true });

    return res.status(200).json({
      paymentId: String(payment.id),
      status: payment.status || "pending",
      qrCode,
      qrCodeBase64,
      amount,
      expiresAt,
      externalReference,
    });
  } catch (error) {
    console.error("Erro ao criar pagamento Pix (MP):", error?.message, JSON.stringify(error?.cause ?? {}));
    const status = typeof error?.status === "number" ? error.status : 500;
    return res.status(status).json({
      error: error?.message || "Erro interno ao criar pagamento Pix",
    });
  }
}
