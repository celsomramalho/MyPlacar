import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  Layers,
  AlertCircle,
  Snowflake,
  Ban,
  Check,
  CheckCircle2,
  Play,
  RefreshCw,
  ChevronDown,
  AlertTriangle,
  Flame,
  ArrowLeft,
  ShieldOff,
  ShieldAlert,
  Clock,
  Zap,
  Calendar,
} from 'lucide-react';
import type { TournamentEvent, TournamentMatch, MatchSetScore } from '@modules/events/types';
import { calculateQueueState } from '@modules/events/services/queueManager';
import { updatePlayoffProgression } from '@modules/events/services/matchProgression';
import { useGame } from '@modules/game';
import { useUI } from '@modules/ui';
import { getDb } from '@infra/firebase';
import type { Firestore } from 'firebase/firestore';
import type { FirebaseTournamentEvent } from '@infra/firebase/events';
import { getCourtColors } from '../../../constants.ts';
import { guessPartnerGender } from '@modules/partners/services/guessPartnerGender';
import { QueueHeaderStats, CourtCard, QueueMatchCard } from './queue';

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

const getMatchCodeLabel = (match: TournamentMatch) =>
  match.matchCode || String(match.matchNumber || 1).padStart(2, '0');

export const EventFormedTeamsView: React.FC<Props> = ({ event, onUpdateEvent, isReadOnly = false }) => {
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
    averageMatchDurationMinutes,
    isDurationEstimated,
    finishedMatchesCountWithDuration,
    nextCourtFreeWaitMinutes,
    nextCourtFreeTimeStr,
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

  const entryLookup = useMemo(() => {
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

  const getPlayerGender = (
    p?: { nickname?: string; name?: string; email?: string; pin?: string; gender?: 'M' | 'F' },
    fallbackGender: 'M' | 'F' = 'M'
  ): 'M' | 'F' => {
    if (!p) return fallbackGender;

    // 1. Inscrição por email
    if (p.email && entryLookup.byEmail.has(p.email.toLowerCase().trim())) {
      const g = entryLookup.byEmail.get(p.email.toLowerCase().trim())?.gender;
      if (g === 'M' || g === 'F') return g;
    }

    // 2. Inscrição por pin
    if (p.pin && entryLookup.byPin.has(p.pin.toLowerCase().trim())) {
      const g = entryLookup.byPin.get(p.pin.toLowerCase().trim())?.gender;
      if (g === 'M' || g === 'F') return g;
    }

    // 3. Inscrição por nickname ou name
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

    // 4. Propriedade direta no objeto do jogador
    if (p.gender === 'M' || p.gender === 'F') {
      return p.gender;
    }

    // 5. Adivinhar gênero pelo primeiro nome
    const candidateName = p.name?.trim() || p.nickname?.trim() || '';
    if (candidateName) {
      const guessed = guessPartnerGender(candidateName);
      if (guessed) return guessed;
    }

    return fallbackGender;
  };

  // Atualiza partidas e quadras interditadas no Firestore e estado local
  const handlePersistEventChanges = async (
    updatedMatches?: TournamentMatch[],
    updatedInterdictedCourts?: string[]
  ) => {
    if (isReadOnly) return;
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
    const gamesPerSet = Number(event.gamesPerSet || event.config?.gamesPerSet || (event.eventType === 'Super 8' ? 4 : 6));
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
        const n1 = Number(s.p1);
        const n2 = Number(s.p2);
        if (n1 >= gamesPerSet && n1 > n2) {
          setsWon1 += 1;
        } else if (n2 >= gamesPerSet && n2 > n1) {
          setsWon2 += 1;
        }
      }
    });

    return { scores, setsWon1, setsWon2 };
  };

  const handleScoreBlur = async () => {
    if (isReadOnly) return;
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
    if (isReadOnly) return;
    const totalSets = (event.setsCount || event.config?.sets || 1) as number;
    const setsToWin = Math.ceil(totalSets / 2);
    const gamesPerSet = Number(event.gamesPerSet || event.config?.gamesPerSet || (event.eventType === 'Super 8' ? 4 : 6));
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
      let hasAnyScore = false;

      currentScores.forEach((s) => {
        if (s.p1 !== null && s.p1 !== undefined && s.p2 !== null && s.p2 !== undefined) {
          resultParts.push(`${s.p1}/${s.p2}`);
          hasAnyScore = true;
          const n1 = Number(s.p1);
          const n2 = Number(s.p2);
          if (n1 >= gamesPerSet && n1 > n2) {
            setsWon1 += 1;
          } else if (n2 >= gamesPerSet && n2 > n1) {
            setsWon2 += 1;
          }
        } else if (s.p1 !== null || s.p2 !== null) {
          hasAnyScore = true;
        }
      });

      let status: 'waiting' | 'live' | 'finished' = m.status || 'live';
      if (status !== 'finished') {
        if (m.court) {
          status = 'live';
        } else if (hasAnyScore) {
          status = 'live';
        } else {
          status = m.status || 'waiting';
        }
      }

      return {
        ...m,
        scores: currentScores,
        result: resultParts.join(' '),
        status,
        court: m.court,
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
    if (isReadOnly) return;
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
    if (isReadOnly) return;
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
    if (isReadOnly) return;
    const allMatches = event.matches || [];
    const nowIso = new Date().toISOString();
    const todayDate = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
    const nextMatches = allMatches.map((m) => {
      if (m.id === matchId) {
        return {
          ...m,
          status: 'live' as const,
          court: courtName,
          frozen: false,
          startedAt: m.startedAt || nowIso,
          matchDate: m.matchDate || todayDate,
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
    if (isReadOnly) return;
    const allMatches = event.matches || [];
    const totalSets = (event.setsCount || event.config?.sets || 1) as number;
    const nowIso = new Date().toISOString();
    const nextMatches = allMatches.map((m) => {
      if (m.id === matchId) {
        if (finish) {
          const { setsWon1, setsWon2, scores } = parseMatchSets(m, totalSets);
          let winnerPairId = m.winnerPairId;
          let loserPairId = m.loserPairId;

          if (setsWon1 > setsWon2) {
            winnerPairId = m.pair1Id;
            loserPairId = m.pair2Id;
          } else if (setsWon2 > setsWon1) {
            winnerPairId = m.pair2Id;
            loserPairId = m.pair1Id;
          } else if (scores[0]?.p1 !== null && scores[0]?.p2 !== null) {
            const n1 = Number(scores[0]?.p1 ?? 0);
            const n2 = Number(scores[0]?.p2 ?? 0);
            if (n1 > n2) {
              winnerPairId = m.pair1Id;
              loserPairId = m.pair2Id;
            } else if (n2 > n1) {
              winnerPairId = m.pair2Id;
              loserPairId = m.pair1Id;
            }
          }

          let durationMinutes: number | undefined = undefined;
          if (m.startedAt) {
            const startMs = new Date(m.startedAt).getTime();
            const endMs = new Date(nowIso).getTime();
            if (!isNaN(startMs) && !isNaN(endMs) && endMs >= startMs) {
              durationMinutes = Math.max(1, Math.round((endMs - startMs) / 60000));
            }
          }

          return {
            ...m,
            status: 'finished' as const,
            winnerPairId: winnerPairId || m.pair1Id,
            loserPairId: loserPairId || m.pair2Id,
            court: undefined,
            finishedAt: nowIso,
            durationMinutes: durationMinutes ?? m.durationMinutes,
          };
        }
        return {
          ...m,
          status: 'waiting' as const,
          court: undefined,
          startedAt: undefined,
        };
      }
      return m;
    });
    const progressed = finish ? updatePlayoffProgression(event.pairs || [], nextMatches) : nextMatches;
    await handlePersistEventChanges(progressed);
  };

  // Valida o placar e exibe confirmação se inválido antes de finalizar
  const handleFinishCourtMatchWithValidation = (matchId: string) => {
    if (isReadOnly) return;
    const allMatches = event.matches || [];
    const totalSets = (event.setsCount || event.config?.sets || 1) as number;
    const setsToWin = Math.ceil(totalSets / 2);
    const gamesPerSet = Number(event.gamesPerSet || event.config?.gamesPerSet || (event.eventType === 'Super 8' ? 4 : 6));

    const match = allMatches.find((m) => m.id === matchId);
    if (!match) return;

    if (!match.matchDate) {
      setModalConfig({
        title: 'Data obrigatória',
        message: 'Informe a data da partida antes de finalizar.',
        onConfirm: () => setModalConfig(null),
        variant: 'info',
      });
      return;
    }

    const { scores, setsWon1, setsWon2 } = parseMatchSets(match, totalSets);

    // Verifica se algum set tem placar digitado
    const hasAnyScore = scores.some((s) => s.p1 !== null || s.p2 !== null);
    if (!hasAnyScore) {
      setModalConfig({
        title: 'Placar não informado',
        message: 'Digite o placar antes de finalizar a partida.',
        onConfirm: () => setModalConfig(null),
        variant: 'info',
      });
      return;
    }

    // Verifica se o vencedor atingiu o número correto de games por set
    let scoreWarnings: string[] = [];
    scores.forEach((s, idx) => {
      if (s.p1 === null || s.p2 === null) return;
      const n1 = Number(s.p1);
      const n2 = Number(s.p2);
      const maxScore = Math.max(n1, n2);
      const minScore = Math.min(n1, n2);
      // Vencedor deve ter exatamente gamesPerSet games (ou mais em caso de deuce)
      if (maxScore < gamesPerSet) {
        scoreWarnings.push(`Set ${idx + 1}: vencedor tem ${maxScore} games, esperado ${gamesPerSet}`);
      } else if (maxScore > gamesPerSet && !(maxScore === gamesPerSet + 1 && minScore === gamesPerSet - 1)) {
        // Permite empate por 1 acima do esperado (ex: 7x6 num jogo de 6 games)
        scoreWarnings.push(`Set ${idx + 1}: placar ${n1}x${n2} parece inválido para ${gamesPerSet} games por set`);
      }
    });

    // Verifica se a partida tem vencedor claro
    const winnerDefined = setsWon1 >= setsToWin || setsWon2 >= setsToWin;
    if (!winnerDefined && totalSets > 1) {
      scoreWarnings.push(`Nenhum time atingiu ${setsToWin} set(s) para vencer (melhor de ${totalSets})`);
    }

    if (scoreWarnings.length > 0) {
      setModalConfig({
        title: 'Placar irregular',
        message: (
          <>
            <span className="block font-bold mb-2">O placar informado parece incorreto:</span>
            {scoreWarnings.map((w, i) => (
              <span key={i} className="block text-sm text-slate-700">• {w}</span>
            ))}
            <span className="block mt-3 text-sm">Deseja finalizar mesmo assim?</span>
          </>
        ),
        confirmLabel: 'Finalizar assim mesmo',
        cancelLabel: 'Corrigir placar',
        onConfirm: () => {
          setModalConfig(null);
          handleFreeCourtMatch(matchId, true);
        },
        onCancel: () => setModalConfig(null),
        variant: 'danger',
      });
      return;
    }

    // Placar válido, finaliza direto
    handleFreeCourtMatch(matchId, true);
  };

  // Salva a data da partida nas quadras
  const handleMatchDateChange = (matchId: string, dateVal: string) => {
    if (isReadOnly) return;
    const allMatches = event.matches || [];
    const nextMatches = allMatches.map((m) =>
      m.id !== matchId ? m : { ...m, matchDate: dateVal || undefined }
    );
    if (onUpdateEvent) onUpdateEvent({ ...event, matches: nextMatches });
    if (saveMatchesTimeoutRef.current) clearTimeout(saveMatchesTimeoutRef.current);
    saveMatchesTimeoutRef.current = setTimeout(async () => {
      const db = getDb();
      if (db && event.pin) {
        try {
          const { updateEvent } = await import('@infra/firebase/events');
          await updateEvent(db as Firestore, event.pin, { matches: nextMatches });
        } catch (err) {
          console.error('Erro ao salvar data da partida no Firestore:', err);
        }
      }
    }, 600);
  };

  const handleOpenMatchRules = (match: TournamentMatch) => {
    if (isReadOnly) return;
    const pair1 = match.pair1 || (match.pair1Id ? pairsById[match.pair1Id] : undefined);
    const pair2 = match.pair2 || (match.pair2Id ? pairsById[match.pair2Id] : undefined);

    let player1 = pair1?.p1 ? getPlayerNick(pair1.p1) : match.pair1Label || '';
    let player3 = pair1?.p2 ? getPlayerNick(pair1.p2) : '';
    let player2 = pair2?.p1 ? getPlayerNick(pair2.p1) : match.pair2Label || '';
    let player4 = pair2?.p2 ? getPlayerNick(pair2.p2) : '';
    const courtColors = getCourtColors(match.court || '');

    // Categoria da partida
    const categoryId = match.categoryId || pair1?.categoryId || pair2?.categoryId;
    const matchCat = categoryId ? event.categories?.find((c) => c.id === categoryId) : undefined;

    // Determina se é Simples ou Duplas conforme categoria / evento
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

    // Se for duplas e parceiros não estiverem separados mas o nome tiver '/', separa
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

    // Identificação de gênero padrão da categoria
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
      sportType: matchCat?.sportId || event.config?.sportType || prev.sportType,
      sets: event.setsCount || event.config?.sets || prev.sets,
      gamesPerSet: event.gamesPerSet || event.config?.gamesPerSet || prev.gamesPerSet,
      noAd: event.config?.noAd ?? prev.noAd,
      isDoubles,
      isScoreboardMode: false,
      isWatchMode: false,
      pendingTournamentMatchId: match.id,
      pendingTournamentPin: event.pin,
      pendingTournamentMatchCode: getMatchCodeLabel(match),
      pendingTournamentPhaseLabel: getPhaseLabel(match.phase),
      pendingTournamentCourt: match.court,
      p1Name: player1,
      p1Partner: isDoubles ? player3 : '',
      p2Name: player2,
      p2Partner: isDoubles ? player4 : '',
      p1Color: courtColors.p1Color,
      p2Color: courtColors.p2Color,
      p1Gender,
      p1PartnerGender,
      p2Gender,
      p2PartnerGender,
      p1Verified: !!pair1?.p1,
      p1PartnerVerified: isDoubles ? !!pair1?.p2 : false,
      p2Verified: !!pair2?.p1,
      p2PartnerVerified: isDoubles ? !!pair2?.p2 : false,
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
  const gamesPerSet = Number(event.gamesPerSet || event.config?.gamesPerSet || (event.eventType === 'Super 8' ? 4 : 6));

  return (
    <div className="space-y-6 max-w-full overflow-hidden">
      {/* Header Geral do Gerenciamento de Fila */}
      <QueueHeaderStats
        visibleMatchesCount={visibleMatches.length}
        totalPendingCount={totalPendingCount}
        freeCourtsCount={freeCourtsCount}
        busyCourtsCount={busyCourtsCount}
        interdictedCourtsCount={interdictedCourtsCount}
        totalCourtsCount={totalCourtsCount}
        averageMatchDurationMinutes={averageMatchDurationMinutes}
        isDurationEstimated={isDurationEstimated}
        finishedMatchesCountWithDuration={finishedMatchesCountWithDuration}
        nextCourtFreeWaitMinutes={nextCourtFreeWaitMinutes}
        nextCourtFreeTimeStr={nextCourtFreeTimeStr}
      />

      {/* SEÇÃO A: Status das Quadras */}
      <section className="space-y-3">
        <div className="flex items-center justify-between px-1 flex-wrap gap-2">
          <h3 className="text-sm font-black text-slate-800 tracking-wider whitespace-nowrap">
            Quadras do evento ({totalCourtsCount})
          </h3>
          <span className="inline-flex items-center gap-1.5 text-[10px] font-black px-2.5 py-1 rounded-xl bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap">
            <Clock size={11} className="text-slate-500" />
            Duração média: {averageMatchDurationMinutes} min {isDurationEstimated ? '(estimada)' : `(${finishedMatchesCountWithDuration} jogos)`}
          </span>
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
            {courtStates.map((court, index) => (
              <CourtCard
                key={court.courtName || index}
                court={court}
                index={index}
                isReadOnly={isReadOnly}
                pairsById={pairsById}
                totalSets={totalSets}
                gamesPerSet={gamesPerSet}
                averageMatchDurationMinutes={averageMatchDurationMinutes}
                refreshingMatchId={refreshingMatchId}
                getPlayerNick={getPlayerNick}
                parseMatchSets={parseMatchSets}
                onFreeCourtMatch={handleFreeCourtMatch}
                onOpenMatchRules={handleOpenMatchRules}
                onToggleInterdictCourt={handleToggleInterdictCourt}
                onRefreshEventScore={handleRefreshEventScore}
                onScoreInputChange={handleScoreInputChange}
                onScoreBlur={handleScoreBlur}
                onMatchDateChange={handleMatchDateChange}
                onFinishCourtMatch={handleFinishCourtMatchWithValidation}
              />
            ))}
          </div>
        )}
      </section>

      {/* SEÇÃO B, C, D: Fila Única Dinâmica de Partidas */}
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

            {/* Legenda dos Status da Fila e Estimativas de Tempo */}
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
              <span className="inline-flex items-center gap-1.5 text-[10px] font-black px-2.5 py-1 rounded-xl bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap">
                <Clock size={11} className="text-slate-500" />
                Duração média: {averageMatchDurationMinutes} min {isDurationEstimated ? '(estimada)' : `(${finishedMatchesCountWithDuration} partidas)`}
              </span>
              {freeCourtsCount > 0 ? (
                <span className="inline-flex items-center gap-1.5 text-[10px] font-black px-2.5 py-1 rounded-xl bg-emerald-100 text-emerald-800 border border-emerald-300 whitespace-nowrap">
                  <Zap size={11} className="fill-emerald-600 text-emerald-600" />
                  {freeCourtsCount} quadra{freeCourtsCount > 1 ? 's livres' : ' livre'} agora
                </span>
              ) : nextCourtFreeWaitMinutes !== undefined ? (
                <span className="inline-flex items-center gap-1.5 text-[10px] font-black px-2.5 py-1 rounded-xl bg-sky-50 text-sky-800 border border-sky-200 whitespace-nowrap">
                  <Clock size={11} className="text-sky-600" />
                  Próxima liberação: em ~{nextCourtFreeWaitMinutes} min (~{nextCourtFreeTimeStr})
                </span>
              ) : null}
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
            {visibleMatches.map((item, queueIndex) => (
              <QueueMatchCard
                key={item.match.id}
                item={item}
                queueIndex={queueIndex}
                freeCourts={freeCourts}
                isReadOnly={isReadOnly}
                isSelectingCourt={activeSelectMatchId === item.match.id}
                onToggleFreezeMatch={handleToggleFreezeMatch}
                onToggleSelectCourt={(matchId) =>
                  setActiveSelectMatchId((prev) => (prev === matchId ? null : matchId))
                }
                onAssignMatchToCourt={handleAssignMatchToCourt}
              />
            ))}
          </div>
        )}

        {/* Indicador de Volumetria */}
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
        </div>
      </section>

      </div>
  );
};
