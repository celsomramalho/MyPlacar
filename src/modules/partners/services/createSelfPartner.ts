import type { UserProfile } from '@modules/auth';
import type { Partner } from '../types';

export const createSelfPartner = (userProfile: UserProfile): Partner => ({
  id: 'me',
  name: userProfile.name,
  nickname: userProfile.nickname || userProfile.name.split(' ')[0] || 'Eu',
  pin: userProfile.pin,
  origin: 'manual',
  addedAt: 0,
  gender: userProfile.gender || 'M',
});
