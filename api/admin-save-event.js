import process from "node:process";
import admin from "firebase-admin";

// Inicializa o Firebase Admin se ainda não foi inicializado
if (!admin.apps.length) {
  try {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!serviceAccountJson) {
      throw new Error("A variável de ambiente FIREBASE_SERVICE_ACCOUNT não está configurada.");
    }
    const serviceAccount = JSON.parse(serviceAccountJson);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } catch (error) {
    console.error("Erro ao inicializar Firebase Admin:", error);
  }
}

/**
 * Remove campos undefined/função recursivamente para garantir
 * que o objeto seja estritamente serializável pelo Firestore Admin SDK.
 */
function sanitize(value) {
  if (value === undefined || value === null) return value;
  if (Array.isArray(value)) {
    return value.map(sanitize).filter((v) => v !== undefined);
  }
  if (typeof value === "object") {
    const cleaned = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined && typeof v !== "function") {
        cleaned[k] = sanitize(v);
      }
    }
    return cleaned;
  }
  return value;
}

/**
 * API Route: POST /api/admin-save-event
 * Body: { event: TournamentEvent, adminPin: string }
 * Salva um evento no Firestore usando o Firebase Admin SDK (bypassa as regras de segurança).
 * Segurança: valida que adminPin pertence a um usuário isAdmin = true no Firestore.
 */
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido" });

  if (!admin.apps.length) {
    return res.status(500).json({ error: "Firebase Admin não inicializado" });
  }

  const { event, adminEmail } = req.body || {};

  if (!event || !event.pin || !event.name) {
    return res.status(400).json({ error: "Dados do evento inválidos ou incompletos" });
  }

  if (!adminEmail) {
    return res.status(400).json({ error: "adminEmail obrigatório" });
  }

  try {
    const db = admin.firestore();

    // Validar se é admin global ou co-admin deste evento
    const existingEventDoc = await db.collection("events").doc(event.pin).get();
    const existingEventData = existingEventDoc.exists ? existingEventDoc.data() : null;

    const userPin = (userDoc.exists && userDoc.data()?.pin ? String(userDoc.data().pin) : '').toUpperCase().trim();
    const coAdminPins = ((existingEventData?.coAdminPins) || []).map(p => String(p).toUpperCase().trim());
    const isCoAdmin = Boolean(userPin && coAdminPins.includes(userPin) && existingEventData?.active === true);

    if (!isAdminUser && !isCoAdmin) {
      return res.status(403).json({ error: "Acesso negado: usuário não é administrador do evento" });
    }

    // Remover entries do documento principal (salvo em subcoleção)
    let { entries: _entries, ...eventWithoutEntries } = event;

    // Se for co-admin (e não admin global), preserva dados cadastrais intocados
    if (isCoAdmin && !isAdminUser && existingEventData) {
      eventWithoutEntries = {
        ...eventWithoutEntries,
        name: existingEventData.name,
        pin: existingEventData.pin,
        active: existingEventData.active,
        eventStatus: existingEventData.eventStatus,
        eventType: existingEventData.eventType,
        setsCount: existingEventData.setsCount,
        gamesPerSet: existingEventData.gamesPerSet,
        teamDrawType: existingEventData.teamDrawType,
        bracketDrawType: existingEventData.bracketDrawType,
        matchDrawType: existingEventData.matchDrawType,
        startDate: existingEventData.startDate,
        endDate: existingEventData.endDate,
        eventDateText: existingEventData.eventDateText,
        location: existingEventData.location,
        registrationFee: existingEventData.registrationFee,
        extraCategoryFee: existingEventData.extraCategoryFee,
        courtsCount: existingEventData.courtsCount,
        courtNames: existingEventData.courtNames,
        coAdminPins: existingEventData.coAdminPins,
        bannerUrl: existingEventData.bannerUrl,
        regulationUrl: existingEventData.regulationUrl,
        regulationFileName: existingEventData.regulationFileName,
        information: existingEventData.information,
      };
    }

    if (Array.isArray(eventWithoutEntries.pairs)) {
      eventWithoutEntries.pairs = eventWithoutEntries.pairs.map((pair) => ({
        id: pair.id,
        p1: {
          email: pair.p1?.email || '',
          name: pair.p1?.name || '',
          nickname: pair.p1?.nickname || pair.p1?.name || '',
          pin: pair.p1?.pin || '',
          gender: pair.p1?.gender || 'M',
          categoryIds: pair.p1?.categoryIds || [],
          registrationId: pair.p1?.registrationId,
          shirtSize: pair.p1?.shirtSize || 'M',
          phone: pair.p1?.phone || '',
          checkedIn: !!pair.p1?.checkedIn,
        },
        p2: {
          email: pair.p2?.email || '',
          name: pair.p2?.name || '',
          nickname: pair.p2?.nickname || pair.p2?.name || '',
          pin: pair.p2?.pin || '',
          gender: pair.p2?.gender || 'M',
          categoryIds: pair.p2?.categoryIds || [],
          registrationId: pair.p2?.registrationId,
          shirtSize: pair.p2?.shirtSize || 'M',
          phone: pair.p2?.phone || '',
          checkedIn: !!pair.p2?.checkedIn,
        },
        categoryId: pair.categoryId,
        teamNumber: pair.teamNumber,
        teamCode: pair.teamCode,
        bracket: pair.bracket,
      }));
    }

    const sanitized = sanitize({
      ...eventWithoutEntries,
      createdAt: event.createdAt || Date.now(),
    });

    await db.collection("events").doc(event.pin).set(sanitized);

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Erro ao salvar evento:", err);
    return res.status(500).json({ error: `Erro interno: ${err.message}` });
  }
}
