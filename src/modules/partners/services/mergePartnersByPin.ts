import { normalizePartnerPin } from './addPartnerToState';

import type { Partner } from '../types';

export const mergePartnersByPin = (
  myPin: string,
  ...partnerLists: Partner[][]
): Partner[] => {
  const normalizedMyPin = normalizePartnerPin(myPin);
  const partnersByPin = new Map<string, Partner>();

  partnerLists.forEach(partners => {
    partners.forEach(partner => {
      const normalizedPin = normalizePartnerPin(partner.pin);
      if (normalizedPin === normalizedMyPin) return;

      partnersByPin.set(normalizedPin, {
        ...partner,
        pin: normalizedPin,
      });
    });
  });

  return Array.from(partnersByPin.values()).sort((a, b) => b.addedAt - a.addedAt);
};
