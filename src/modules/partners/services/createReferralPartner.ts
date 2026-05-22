import { normalizePartnerPin } from './addPartnerToState';
import type { FirebaseReferredUser } from '@infra/firebase/users';

import type { Partner } from '../types';

export const createReferralPartner = (user: FirebaseReferredUser): Partner => ({
  id: user.id,
  name: user.name,
  nickname: user.nickname,
  pin: normalizePartnerPin(user.pin),
  origin: 'referral',
  addedAt: user.addedAt,
  gender: user.gender,
});
