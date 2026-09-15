import {
  getBaseUrl,
  initFirebaseAdmin,
  mercadoPagoRequest,
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
    const cleanEventPin = String(eventPin || "").trim().toUpperCase();
    const cleanEntryEmail = String(entryEmail || "").toLowerCase().trim();
    if (!cleanEventPin || !cleanEntryEmail) {
      return res.status(400).json({ error: "Evento e inscrição são obrigatórios" });
    }

    const db = initFirebaseAdmin();
    const eventRef = db.collection("events").doc(cleanEventPin);
    const entryRef = eventRef.collection("entries").doc(cleanEntryEmail);
    const [eventSnap, entrySnap] = await Promise.all([eventRef.get(), entryRef.get()]);

    if (!eventSnap.exists) return res.status(404).json({ error: "Evento não encontrado" });
    if (!entrySnap.exists) return res.status(404).json({ error: "Inscrição não encontrada" });

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

    const preference = await mercadoPagoRequest("/checkout/preferences", {
      method: "POST",
      body: JSON.stringify({
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
        // Restringe o checkout exclusivamente ao Pix
        payment_methods: {
          excluded_payment_types: [
            { id: "credit_card" },
            { id: "debit_card" },
            { id: "ticket" },
            { id: "atm" },
            { id: "prepaid_card" },
            { id: "digital_currency" },
            { id: "digital_wallet" },
          ],
          default_payment_method_id: "pix",
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
      }),
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
