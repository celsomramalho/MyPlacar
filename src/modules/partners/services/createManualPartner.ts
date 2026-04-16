import type { Partner } from '../types';

interface CreateManualPartnerInput {
  pin: string;
  nickname: string;
  gender: 'M' | 'F';
  name?: string;
}

export const createManualPartner = ({
  pin,
  nickname,
  gender,
  name,
}: CreateManualPartnerInput): Partner => ({
  id: `p_${Date.now()}`,
  name,
  nickname,
  pin: pin.toUpperCase(),
  origin: 'manual',
  addedAt: Date.now(),
  gender,
});
