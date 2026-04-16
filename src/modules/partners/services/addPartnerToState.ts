import type { Partner } from '../types';

export const normalizePartnerPin = (pin: string) => pin.toUpperCase().trim();

export const hasPartnerWithPin = (
  partners: Partner[],
  pin: string,
): boolean => {
  const normalizedPin = normalizePartnerPin(pin);
  return partners.some(partner => normalizePartnerPin(partner.pin) === normalizedPin);
};

export const addPartnerToState = (
  previousPartners: Partner[],
  partner: Partner,
): Partner[] => {
  const normalizedPin = normalizePartnerPin(partner.pin);
  const existingIndex = previousPartners.findIndex(
    existingPartner => normalizePartnerPin(existingPartner.pin) === normalizedPin,
  );

  if (existingIndex === -1) {
    return [
      {
        ...partner,
        pin: normalizedPin,
      },
      ...previousPartners,
    ];
  }

  const nextPartners = [...previousPartners];
  const existingPartner = nextPartners[existingIndex];

  nextPartners[existingIndex] = {
    ...existingPartner,
    ...partner,
    id: existingPartner.id,
    pin: normalizedPin,
    addedAt: existingPartner.addedAt,
    nickname: partner.nickname || existingPartner.nickname,
    name: partner.name || existingPartner.name,
    gender: partner.gender || existingPartner.gender,
  };

  return nextPartners;
};
