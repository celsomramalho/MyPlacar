import process from "node:process";
import admin from "firebase-admin";

if (!admin.apps.length) {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (serviceAccountJson) {
    try {
      admin.initializeApp({ credential: admin.credential.cert(JSON.parse(serviceAccountJson)) });
    } catch (e) {
      console.error("Erro ao inicializar Firebase Admin:", e);
    }
  }
}

function sanitize(value) {
  if (value === undefined || value === null) return value;
  if (Array.isArray(value)) return value.map(sanitize).filter((item) => item !== undefined);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined && typeof item !== "function")
        .map(([key, item]) => [key, sanitize(item)])
    );
  }
  return value;
}

/**
 * Valida se o usuário tem privilégios de administrador global ou do evento
 */
async function checkAdminAuthorization(db, adminEmail, eventPin) {
  const cleanAdminEmail = (adminEmail || "").toLowerCase().trim();
  if (!cleanAdminEmail) return false;

  const userDoc = await db.collection("users").doc(cleanAdminEmail).get();
  const isGlobalAdmin = (userDoc.exists && userDoc.data()?.isAdmin === true) || cleanAdminEmail === "celsomramalho@gmail.com";
  if (isGlobalAdmin) return true;

  if (eventPin) {
    const eventDoc = await db.collection("events").doc(eventPin).get();
    if (eventDoc.exists) {
      const eventData = eventDoc.data();
      const userPin = userDoc.exists && userDoc.data()?.pin ? String(userDoc.data().pin).toUpperCase().trim() : "";
      const coAdminPins = (eventData?.coAdminPins || []).map((p) => String(p).toUpperCase().trim());
      if (userPin && coAdminPins.includes(userPin) && eventData?.active === true) {
        return true;
      }
    }
  }

  return false;
}

