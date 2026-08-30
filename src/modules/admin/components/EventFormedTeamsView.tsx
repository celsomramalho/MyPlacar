import React, { useState, useRef, useMemo } from 'react';
import {
  Layers,
  AlertCircle,
  Snowflake,
  Ban,
  CheckCircle2,
  Play,
  RefreshCw,
  ChevronDown,
  AlertTriangle,
  Flame,
} from 'lucide-react';
import type { TournamentEvent, TournamentMatch, MatchSetScore } from '@modules/events/types';
import { calculateQueueState } from '@modules/events/services/queueManager';
import { updatePlayoffProgression } from '@modules/events/services/matchProgression';
import { useGame } from '@modules/game';
import { useUI } from '@modules/ui';
import { getDb } from '@infra/firebase';
import type { Firestore } from 'firebase/firestore';
import type { FirebaseTournamentEvent } from '@infra/firebase/events';

interface Props {
  event: TournamentEvent;
  onUpdateEvent?: (event: TournamentEvent) => void;
}

const getMatchCodeLabel = (match: TournamentMatch) =>
  match.matchCode || String(match.matchNumber || 1).padStart(2, '0');

const getPhaseLabel = (phase?: string) => {
  if (phase === 'chave1') return 'Chave 1';
  if (phase === 'chave2') return 'Chave 2';
  return phase || 'Jogo';
};

