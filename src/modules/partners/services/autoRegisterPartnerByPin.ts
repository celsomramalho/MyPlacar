import { findUserByPin } from '@infra/firebase/users';
import type { Firestore } from 'firebase/firestore';

import type { Partner } from '../types';

interface AutoRegisterResult {
  nickname: string;
  partner: Partner;
}

interface AutoRegisterOptions {
  origin?: Partner['origin'];
  fallbackNickname?: string;
}

export const autoRegisterPartnerByPin = async (
  db: Firestore,
  pin: string,
  options?: AutoRegisterOptions,
): Promise<AutoRegisterResult | null> => {
  const user = await findUserByPin(db, pin, { fallbackNickname: options?.fallbackNickname });
  if (!user) {
    return null;
  }

  return {
    nickname: user.nickname,
    partner: {
      id: user.id,
      name: user.name,
      nickname: user.nickname,
      pin: user.pin,
      addedAt: Date.now(),
      origin: options?.origin || 'qrcode',
      gender: user.gender,
    },
  };
};
