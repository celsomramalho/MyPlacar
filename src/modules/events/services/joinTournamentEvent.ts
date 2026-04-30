import type { Firestore } from 'firebase/firestore';
import {
  fetchEventByPin,
  fetchEventEntry,
  saveEventEntry,
  saveUserEventRegistration,
} from '@infra/firebase';
import type { EventRegistration, TournamentEntry, TournamentEvent } from '../types';

interface EventJoinProfile {
  email: string;
  name: string;
  nickname: string;
  pin: string;
  gender?: 'M' | 'F';
}

export const joinTournamentEvent = async (
  db: Firestore,
  pin: string,
  profile: EventJoinProfile,
): Promise<{ event: TournamentEvent; joinedAt: number; registration: EventRegistration } | null> => {
  const event = await fetchEventByPin(db, pin) as TournamentEvent | null;
  if (!event || !event.active) return null;

  const email = profile.email.toLowerCase().trim();
  const existingEntry = await fetchEventEntry(db, pin, email);
  const joinedAt = existingEntry?.joinedAt ?? Date.now();

  if (!existingEntry) {
    const entry: TournamentEntry = {
      email,
      name: profile.name,
      nickname: profile.nickname,
      pin: profile.pin,
      gender: profile.gender || (profile.nickname.toLowerCase().endsWith('a') ? 'F' : 'M'),
      joinedAt,
    };
    await saveEventEntry(db, pin, entry);
  }

  const registration: EventRegistration = {
    pin,
    name: event.name,
    joinedAt,
    bannerUrl: event.bannerUrl || null,
  };
  await saveUserEventRegistration(db, email, pin, registration);

  return { event, joinedAt, registration };
};
