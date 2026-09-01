export interface TournamentPair {
  id: string;
  p1: TournamentEntry;
  p2: TournamentEntry;
  /** Category and event-wide display number assigned when the team is formed. */
  categoryId?: string;
  teamNumber?: number;
  teamCode?: string;
  bracket?: 1 | 2;
  bracketOrder?: number;
}

export const minifyEntryForPair = (entry: Partial<TournamentEntry>): TournamentEntry => ({
  email: entry.email || '',
  name: entry.name || '',
  nickname: entry.nickname || entry.name || '',
  pin: entry.pin || '',
  joinedAt: entry.joinedAt || 0,
  gender: entry.gender || 'M',
  categoryIds: entry.categoryIds || [],
  registrationId: entry.registrationId,
  shirtSize: entry.shirtSize || 'M',
  phone: entry.phone || '',
  checkedIn: !!entry.checkedIn,
});

export const minifyPairForStorage = (pair: TournamentPair): TournamentPair => ({
  id: pair.id,
  p1: minifyEntryForPair(pair.p1),
  p2: minifyEntryForPair(pair.p2),
  categoryId: pair.categoryId,
  teamNumber: pair.teamNumber,
  teamCode: pair.teamCode,
  bracket: pair.bracket,
  bracketOrder: pair.bracketOrder,
});

/**
 * Ordena os participantes da dupla para que, em times mistos (mulher e homem),
 * a mulher (gender === 'F') seja sempre p1 (primeiro nome) e o homem (gender === 'M') seja sempre p2.
 */
export const orderPairEntriesForMixed = (
  entry1: TournamentEntry,
  entry2: TournamentEntry,
): [TournamentEntry, TournamentEntry] => {
  if (entry1.gender === 'M' && entry2.gender === 'F') {
    return [entry2, entry1];
  }
  return [entry1, entry2];
};

export interface MatchSetScore {
  p1?: number | null;
  p2?: number | null;
  inProgress?: boolean;
}

export interface TournamentMatch {
  id: string;
  matchNumber?: number;
  matchCode?: string;
  categoryId?: string;
  phase?: 'chave1' | 'chave2' | 'semifinal' | 'final' | '3lugar' | string;
  pair1Id?: string;
  pair2Id?: string;
  pair1Label?: string;
  pair2Label?: string;
  pair1?: TournamentPair;
  pair2?: TournamentPair;
  status: 'waiting' | 'live' | 'finished';
  result?: string;
  scores?: MatchSetScore[];
  winnerPairId?: string;
  loserPairId?: string;
  ownerPin?: string;
  matchId?: string;
  court?: string;
  order?: number;
  frozen?: boolean;
}

export interface TournamentConfig {
  sportType: string;
  sets: 1 | 3 | 5;
  gamesPerSet: number;
  noAd: boolean;
  isLocked: boolean;
}

export type EventStatusOption =
  | 'Em configuração'
  | 'Inscrições abertas'
  | 'Inscrições encerradas'
  | 'Pronto para check-in'
  | 'Pronto para sorteio'
  | 'Em andamento'
  | 'Finalizado'
  | 'Cancelado';

export const EVENT_STATUS_OPTIONS: EventStatusOption[] = [
  'Em configuração',
  'Inscrições abertas',
  'Inscrições encerradas',
  'Pronto para check-in',
  'Pronto para sorteio',
  'Em andamento',
  'Finalizado',
  'Cancelado',
];

export type EventTypeOption =
  | 'Chave classificatória'
  | 'Chave mata-mata'
  | 'Super 8'
  | 'Ranking';

export const EVENT_TYPE_OPTIONS: EventTypeOption[] = [
  'Chave classificatória',
  'Chave mata-mata',
  'Super 8',
  'Ranking',
];

export interface PlayerStanding {
  entry: TournamentEntry;
  played: number;
  wins: number;
  losses: number;
  gamesWon: number;
  gamesLost: number;
  gamesDiff: number;
  rank?: number;
  tieBreakNote?: string;
  isTiedWithOthers?: boolean;
}

export type DrawTypeOption =
  | 'Manual'
  | 'Sistema';

export const DRAW_TYPE_OPTIONS: DrawTypeOption[] = [
  'Manual',
  'Sistema',
];

export interface EventCategory {
  id: string;
  name: string;
  description?: string;
  format: 'Simples' | 'Duplas';
  priority: number;
  sportId: string;
  sportName?: string;
  abbreviation: string;
  gender1?: 'M' | 'F';
  gender2?: 'M' | 'F';
}

export interface EventSponsor {
  id: string;
  name: string;
  instagram?: string;
  logoUrl?: string;
  obs1?: string;
  obs2?: string;
  createdAt?: number;
}

export interface TournamentEvent {
  pin: string;
  name: string;
  bannerUrl?: string;
  active: boolean;
  createdAt: number;
  config?: TournamentConfig;
  pairs?: TournamentPair[];
  matches?: TournamentMatch[];
  entries?: TournamentEntry[];
  sponsors?: EventSponsor[];
  coAdminPins?: string[];
  eventDateText?: string;
  startDate?: string;
  endDate?: string;
  location?: string;
  courtsCount?: number;
  courtNames?: string[];
  interdictedCourts?: string[];
  registrationFee?: number;
  extraCategoryFee?: number;
  eventStatus?: EventStatusOption;
  eventType?: EventTypeOption;
  setsCount?: 1 | 3 | 5;
  gamesPerSet?: number;
  teamDrawType?: DrawTypeOption;
  bracketDrawType?: DrawTypeOption;
  matchDrawType?: DrawTypeOption;
  categories?: EventCategory[];
  regulationUrl?: string;
  regulationFileName?: string;
  information?: string;
}

export interface PaymentItem {
  id: string;
  date: number;
  amount: number;
  receiptUrl?: string;
  receiptFileName?: string;
}

export interface CategoryPartnerInfo {
  name: string;
  email: string;
  phone: string;
}

export interface TournamentEntry {
  registrationId?: number;
  email: string;
  name: string;
  nickname: string;
  pin: string;
  joinedAt: number;
  gender?: 'M' | 'F';
  checkedIn?: boolean;
  dueAmount?: number;
  paymentStatus?: 'Pendente' | 'Confirmado' | 'Pago' | 'Isento';
  paidAmount?: number;
  payments?: PaymentItem[];
  categoryIds?: string[];
  phone: string;
  shirtSize: 'P' | 'M' | 'G';
  partnerName?: string;
  partnerEmail?: string;
  partnerPhone?: string;
  categoryPartners?: Record<string, CategoryPartnerInfo>;
}

/**
 * Formata o Inscrição_ID para 4 dígitos (ex: 1 -> "0001", 24 -> "0024").
 */
export const formatRegistrationId = (id?: number | string | null): string => {
  if (id === undefined || id === null || id === '') return '';
  const num = Number(id);
  if (isNaN(num) || num <= 0) return String(id);
  return String(num).padStart(4, '0');
};

/**
 * Gera o próximo número sequencial de inscrição único para o evento.
 */
export const getNextRegistrationId = (
  entries?: Array<{ registrationId?: number | string | null }> | null,
): number => {
  if (!entries || entries.length === 0) return 1;
  const ids = entries
    .map((e) => Number(e.registrationId))
    .filter((n) => !isNaN(n) && n > 0);
  if (ids.length === 0) return 1;
  return Math.max(...ids) + 1;
};

export interface EventRegistration {
  pin: string;
  name: string;
  joinedAt: number;
  bannerUrl?: string | null;
}