export const EventFormedTeamsView: React.FC<Props> = ({ event, onUpdateEvent }) => {
  const [selectedCourtForMatch, setSelectedCourtForMatch] = useState<string | null>(null);
  const [activeSelectMatchId, setActiveSelectMatchId] = useState<string | null>(null);
  const [refreshingMatchId, setRefreshingMatchId] = useState<string | null>(null);
  const { setMatchSettings } = useGame();
  const { setCurrentScreen, setModalConfig } = useUI();

  const saveMatchesTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const queueState = calculateQueueState(event);
  const {
    courtStates,
    freeCourts,
    visibleMatches,
    totalPendingCount,
    totalCourtsCount,
    interdictedCourtsCount,
    busyCourtsCount,
    freeCourtsCount,
  } = queueState;

  const pairs = event.pairs || [];
  const pairsById = useMemo(() => {
    const map: Record<string, (typeof pairs)[0]> = {};
    pairs.forEach((p) => {
      map[p.id] = p;
    });
    return map;
  }, [pairs]);

  const entries = event.entries || [];
  const entriesByEmail = useMemo(() => {
    const map = new Map<string, string>();
    entries.forEach((e) => {
      const nick = e.nickname?.trim() || e.name?.trim();
      if (nick && e.email) map.set(e.email.toLowerCase().trim(), nick);
    });
    return map;
  }, [entries]);

  const entriesByPin = useMemo(() => {
    const map = new Map<string, string>();
    entries.forEach((e) => {
      const nick = e.nickname?.trim() || e.name?.trim();
      if (nick && e.pin) map.set(e.pin.toLowerCase().trim(), nick);
    });
    return map;
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

  // Atualiza partidas e quadras interditadas no Firestore e estado local
  const handlePersistEventChanges = async (
    updatedMatches?: TournamentMatch[],
    updatedInterdictedCourts?: string[]
  ) => {
    const nextEvent: TournamentEvent = {
      ...event,
      matches: updatedMatches ?? event.matches,
      interdictedCourts: updatedInterdictedCourts ?? event.interdictedCourts,
    };

    if (onUpdateEvent) {
      onUpdateEvent(nextEvent);
    }

    const db = getDb();
    if (db && event.pin) {
      try {
        const { updateEvent } = await import('@infra/firebase/events');
        const payload: Partial<FirebaseTournamentEvent> = {};
        if (updatedMatches !== undefined) payload.matches = updatedMatches;
        if (updatedInterdictedCourts !== undefined) payload.interdictedCourts = updatedInterdictedCourts;
        await updateEvent(db as Firestore, event.pin, payload);
      } catch (err) {
        console.error('Erro ao atualizar fila no Firestore:', err);
      }
    }
  };

  // Helper para parsear os sets de uma partida
  const parseMatchSets = (match: TournamentMatch, totalSets: number) => {
    const scores: MatchSetScore[] = Array.from({ length: totalSets }, (_, i) => {
      if (match.scores && match.scores[i]) {
        return match.scores[i];
      }
      if (match.result) {
        const parts = match.result.trim().split(/[\s,]+/);
        if (parts[i]) {
          const matchParts = parts[i].match(/(\d+)[\/xX\-](\d+)/);
          if (matchParts) {
            return { p1: Number(matchParts[1]), p2: Number(matchParts[2]) };
          }
        }
      }
      return { p1: null, p2: null };
    });

    let setsWon1 = 0;
    let setsWon2 = 0;

    scores.forEach((s) => {
      if (s.inProgress && match.status !== 'finished') return;
      if (s.p1 !== null && s.p1 !== undefined && s.p2 !== null && s.p2 !== undefined) {
        if (Number(s.p1) > Number(s.p2)) {
          setsWon1 += 1;
        } else if (Number(s.p2) > Number(s.p1)) {
          setsWon2 += 1;
        }
      }
    });

    return { scores, setsWon1, setsWon2 };
  };

  const handleScoreBlur = async () => {
    if (saveMatchesTimeoutRef.current) {
      clearTimeout(saveMatchesTimeoutRef.current);
      saveMatchesTimeoutRef.current = null;
    }
    const db = getDb();
    if (db && event.pin) {
      try {
        const { updateEvent } = await import('@infra/firebase/events');
        await updateEvent(db as Firestore, event.pin, { matches: event.matches });
      } catch (err) {
        console.error('Erro ao salvar placar no Firestore onBlur:', err);
      }
    }
  };

  // Manipulador de edição de placar com finalização automática da partida e liberação de quadra
  const handleScoreInputChange = (
    matchId: string,
    setIndex: number,
    player: 'p1' | 'p2',
    rawVal: string
  ) => {
    const totalSets = (event.setsCount || event.config?.sets || 1) as number;
    const setsToWin = Math.ceil(totalSets / 2);
    const allMatches = event.matches || [];

    const nextMatches = allMatches.map((m) => {
      if (m.id !== matchId) return m;

      const currentScores: MatchSetScore[] = Array.from({ length: totalSets }, (_, i) => {
        const existing = m.scores?.[i] || {};
        return {
          p1: existing.p1 !== undefined ? existing.p1 : null,
          p2: existing.p2 !== undefined ? existing.p2 : null,
        };
      });

      const parsedNum = rawVal.trim() === '' ? null : parseInt(rawVal, 10);
      const val = isNaN(parsedNum as number) ? null : parsedNum;

      currentScores[setIndex] = {
        ...currentScores[setIndex],
        [player]: val,
      };

      let setsWon1 = 0;
      let setsWon2 = 0;
      const resultParts: string[] = [];

      currentScores.forEach((s) => {
        if (s.p1 !== null && s.p1 !== undefined && s.p2 !== null && s.p2 !== undefined) {
          resultParts.push(`${s.p1}/${s.p2}`);
          if (Number(s.p1) > Number(s.p2)) {
            setsWon1 += 1;
          } else if (Number(s.p2) > Number(s.p1)) {
            setsWon2 += 1;
          }
        }
      });

      let status: 'waiting' | 'live' | 'finished' = m.status || 'live';
      let winnerPairId = m.winnerPairId;
      let loserPairId = m.loserPairId;
      let court = m.court;

      // Se atingiu o número de sets para vencer, finaliza e libera a quadra
      if (setsWon1 >= setsToWin) {
        status = 'finished';
        winnerPairId = m.pair1Id;
        loserPairId = m.pair2Id;
        court = undefined;
      } else if (setsWon2 >= setsToWin) {
        status = 'finished';
        winnerPairId = m.pair2Id;
        loserPairId = m.pair1Id;
        court = undefined;
      } else if (resultParts.length > 0) {
        status = 'live';
        winnerPairId = undefined;
        loserPairId = undefined;
      }

      return {
        ...m,
        scores: currentScores,
        result: resultParts.join(' '),
        status,
        winnerPairId,
        loserPairId,
        court,
      };
    });

    const progressedMatches = updatePlayoffProgression(event.pairs || [], nextMatches);

    if (onUpdateEvent) {
      onUpdateEvent({ ...event, matches: progressedMatches });
    }

    if (saveMatchesTimeoutRef.current) {
      clearTimeout(saveMatchesTimeoutRef.current);
    }

    saveMatchesTimeoutRef.current = setTimeout(async () => {
      const db = getDb();
      if (db && event.pin) {
        try {
          const { updateEvent } = await import('@infra/firebase/events');
          await updateEvent(db as Firestore, event.pin, { matches: progressedMatches });
        } catch (err) {
          console.error('Erro ao atualizar placar no Firestore:', err);
        }
      }
    }, 600);
  };

  // Alterna o status de interdição de uma quadra (Regra A: Vermelha)
  const handleToggleInterdictCourt = async (courtName: string) => {
    const current = new Set(event.interdictedCourts || []);
    if (current.has(courtName)) {
      current.delete(courtName);
    } else {
      current.add(courtName);
    }
    const nextInterdicted = Array.from(current);
    await handlePersistEventChanges(undefined, nextInterdicted);
  };

  // Alterna o congelamento manual de uma partida (Regra D: Vermelha/Congelada)
  const handleToggleFreezeMatch = async (matchId: string) => {
    const allMatches = event.matches || [];
    const nextMatches = allMatches.map((m) => {
      if (m.id === matchId) {
        return {
          ...m,
          frozen: !m.frozen,
        };
      }
      return m;
    });
    await handlePersistEventChanges(nextMatches);
  };

  // Vincula partida a uma quadra livre (Regra E: Fluxo de Entrada em Quadra)
  const handleAssignMatchToCourt = async (matchId: string, courtName: string) => {
    const allMatches = event.matches || [];
    const nextMatches = allMatches.map((m) => {
      if (m.id === matchId) {
        return {
          ...m,
          status: 'live' as const,
          court: courtName,
          frozen: false,
        };
      }
      return m;
    });
    setActiveSelectMatchId(null);
    setSelectedCourtForMatch(null);
    await handlePersistEventChanges(nextMatches);
  };

  // Desvincula/libera uma quadra ocupada voltando a partida para 'waiting' ou finalizando
  const handleFreeCourtMatch = async (matchId: string, finish = false) => {
    const allMatches = event.matches || [];
    const nextMatches = allMatches.map((m) => {
      if (m.id === matchId) {
        return {
          ...m,
          status: finish ? ('finished' as const) : ('waiting' as const),
          court: undefined,
        };
      }
      return m;
    });
    const progressed = finish ? updatePlayoffProgression(event.pairs || [], nextMatches) : nextMatches;
    await handlePersistEventChanges(progressed);
  };

  const handleOpenMatchRules = (match: TournamentMatch) => {
    const pair1 = match.pair1 || (match.pair1Id ? pairsById[match.pair1Id] : undefined);
    const pair2 = match.pair2 || (match.pair2Id ? pairsById[match.pair2Id] : undefined);

    const player1 = pair1?.p1 ? getPlayerNick(pair1.p1) : match.pair1Label || '';
    const player3 = pair1?.p2 ? getPlayerNick(pair1.p2) : '';
    const player2 = pair2?.p1 ? getPlayerNick(pair2.p1) : match.pair2Label || '';
    const player4 = pair2?.p2 ? getPlayerNick(pair2.p2) : '';

    setMatchSettings((prev) => ({
      ...prev,
      sportType: event.config?.sportType || prev.sportType,
      sets: event.config?.sets || event.setsCount || prev.sets,
      gamesPerSet: event.config?.gamesPerSet || prev.gamesPerSet,
      noAd: event.config?.noAd ?? prev.noAd,
      isDoubles: true,
      pendingTournamentMatchId: match.id,
      pendingTournamentPin: event.pin,
      pendingTournamentMatchCode: getMatchCodeLabel(match),
      pendingTournamentPhaseLabel: getPhaseLabel(match.phase),
      p1Name: player1,
      p1Partner: player3,
      p2Name: player2,
      p2Partner: player4,
      p1Gender: pair1?.p1.gender || prev.p1Gender,
      p1PartnerGender: pair1?.p2.gender || prev.p1PartnerGender,
      p2Gender: pair2?.p1.gender || prev.p2Gender,
      p2PartnerGender: pair2?.p2.gender || prev.p2PartnerGender,
      p1Verified: !!pair1?.p1,
      p1PartnerVerified: !!pair1?.p2,
      p2Verified: !!pair2?.p1,
      p2PartnerVerified: !!pair2?.p2,
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

  const totalSets = (event.setsCount || event.config?.sets || 1) as number;

  return (
    <div className="space-y-6 max-w-full overflow-hidden">
      {/* Header Geral do Gerenciamento de Fila */}
      <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-sm shrink-0 mt-0.5">
            <Layers size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-black text-slate-800 tracking-tight whitespace-nowrap truncate">Gerenciar fila</h2>
            <p className="text-xs text-slate-400 font-bold mt-0.5 whitespace-nowrap truncate">
              Controle de quadras ao vivo e fila única dinâmica de partidas.
            </p>

            {/* a) Volumetria logo abaixo do subtítulo */}
            <p className="text-xs font-bold text-slate-500 mt-1.5">
              Exibindo{' '}
              <span className="font-black text-slate-700">{visibleMatches.length}</span>
              {' '}de{' '}
              <span className="font-black text-slate-700">{totalPendingCount}</span>
              {' '}partidas pendentes na fila
              {totalPendingCount > visibleMatches.length && (
                <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">
                  +{totalPendingCount - visibleMatches.length} não exibidas
                </span>
              )}
            </p>

            {/* b) Indicativos de status das quadras abaixo da volumetria */}
            <div className="flex items-center gap-2 flex-wrap mt-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                {freeCourtsCount} {freeCourtsCount === 1 ? 'Livre' : 'Livres'}
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                {busyCourtsCount} {busyCourtsCount === 1 ? 'Ocupada' : 'Ocupadas'}
              </span>
              {interdictedCourtsCount > 0 && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black bg-red-50 text-red-700 border border-red-200 whitespace-nowrap">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  {interdictedCourtsCount} {interdictedCourtsCount === 1 ? 'Interditada' : 'Interditadas'}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* SEÇÃO A: Status das Quadras (Uma quadra por linha, 100% dentro do container) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-sm font-black text-slate-800 tracking-wider whitespace-nowrap">
            Quadras do evento ({totalCourtsCount})
          </h3>
        </div>

        {totalCourtsCount === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-8 text-center space-y-3">
            <div className="w-12 h-12 bg-blue-50 text-blue-500 rounded-2xl flex items-center justify-center mx-auto">
              <AlertCircle size={24} />
            </div>
            <p className="text-sm font-black text-slate-700 whitespace-nowrap">Nenhuma quadra configurada</p>
            <p className="text-xs text-slate-400 font-bold max-w-sm mx-auto">
              Defina a quantidade e os nomes das quadras na aba de Configurações para gerenciar as partidas.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {courtStates.map((court, index) => {
              const isFree = court.status === 'free';
              const isBusy = court.status === 'busy';
              const isInterdicted = court.status === 'interdicted';

              const activeMatch = court.activeMatch;
              const activeCat = court.activeMatchCategory;

              const p1 = activeMatch ? activeMatch.pair1 || (activeMatch.pair1Id && pairsById ? pairsById[activeMatch.pair1Id] : undefined) : undefined;
              const p2 = activeMatch ? activeMatch.pair2 || (activeMatch.pair2Id && pairsById ? pairsById[activeMatch.pair2Id] : undefined) : undefined;

              const team1P1Name = p1?.p1 ? getPlayerNick(p1.p1) : '';
              const team1P2Name = p1?.p2 ? getPlayerNick(p1.p2) : undefined;
              const team1Name = p1 ? (team1P2Name ? `${team1P1Name} & ${team1P2Name}` : team1P1Name) : activeMatch?.pair1Label || 'Time 1';
              const team1Code = p1 ? (p1.teamCode || `Time ${p1.teamNumber || ''}`) : '';

              const team2P1Name = p2?.p1 ? getPlayerNick(p2.p1) : '';
              const team2P2Name = p2?.p2 ? getPlayerNick(p2.p2) : undefined;
              const team2Name = p2 ? (team2P2Name ? `${team2P1Name} & ${team2P2Name}` : team2P1Name) : activeMatch?.pair2Label || 'Time 2';
              const team2Code = p2 ? (p2.teamCode || `Time ${p2.teamNumber || ''}`) : '';

              const parsedSets = activeMatch ? parseMatchSets(activeMatch, totalSets) : { scores: [], setsWon1: 0, setsWon2: 0 };
              const { scores, setsWon1, setsWon2 } = parsedSets;
              const matchCodeLabel = activeMatch ? getMatchCodeLabel(activeMatch) : '';
              const phaseLabel = activeMatch ? getPhaseLabel(activeMatch.phase) : '';

              return (
                <div
                  key={index}
                  className={`rounded-3xl border shadow-sm p-4 flex flex-col gap-2.5 transition-all overflow-hidden ${
                    isFree
                      ? 'bg-white border-emerald-200 hover:border-emerald-400'
                      : isBusy
                      ? 'bg-amber-50/40 border-amber-200 hover:border-amber-400'
                      : 'bg-red-50/40 border-red-200'
                  }`}
                >
                  {/* Linha Superior da Quadra: Identificação, Status e Botões de Ação */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    {/* Lado Esquerdo: Ícone + Nome da Quadra + Badge */}
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          isFree
                            ? 'bg-emerald-100 text-emerald-700'
                            : isBusy
                            ? 'bg-amber-200 text-amber-800'
                            : 'bg-red-200 text-red-700'
                        }`}
                      >
                        <Layers size={16} />
                      </div>
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <h4 className="text-sm font-black text-slate-800 tracking-tight whitespace-nowrap">
                          {court.courtName}
                        </h4>
                        {isFree && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black border bg-emerald-100 text-emerald-800 border-emerald-300 whitespace-nowrap">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Livre
                          </span>
                        )}
                        {isBusy && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black border bg-amber-100 text-amber-900 border-amber-300 whitespace-nowrap">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                            Ocupada (Ao vivo)
                          </span>
                        )}
                        {isInterdicted && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black border bg-red-100 text-red-800 border-red-300 whitespace-nowrap">
                            <Ban size={10} />
                            Interditada
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Lado Direito: Botões de Ação 100% contidos dentro do card */}
                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      {isBusy && activeMatch && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleFreeCourtMatch(activeMatch.id, false)}
                            className="px-3 py-1.5 bg-white hover:bg-slate-50 active:scale-95 text-slate-600 font-black text-xs rounded-xl border border-slate-200 transition-all whitespace-nowrap"
                            title="Desvincular da quadra e devolver para a fila de espera"
                          >
                            Voltar para fila
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenMatchRules(activeMatch)}
                            className="w-9 h-9 bg-[#fff8e6] hover:bg-emerald-50 active:scale-95 text-emerald-500 rounded-xl transition-all flex items-center justify-center shrink-0"
                            title="Abrir regras com os jogadores desta partida"
                          >
                            <Play size={18} className="fill-emerald-500" />
                          </button>
                        </>
                      )}

                      <button
                        type="button"
                        onClick={() => handleToggleInterdictCourt(court.courtName)}
                        className={`text-xs font-black px-3 py-1.5 rounded-xl border transition-all active:scale-95 flex items-center gap-1 whitespace-nowrap ${
                          isInterdicted
                            ? 'bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-50'
                            : 'bg-white text-slate-500 border-slate-200 hover:text-red-600 hover:border-red-200'
                        }`}
                        title={isInterdicted ? 'Liberar quadra para jogos' : 'Interditar esta quadra'}
                      >
                        {isInterdicted ? 'Desinterditar' : 'Interditar'}
                      </button>
                    </div>
                  </div>

                  {/* Linha Inferior da Quadra: Dados da Partida em Andamento e Placar Editável */}
                  {isBusy && activeMatch && (
                    <div className="mt-1 p-3 bg-white/95 rounded-2xl border border-amber-200/80 shadow-xs space-y-3">
                      {/* a) Abreviação da categoria + fase */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center text-[10px] font-black text-slate-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg whitespace-nowrap">
                          {activeCat?.abbreviation || activeCat?.name || ''}
                          {activeCat && ' · '}
                          {phaseLabel}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs font-black text-slate-800 whitespace-nowrap">
                            [{matchCodeLabel}] {phaseLabel ? `[${phaseLabel}]` : ''}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRefreshEventScore(activeMatch.id)}
                            disabled={refreshingMatchId === activeMatch.id}
                            className="w-8 h-8 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-blue-600 active:scale-95 transition-all flex items-center justify-center disabled:opacity-60"
                            title="Atualizar placar"
                          >
                            <RefreshCw size={14} className={refreshingMatchId === activeMatch.id ? 'animate-spin' : ''} />
                          </button>
                        </div>
                      </div>

                      {/* Placar e Nomes dos Times: Layout idêntico ao de categorias/partidas */}
                      {totalSets === 1 ? (
                        /* Layout para 1 Set */
                        <div className="flex items-center justify-between gap-4">
                          {/* Lado Esquerdo: Nomes dos Times */}
                          <div className="min-w-0 flex-1 space-y-3">
                            <div>
                              <p className="text-sm font-black text-slate-800 leading-tight truncate">
                                {team1Name}
                              </p>
                              {team1Code && (
                                <p className="text-xs font-bold text-slate-500">
                                  [{team1Code}]
                                </p>
                              )}
                            </div>
                            <div>
                              <p className="text-sm font-black text-slate-800 leading-tight truncate">
                                {team2Name}
                              </p>
                              {team2Code && (
                                <p className="text-xs font-bold text-slate-500">
                                  [{team2Code}]
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Lado Direito: Placar do Set 1 */}
                          <div className="flex flex-col items-center shrink-0">
                            {/* Linha 1: Pontuação Time 1 */}
                            <div className="flex items-center gap-2">
                              <span className="w-5 text-center text-sm font-black text-slate-800">
                                {setsWon1}
                              </span>
                              <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                maxLength={2}
                                value={scores[0]?.p1 !== null && scores[0]?.p1 !== undefined ? scores[0].p1 : ''}
                                onChange={(e) => handleScoreInputChange(activeMatch.id, 0, 'p1', e.target.value)}
                                onBlur={handleScoreBlur}
                                className={`w-9 h-9 sm:w-10 sm:h-10 border-2 border-black flex items-center justify-center text-center font-black text-sm outline-none transition-colors ${
                                  !scores[0]?.inProgress && scores[0]?.p1 !== null && scores[0]?.p1 !== undefined && scores[0]?.p2 !== null && scores[0]?.p2 !== undefined && Number(scores[0].p1) > Number(scores[0].p2)
                                    ? 'bg-[#22c55e] text-white'
                                    : 'bg-white text-slate-900 focus:bg-slate-50'
                                }`}
                              />
                            </div>

                            {/* Linha 2: Label set1 */}
                            <div className="flex items-center gap-2 py-1">
                              <span className="w-5" />
                              <span className="w-9 sm:w-10 text-center text-[10px] sm:text-xs font-bold text-slate-600">
                                set1
                              </span>
                            </div>

                            {/* Linha 3: Pontuação Time 2 */}
                            <div className="flex items-center gap-2">
                              <span className="w-5 text-center text-sm font-black text-slate-800">
                                {setsWon2}
                              </span>
                              <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                maxLength={2}
                                value={scores[0]?.p2 !== null && scores[0]?.p2 !== undefined ? scores[0].p2 : ''}
                                onChange={(e) => handleScoreInputChange(activeMatch.id, 0, 'p2', e.target.value)}
                                onBlur={handleScoreBlur}
                                className={`w-9 h-9 sm:w-10 sm:h-10 border-2 border-black flex items-center justify-center text-center font-black text-sm outline-none transition-colors ${
                                  !scores[0]?.inProgress && scores[0]?.p1 !== null && scores[0]?.p1 !== undefined && scores[0]?.p2 !== null && scores[0]?.p2 !== undefined && Number(scores[0].p2) > Number(scores[0].p1)
                                    ? 'bg-[#22c55e] text-white'
                                    : 'bg-white text-slate-900 focus:bg-slate-50'
                                }`}
                              />
                            </div>
                          </div>
                        </div>
                      ) : (
                        /* Layout para Mais de 1 Set (ex: 3 ou 5 sets) */
                        <div className="space-y-3">
                          {/* Time 1 */}
                          <div>
                            <p className="text-sm font-black text-slate-800 leading-tight truncate">
                              {team1Name}
                            </p>
                            {team1Code && (
                              <p className="text-xs font-bold text-slate-500">
                                [{team1Code}]
                              </p>
                            )}
                          </div>

                          {/* Grid de Sets */}
                          <div className="flex flex-col items-start pl-0.5">
                            {/* Linha 1: Input Placar Time 1 */}
                            <div className="flex items-center gap-1.5">
                              <span className="w-5 text-center text-sm font-black text-slate-800">
                                {setsWon1}
                              </span>
                              {scores.map((setScore, setIdx) => {
                                const isSetWon =
                                  !setScore.inProgress &&
                                  setScore.p1 !== null &&
                                  setScore.p1 !== undefined &&
                                  setScore.p2 !== null &&
                                  setScore.p2 !== undefined &&
                                  Number(setScore.p1) > Number(setScore.p2);

                                return (
                                  <input
                                    key={`p1_set_${setIdx}`}
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    maxLength={2}
                                    value={setScore.p1 !== null && setScore.p1 !== undefined ? setScore.p1 : ''}
                                    onChange={(e) =>
                                      handleScoreInputChange(activeMatch.id, setIdx, 'p1', e.target.value)
                                    }
                                    onBlur={handleScoreBlur}
                                    className={`w-9 h-9 sm:w-10 sm:h-10 border-2 border-black flex items-center justify-center text-center font-black text-sm outline-none transition-colors ${
                                      isSetWon
                                        ? 'bg-[#22c55e] text-white'
                                        : 'bg-white text-slate-900 focus:bg-slate-50'
                                    }`}
                                  />
                                );
                              })}
                            </div>

                            {/* Linha 2: Labels dos sets */}
                            <div className="flex items-center gap-1.5 py-1">
                              <span className="w-5" />
                              {scores.map((_, setIdx) => (
                                <span
                                  key={`label_set_${setIdx}`}
                                  className="w-9 sm:w-10 text-center text-[10px] sm:text-xs font-bold text-slate-600"
                                >
                                  set{setIdx + 1}
                                </span>
                              ))}
                            </div>

                            {/* Linha 3: Input Placar Time 2 */}
                            <div className="flex items-center gap-1.5">
                              <span className="w-5 text-center text-sm font-black text-slate-800">
                                {setsWon2}
                              </span>
                              {scores.map((setScore, setIdx) => {
                                const isSetWon =
                                  !setScore.inProgress &&
                                  setScore.p1 !== null &&
                                  setScore.p1 !== undefined &&
                                  setScore.p2 !== null &&
                                  setScore.p2 !== undefined &&
                                  Number(setScore.p2) > Number(setScore.p1);

                                return (
                                  <input
                                    key={`p2_set_${setIdx}`}
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    maxLength={2}
                                    value={setScore.p2 !== null && setScore.p2 !== undefined ? setScore.p2 : ''}
                                    onChange={(e) =>
                                      handleScoreInputChange(activeMatch.id, setIdx, 'p2', e.target.value)
                                    }
                                    onBlur={handleScoreBlur}
                                    className={`w-9 h-9 sm:w-10 sm:h-10 border-2 border-black flex items-center justify-center text-center font-black text-sm outline-none transition-colors ${
                                      isSetWon
                                        ? 'bg-[#22c55e] text-white'
                                        : 'bg-white text-slate-900 focus:bg-slate-50'
                                    }`}
                                  />
                                );
                              })}
                            </div>
                          </div>

                          {/* Time 2 */}
                          <div>
                            <p className="text-sm font-black text-slate-800 leading-tight truncate">
                              {team2Name}
                            </p>
                            {team2Code && (
                              <p className="text-xs font-bold text-slate-500">
                                [{team2Code}]
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {isFree && (
                    <p className="text-xs font-bold text-slate-400 whitespace-nowrap truncate">
                      Aguardando chamada de jogos · Quadra pronta para receber a próxima partida.
                    </p>
                  )}

                  {isInterdicted && (
                    <p className="text-xs font-black text-red-700 whitespace-nowrap truncate">
                      Quadra interditada para manutenção ou indisponível para jogos.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* SEÇÃO B, C, D: Fila Única Dinâmica de Partidas (Ordenada por cor: Verde -> Amarela -> Vermelha) */}
      <section className="space-y-4 pt-4 border-t border-slate-200">
        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div>
            <h3 className="text-base font-black text-slate-800 tracking-tight flex items-center gap-2 whitespace-nowrap">
              <Flame size={18} className="text-amber-500" />
              Fila Única de Partidas
            </h3>
            <p className="text-xs text-slate-400 font-bold mt-0.5">
              Ordenação por status de cor (Verde, Amarela, Vermelha) e prioridade de categorias.
            </p>

            {/* c) Legenda dos Status da Fila abaixo do texto "Ordenação por..." */}
            <div className="flex items-center gap-2 flex-wrap mt-2">
              <span className="inline-flex items-center gap-1 text-[10px] font-black px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                Pronta para Quadra
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-black px-2.5 py-1 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                Aguardando Chamada
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-black px-2.5 py-1 rounded-xl bg-red-50 text-red-700 border border-red-200 whitespace-nowrap">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                Bloqueada / Congelada
              </span>
            </div>
          </div>
        </div>

        {/* Lista de Partidas da Fila */}
        {visibleMatches.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-10 text-center space-y-2">
            <CheckCircle2 size={32} className="mx-auto text-emerald-400" />
            <p className="text-sm font-black text-slate-700 whitespace-nowrap">Nenhuma partida pendente na fila</p>
            <p className="text-xs text-slate-400 font-bold max-w-sm mx-auto">
              Todas as partidas já foram concluídas ou estão em andamento nas quadras.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {visibleMatches.map((item, queueIndex) => {
              const { match, category, queueStatus, conflictReason, pair1Name, pair2Name, phaseLabel } = item;

              const isGreen = queueStatus === 'green';
              const isYellow = queueStatus === 'yellow';
              const isRed = queueStatus === 'red';

              const isSelectingCourt = activeSelectMatchId === match.id;

              return (
                <div
                  key={match.id}
                  className={`p-4 rounded-3xl border-2 transition-all shadow-xs space-y-3 overflow-hidden ${
                    isGreen
                      ? 'bg-emerald-50/40 border-emerald-300'
                      : isYellow
                      ? 'bg-amber-50/30 border-amber-300'
                      : isRed
                      ? 'bg-red-50/30 border-red-300'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  {/* Linha do TOPO: Número da partida, Badges e BOTÕES à direita */}
                  <div className="flex items-center justify-between gap-3 w-full flex-wrap">
                    {/* Informações da Partida no Topo */}
                    <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
                      {/* Posição na Fila */}
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs shrink-0 whitespace-nowrap ${
                          isGreen
                            ? 'bg-emerald-500 text-white shadow-xs'
                            : isYellow
                            ? 'bg-amber-500 text-white shadow-xs'
                            : isRed
                            ? 'bg-red-500 text-white shadow-xs'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        #{queueIndex + 1}
                      </div>

                      {/* Código e Fase */}
                      <span className="text-xs font-black text-slate-800 whitespace-nowrap shrink-0">
                        [{match.matchCode || String(match.matchNumber || queueIndex + 1).padStart(2, '0')}]
                        {phaseLabel ? ` [${phaseLabel}]` : ''}
                      </span>

                      {/* Categoria e Prioridade */}
                      {category && (
                        <span className="text-[10px] font-black text-slate-600 bg-white/90 border border-slate-200 px-2 py-0.5 rounded-lg whitespace-nowrap shrink-0">
                          {category.name} (Prio {category.priority ?? 1})
                        </span>
                      )}

                      {/* Badge de Status da Fila (Regra D) */}
                      {isGreen && (
                        <span className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 whitespace-nowrap shrink-0">
                          Pronta para Quadra
                        </span>
                      )}
                      {isYellow && (
                        <span className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-300 whitespace-nowrap shrink-0">
                          Aguardando Chamada
                        </span>
                      )}
                      {isRed && (
                        <span className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-red-100 text-red-800 border border-red-300 flex items-center gap-1 whitespace-nowrap shrink-0">
                          <AlertTriangle size={10} />
                          {conflictReason
                            ? conflictReason.includes('fase anterior')
                              ? 'Aguardando Fase'
                              : 'Conflito de Jogador'
                            : 'Congelada'}
                        </span>
                      )}
                    </div>

                    {/* BOTÕES NO TOPO: Congelar acima, Quadra abaixo (coluna) */}
                    <div className="flex flex-col items-stretch gap-1.5 shrink-0 min-w-[100px]">
                      {/* Botão Congelar / Descongelar */}
                      <button
                        type="button"
                        onClick={() => handleToggleFreezeMatch(match.id)}
                        className={`px-3 py-1.5 rounded-2xl text-xs font-black border transition-all active:scale-95 flex items-center justify-center gap-1.5 whitespace-nowrap ${
                          match.frozen
                            ? 'bg-red-500 text-white border-red-600 shadow-xs'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-red-300 hover:text-red-600'
                        }`}
                        title={match.frozen ? 'Descongelar esta partida' : 'Congelar esta partida'}
                      >
                        <Snowflake size={13} />
                        <span>{match.frozen ? 'Congelado' : 'Congelar'}</span>
                      </button>

                      {/* Botão Quadra */}
                      <button
                        type="button"
                        onClick={() => {
                          if (isRed) return;
                          if (freeCourts.length === 0) {
                            window.alert('Não há quadras livres disponíveis no momento.');
                            return;
                          }
                          if (freeCourts.length === 1) {
                            handleAssignMatchToCourt(match.id, freeCourts[0]);
                          } else {
                            setActiveSelectMatchId(isSelectingCourt ? null : match.id);
                          }
                        }}
                        disabled={freeCourts.length === 0 || isRed}
                        className={`px-3.5 py-1.5 rounded-2xl text-xs font-black transition-all active:scale-95 flex items-center justify-center gap-1.5 shadow-xs whitespace-nowrap ${
                          isSelectingCourt
                            ? 'bg-slate-200 text-slate-700 border border-slate-300'
                            : isRed
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200 opacity-60'
                            : freeCourts.length > 0
                            ? isGreen
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                              : 'bg-blue-600 hover:bg-blue-700 text-white'
                            : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                        }`}
                        title={
                          isRed
                            ? (conflictReason || 'Partida bloqueada ou congelada')
                            : freeCourts.length > 0
                            ? 'Vincular esta partida a uma quadra livre'
                            : 'Nenhuma quadra livre disponível'
                        }
                      >
                        <Play size={12} className="fill-current" />
                        <span>Quadra</span>
                        {!isRed && freeCourts.length > 1 && (
                          <ChevronDown
                            size={12}
                            className={isSelectingCourt ? 'rotate-180 transition-transform' : 'transition-transform'}
                          />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Dropdown de seleção de quadra — expande abaixo do cabeçalho do card */}
                  {isSelectingCourt && (
                    <div className="rounded-2xl border border-slate-200 bg-white shadow-md overflow-hidden">
                      {freeCourts.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => handleAssignMatchToCourt(match.id, c)}
                          className="w-full text-left px-4 py-2.5 text-xs font-black text-slate-800 hover:bg-emerald-50 hover:text-emerald-800 transition-colors border-b border-slate-100 last:border-b-0 flex items-center gap-2"
                        >
                          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                          {c}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setActiveSelectMatchId(null)}
                        className="w-full text-center px-4 py-2 text-xs font-bold text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}

                  {/* Linha Abaixo do Topo: Nomes dos Times ocupando toda a linha */}
                  <div className="text-xs font-black text-slate-800 space-y-1 w-full">
                    <p className="whitespace-nowrap truncate w-full">
                      {pair1Name}{' '}
                      {match.pair1?.teamCode && (
                        <span className="text-[10px] text-slate-400 font-bold">
                          [{match.pair1.teamCode}]
                        </span>
                      )}
                    </p>
                    <p className="whitespace-nowrap truncate w-full">
                      {pair2Name}{' '}
                      {match.pair2?.teamCode && (
                        <span className="text-[10px] text-slate-400 font-bold">
                          [{match.pair2.teamCode}]
                        </span>
                      )}
                    </p>
                  </div>

                  {/* Alerta de Conflito de Jogador sem quebra de linha */}
                  {conflictReason && (
                    <div className="pt-1 border-t border-red-200/60">
                      <p className="text-[11px] text-red-700 font-black flex items-center gap-1.5 whitespace-nowrap truncate w-full">
                        <AlertCircle size={13} className="shrink-0 text-red-600" />
                        <span>{conflictReason}</span>
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Indicador de Volumetria (Regra C) */}
        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex flex-wrap items-center justify-center gap-3">
          <span className="text-xs font-bold text-slate-500">
            Exibindo{' '}
            <span className="font-black text-slate-700">{visibleMatches.length}</span>
            {' '}de{' '}
            <span className="font-black text-slate-700">{totalPendingCount}</span>
            {' '}partidas pendentes
          </span>
          {totalPendingCount > visibleMatches.length && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[10px] font-black bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">
              +{totalPendingCount - visibleMatches.length} não exibidas (limite de visualização)
            </span>
          )}
          {totalPendingCount === 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
              Fila limpa ✓
            </span>
          )}
        </div>
      </section>
    </div>
  );
};
