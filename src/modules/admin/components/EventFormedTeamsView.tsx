import React, { useState } from 'react';
import { Play } from 'lucide-react';
import type { TournamentEvent, TournamentMatch } from '@modules/events/types';
import { CourtQueuePanel } from '@modules/events/domain/queue';
import { useGame } from '@modules/game';
import { useUI } from '@modules/ui';
import { getDb } from '@infra/firebase';
import type { Firestore } from 'firebase/firestore';
import { getCourtColors } from '../../../constants.ts';
import { guessPartnerGender } from '@modules/partners/services/guessPartnerGender';

interface Props {
  event: TournamentEvent;
  onUpdateEvent?: (event: TournamentEvent) => void;
  isReadOnly?: boolean;
}

const getPhaseLabel = (phase?: string) => {
  if (phase === 'chave1') return 'Chave 1';
  if (phase === 'chave2') return 'Chave 2';
  return phase || 'Jogo';
};

export const EventFormedTeamsView: React.FC<Props> = ({ event, onUpdateEvent, isReadOnly = false }) => {
  const [refreshingMatchId, setRefreshingMatchId] = useState<string | null>(null);
  const { setMatchSettings } = useGame();
  const { setCurrentScreen, setModalConfig } = useUI();

  // Lookups para resolução de apelidos e gêneros ao abrir regras do jogo
  const entries = event.entries || [];
  const entriesByEmail = React.useMemo(() => {
    const map = new Map<string, string>();
    entries.forEach((e) => {
      const nick = e.nickname?.trim() || e.name?.trim();
      if (nick && e.email) map.set(e.email.toLowerCase().trim(), nick);
    });
    return map;
  }, [entries]);

  const entriesByPin = React.useMemo(() => {
    const map = new Map<string, string>();
    entries.forEach((e) => {
      const nick = e.nickname?.trim() || e.name?.trim();
      if (nick && e.pin) map.set(e.pin.toLowerCase().trim(), nick);
    });
    return map;
  }, [entries]);

  const entryLookup = React.useMemo(() => {
    const byPin = new Map<string, (typeof entries)[0]>();
    const byEmail = new Map<string, (typeof entries)[0]>();
    const byName = new Map<string, (typeof entries)[0]>();
    entries.forEach((e) => {
      if (e.pin) byPin.set(e.pin.toLowerCase().trim(), e);
      if (e.email) byEmail.set(e.email.toLowerCase().trim(), e);
      if (e.nickname) byName.set(e.nickname.toLowerCase().trim(), e);
      if (e.name) byName.set(e.name.toLowerCase().trim(), e);
    });
    return { byPin, byEmail, byName };
  }, [entries]);

  const getPlayerNick = (p?: { nickname?: string; name?: string; email?: string; pin?: string }) => {
    if (!p) return '';
    if (p.email && entriesByEmail.has(p.email.toLowerCase().trim())) {
      return entriesByEmail.get(p.email.toLowerCase().trim())!;
    }
    if (p.pin && entriesByPin.has(p.pin.toLowerCase().trim())) {
      return entriesByPin.get(p.pin.toLowerCase().trim())!;
    }
    return p.nickname?.trim() || p.name?.trim() || 'Jogador';
  };

  const getPlayerGender = (
    p?: { nickname?: string; name?: string; email?: string; pin?: string; gender?: 'M' | 'F' },
    fallbackGender: 'M' | 'F' = 'M'
  ): 'M' | 'F' => {
    if (!p) return fallbackGender;
    if (p.email && entryLookup.byEmail.has(p.email.toLowerCase().trim())) {
      const g = entryLookup.byEmail.get(p.email.toLowerCase().trim())?.gender;
      if (g === 'M' || g === 'F') return g;
    }
    if (p.pin && entryLookup.byPin.has(p.pin.toLowerCase().trim())) {
      const g = entryLookup.byPin.get(p.pin.toLowerCase().trim())?.gender;
      if (g === 'M' || g === 'F') return g;
    }
    const rawNick = (p.nickname || '').toLowerCase().trim();
    if (rawNick && entryLookup.byName.has(rawNick)) {
      const g = entryLookup.byName.get(rawNick)?.gender;
      if (g === 'M' || g === 'F') return g;
    }
    const rawName = (p.name || '').toLowerCase().trim();
    if (rawName && entryLookup.byName.has(rawName)) {
      const g = entryLookup.byName.get(rawName)?.gender;
      if (g === 'M' || g === 'F') return g;
    }
    if (p.gender === 'M' || p.gender === 'F') return p.gender;
    const candidateName = p.name?.trim() || p.nickname?.trim() || '';
    if (candidateName) {
      const guessed = guessPartnerGender(candidateName);
      if (guessed) return guessed;
    }
    return fallbackGender;
  };

  const pairs = event.pairs || [];
  const pairsById = React.useMemo(() => {
    const map: Record<string, (typeof pairs)[0]> = {};
    pairs.forEach((p) => { map[p.id] = p; });
    return map;
  }, [pairs]);

  const handleOpenMatchRules = (match: TournamentMatch) => {
    if (isReadOnly) return;
    const pair1 = match.pair1 || (match.pair1Id ? pairsById[match.pair1Id] : undefined);
    const pair2 = match.pair2 || (match.pair2Id ? pairsById[match.pair2Id] : undefined);

    let player1 = pair1?.p1 ? getPlayerNick(pair1.p1) : match.pair1Label || '';
    let player3 = pair1?.p2 ? getPlayerNick(pair1.p2) : '';
    let player2 = pair2?.p1 ? getPlayerNick(pair2.p1) : match.pair2Label || '';
    let player4 = pair2?.p2 ? getPlayerNick(pair2.p2) : '';
    const courtColors = getCourtColors(match.court || '');

    const categoryId = match.categoryId || pair1?.categoryId || pair2?.categoryId;
    const matchCat = categoryId ? event.categories?.find((c) => c.id === categoryId) : undefined;

    let isDoubles = true;
    if (matchCat?.format) {
      isDoubles = matchCat.format.toLowerCase() === 'duplas';
    } else if (matchCat?.name) {
      const catLower = matchCat.name.toLowerCase();
      if (catLower.includes('simples') || catLower.includes('single')) {
        isDoubles = false;
      } else if (catLower.includes('dupla') || catLower.includes('double')) {
        isDoubles = true;
      } else if (!pair1?.p2 && !pair2?.p2 && !player3 && !player4) {
        isDoubles = false;
      }
    } else if (!pair1?.p2 && !pair2?.p2 && !player3 && !player4) {
      isDoubles = false;
    }

    if (isDoubles) {
      if (!player3 && player1.includes('/')) {
        const parts = player1.split('/').map((s) => s.trim());
        player1 = parts[0];
        player3 = parts.slice(1).join(' / ');
      }
      if (!player4 && player2.includes('/')) {
        const parts = player2.split('/').map((s) => s.trim());
        player2 = parts[0];
        player4 = parts.slice(1).join(' / ');
      }
    } else {
      player3 = '';
      player4 = '';
    }

    const catNameLower = (matchCat?.name || '').toLowerCase();
    const isCatAllFemale =
      (matchCat?.gender1 === 'F' && matchCat?.gender2 === 'F') ||
      (matchCat?.gender1 === 'F' && !matchCat?.gender2 && !isDoubles) ||
      catNameLower.includes('fem') ||
      catNameLower.includes('dama') ||
      catNameLower.includes('mulher');

    const isCatAllMale =
      (matchCat?.gender1 === 'M' && matchCat?.gender2 === 'M') ||
      (matchCat?.gender1 === 'M' && !matchCat?.gender2 && !isDoubles) ||
      catNameLower.includes('masc') ||
      catNameLower.includes('homem');

    const defaultGenderP1: 'M' | 'F' = isCatAllFemale ? 'F' : (isCatAllMale ? 'M' : (matchCat?.gender1 || 'M'));
    const defaultGenderP2: 'M' | 'F' = isCatAllFemale ? 'F' : (isCatAllMale ? 'M' : (matchCat?.gender1 || 'M'));
    const defaultGenderP1Partner: 'M' | 'F' = isCatAllFemale ? 'F' : (isCatAllMale ? 'M' : (matchCat?.gender2 || 'M'));
    const defaultGenderP2Partner: 'M' | 'F' = isCatAllFemale ? 'F' : (isCatAllMale ? 'M' : (matchCat?.gender2 || 'M'));

    const p1Gender = getPlayerGender(pair1?.p1 || { name: player1, nickname: player1 }, defaultGenderP1);
    const p1PartnerGender = isDoubles ? getPlayerGender(pair1?.p2 || { name: player3, nickname: player3 }, defaultGenderP1Partner) : undefined;
    const p2Gender = getPlayerGender(pair2?.p1 || { name: player2, nickname: player2 }, defaultGenderP2);
    const p2PartnerGender = isDoubles ? getPlayerGender(pair2?.p2 || { name: player4, nickname: player4 }, defaultGenderP2Partner) : undefined;

    setMatchSettings((prev) => ({
      ...prev,
      player1,
      player2,
      player3,
      player4,
      isDoubles,
      p1Color: courtColors.p1Color,
      p2Color: courtColors.p2Color,
      p1Gender,
      p1PartnerGender,
      p2Gender,
      p2PartnerGender,
      tournamentMatch: {
        matchId: match.id,
        eventPin: event.pin,
        court: match.court || '',
        categoryName: matchCat?.name || '',
        roundName: getPhaseLabel(match.phase),
      },
    }));

    setCurrentScreen('new-game');
    setModalConfig({
      title: 'Atenção',
      message: (
        <>
          <span className="block">Configurar conforme evento: {event.name}</span>
          <span className="block mt-2">Fase: {getPhaseLabel(match.phase)}</span>
          <span className="mt-3 inline-flex items-center justify-center gap-2">
            Depois é só dar <Play size={18} className="text-emerald-500 fill-emerald-500" aria-hidden="true" />
          </span>
        </>
      ),
      onConfirm: () => setModalConfig(null),
    });
  };

  const handleRefreshEventScore = async (matchId: string) => {
    if (!event.pin || refreshingMatchId) return;
    setRefreshingMatchId(matchId);
    try {
      const db = getDb();
      if (!db) return;
      const { fetchEventByPinFromServer } = await import('@infra/firebase/events');
      const freshEvent = await fetchEventByPinFromServer(db as Firestore, event.pin);
      if (freshEvent && onUpdateEvent) {
        onUpdateEvent(freshEvent as TournamentEvent);
      }
    } catch (err) {
      console.error('Erro ao atualizar placar do evento:', err);
    } finally {
      setRefreshingMatchId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-full overflow-hidden">
      <CourtQueuePanel
        event={event}
        isReadOnly={isReadOnly}
        onUpdateEvent={onUpdateEvent}
        onOpenMatchRules={handleOpenMatchRules}
        onRefreshEventScore={handleRefreshEventScore}
        refreshingMatchId={refreshingMatchId}
      />
    </div>
  );
};
