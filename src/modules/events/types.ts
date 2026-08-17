export interface TournamentPair {
  id: string;
  p1: TournamentEntry;
  p2: TournamentEntry;
  /** Category and event-wide display number assigned when the team is formed. */
  categoryId?: string;
  teamNumber?: number;
  teamCode?: string;
  bracket?: 1 | 2;
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
  registrationFee?: number;
  extraCategoryFee?: number;
  eventStatus?: EventStatusOption;
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

export interface EventRegistration {
  pin: string;
  name: string;
  joinedAt: number;
  bannerUrl?: string | null;
}
