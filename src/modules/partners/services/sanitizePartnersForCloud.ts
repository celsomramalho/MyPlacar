import { normalizePartnerPin } from './addPartnerToState';

import type { Partner } from '../types';

export interface CloudPartnerPayload {
  id: string;
  pin: string;
  nickname: string;
  name: string;
  origin: Partner['origin'];
  addedAt: number;
  gender: 'M' | 'F';
}

export const sanitizePartnersForCloud = (
  partners: Partner[],
): CloudPartnerPayload[] => partners.map(partner => ({
  id: partner.id,
  pin: normalizePartnerPin(partner.pin),
  nickname: partner.nickname || normalizePartnerPin(partner.pin),
  name: partner.name || '',
  origin: partner.origin || 'manual',
  addedAt: partner.addedAt ?? 0,
  gender: partner.gender || 'M',
}));
