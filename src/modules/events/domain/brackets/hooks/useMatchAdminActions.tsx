import React, { useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { Firestore } from 'firebase/firestore';
import {
  minifyPairForStorage,
  resolveCategoryDuplaType,
  type EventCategory,
  type MatchSetScore,
  type TournamentEntry,
  type TournamentEvent,
  type TournamentMatch,
  type TournamentPair,
} from '@modules/events/types';
import type { ModalConfig } from '@modules/ui/types';
import { getDb } from '@infra/firebase';
import { updateEvent } from '@infra/firebase/events';
import {
  createManualMatch,
  generateSystemMatchesForCategory,
  pairsSharePlayer,
} from '../engine/bracketGenerator';
import { parseMatchSets, isSetScoreComplete } from '../engine/matchScoreEngine';
import { updatePlayoffProgression } from '../engine/bracketProgressionEngine';
import {
  generateSuper8MatchesForCategory,
  generateSuper8DuplasMatchesForCategory,
} from '@modules/events/services/matchGenerator';
import { exportCategoryMatchesBlankPdf } from '@modules/events/services/tournamentPdfExport';
import { exportCategoryCalculationWorksheetPdf } from '@modules/events/services/calculationWorksheetPdf';
import { resolveMatchRules } from '@modules/events/domain/rules/eventMatchRules';

interface UseMatchAdminActionsOptions {
  event: TournamentEvent;
  selectedCategory?: EventCategory;
  categoryEntries: TournamentEntry[];
  categoryPairs: TournamentPair[];
  categoryMatches: TournamentMatch[];
  pairs: TournamentPair[];
  pairsById: Record<string, TournamentPair>;
  matches: TournamentMatch[];
  selectedTeamIds: Set<string>;
  totalSets: number;
  isRanking: boolean;
  isSuper8: boolean;
  isSuper8Duplas: boolean;
  onUpdateEvent: (event: TournamentEvent) => void;
  setSelectedTeamIds: Dispatch<SetStateAction<Set<string>>>;
  setModalConfig: Dispatch<SetStateAction<ModalConfig | null>>;
}

export function useMatchAdminActions({
  event,
  selectedCategory,
  categoryEntries,
  categoryPairs,
  categoryMatches,
  pairs,
  pairsById,
  matches,
  selectedTeamIds,
  totalSets,
  isRanking,
  isSuper8,
  isSuper8Duplas,
  onUpdateEvent,
  setSelectedTeamIds,
  setModalConfig,
}: UseMatchAdminActionsOptions) {
  const [isSuper8dDrawModalOpen, setIsSuper8dDrawModalOpen] = useState(false);
  const saveMatchesTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getRulesForPhase = (phase?: string) => resolveMatchRules(
    event.sportRules,
    phase,
    (event.setsCount || event.config?.sets || totalSets) as 1 | 3 | 5,
    Number(event.gamesPerSet || event.config?.gamesPerSet || (event.eventType === 'Super 8' ? 4 : 6)),
    event.sportId || event.config?.sportType
  );
  const getGamesPerSet = (phase?: string) => getRulesForPhase(phase).gamesPerSet;
  const isTotalGamesSet = (phase?: string) => {
    const rules = getRulesForPhase(phase);
    return (event.sportId || event.config?.sportType) === 'beach-tennis' && rules.gamesPerSet === 7;
  };

  const persistPatch = async (
    patch: Partial<TournamentEvent>,
    errorMessage: string
  ) => {
    const db = getDb();
    if (!db) return;
    try {
      await updateEvent(db as Firestore, event.pin, patch as any);
    } catch (err) {
      console.error(errorMessage, err);
    }
  };

  const handleCreateManualMatch = async () => {
    if (selectedTeamIds.size !== 2 || !selectedCategory) return;
    const [t1Id, t2Id] = Array.from(selectedTeamIds);
    const p1 = pairs.find((p) => p.id === t1Id);
    const p2 = pairs.find((p) => p.id === t2Id);
    if (!p1 || !p2) return;

    // Impedir partida se algum jogador estiver nos dois times
    if (pairsSharePlayer(p1, p2)) {
      setModalConfig({
        title: 'Jogador duplicado',
        message: 'Não é possível formar uma partida com o mesmo jogador nos dois times.',
        onConfirm: () => setModalConfig(null),
      });
      return;
    }

    const rankingMatchesLimit = Number(event.rankingMatchesPerTeam || 0);
    if (isRanking && rankingMatchesLimit > 0) {
      const isFree = resolveCategoryDuplaType(selectedCategory, 'ranking') === 'Livre';
      const blockedPair = [p1, p2].find((pair) => {
        const playerKeys = new Set([pair.p1, pair.p2].map((entry) =>
          (entry.email || entry.pin || '').toLowerCase().trim()
        ));
        const playedMatches = categoryMatches.filter((match) => {
          if (!isFree) return match.pair1Id === pair.id || match.pair2Id === pair.id;
          return [match.pair1, match.pair2].some((matchPair) => matchPair &&
            [matchPair.p1, matchPair.p2].some((entry) => playerKeys.has((entry.email || entry.pin || '').toLowerCase().trim()))
          );
        });
        return playedMatches.length >= rankingMatchesLimit;
      });
      if (blockedPair) {
        setModalConfig({
          title: 'Limite de partidas atingido',
          message: `${blockedPair.teamCode || 'Este time'} já atingiu o limite de ${rankingMatchesLimit} ${rankingMatchesLimit === 1 ? 'partida permitida' : 'partidas permitidas'}.`,
          onConfirm: () => setModalConfig(null),
        });
        return;
      }
    }

    const newMatch = createManualMatch(p1, p2, selectedCategory, matches);
    if (isRanking) {
      newMatch.phase = 'ranking';
    }
    const nextMatches = [...matches, newMatch];

    onUpdateEvent({ ...event, matches: nextMatches });
    setSelectedTeamIds(new Set());
    await persistPatch(
      { matches: nextMatches },
      'Erro ao salvar partida manual no Firestore:'
    );
  };

  const handleGenerateSystemMatches = async () => {
    if (!selectedCategory) return;

    if (isSuper8Duplas) {
      setIsSuper8dDrawModalOpen(true);
      return;
    }

    let newCategoryMatches: TournamentMatch[] = [];
    let newCategoryPairs: TournamentPair[] = [];
    if (isSuper8) {
      const result = generateSuper8MatchesForCategory(
        selectedCategory,
        categoryEntries,
        matches,
        pairs
      );
      newCategoryMatches = result.matches;
      newCategoryPairs = result.pairs;
    } else {
      newCategoryMatches = generateSystemMatchesForCategory(
        selectedCategory,
        categoryPairs,
        matches
      );
    }

    if (newCategoryMatches.length === 0) {
      const message = isSuper8
        ? 'Não há atletas disponíveis suficientes nesta categoria para gerar partidas. Confira as inscrições ativas.'
        : 'Nenhuma partida foi criada. Forme pelo menos dois times nesta categoria antes de gerar as partidas.';
      setModalConfig({
        title: 'Não foi possível gerar partidas',
        message,
        onConfirm: () => setModalConfig(null),
        variant: 'info',
      });
      return;
    }

    const otherMatches = matches.filter(
      (m) =>
        m.categoryId !== selectedCategory.id &&
        !pairs.some(
          (p) =>
            (p.id === m.pair1Id || p.id === m.pair2Id) &&
            p.categoryId === selectedCategory.id
        )
    );

    const nextMatches = [...otherMatches, ...newCategoryMatches];

    let nextPairs = pairs;
    if (newCategoryPairs && newCategoryPairs.length > 0) {
      const otherPairs = pairs.filter((p) => p.categoryId !== selectedCategory.id);
      nextPairs = [...otherPairs, ...newCategoryPairs];
    }

    onUpdateEvent({ ...event, matches: nextMatches, pairs: nextPairs });
    await persistPatch(
      { matches: nextMatches, pairs: nextPairs },
      'Erro ao gerar partidas pelo sistema no Firestore:'
    );
  };

  const handleConfirmSuper8DuplasDraw = async (
    orderedPlayers: TournamentEntry[]
  ) => {
    if (!selectedCategory) return;
    const groupsPerBracket = event.groupsPerBracket ?? 2;
    const newCategoryMatches = generateSuper8DuplasMatchesForCategory(
      selectedCategory,
      orderedPlayers,
      groupsPerBracket,
      matches
    );

    const otherMatches = matches.filter(
      (m) =>
        m.categoryId !== selectedCategory.id &&
        !pairs.some(
          (p) =>
            (p.id === m.pair1Id || p.id === m.pair2Id) &&
            p.categoryId === selectedCategory.id
        )
    );

    const nextMatches = [...otherMatches, ...newCategoryMatches];
    onUpdateEvent({ ...event, matches: nextMatches });
    setIsSuper8dDrawModalOpen(false);
    await persistPatch(
      { matches: nextMatches },
      'Erro ao gerar partidas de Super 8 duplas no Firestore:'
    );
  };

  const handleDeleteMatch = (matchId: string) => {
    setModalConfig({
      title: 'Excluir partida?',
      message: 'Tem certeza que deseja excluir esta partida?',
      confirmLabel: 'Excluir',
      variant: 'danger',
      onConfirm: async () => {
        setModalConfig(null);
        const nextMatches = matches.filter((m) => m.id !== matchId);
        onUpdateEvent({ ...event, matches: nextMatches });
        await persistPatch(
          { matches: nextMatches },
          'Erro ao excluir partida no Firestore:'
        );
      },
      onCancel: () => setModalConfig(null),
    });
  };

  const handleDeleteAllCategoryMatches = () => {
    if (!selectedCategory) return;
    setModalConfig({
      title: 'Limpar todos os confrontos?',
      message: `Deseja apagar todos os jogos gerados da categoria "${selectedCategory.name}"?`,
      confirmLabel: 'Limpar tudo',
      variant: 'danger',
      onConfirm: async () => {
        setModalConfig(null);
        const remainingMatches = matches.filter(
          (m) =>
            m.categoryId !== selectedCategory.id &&
            !pairs.some(
              (p) =>
                (p.id === m.pair1Id || p.id === m.pair2Id) &&
                p.categoryId === selectedCategory.id
            )
        );
        onUpdateEvent({ ...event, matches: remainingMatches });
        await persistPatch(
          { matches: remainingMatches },
          'Erro ao limpar partidas da categoria no Firestore:'
        );
      },
      onCancel: () => setModalConfig(null),
    });
  };

  const handleScoreInputChange = (
    matchId: string,
    setIndex: number,
    player: 'p1' | 'p2',
    rawVal: string
  ) => {
    const nextMatches = matches.map((m) => {
      if (m.id !== matchId) return m;
      const gamesPerSet = getGamesPerSet(m.phase);
      const totalGamesSet = isTotalGamesSet(m.phase);

      const currentScores: MatchSetScore[] = Array.from(
        { length: totalSets },
        (_, i) => {
          const existing = m.scores?.[i] || {};
          return {
            p1: existing.p1 !== undefined ? existing.p1 : null,
            p2: existing.p2 !== undefined ? existing.p2 : null,
          };
        }
      );

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
        if (
          s.p1 !== null &&
          s.p1 !== undefined &&
          s.p2 !== null &&
          s.p2 !== undefined
        ) {
          resultParts.push(`${s.p1}/${s.p2}`);
          hasAnyScore = true;
          const n1 = Number(s.p1);
          const n2 = Number(s.p2);
          const rules = getRulesForPhase(m.phase);
          const complete = isSetScoreComplete(n1, n2, gamesPerSet, { isTotalGamesSet: totalGamesSet, tieBreak: rules.tieBreak, tieBreakAt: rules.tieBreakAt });
          if (complete && n1 > n2) {
            setsWon1 += 1;
          } else if (complete && n2 > n1) {
            setsWon2 += 1;
          }
        } else if (s.p1 !== null || s.p2 !== null) {
          hasAnyScore = true;
        }
      });

      let status: 'waiting' | 'live' | 'finished' =
        m.status === 'finished'
          ? 'finished'
          : hasAnyScore
            ? 'live'
            : 'waiting';
      let winnerPairId: string | undefined = m.winnerPairId;
      let loserPairId: string | undefined = m.loserPairId;

      if (status === 'finished') {
        if (setsWon1 > setsWon2) {
          winnerPairId = m.pair1Id;
          loserPairId = m.pair2Id;
        } else if (setsWon2 > setsWon1) {
          winnerPairId = m.pair2Id;
          loserPairId = m.pair1Id;
        }
      }

      return {
        ...m,
        scores: currentScores,
        result: resultParts.join(' '),
        status,
        winnerPairId,
        loserPairId,
      };
    });

    onUpdateEvent({ ...event, matches: nextMatches });

    if (saveMatchesTimeoutRef.current) clearTimeout(saveMatchesTimeoutRef.current);
    saveMatchesTimeoutRef.current = setTimeout(async () => {
      await persistPatch(
        { matches: nextMatches },
        'Erro ao salvar placar no Firestore debounce:'
      );
    }, 1000);
  };

  const handleScoreUndoChange = (
    matchId: string,
    setIndex: number,
    p1Val: string,
    p2Val: string
  ) => {
    const toVal = (raw: string) => {
      const n = parseInt(raw, 10);
      return isNaN(n) ? null : n;
    };

    const nextMatches = matches.map((m) => {
      if (m.id !== matchId) return m;
      const gamesPerSet = getGamesPerSet(m.phase);
      const totalGamesSet = isTotalGamesSet(m.phase);

      const currentScores: MatchSetScore[] = Array.from(
        { length: totalSets },
        (_, i) => {
          const existing = m.scores?.[i] || {};
          return {
            p1: existing.p1 !== undefined ? existing.p1 : null,
            p2: existing.p2 !== undefined ? existing.p2 : null,
          };
        }
      );

      currentScores[setIndex] = {
        p1: toVal(p1Val),
        p2: toVal(p2Val),
      };

      let setsWon1 = 0;
      let setsWon2 = 0;
      const resultParts: string[] = [];
      let hasAnyScore = false;

      currentScores.forEach((s) => {
        if (
          s.p1 !== null &&
          s.p1 !== undefined &&
          s.p2 !== null &&
          s.p2 !== undefined
        ) {
          resultParts.push(`${s.p1}/${s.p2}`);
          hasAnyScore = true;
          const n1 = Number(s.p1);
          const n2 = Number(s.p2);
          const rules = getRulesForPhase(m.phase);
          const complete = isSetScoreComplete(n1, n2, gamesPerSet, { isTotalGamesSet: totalGamesSet, tieBreak: rules.tieBreak, tieBreakAt: rules.tieBreakAt });
          if (complete && n1 > n2) {
            setsWon1 += 1;
          } else if (complete && n2 > n1) {
            setsWon2 += 1;
          }
        } else if (s.p1 !== null || s.p2 !== null) {
          hasAnyScore = true;
        }
      });

      let status: 'waiting' | 'live' | 'finished' =
        m.status === 'finished'
          ? 'finished'
          : hasAnyScore
            ? 'live'
            : 'waiting';
      let winnerPairId: string | undefined = m.winnerPairId;
      let loserPairId: string | undefined = m.loserPairId;

      if (status === 'finished') {
        if (setsWon1 > setsWon2) {
          winnerPairId = m.pair1Id;
          loserPairId = m.pair2Id;
        } else if (setsWon2 > setsWon1) {
          winnerPairId = m.pair2Id;
          loserPairId = m.pair1Id;
        }
      }

      return {
        ...m,
        scores: currentScores,
        result: resultParts.join(' '),
        status,
        winnerPairId,
        loserPairId,
      };
    });

    onUpdateEvent({ ...event, matches: nextMatches });

    if (saveMatchesTimeoutRef.current) clearTimeout(saveMatchesTimeoutRef.current);
    saveMatchesTimeoutRef.current = setTimeout(async () => {
      await persistPatch(
        { matches: nextMatches },
        'Erro ao salvar placar no Firestore debounce:'
      );
    }, 1000);
  };

  const handleMatchDateChange = (matchId: string, dateVal: string) => {
    const nextMatches = matches.map((m) =>
      m.id !== matchId ? m : { ...m, matchDate: dateVal || undefined }
    );
    onUpdateEvent({ ...event, matches: nextMatches });

    if (saveMatchesTimeoutRef.current) clearTimeout(saveMatchesTimeoutRef.current);
    saveMatchesTimeoutRef.current = setTimeout(async () => {
      await persistPatch(
        { matches: nextMatches },
        'Erro ao salvar data da partida no Firestore:'
      );
    }, 600);
  };

  const handleFinishMatch = async (matchId: string) => {
    const nowIso = new Date().toISOString();

    const nextMatches = matches.map((m) => {
      if (m.id !== matchId) return m;
      const gamesPerSet = getGamesPerSet(m.phase);
      const totalGamesSet = isTotalGamesSet(m.phase);
      const { setsWon1, setsWon2, scores } = parseMatchSets(
        m,
        totalSets,
        gamesPerSet,
        { isTotalGamesSet: totalGamesSet, tieBreak: getRulesForPhase(m.phase).tieBreak, tieBreakAt: getRulesForPhase(m.phase).tieBreakAt }
      );
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

      const p1Obj =
        m.pair1 || (m.pair1Id ? pairs.find((p) => p.id === m.pair1Id) : undefined);
      const p2Obj =
        m.pair2 || (m.pair2Id ? pairs.find((p) => p.id === m.pair2Id) : undefined);

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
        pair1: p1Obj ? minifyPairForStorage(p1Obj) : m.pair1,
        pair2: p2Obj ? minifyPairForStorage(p2Obj) : m.pair2,
        finishedAt: nowIso,
        durationMinutes: durationMinutes ?? m.durationMinutes,
      };
    });

    const progressedMatches = isRanking
      ? nextMatches
      : updatePlayoffProgression(pairs, nextMatches);
    onUpdateEvent({ ...event, matches: progressedMatches, pairs });
    await persistPatch(
      { matches: progressedMatches, pairs },
      'Erro ao finalizar partida no Firestore:'
    );
  };

  const handleFinishMatchWithValidation = (matchId: string) => {
    const setsToWin = Math.ceil(totalSets / 2);

    const match = matches.find((m) => m.id === matchId);
    if (!match) return;
    const gamesPerSet = getGamesPerSet(match.phase);
    const totalGamesSet = isTotalGamesSet(match.phase);

    if (!match.matchDate) {
      setModalConfig({
        title: 'Data obrigatória',
        message: 'Informe a data da partida antes de finalizar.',
        onConfirm: () => setModalConfig(null),
        variant: 'info',
      });
      return;
    }

    const { scores, setsWon1, setsWon2 } = parseMatchSets(
      match,
      totalSets,
      gamesPerSet,
      { isTotalGamesSet: totalGamesSet, tieBreak: getRulesForPhase(match.phase).tieBreak, tieBreakAt: getRulesForPhase(match.phase).tieBreakAt }
    );

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

    if (isRanking) {
      handleFinishMatch(matchId);
      return;
    }

    const scoreWarnings: string[] = [];
    scores.forEach((s, idx) => {
      if (s.p1 === null || s.p2 === null) return;
      const n1 = Number(s.p1);
      const n2 = Number(s.p2);
      const maxScore = Math.max(n1, n2);
      const minScore = Math.min(n1, n2);
      if (totalGamesSet) {
        if (n1 + n2 !== gamesPerSet) {
          scoreWarnings.push(`Set ${idx + 1}: a soma precisa ser exatamente ${gamesPerSet} games`);
        }
      } else if (maxScore < gamesPerSet) {
        scoreWarnings.push(
          `Set ${idx + 1}: vencedor tem ${maxScore} games, esperado ${gamesPerSet}`
        );
      } else if (
        maxScore > gamesPerSet &&
        !(maxScore === gamesPerSet + 1 && minScore === gamesPerSet - 1)
      ) {
        scoreWarnings.push(
          `Set ${idx + 1}: placar ${n1}x${n2} parece inválido para ${gamesPerSet} games por set`
        );
      }
    });

    const winnerDefined = setsWon1 >= setsToWin || setsWon2 >= setsToWin;
    if (!winnerDefined && totalSets > 1) {
      scoreWarnings.push(
        `Nenhum time atingiu ${setsToWin} set(s) para vencer (melhor de ${totalSets})`
      );
    }

    if (scoreWarnings.length > 0) {
      setModalConfig({
        title: 'Placar irregular',
        message: (
          <>
            <span className="block font-bold mb-2">
              O placar informado parece incorreto:
            </span>
            {scoreWarnings.map((w, i) => (
              <span key={i} className="block text-sm text-slate-700">
                • {w}
              </span>
            ))}
            <span className="block mt-3 text-sm">
              Deseja finalizar mesmo assim?
            </span>
          </>
        ),
        confirmLabel: 'Finalizar assim mesmo',
        cancelLabel: 'Corrigir placar',
        onConfirm: () => {
          setModalConfig(null);
          handleFinishMatch(matchId);
        },
        onCancel: () => setModalConfig(null),
        variant: 'danger',
      });
      return;
    }

    handleFinishMatch(matchId);
  };

  const handleReopenMatch = async (matchId: string) => {
    const targetMatch = matches.find((m) => m.id === matchId);
    const nextMatches = matches.map((m) => {
      if (m.id !== matchId) return m;
      return {
        ...m,
        status: 'live' as const,
        winnerPairId: undefined,
        loserPairId: undefined,
      };
    });

    let nextPairs = pairs;
    if (isRanking && targetMatch) {
      const toAdd = [targetMatch.pair1, targetMatch.pair2].filter(
        (p): p is TournamentPair =>
          Boolean(p && !pairs.some((ep) => ep.id === p.id))
      );
      if (toAdd.length > 0) {
        nextPairs = [...pairs, ...toAdd.map(minifyPairForStorage)];
      }
    }

    const progressedMatches = isRanking
      ? nextMatches
      : updatePlayoffProgression(nextPairs, nextMatches);
    onUpdateEvent({ ...event, matches: progressedMatches, pairs: nextPairs });
    await persistPatch(
      { matches: progressedMatches, pairs: nextPairs },
      'Erro ao reabrir partida no Firestore:'
    );
  };

  const handleGenerateBlankPdf = () => {
    if (!selectedCategory) return;
    exportCategoryMatchesBlankPdf(
      event,
      selectedCategory,
      categoryMatches,
      pairsById
    );
  };

  const handleGenerateCalculationPdf = () => {
    if (!selectedCategory) return;
    exportCategoryCalculationWorksheetPdf(
      event,
      selectedCategory,
      categoryEntries,
      categoryPairs,
      categoryMatches,
      pairsById
    );
  };

  return {
    isSuper8dDrawModalOpen,
    setIsSuper8dDrawModalOpen,
    handleCreateManualMatch,
    handleGenerateSystemMatches,
    handleConfirmSuper8DuplasDraw,
    handleDeleteMatch,
    handleDeleteAllCategoryMatches,
    handleScoreInputChange,
    handleScoreUndoChange,
    handleMatchDateChange,
    handleFinishMatchWithValidation,
    handleReopenMatch,
    handleGenerateBlankPdf,
    handleGenerateCalculationPdf,
  };
}
