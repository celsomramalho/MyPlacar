import type { MatchSettings } from '@game/types';
import type { Partner } from '../types';

const isVerifiedPartner = (partner: Partner): boolean => {
  return partner.pin === 'VERIFIED' || !!partner.pin;
};

export const applyPartnerSelection = (
  settings: MatchSettings,
  team1: Partner[],
  team2: Partner[],
): MatchSettings => {
  const next = { ...settings };

  if (!settings.isDoubles) {
    if (team1.length > 0) {
      next.p1Name = team1[0].nickname;
      next.p1Verified = isVerifiedPartner(team1[0]);
    }

    if (team2.length > 0) {
      next.p2Name = team2[0].nickname;
      next.p2Verified = isVerifiedPartner(team2[0]);
    }

    return next;
  }

  if (team1.length >= 1) {
    next.p1Name = team1[0].nickname;
    next.p1Verified = isVerifiedPartner(team1[0]);
  }

  if (team1.length >= 2) {
    next.p1Partner = team1[1].nickname;
    next.p1PartnerVerified = isVerifiedPartner(team1[1]);
  }

  if (team2.length >= 1) {
    next.p2Name = team2[0].nickname;
    next.p2Verified = isVerifiedPartner(team2[0]);
  }

  if (team2.length >= 2) {
    next.p2Partner = team2[1].nickname;
    next.p2PartnerVerified = isVerifiedPartner(team2[1]);
  }

  return next;
};