/**
 * POST /api/admin-entry
 *
 * Endpoint unificado para gerenciar inscrições no painel admin (economiza slots serverless do Vercel Hobby):
 * - action === 'save' | default (quando tem entry): salva a inscrição
 * - action === 'delete': exclui a inscrição da subcoleção, histórico e duplas
 * - action === 'fix-ids': detecta e renumera IDs duplicados
 */
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido" });
  if (!admin.apps.length) return res.status(500).json({ error: "Firebase Admin não inicializado" });

  const body = req.body || {};
  const { action, eventPin, adminEmail } = body;

  if (!eventPin || !adminEmail) {
    return res.status(400).json({ error: "eventPin e adminEmail são obrigatórios" });
  }

  try {
    const db = admin.firestore();
    let isAuthorized = await checkAdminAuthorization(db, adminEmail, eventPin);
    let isHelperCheckIn = false;
    if (!isAuthorized && action === "check-in") {
      const cleanEmail = String(adminEmail).toLowerCase().trim();
      const requestedPin = String(body.adminPin || "").toUpperCase().trim();
      const [userSnap, eventSnap] = await Promise.all([
        db.collection("users").doc(cleanEmail).get(),
        db.collection("events").doc(eventPin).get(),
      ]);
      const storedPin = userSnap.exists ? String(userSnap.data()?.pin || "").toUpperCase().trim() : "";
      const helperPins = eventSnap.exists ? (eventSnap.data()?.helperPins || []).map((pin) => String(pin).toUpperCase().trim()) : [];
      isHelperCheckIn = Boolean(requestedPin && requestedPin === storedPin && helperPins.includes(requestedPin) && eventSnap.data()?.active === true);
      isAuthorized = isHelperCheckIn;
    }
    if (!isAuthorized) {
      return res.status(403).json({ error: "Acesso negado: usuário não é administrador deste evento" });
    }

    if (action === "check-in") {
      const entry = body.entry || {};
      const cleanEmail = String(entry.email || "").toLowerCase().trim();
      if (!cleanEmail || typeof entry.checkedIn !== "boolean") {
        return res.status(400).json({ error: "Dados de check-in inválidos" });
      }
      const eventSnap = await db.collection("events").doc(eventPin).get();
      const eventData = eventSnap.exists ? eventSnap.data() : null;
      const dateParts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
      }).formatToParts(new Date());
      const datePart = (type) => dateParts.find((part) => part.type === type)?.value || "";
      const today = `${datePart("year")}-${datePart("month")}-${datePart("day")}`;
      const startDate = eventData?.tournamentStartDate;
      const endDate = eventData?.tournamentEndDate;
      const isWithinTournamentDates = startDate || endDate
        ? (!startDate || today >= startDate) && (!endDate || today <= endDate)
        : eventData?.eventStatus === "Pronto para check-in" || eventData?.eventStatus === "Em andamento";
      if (!eventData || eventData.active === false || !isWithinTournamentDates) {
        return res.status(403).json({ error: "Check-in indisponível fora do período do torneio" });
      }
      const entryRef = db.collection("events").doc(eventPin).collection("entries").doc(cleanEmail);
      const auditRef = db.collection("events").doc(eventPin).collection("audit_logs").doc();
      let entryNotFound = false;
      await db.runTransaction(async (transaction) => {
        const existingEntry = await transaction.get(entryRef);
        if (!existingEntry.exists) {
          entryNotFound = true;
          return;
        }
        const data = existingEntry.data();
        const previousDates = Array.isArray(data.checkInDates) ? data.checkInDates : [];
        const checkInDates = entry.checkedIn
          ? Array.from(new Set([...previousDates.filter((date) => typeof date === "string"), today])).slice(-40)
          : previousDates.filter((date) => typeof date === "string" && date !== today).slice(-40);
        transaction.set(entryRef, {
          checkedIn: entry.checkedIn,
          checkInDate: entry.checkedIn ? today : null,
          checkInDates,
        }, { merge: true });
        transaction.set(auditRef, {
          id: auditRef.id,
          eventPin,
          registrationEmail: cleanEmail,
          registrationId: data.registrationId ?? null,
          participantName: data.name || data.nickname || null,
          actorEmail: String(adminEmail).toLowerCase().trim(),
          actorRole: isHelperCheckIn ? "event_helper" : "admin_or_coadmin",
          action: "checkin_changed",
          changedFields: ["checkedIn", "checkInDate"],
          before: { checkedIn: Boolean(data.checkedIn), checkInDate: data.checkInDate || null },
          after: { checkedIn: entry.checkedIn, checkInDate: entry.checkedIn ? today : null },
          source: "live",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });
      if (entryNotFound) return res.status(404).json({ error: "Inscrição não localizada" });
      return res.status(200).json({ success: true });
    }

    if (action === "backfill-audit-notices") {
      const eventRef = db.collection("events").doc(eventPin);
      const migrationRef = eventRef.collection("audit_migrations").doc("communications_v1");
      const migrationSnap = await migrationRef.get();
      if (migrationSnap.exists) return res.status(200).json({ success: true, migrated: 0, alreadyDone: true });

      const [entriesSnap, noticesSnap] = await Promise.all([
        eventRef.collection("entries").get(),
        db.collection("communications").where("eventPin", "==", eventPin).get(),
      ]);
      const entries = entriesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      const legacyNoticeTypes = new Set(["event_registration_created", "registration_confirmed", "pre_registration", "event_payment_created", "payment_created", "new_category", "registration_deleted", "pending_payment"]);
      const notices = noticesSnap.docs.filter((doc) => {
        const type = String(doc.data()?.notificationType || "");
        return legacyNoticeTypes.has(type);
      });
      let batch = db.batch();
      let writes = 0;
      let migrated = 0;
      const flush = async () => {
        if (writes) await batch.commit();
        batch = db.batch();
        writes = 0;
      };
      for (const noticeDoc of notices) {
        const notice = noticeDoc.data();
        const targetEmail = String(notice.targetUserEmail || "").trim().toLowerCase();
        const targetPin = String(notice.targetUserPin || "").trim().toUpperCase();
        const registrationId = notice.registrationId ?? null;
        const useRecipientAsParticipant = !/event_(registration|payment)_created/i.test(String(notice.notificationType || ""));
        const entry = entries.find((item) =>
          (registrationId && String(item.registrationId) === String(registrationId)) ||
          (useRecipientAsParticipant && targetEmail && String(item.email || "").toLowerCase() === targetEmail) ||
          (useRecipientAsParticipant && targetPin && String(item.pin || "").toUpperCase() === targetPin)
        );
        const auditRef = eventRef.collection("audit_logs").doc(`legacy_${noticeDoc.id}`);
        batch.set(auditRef, {
          id: auditRef.id,
          eventPin,
          registrationEmail: entry?.email ? String(entry.email).toLowerCase() : null,
          registrationId: registrationId ?? entry?.registrationId ?? null,
          participantName: entry?.name || entry?.nickname || null,
          actorEmail: null,
          actorRole: "unknown",
          action: notice.notificationType || "legacy_notice",
          changedFields: [],
          before: null,
          after: null,
          summary: String(notice.content || notice.title || "Aviso histórico"),
          originalTitle: notice.title || null,
          originalCreatedAt: notice.createdAt || null,
          source: "legacy_notice",
          reconstructed: true,
          confidence: entry ? "matched" : "event_only",
          sourceCommunicationId: noticeDoc.id,
          createdAt: notice.createdAt || Date.now(),
        }, { merge: true });
        migrated++;
        writes++;
        if (writes >= 400) await flush();
      }
      batch.set(migrationRef, { completedAt: Date.now(), migrated, source: "communications" });
      writes++;
      await flush();
      return res.status(200).json({ success: true, migrated });
    }

    // ───────────────────────────────────────────────
    // 1. ACTION: DELETE
    // ───────────────────────────────────────────────
    if (action === "delete" || (!action && body.entryEmail && !body.entry)) {
      const { entryEmail, entryPin } = body;
      if (!entryEmail && !entryPin) {
        return res.status(400).json({ error: "entryEmail ou entryPin obrigatório para exclusão" });
      }

      const cleanEmail = entryEmail ? entryEmail.toLowerCase().trim() : null;
      const cleanPin = entryPin ? entryPin.toUpperCase().trim() : null;
      const entriesRef = db.collection("events").doc(eventPin).collection("entries");
      const docsToDelete = new Set();

      if (cleanEmail) docsToDelete.add(cleanEmail);
      if (cleanPin) docsToDelete.add(cleanPin);

      if (cleanEmail) {
        const snapByEmail = await entriesRef.where("email", "==", cleanEmail).get();
        snapByEmail.forEach((d) => docsToDelete.add(d.id));
      }
      if (cleanPin) {
        const snapByPin = await entriesRef.where("pin", "==", cleanPin).get();
        snapByPin.forEach((d) => docsToDelete.add(d.id));
      }

      const batch = db.batch();
      for (const docId of docsToDelete) {
        const entryRef = entriesRef.doc(docId);
        const existingEntry = await entryRef.get();
        if (existingEntry.exists) {
          const data = existingEntry.data();
          const auditRef = db.collection("events").doc(eventPin).collection("audit_logs").doc();
          batch.set(auditRef, {
            id: auditRef.id,
            eventPin,
            registrationEmail: String(data.email || "").toLowerCase() || null,
            registrationId: data.registrationId ?? null,
            participantName: data.name || data.nickname || null,
            actorEmail: String(adminEmail).toLowerCase().trim(),
            actorRole: "admin_or_coadmin",
            action: "registration_deleted",
            changedFields: ["$registration"],
            before: { categoryIds: data.categoryIds || [], paymentStatus: data.paymentStatus || null, payments: (data.payments || []).map((payment) => ({ id: payment.id || null, amount: payment.amount ?? null, date: payment.date ?? null, status: payment.status ?? null, receipt: Boolean(payment.receiptUrl), receiptName: payment.receiptFileName || payment.receiptName || null })) },
            after: null,
            source: "live",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
        batch.delete(entryRef);
      }

      if (cleanEmail) {
        const userRegRef = db.collection("user_registrations").doc(cleanEmail).collection("events").doc(eventPin);
        batch.delete(userRegRef);
      }

      await batch.commit();

      // Limpa duplas em event.pairs se o participante excluído estiver escalado
      try {
        const eventDocRef = db.collection("events").doc(eventPin);
        const eventSnap = await eventDocRef.get();
        if (eventSnap.exists) {
          const currentPairs = eventSnap.data()?.pairs;
          if (Array.isArray(currentPairs) && currentPairs.length > 0) {
            const updatedPairs = currentPairs.filter((p) => {
              const p1Pin = p.p1?.pin?.toUpperCase().trim();
              const p2Pin = p.p2?.pin?.toUpperCase().trim();
              const p1Email = p.p1?.email?.toLowerCase().trim();
              const p2Email = p.p2?.email?.toLowerCase().trim();

              if (cleanPin && (p1Pin === cleanPin || p2Pin === cleanPin)) return false;
              if (cleanEmail && (p1Email === cleanEmail || p2Email === cleanEmail)) return false;
              return true;
            });

            if (updatedPairs.length !== currentPairs.length) {
              await eventDocRef.update({ pairs: updatedPairs });
            }
          }
        }
      } catch (pairErr) {
        console.warn("Aviso ao limpar pairs após exclusão:", pairErr);
      }

      return res.status(200).json({ success: true, deletedDocs: Array.from(docsToDelete) });
    }

    // ───────────────────────────────────────────────
    // 2. ACTION: FIX-IDS
    // ───────────────────────────────────────────────
    if (action === "fix-ids") {
      const snap = await db.collection("events").doc(eventPin).collection("entries").get();
      if (snap.empty) return res.status(200).json({ message: "Nenhuma entry encontrada", fixes: [] });

      const entries = snap.docs.map((d) => ({ _docId: d.id, ...d.data() }));
      const sorted = [...entries].sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));

      const idCount = {};
      for (const e of sorted) {
        const id = Number(e.registrationId);
        if (!isNaN(id) && id > 0) {
          idCount[id] = (idCount[id] || 0) + 1;
        }
      }

      const safeIds = new Set(Object.keys(idCount).filter((k) => idCount[k] === 1).map(Number));
      const maxSafeId = safeIds.size > 0 ? Math.max(...safeIds) : 0;
      let nextSeq = maxSafeId + 1;
      const getNextAvailableId = () => {
        while (safeIds.has(nextSeq)) nextSeq++;
        safeIds.add(nextSeq);
        return nextSeq++;
      };

      const fixes = [];
      const batch = db.batch();

      for (const entry of sorted) {
        const id = Number(entry.registrationId);
        const isDuplicate = idCount[id] > 1;
        const isMissing = isNaN(id) || id <= 0;

        if (isMissing || isDuplicate) {
          if (isDuplicate) {
            idCount[id]--;
            if (idCount[id] >= 1) {
              const newId = getNextAvailableId();
              const ref = db.collection("events").doc(eventPin).collection("entries").doc(entry._docId);
              batch.update(ref, { registrationId: newId });
              fixes.push({
                email: entry._docId,
                name: entry.name || entry.nickname || entry._docId,
                oldId: entry.registrationId,
                newId,
              });
            }
          } else {
            const newId = getNextAvailableId();
            const ref = db.collection("events").doc(eventPin).collection("entries").doc(entry._docId);
            batch.update(ref, { registrationId: newId });
            fixes.push({
              email: entry._docId,
              name: entry.name || entry.nickname || entry._docId,
              oldId: entry.registrationId ?? null,
              newId,
            });
          }
        }
      }

      if (fixes.length > 0) {
        await batch.commit();
      }

      return res.status(200).json({
        message: fixes.length > 0 ? `${fixes.length} inscrição(ões) corrigida(s)` : "Nenhuma correção necessária",
        fixes,
      });
    }

    // ───────────────────────────────────────────────
    // 3. ACTION: SAVE (default)
    // ───────────────────────────────────────────────
    const { entry } = body;
    if (!entry || !entry.email) {
      return res.status(400).json({ error: "Dados da inscrição incompletos para salvamento" });
    }

    const eventRef = db.collection("events").doc(eventPin);
    const entryRef = eventRef.collection("entries").doc(entry.email.toLowerCase().trim());
    const auditRef = eventRef.collection("audit_logs").doc();
    await db.runTransaction(async (transaction) => {
      const [eventSnapshot, current] = await Promise.all([transaction.get(eventRef), transaction.get(entryRef)]);
      const eventData = eventSnapshot.data() || {};
      const categories = Array.isArray(eventData.categories) ? eventData.categories : [];
      const selectedCategoryIds = Array.isArray(entry.categoryIds) ? entry.categoryIds : [];
      const beforeData = current.exists ? current.data() : {};
      const categorySelectionChanged = !current.exists || JSON.stringify(beforeData.categoryIds || []) !== JSON.stringify(selectedCategoryIds);
      if (categories.length && categorySelectionChanged && (!selectedCategoryIds.length || selectedCategoryIds.some((id) => !categories.some((category) => category.id === id)))) {
        throw new Error("A inscrição precisa ter ao menos uma categoria válida do evento.");
      }
      const normalizedDrawType = String(eventData.teamDrawType || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const requiresPartner = categorySelectionChanged && normalizedDrawType.includes("pre") && selectedCategoryIds.some((id) => categories.some((category) => category.id === id && category.format === "Duplas" && category.requiresPartner !== false));
      if (requiresPartner && selectedCategoryIds.some((id) => {
        const category = categories.find((item) => item.id === id);
        if (!category || category.format !== "Duplas" || category.requiresPartner === false) return false;
        const partner = entry.categoryPartners?.[id];
        return !(partner?.name && partner?.email && partner?.phone);
      })) throw new Error("Informe os dados do parceiro para cada categoria de duplas pré-definidas.");
      const tracked = ["categoryIds", "categoryPartners", "partnerName", "partnerEmail", "partnerPhone", "paymentStatus", "payments", "dueAmount", "paidAmount", "checkedIn", "checkInDate", "checkInDates", "disabled", "disabledReason"];
      const cleanForAudit = (value, field) => field === "payments" && Array.isArray(value)
        ? value.map((payment) => ({ id: payment.id || null, amount: payment.amount ?? null, date: payment.date ?? null, status: payment.status ?? null, provider: payment.provider ?? null, receipt: Boolean(payment.receiptUrl), receiptName: payment.receiptFileName || payment.receiptName || null }))
        : value ?? null;
      const changedFields = tracked.filter((field) => JSON.stringify(cleanForAudit(beforeData[field], field)) !== JSON.stringify(cleanForAudit(entry[field], field)));
      if (!current.exists) changedFields.unshift("$registration");
      transaction.set(entryRef, sanitize(entry));
      if (changedFields.length) {
        transaction.set(auditRef, {
          id: auditRef.id,
          eventPin,
          registrationEmail: String(entry.email).toLowerCase().trim(),
          registrationId: entry.registrationId ?? beforeData.registrationId ?? null,
          participantName: entry.name || entry.nickname || beforeData.name || beforeData.nickname || null,
          actorEmail: String(adminEmail).toLowerCase().trim(),
          actorRole: "admin_or_coadmin",
          action: current.exists ? "registration_updated" : "registration_created",
          changedFields,
          before: Object.fromEntries(changedFields.filter((field) => tracked.includes(field)).map((field) => [field, cleanForAudit(beforeData[field], field)])),
          after: Object.fromEntries(changedFields.filter((field) => tracked.includes(field)).map((field) => [field, cleanForAudit(entry[field], field)])),
          source: "live",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        const oldPaymentIds = new Set((beforeData.payments || []).map((payment) => payment.id).filter(Boolean));
        const hasNewPayment = (entry.payments || []).some((payment) => payment.id && !oldPaymentIds.has(payment.id));
        const important = changedFields.some((field) => ["categoryIds", "categoryPartners", "partnerName", "partnerEmail", "partnerPhone", "paymentStatus"].includes(field) || (field === "payments" && !hasNewPayment));
        if (important && current.exists && !String(entry.email).toLowerCase().includes("@simplificada.local")) {
          const categoryNames = selectedCategoryIds.map((id) => categories.find((category) => category.id === id)?.name).filter(Boolean);
          const communicationRef = db.collection("communications").doc();
          const hasCategoryChange = changedFields.some((field) => ["categoryIds", "categoryPartners"].includes(field));
          transaction.set(communicationRef, {
            type: "message",
            title: hasCategoryChange ? "Inscrição atualizada pela organização" : "Pagamento atualizado pela organização",
            content: `A organização atualizou ${hasCategoryChange ? "categorias/parceiro" : "o pagamento"} da sua inscrição no evento ${eventData.name || eventPin}${categoryNames.length ? `. Categorias atuais: ${categoryNames.join(", ")}` : ""}.`,
            authorId: "system",
            authorName: eventData.name || "Organização",
            createdAt: Date.now(),
            targetUserId: String(entry.email).toLowerCase().trim(),
            targetUserEmail: String(entry.email).toLowerCase().trim(),
            targetUserPin: entry.pin || "",
            isPinned: false,
            readBy: [],
            eventPin,
            notificationType: "event_registration_updated_by_admin",
            registrationId: entry.registrationId || null,
            auditId: auditRef.id,
          });
        }
      }
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Erro na rota /api/admin-entry:", error);
    return res.status(500).json({ error: `Erro interno: ${error.message}` });
  }
}
