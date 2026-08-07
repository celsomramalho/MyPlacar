export interface TournamentPair {
  id: string;
  p1: TournamentEntry;
  p2: TournamentEntry;
}

export interface TournamentMatch {
  id: string;
  pair1Id: string;
  pair2Id: string;
  status: 'waiting' | 'live' | 'finished';
  result?: string;
  winnerPairId?: string;
  ownerPin?: string;
  matchId?: string;
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
  coAdminPins?: string[];
  eventDateText?: string;
  startDate?: string;
  endDate?: string;
  courtsCount?: number;
  registrationFee?: number;
  extraCategoryFee?: number;
  eventStatus?: EventStatusOption;
  categories?: EventCategory[];
}

export interface TournamentEntry {
  email: string;
  name: string;
  nickname: string;
  pin: string;
  joinedAt: number;
  gender?: 'M' | 'F';
  checkedIn?: boolean;
  dueAmount?: number;
  paymentStatus?: 'Pendente' | 'Pago' | 'Isento';
  paidAmount?: number;
  categoryIds?: string[];
}

export interface EventRegistration {
  pin: string;
  name: string;
  joinedAt: number;
  bannerUrl?: string | null;
}
