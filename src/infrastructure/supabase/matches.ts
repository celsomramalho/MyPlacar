import { supabase } from './client';
import type { MatchHistoryItem } from '@modules/history';

const isDev = import.meta.env.DEV;

const warn = (fn: string, err: unknown) => {
  if (isDev) console.warn(`[supabaseMirror] ${fn}:`, err);
  else {
    const msg = err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : (typeof err === 'object' && err !== null)
          ? JSON.stringify(err)
          : String(err);
    const normalizedMsg = msg || '';
    if (!normalizedMsg.includes('duplicate') && !normalizedMsg.includes('conflict')) {
      console.warn(`[supabaseMirror] ${fn}:`, normalizedMsg);
    }
  }
};

export const mirrorMatches = (
  matches: MatchHistoryItem[],
  ownerEmail: string,
  ownerPin: string,
): void => {
  if (!matches.length || !ownerEmail) return;

  const rows = matches.map((match) => ({
    id: match.id,
    owner_email: ownerEmail.toLowerCase().trim(),
    owner_pin: ownerPin || '',
    date: match.date || '',
    time: match.time || '',
    sport_type: match.sportType || '',
    p1_name: match.p1Name || '',
    p1_partner: match.p1Partner || '',
    p2_name: match.p2Name || '',
    p2_partner: match.p2Partner || '',
    p1_color: match.p1Color || '',
    p2_color: match.p2Color || '',
    p1_sets: match.p1Sets ?? [],
    p2_sets: match.p2Sets ?? [],
    score_summary: match.scoreSummary || '',
    winner: match.winner || '',
    winner_team: match.winnerTeam ?? 1,
    duration: match.duration ?? 0,
    stats: match.stats ?? {},
    point_history: match.pointHistory ?? [],
    location: match.location ?? null,
    involved_pins: match.involvedPins ?? [],
    is_synced: true,
    synced_at: new Date().toISOString(),
  }));

  supabase
    .from('matches')
    .upsert(rows, { onConflict: 'id' })
    .then(({ error }) => { if (error) warn('mirrorMatches', error); });
};

export const deleteSupabaseMatch = (id: string): void => {
  if (!id) return;

  supabase
    .from('matches')
    .delete()
    .eq('id', id)
    .then(({ error }) => { if (error) warn('deleteMatch', error); });
};

export const deleteSupabaseMatches = (ids: string[]): void => {
  if (!ids.length) return;

  supabase
    .from('matches')
    .delete()
    .in('id', ids)
    .then(({ error }) => { if (error) warn('deleteManyMatches', error); });
};

export const deleteAllSupabaseMatches = (ownerEmail: string): void => {
  if (!ownerEmail) return;

  supabase
    .from('matches')
    .delete()
    .eq('owner_email', ownerEmail.toLowerCase().trim())
    .then(({ error }) => { if (error) warn('deleteAllMatches', error); });
};
