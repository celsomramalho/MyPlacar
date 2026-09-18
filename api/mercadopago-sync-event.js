import { Payment } from "mercadopago";
import {
  initFirebaseAdmin,
  getMercadoPagoClient,
  getOrganizerMercadoPagoToken,
  setCors,
  sanitize,
} from "./_mercadopago.js";

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido" });

  try {
    const { eventPin } = req.body || {};
    const rawPin = String(eventPin || "").trim();
    if (!rawPin) {
      return res.status(400).json({ error: "eventPin é obrigatório" });
    }

    const db = initFirebaseAdmin();

    // 1. Localiza o evento
    let eventRef = db.collection("events").doc(rawPin);
    let eventSnap = await eventRef.get();
    if (!eventSnap.exists) {
      const q = await db.collection("events").where("pin", "==", rawPin).limit(1).get();
      if (!q.empty) {
        eventRef = q.docs[0].ref;
        eventSnap = q.docs[0];
      }
    }

    if (!eventSnap.exists) {
      return res.status(404).json({ error: "Evento não encontrado" });
    }

    const eventData = eventSnap.data() || {};
    const organizerEmail = eventData.organizerEmail ? String(eventData.organizerEmail).toLowerCase().trim() : null;
    let organizerData = null;
    if (organizerEmail) {
      organizerData = await getOrganizerMercadoPagoToken(db, organizerEmail);
    }

    const primaryClient = organizerData?.accessToken
      ? getMercadoPagoClient(organizerData.accessToken)
      : getMercadoPagoClient();
    const fallbackClient = organizerData?.accessToken ? getMercadoPagoClient() : null;

    // 2. Busca todas as inscrições pendentes com paymentId
    const entriesSnap = await eventRef.collection("entries").get();
    const pendingEntries = [];

    for (const doc of entriesSnap.docs) {
      const entry = doc.data();
      const isPending = entry.paymentStatus !== "Confirmado" && entry.paymentStatus !== "Pago";
      const paymentId = entry.mercadoPagoCheckout?.paymentId;
      if (isPending && paymentId) {
        pendingEntries.push({ ref: doc.ref, email: doc.id, entry, paymentId: String(paymentId) });
      }
    }

    if (pendingEntries.length === 0) {
      return res.status(200).json({
        totalChecked: 0,
        totalApproved: 0,
        message: "Nenhuma inscrição pendente com pagamento Mercado Pago para sincronizar.",
      });
    }

    let totalApproved = 0;
    const updatedEmails = [];

    // 3. Consulta cada pagamento na API do Mercado Pago
    for (const item of pendingEntries) {
      try {
        let payment = null;
        try {
          payment = await new Payment(primaryClient).get({ id: item.paymentId });
        } catch (err) {
          if (fallbackClient) {
            payment = await new Payment(fallbackClient).get({ id: item.paymentId });
          }
        }

        if (payment && payment.status === "approved") {
          const txAmount = Number(payment.transaction_amount || 0);
          const existing = Array.isArray(item.entry.payments) ? item.entry.payments : [];
          const alreadyRecorded = existing.some((p) => String(p.providerPaymentId) === String(payment.id));

          const updates = {
            paymentStatus: "Confirmado",
            paidAmount: (Number(item.entry.paidAmount ?? 0) + (alreadyRecorded ? 0 : txAmount)) || txAmount,
            mercadoPagoCheckout: {
              ...(item.entry.mercadoPagoCheckout || {}),
              status: "approved",
              lastPaymentId: String(payment.id),
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

          await item.ref.set(sanitize(updates), { merge: true });
          totalApproved++;
          updatedEmails.push(item.email);
        }
      } catch (checkErr) {
        console.warn(`Erro ao sincronizar pagamento ${item.paymentId} de ${item.email}:`, checkErr.message);
      }
    }

    return res.status(200).json({
      totalChecked: pendingEntries.length,
      totalApproved,
      updatedEmails,
      message: totalApproved > 0
        ? `Sincronização concluída: ${totalApproved} inscrição(ões) confirmada(s)!`
        : `Nenhum novo pagamento aprovado entre as ${pendingEntries.length} inscrições verificadas.`,
    });
  } catch (error) {
    console.error("Erro geral na sincronização de pagamentos:", error);
    return res.status(500).json({ error: error?.message || "Erro ao sincronizar pagamentos" });
  }
}
