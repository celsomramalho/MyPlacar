import { Preference } from "mercadopago";
import {
  getBaseUrl,
  getMercadoPagoClient,
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
    const { eventPin, entryEmail } = req.body || {};
    const rawPin = String(eventPin || "").trim();
    const cleanEntryEmail = String(entryEmail || "").toLowerCase().trim();
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
      if (upperSnap.exists) {
        eventRef = upperRef;
        eventSnap = upperSnap;
      }
    }

    if (!eventSnap.exists && rawPin.toLowerCase() !== rawPin) {
      const lowerRef = db.collection("events").doc(rawPin.toLowerCase());
      const lowerSnap = await lowerRef.get();
      if (lowerSnap.exists) {
        eventRef = lowerRef;
        eventSnap = lowerSnap;
      }
    }

    // Se ainda não achou, faz busca pelo campo 'pin' no documento
    if (!eventSnap.exists) {
      const querySnap = await db.collection("events").where("pin", "==", rawPin).limit(1).get();
      if (!querySnap.empty) {
        eventRef = querySnap.docs[0].ref;
        eventSnap = querySnap.docs[0];
      }
    }

    if (!eventSnap.exists) {
      console.warn("Evento não encontrado no Firestore:", { rawPin, cleanEntryEmail });
      return res.status(404).json({ error: `Evento com PIN '${rawPin}' não encontrado no banco de dados.` });
    }

    const cleanEventPin = eventRef.id;
    let entryRef = eventRef.collection("entries").doc(cleanEntryEmail);
    let entrySnap = await entryRef.get();

    if (!entrySnap.exists) {
      // Se não achou pelo ID exato, busca pelo campo 'email' na subcoleção
      const entryQuery = await eventRef.collection("entries").where("email", "==", cleanEntryEmail).limit(1).get();
      if (!entryQuery.empty) {
        entryRef = entryQuery.docs[0].ref;
        entrySnap = entryQuery.docs[0];
      }
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
    const title = `Inscrição - ${event.name || cleanEventPin}`;

    // Pix expira em 24 horas
    const pixExpiration = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const client = getMercadoPagoClient();
    const preferenceClient = new Preference(client);

    const preference = await preferenceClient.create({
      body: {
        items: [
          {
            id: `event-${cleanEventPin}`,
            title,
            quantity: 1,
            currency_id: "BRL",
            unit_price: amount,
          },
        ],
        payer: {
          email: cleanEntryEmail,
          name: entry.name || entry.nickname || undefined,
        },
        external_reference: externalReference,
        metadata: {
          event_pin: cleanEventPin,
          entry_email: cleanEntryEmail,
        },
        // Restringe o checkout apenas para Pix
        payment_methods: {
          excluded_payment_types: [
            { id: "credit_card" },
            { id: "debit_card" },
            { id: "prepaid_card" },
            { id: "ticket" },
            { id: "atm" },
          ],
          excluded_payment_methods: [
            { id: "account_money" },
          ],
          installments: 1,
        },
        // Expiração do Pix em 24 horas
        date_of_expiration: pixExpiration,
        back_urls: {
          success: `${baseUrl}/?joinEvent=${encodeURIComponent(cleanEventPin)}&payment=success`,
          failure: `${baseUrl}/?joinEvent=${encodeURIComponent(cleanEventPin)}&payment=failure`,
          pending: `${baseUrl}/?joinEvent=${encodeURIComponent(cleanEventPin)}&payment=pending`,
        },
        auto_return: "approved",
        notification_url: `${baseUrl}/api/mercadopago-webhook`,
      },
    });

    const checkout = {
      provider: "mercadopago",
      preferenceId: preference.id,
      initPoint: preference.init_point,
      sandboxInitPoint: preference.sandbox_init_point,
      externalReference,
      amount,
      paymentMethod: "pix",
      status: "created",
      expiresAt: pixExpiration,
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
      preferenceId: preference.id,
      initPoint: preference.init_point,
      sandboxInitPoint: preference.sandbox_init_point,
      amount,
      externalReference,
    });
  } catch (error) {
    console.error("Erro ao criar preferência Mercado Pago:", error);
    return res.status(error.status || 500).json({
      error: error.message || "Erro interno ao criar pagamento",
    });
  }
}
