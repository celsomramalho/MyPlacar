import { collection, getDocs, type Firestore } from 'firebase/firestore';
import type { MatchHistoryItem } from '@modules/history/types';
import { mirrorMatches } from './matches';
import { mirrorIcon, mirrorPartners, mirrorUser, type SupabaseMirrorPartner, type SupabaseMirrorUserProfile } from './mirror';

export interface SupabaseAdminMigrationResult {
  users: number;
  matches: number;
  partners: number;
  icons: number;
}

export const migrateFirebaseAdminDataToSupabase = async (
  db: Firestore,
): Promise<SupabaseAdminMigrationResult> => {
  let usersCount = 0;
  let matchesCount = 0;
  let partnersCount = 0;
  let iconsCount = 0;

  const usersSnap = await getDocs(collection(db, 'users'));
  for (const docSnap of usersSnap.docs) {
    const data = docSnap.data() as SupabaseMirrorUserProfile;
    if (data.email && data.pin) {
      mirrorUser(data);
      usersCount++;
    }
  }

  const matchesSnap = await getDocs(collection(db, 'matches'));
  const matchesByOwner = new Map<string, { match: Record<string, unknown>; ownerPin: string }[]>();
  matchesSnap.forEach(docSnap => {
    const data = { id: docSnap.id, ...docSnap.data() } as Record<string, unknown>;
    const ownerEmail = (data.ownerEmail as string) || '';
    const ownerPin = (data.ownerPin as string) || '';
    if (!ownerEmail) return;
    if (!matchesByOwner.has(ownerEmail)) matchesByOwner.set(ownerEmail, []);
    matchesByOwner.get(ownerEmail)!.push({ match: data, ownerPin });
  });

  for (const [ownerEmail, items] of matchesByOwner) {
    const ownerPin = items[0].ownerPin;
    const matches = items.map(i => i.match) as unknown as MatchHistoryItem[];
    mirrorMatches(matches, ownerEmail, ownerPin);
    matchesCount += matches.length;
  }

  const partnersSnap = await getDocs(collection(db, 'user_partners_metadata'));
  for (const docSnap of partnersSnap.docs) {
    const ownerEmail = docSnap.id;
    const partnersList = docSnap.data().partners_list || [];
    const validPartners = partnersList.filter(
      (partner: Record<string, unknown>) =>
        partner.pin && typeof partner.pin === 'string' && partner.pin.trim().length > 0,
    ) as SupabaseMirrorPartner[];
    if (ownerEmail && validPartners.length > 0) {
      mirrorPartners(ownerEmail, validPartners);
      partnersCount += validPartners.length;
    }
  }

  const sportSnap = await getDocs(collection(db, 'sport_icons'));
  sportSnap.forEach(docSnap => {
    mirrorIcon('sport', { id: docSnap.id, name: '', url: '', ...docSnap.data() });
    iconsCount++;
  });

  const categorySnap = await getDocs(collection(db, 'category_icons'));
  categorySnap.forEach(docSnap => {
    mirrorIcon('category', { id: docSnap.id, name: '', url: '', ...docSnap.data() });
    iconsCount++;
  });

  return {
    users: usersCount,
    matches: matchesCount,
    partners: partnersCount,
    icons: iconsCount,
  };
};
