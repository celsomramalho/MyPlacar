import type { TournamentEvent } from '../types';

export type RegistrationPeriodStatus = 'not_started' | 'open' | 'closed';

export interface RegistrationPeriodInfo {
  status: RegistrationPeriodStatus;
  isOpen: boolean;
  message: string;
}

/**
 * Avalia se o período de inscrições de um evento está aberto.
 * Compara as datas startDate e endDate no fuso horário local (formato YYYY-MM-DD).
 */
export const getRegistrationPeriodStatus = (
  event: Pick<TournamentEvent, 'startDate' | 'endDate' | 'active'>,
  now = new Date()
): RegistrationPeriodInfo => {
  if (event.active === false) {
    return { status: 'closed', isOpen: false, message: 'Evento inativo' };
  }

  // Data local do cliente no formato YYYY-MM-DD
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${day}`;

  if (event.startDate && todayStr < event.startDate) {
    const [sY, sM, sD] = event.startDate.split('-');
    const formattedStart = `${sD}/${sM}/${sY}`;
    return {
      status: 'not_started',
      isOpen: false,
      message: `Inscrições abrem em ${formattedStart}`,
    };
  }

  if (event.endDate && todayStr > event.endDate) {
    return {
      status: 'closed',
      isOpen: false,
      message: 'Inscrições encerradas',
    };
  }

  let message = 'Inscrições abertas';
  if (event.endDate) {
    const [eY, eM, eD] = event.endDate.split('-');
    message = `Inscrições até ${eD}/${eM}/${eY}`;
  }

  return {
    status: 'open',
    isOpen: true,
    message,
  };
};

export const isRegistrationPeriodOpen = (
  event: Pick<TournamentEvent, 'startDate' | 'endDate' | 'active'>,
  now = new Date()
): boolean => {
  return getRegistrationPeriodStatus(event, now).isOpen;
};

/**
 * Retorna a data atual no formato YYYY-MM-DD no fuso horário local.
 */
export const getTodayDateStr = (now = new Date()): string => {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Avalia se o período do torneio (definido no cadastro do evento via tournamentStartDate e tournamentEndDate)
 * está ativo no momento. Se as datas do torneio estiverem definidas, compara com a data atual.
 * Caso não estejam preenchidas, recorre ao status do evento.
 */
export const isTournamentPeriodActive = (
  event: Pick<TournamentEvent, 'tournamentStartDate' | 'tournamentEndDate' | 'eventStatus' | 'active'>,
  now = new Date()
): boolean => {
  if (event.active === false) return false;

  const todayStr = getTodayDateStr(now);

  if (event.tournamentStartDate && todayStr < event.tournamentStartDate) {
    return false;
  }
  if (event.tournamentEndDate && todayStr > event.tournamentEndDate) {
    return false;
  }

  if (event.tournamentStartDate || event.tournamentEndDate) {
    return true;
  }

  // Fallback se não configurado período de torneio
  return event.eventStatus === 'Pronto para check-in' || event.eventStatus === 'Em andamento';
};

/**
 * Extrai a data de realização/finalização de uma partida no formato YYYY-MM-DD.
 */
export const getMatchDateStr = (match: import('../types').TournamentMatch): string | null => {
  if (match.matchDate && /^\d{4}-\d{2}-\d{2}$/.test(match.matchDate)) {
    return match.matchDate;
  }
  const dateStr = match.finishedAt || match.startedAt;
  if (dateStr) {
    try {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
    } catch {}
  }
  return null;
};

/**
 * Verifica se um participante possui ao menos uma partida finalizada na data informada (padrão: hoje).
 * Usado para check-in automático diário.
 */
export const entryHasFinishedMatchOnDate = (
  entry?: { email?: string; pin?: string } | null,
  matches?: import('../types').TournamentMatch[] | null,
  pairsById?: Map<string, import('../types').TournamentPair> | Record<string, import('../types').TournamentPair> | null,
  targetDate: string = getTodayDateStr()
): boolean => {
  if (!entry || (!entry.email && !entry.pin) || !matches || matches.length === 0) {
    return false;
  }
  const email = entry.email?.toLowerCase().trim();
  const pin = entry.pin?.toUpperCase().trim();

  return matches.some((m) => {
    if (m.status !== 'finished') return false;

    const matchDay = getMatchDateStr(m);
    if (matchDay && matchDay !== targetDate) {
      return false;
    }

    const pair1 = m.pair1 || (m.pair1Id ? (pairsById instanceof Map ? pairsById.get(m.pair1Id) : pairsById?.[m.pair1Id]) : undefined);
    const pair2 = m.pair2 || (m.pair2Id ? (pairsById instanceof Map ? pairsById.get(m.pair2Id) : pairsById?.[m.pair2Id]) : undefined);

    const isInPair = (p?: import('../types').TournamentPair) => {
      if (!p) return false;
      const isP1 = (p.p1?.email && email && p.p1.email.toLowerCase().trim() === email) || (p.p1?.pin && pin && p.p1.pin.toUpperCase().trim() === pin);
      const isP2 = (p.p2?.email && email && p.p2.email.toLowerCase().trim() === email) || (p.p2?.pin && pin && p.p2.pin.toUpperCase().trim() === pin);
      return Boolean(isP1 || isP2);
    };

    return isInPair(pair1) || isInPair(pair2);
  });
};

/**
 * Verifica se um participante possui ao menos uma partida finalizada em qualquer data no evento.
 * Usado para desativação/cancelamento de inscrição.
 */
export const entryHasFinishedMatch = (
  entry?: { email?: string; pin?: string } | null,
  matches?: import('../types').TournamentMatch[] | null,
  pairsById?: Map<string, import('../types').TournamentPair> | Record<string, import('../types').TournamentPair> | null
): boolean => {
  if (!entry || (!entry.email && !entry.pin) || !matches || matches.length === 0) {
    return false;
  }
  const email = entry.email?.toLowerCase().trim();
  const pin = entry.pin?.toUpperCase().trim();

  return matches.some((m) => {
    if (m.status !== 'finished') return false;
    const pair1 = m.pair1 || (m.pair1Id ? (pairsById instanceof Map ? pairsById.get(m.pair1Id) : pairsById?.[m.pair1Id]) : undefined);
    const pair2 = m.pair2 || (m.pair2Id ? (pairsById instanceof Map ? pairsById.get(m.pair2Id) : pairsById?.[m.pair2Id]) : undefined);

    const isInPair = (p?: import('../types').TournamentPair) => {
      if (!p) return false;
      const isP1 = (p.p1?.email && email && p.p1.email.toLowerCase().trim() === email) || (p.p1?.pin && pin && p.p1.pin.toUpperCase().trim() === pin);
      const isP2 = (p.p2?.email && email && p.p2.email.toLowerCase().trim() === email) || (p.p2?.pin && pin && p.p2.pin.toUpperCase().trim() === pin);
      return Boolean(isP1 || isP2);
    };

    return isInPair(pair1) || isInPair(pair2);
  });
};

/**
 * Avalia se o participante está com check-in válido para a data especificada (padrão: hoje).
 * Se o evento tiver múltiplos dias, o check-in é limpo todo início de dia (check-in de datas anteriores não é válido hoje).
 * Partida finalizada no dia confere check-in automático no dia.
 */
export const isEntryCheckedInToday = (
  entry?: import('../types').TournamentEntry | null,
  matches?: import('../types').TournamentMatch[] | null,
  pairsById?: Map<string, import('../types').TournamentPair> | Record<string, import('../types').TournamentPair> | null,
  targetDate: string = getTodayDateStr()
): boolean => {
  if (!entry) return false;

  // 1. Partida finalizada HOJE confere check-in automático para hoje
  if (entryHasFinishedMatchOnDate(entry, matches, pairsById, targetDate)) {
    return true;
  }

  // 2. Se marcado check-in para hoje
  if (entry.checkedIn) {
    if (entry.checkInDate) {
      return entry.checkInDate === targetDate;
    }
    if (entry.checkInDates && Array.isArray(entry.checkInDates)) {
      return entry.checkInDates.includes(targetDate);
    }
    // Para entradas antigas sem checkInDate registrado:
    // Aceita apenas se não tiver data divergente gravada
    return true;
  }

  // 3. Checagem em histórico de checkInDates
  if (entry.checkInDates && Array.isArray(entry.checkInDates) && entry.checkInDates.includes(targetDate)) {
    return true;
  }

  return false;
};
