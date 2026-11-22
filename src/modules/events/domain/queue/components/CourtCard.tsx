import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Layers,
  Ban,
  Clock,
  Play,
  ArrowLeft,
  ShieldOff,
  ShieldAlert,
  RefreshCw,
  Calendar,
  Check,
  RotateCcw,
  Trash2,
  Hourglass,
  ArrowRightLeft,
  CircleDot,
  Dices,
  Loader2,
} from 'lucide-react';
import type { TournamentMatch, TournamentPair, MatchSetScore } from '../../../types';
import type { CourtState } from '../types';
import type { TournamentEvent } from '../../../types';
import { isSetScoreComplete } from '@modules/events/domain/brackets/engine/matchScoreEngine';
import { resolveCourtMinutes, resolveMatchRules } from '../../rules/eventMatchRules';
import { getCourtColors, COURT_TEAM_STYLES } from '../../../../../constants';
import type { QueueCategoryColor } from '../utils/queueCategoryColors';

export { COURT_TEAM_STYLES };

export const MatchTimer: React.FC<{ startedAt?: string; averageMinutes?: number }> = ({
  startedAt,
  averageMinutes,
}) => {
  const [elapsed, setElapsed] = useState<number>(() => {
    if (!startedAt) return 0;
    const diff = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
    return Math.max(0, isNaN(diff) ? 0 : diff);
  });

  useEffect(() => {
    if (!startedAt) return;
    const tick = () => {
      const diff = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
      setElapsed(Math.max(0, isNaN(diff) ? 0 : diff));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  const hrs = Math.floor(elapsed / 3600);
  const mins = Math.floor((elapsed % 3600) / 60);
  const secs = elapsed % 60;
  const timeStr = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  const totalMins = Math.floor(elapsed / 60);
  const isOvertime = averageMinutes && totalMins >= averageMinutes;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black font-mono border transition-all ${
        isOvertime
          ? 'bg-rose-100 text-rose-800 border-rose-300 animate-pulse'
          : 'bg-amber-100 text-amber-900 border-amber-300'
      }`}
      title={
        startedAt
          ? `Iniciado às ${new Date(startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
          : 'Cronômetro'
      }
    >
      <Clock size={11} className={isOvertime ? 'text-rose-600' : 'text-amber-700'} />
      <span>{timeStr}</span>
      {averageMinutes && (
        <span className="text-[9px] font-sans font-bold opacity-75">
          (~{averageMinutes}m)
        </span>
      )}
    </span>
  );
};

const WarmupCountdown: React.FC<{ startedAt?: string; minutes: number }> = ({ startedAt, minutes }) => {
  const [remaining, setRemaining] = useState(() => Math.max(0, minutes * 60 - (startedAt ? Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000) : 0)));
  useEffect(() => {
    const update = () => setRemaining(Math.max(0, minutes * 60 - (startedAt ? Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000) : 0)));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [startedAt, minutes]);
  return <span className="font-mono text-lg font-black tabular-nums">{String(Math.floor(remaining / 60)).padStart(2, '0')}:{String(remaining % 60).padStart(2, '0')}</span>;
};

const ScoreStopwatch: React.FC<{ startedAt?: string; finishedAt?: string }> = ({ startedAt, finishedAt }) => {
  const [elapsed, setElapsed] = useState(() => startedAt ? Math.max(0, Math.floor(((finishedAt ? new Date(finishedAt).getTime() : Date.now()) - new Date(startedAt).getTime()) / 1000)) : 0);
  useEffect(() => {
    if (!startedAt) return;
    const update = () => {
      const endMs = finishedAt ? new Date(finishedAt).getTime() : Date.now();
      setElapsed(Math.max(0, Math.floor((endMs - new Date(startedAt).getTime()) / 1000)));
    };
    update();
    if (finishedAt) return;
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [startedAt, finishedAt]);
  if (!startedAt) return null;
  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  const seconds = elapsed % 60;
  const time = [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
  return <span className="px-2 py-1 rounded-md border border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 font-mono text-[11px] tabular-nums whitespace-nowrap">{time}</span>;
};

const ScoreSyncIndicator: React.FC<{ status: 'saved' | 'saving' | 'error' }> = ({ status }) => {
  const label = status === 'saving' ? 'Salvando no Firebase' : status === 'error' ? 'Falha ao salvar no Firebase' : 'Salvo no Firebase';
  return (
    <span
      role="status"
      aria-label={label}
      title={label}
      className={`w-2.5 h-2.5 shrink-0 rounded-full ${status === 'saving' ? 'bg-blue-600 animate-pulse' : status === 'error' ? 'bg-red-600' : 'bg-emerald-600'}`}
    />
  );
};

export interface CourtCardProps {
  court: CourtState;
  index: number;
  isReadOnly: boolean;
  categoryColor?: QueueCategoryColor;
  pairsById: Record<string, TournamentPair>;
  totalSets: number;
  gamesPerSet: number;
  isTotalGamesSet: boolean;
  sportId?: string;
  sportRules?: TournamentEvent['sportRules'];
  tieBreak: boolean;
  tieBreakAt: string;
  averageMatchDurationMinutes: number;
  refreshingMatchId: string | null;
  saveStatus: 'saved' | 'saving' | 'error';
  getPlayerNick: (p?: { nickname?: string; name?: string; email?: string; pin?: string }) => string;
  parseMatchSets: (
    match: TournamentMatch,
    totalSets: number
  ) => { scores: MatchSetScore[]; setsWon1: number; setsWon2: number };
  onFreeCourtMatch: (matchId: string, isFinished?: boolean) => void;
  onOpenMatchRules: (match: TournamentMatch) => void;
  onToggleInterdictCourt: (courtName: string) => void;
  onRefreshEventScore: (matchId: string) => void;
  onScoreInputChange: (matchId: string, setIndex: number, player: 'p1' | 'p2', rawVal: string) => void;
  onScoreUndoChange?: (
    matchId: string,
    setIndex: number,
    p1Val: string,
    p2Val: string,
    gameP1?: string,
    gameP2?: string,
    servingOrderOffset?: number | null
  ) => void;
  onServeSettingsChange?: (matchId: string, settings: Partial<Pick<TournamentMatch, 'servingOrderOffset' | 'serveOrderP1Reversed' | 'serveOrderP2Reversed'>>) => void;
  onScoreBlur: (matchId?: string) => void;
  onMatchDateChange: (matchId: string, matchDate: string) => void;
  onFinishCourtMatch: (matchId: string) => void;
  onResetCourtMatch?: (matchId: string) => void | Promise<void>;
  onAdvanceCourtMatchStage: (matchId: string, stage: 'serve_draw' | 'match') => void | Promise<void>;
  onStartCourtWarmup: (matchId: string) => void | Promise<void>;
}

export const CourtCard: React.FC<CourtCardProps> = ({
  court,
  index,
  isReadOnly,
  categoryColor,
  pairsById,
  totalSets,
  gamesPerSet,
  isTotalGamesSet,
  sportId,
  sportRules,
  tieBreak,
  tieBreakAt,
  averageMatchDurationMinutes,
  refreshingMatchId,
  saveStatus,
  getPlayerNick,
  parseMatchSets,
  onFreeCourtMatch,
  onToggleInterdictCourt,
  onRefreshEventScore,
  onScoreInputChange,
  onScoreUndoChange,
  onServeSettingsChange,
  onScoreBlur,
  onMatchDateChange,
  onFinishCourtMatch,
  onResetCourtMatch,
  onAdvanceCourtMatchStage,
  onStartCourtWarmup,
}) => {
  const isFree = court.status === 'free';
  const isBusy = court.status === 'busy';
  const isInterdicted = court.status === 'interdicted';

  const activeMatch = court.activeMatch;
  const courtStage = activeMatch?.courtStage || 'match';
  const activeCat = court.activeMatchCategory;

  const p1 = activeMatch
    ? activeMatch.pair1 || (activeMatch.pair1Id && pairsById ? pairsById[activeMatch.pair1Id] : undefined)
    : undefined;
  const p2 = activeMatch
    ? activeMatch.pair2 || (activeMatch.pair2Id && pairsById ? pairsById[activeMatch.pair2Id] : undefined)
    : undefined;

  const team1P1Name = p1?.p1 ? getPlayerNick(p1.p1) : '';
  const team1P2Name = p1?.p2 ? getPlayerNick(p1.p2) : undefined;
  const team1Name = p1 ? (team1P2Name ? `${team1P1Name} & ${team1P2Name}` : team1P1Name) : activeMatch?.pair1Label || 'Time 1';
  const team1Code = p1 ? p1.teamCode || `Time ${p1.teamNumber || ''}` : '';

  const team2P1Name = p2?.p1 ? getPlayerNick(p2.p1) : '';
  const team2P2Name = p2?.p2 ? getPlayerNick(p2.p2) : undefined;
  const team2Name = p2 ? (team2P2Name ? `${team2P1Name} & ${team2P2Name}` : team2P1Name) : activeMatch?.pair2Label || 'Time 2';
  const team2Code = p2 ? p2.teamCode || `Time ${p2.teamNumber || ''}` : '';

  const parsedSets = activeMatch ? parseMatchSets(activeMatch, totalSets) : { scores: [], setsWon1: 0, setsWon2: 0 };
  const { scores, setsWon1, setsWon2 } = parsedSets;
  const isSetWonByScore = (p1: number, p2: number) =>
    isSetScoreComplete(p1, p2, gamesPerSet, { isTotalGamesSet, tieBreak, tieBreakAt });
  const matchCodeLabel = activeMatch ? activeMatch.matchCode || String(activeMatch.matchNumber || 1).padStart(2, '0') : '';
  const phaseLabel = activeMatch?.phase === 'chave1' ? 'Chave 1' : activeMatch?.phase === 'chave2' ? 'Chave 2' : activeMatch?.phase || 'Jogo';

  const courtColors = getCourtColors(court.courtName || index);
  const t1Style = COURT_TEAM_STYLES[courtColors.p1Color] || COURT_TEAM_STYLES.azul;
  const t2Style = COURT_TEAM_STYLES[courtColors.p2Color] || COURT_TEAM_STYLES.vermelho;
  const servingOffset = activeMatch?.servingOrderOffset;
  const servingTeam = servingOffset === undefined ? null : (servingOffset % 2 === 0 ? 'p1' : 'p2');
  const openingServingTeam = activeMatch?.initialServingOrderOffset === undefined
    ? null
    : (activeMatch.initialServingOrderOffset % 2 === 0 ? 'p1' : 'p2');
  const team1MatchOrderClass = openingServingTeam === 'p2' ? 'order-3' : 'order-1';
  const team2MatchOrderClass = openingServingTeam === 'p2' ? 'order-1' : 'order-3';
  const servingPartner = servingOffset === undefined ? false : servingOffset >= 2;
  const p1FirstServeReversed = Boolean(activeMatch?.serveOrderP1Reversed);
  const p2FirstServeReversed = Boolean(activeMatch?.serveOrderP2Reversed);
  const team1FirstName = p1FirstServeReversed ? team1P2Name || team1P1Name || team1Name : team1P1Name || team1Name;
  const team1SecondName = p1FirstServeReversed ? team1P1Name : team1P2Name;
  const team2FirstName = p2FirstServeReversed ? team2P2Name || team2P1Name || team2Name : team2P1Name || team2Name;
  const team2SecondName = p2FirstServeReversed ? team2P1Name : team2P2Name;
  const hasAnyScoreActivity = scores.some((score) => Number(score.p1 || 0) > 0 || Number(score.p2 || 0) > 0 || (score.gameP1 && score.gameP1 !== '0') || (score.gameP2 && score.gameP2 !== '0'));
  const supportsServerDraw = sportId === 'tennis' || sportId === 'beach-tennis';

  const toggleServeOrder = (team: 'p1' | 'p2') => {
    if (!activeMatch || !onServeSettingsChange) return;
    const field = team === 'p1' ? 'serveOrderP1Reversed' : 'serveOrderP2Reversed';
    onServeSettingsChange(activeMatch.id, { [field]: !activeMatch[field] });
  };

  const drawStartingServer = () => {
    if (!activeMatch || !onServeSettingsChange || !canDrawStartingServer || isDrawingServer) return;
    setIsDrawingServer(true);
    let rounds = 0;
    let finalOffset: 0 | 1 = 0;
    drawTimerRef.current = setInterval(() => {
      finalOffset = Math.random() < 0.5 ? 0 : 1;
      setDrawPreview(finalOffset);
      rounds += 1;
      if (rounds >= 3) {
        if (drawTimerRef.current) clearInterval(drawTimerRef.current);
        drawTimerRef.current = null;
        drawFinalizeTimerRef.current = setTimeout(() => {
          drawFinalizeTimerRef.current = null;
          setIsDrawingServer(false);
          setDrawPreview(null);
          onServeSettingsChange(activeMatch.id, { servingOrderOffset: finalOffset });
        }, 260);
      }
    }, 220);
  };

  // ── Tap-to-score e Undo com histórico fiel de ambos os times ──────────────
  const scoreHistoryRef = useRef<Array<{ setIdx: number; p1: string; p2: string; gameP1: string; gameP2: string; servingOrderOffset?: number | null }>>([]);
  const [hasUndoSteps, setHasUndoSteps] = useState(false);
  const [isDrawingServer, setIsDrawingServer] = useState(false);
  const [drawPreview, setDrawPreview] = useState<0 | 1 | null>(null);
  const drawTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const drawFinalizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setIsDrawingServer(false);
    setDrawPreview(null);
    return () => {
      if (drawTimerRef.current) clearInterval(drawTimerRef.current);
      if (drawFinalizeTimerRef.current) clearTimeout(drawFinalizeTimerRef.current);
      drawTimerRef.current = null;
      drawFinalizeTimerRef.current = null;
    };
  }, [activeMatch?.id]);

  const resetCurrentMatch = () => {
    if (!activeMatch || !onResetCourtMatch || isReadOnly) return;
    if (!window.confirm('Deseja zerar a partida? Esta ação não pode ser desfeita.')) return;
    scoreHistoryRef.current = [];
    latestScoresRef.current = {};
    setHasUndoSteps(false);
    void onResetCourtMatch(activeMatch.id);
  };
  const historyMatchIdRef = useRef(activeMatch?.id);

  useEffect(() => {
    if (historyMatchIdRef.current === activeMatch?.id) return;
    historyMatchIdRef.current = activeMatch?.id;
    scoreHistoryRef.current = [];
    latestScoresRef.current = {};
    setHasUndoSteps(false);
  }, [activeMatch?.id]);

  // Mantém o estado mais recente de cada set em memória local para cliques rápidos
  const latestScoresRef = useRef<Record<number, { p1: string; p2: string; gameP1?: string; gameP2?: string }>>({});

  // Sincroniza latestScoresRef quando scores mudar de fora (props)
  useEffect(() => {
    scores.forEach((s, idx) => {
      const p1 = s.p1 !== null && s.p1 !== undefined ? String(s.p1) : '';
      const p2 = s.p2 !== null && s.p2 !== undefined ? String(s.p2) : '';
      latestScoresRef.current[idx] = { p1, p2, gameP1: s.gameP1 || '0', gameP2: s.gameP2 || '0' };
    });
  }, [scores]);

  const canTapScore = !isReadOnly && Boolean(activeMatch);
  const canDrawStartingServer = canTapScore && (courtStage === 'serve_draw' || !hasAnyScoreActivity);

  // Determina se já há um vencedor definido pelo placar
  const setsToWin = Math.ceil(totalSets / 2);
  const hasWinnerDefined =
    totalSets === 1
      ? (scores[0]?.p1 !== null &&
          scores[0]?.p1 !== undefined &&
          scores[0]?.p2 !== null &&
          scores[0]?.p2 !== undefined &&
          isSetWonByScore(Number(scores[0].p1), Number(scores[0].p2)))
      : setsWon1 >= setsToWin || setsWon2 >= setsToWin;

  // Botões de incremento desabilitados quando houver vencedor
  const canIncrementScore = canTapScore && !hasWinnerDefined;

  // Determina qual set está em jogo no momento (só pula para o próximo se o anterior estiver finalizado)
  const getActiveSetIdx = useCallback((): number => {
    if (totalSets === 1) return 0;
    for (let i = 0; i < scores.length; i++) {
      const s = scores[i];
      if (s.inProgress) return i;
      const cur = latestScoresRef.current[i] || {
        p1: s.p1 !== null && s.p1 !== undefined ? String(s.p1) : '',
        p2: s.p2 !== null && s.p2 !== undefined ? String(s.p2) : '',
      };
      if (cur.p1 === '' || cur.p2 === '') return i;
      const n1 = Number(cur.p1);
      const n2 = Number(cur.p2);
      const isWon = isSetWonByScore(n1, n2);
      if (!isWon) return i;
    }
    return Math.max(0, scores.length - 1);
  }, [totalSets, scores, gamesPerSet, isTotalGamesSet, tieBreak, tieBreakAt]);

  const applySetScore = useCallback(
    (setIdx: number, p1Val: string, p2Val: string, gameP1 = '', gameP2 = '', servingOrderOffset: number | null | undefined = activeMatch?.servingOrderOffset) => {
      if (!activeMatch) return;
      latestScoresRef.current[setIdx] = { p1: p1Val, p2: p2Val, gameP1, gameP2 };

      if (onScoreUndoChange) {
        onScoreUndoChange(activeMatch.id, setIdx, p1Val, p2Val, gameP1, gameP2, servingOrderOffset);
      } else if (onScoreInputChange) {
        onScoreInputChange(activeMatch.id, setIdx, 'p1', p1Val);
        onScoreInputChange(activeMatch.id, setIdx, 'p2', p2Val);
      }
    },
    [activeMatch?.id, activeMatch?.servingOrderOffset, onScoreUndoChange, onScoreInputChange]
  );

  const handleTapGame = useCallback((player: 'p1' | 'p2', setIdx = 0) => {
    if (!canIncrementScore || !activeMatch) return;
    const score = scores[setIdx];
    if (!score) return;
    const oldP1 = String(score.p1 ?? '');
    const oldP2 = String(score.p2 ?? '');
    const oldGameP1 = score.gameP1 || '0';
    const oldGameP2 = score.gameP2 || '0';
    const servingOrderOffset = activeMatch.servingOrderOffset ?? 0;
    scoreHistoryRef.current = [...scoreHistoryRef.current, { setIdx, p1: oldP1, p2: oldP2, gameP1: oldGameP1, gameP2: oldGameP2, servingOrderOffset: activeMatch.servingOrderOffset ?? null }];
    setHasUndoSteps(true);

    const rules = resolveMatchRules(sportRules, activeMatch.phase, totalSets as 1 | 3 | 5, gamesPerSet, sportId);
    const inTieBreak = rules.tieBreak && !isTotalGamesSet && oldP1 !== '' && oldP2 !== '' && (() => {
      const [a, b] = rules.tieBreakAt.split('-').map(Number);
      return Number(oldP1) === a && Number(oldP2) === b;
    })();
    let g1 = oldGameP1;
    let g2 = oldGameP2;
    let wonGame = false;
    let nextServingOrderOffset = servingOrderOffset;
    if (inTieBreak) {
      if (player === 'p1') g1 = String(Number(g1) + 1); else g2 = String(Number(g2) + 1);
      const a = Number(g1), b = Number(g2), target = rules.tieBreakPoints || 7;
      wonGame = rules.tieBreakWinByTwo
        ? Math.max(a, b) >= target && Math.abs(a - b) >= 2
        : Math.max(a, b) >= target;
      if (!wonGame && (a + b) % 2 === 1) nextServingOrderOffset = (nextServingOrderOffset + 1) % (activeMatch.pair1?.p2 || activeMatch.pair2?.p2 ? 4 : 2);
    } else {
      const values = ['0', '15', '30', '40'];
      const mine = player === 'p1' ? g1 : g2;
      const theirs = player === 'p1' ? g2 : g1;
      if (mine === '40' && theirs === '40') {
        if (rules.noAd) wonGame = true;
        else if (player === 'p1') g1 = 'Ad'; else g2 = 'Ad';
      } else if (mine === 'Ad') wonGame = true;
      else if (theirs === 'Ad') { if (player === 'p1') g2 = '40'; else g1 = '40'; }
      else if (mine === '40') wonGame = true;
      else {
        const next = values[Math.min(values.indexOf(mine), 2) + 1] || '15';
        if (player === 'p1') g1 = next; else g2 = next;
      }
    }
    let nextP1 = oldP1, nextP2 = oldP2;
    if (wonGame) {
      const n1 = Number(oldP1 || 0) + (player === 'p1' ? 1 : 0);
      const n2 = Number(oldP2 || 0) + (player === 'p2' ? 1 : 0);
      nextP1 = String(n1); nextP2 = String(n2); g1 = '0'; g2 = '0';
      if (!inTieBreak) nextServingOrderOffset = (nextServingOrderOffset + 1) % (activeMatch.pair1?.p2 || activeMatch.pair2?.p2 ? 4 : 2);
      if (isSetScoreComplete(n1, n2, rules.gamesPerSet, { isTotalGamesSet, tieBreak: rules.tieBreak, tieBreakAt: rules.tieBreakAt })) {
        g1 = '0';
        g2 = '0';
      }
    }
    applySetScore(setIdx, nextP1, nextP2, g1, g2, nextServingOrderOffset);
  }, [canIncrementScore, activeMatch, scores, totalSets, gamesPerSet, isTotalGamesSet, sportId, sportRules, applySetScore]);

  const handleTapScore = useCallback(
    (player: 'p1' | 'p2', setIdxOverride?: number) => {
      if (!canIncrementScore || !activeMatch) return;
      const setIdx = setIdxOverride !== undefined ? setIdxOverride : getActiveSetIdx();

      const existing = latestScoresRef.current[setIdx] || {
        p1: scores[setIdx]?.p1 !== null && scores[setIdx]?.p1 !== undefined ? String(scores[setIdx].p1) : '',
        p2: scores[setIdx]?.p2 !== null && scores[setIdx]?.p2 !== undefined ? String(scores[setIdx].p2) : '',
        gameP1: scores[setIdx]?.gameP1 || '0', gameP2: scores[setIdx]?.gameP2 || '0',
      };
      const curP1 = existing.p1;
      const curP2 = existing.p2;

      // Salva snapshot exato de ambos os times ANTES do ponto
      scoreHistoryRef.current = [
        ...scoreHistoryRef.current,
        { setIdx, p1: curP1, p2: curP2, gameP1: scores[setIdx]?.gameP1 || '0', gameP2: scores[setIdx]?.gameP2 || '0', servingOrderOffset: activeMatch.servingOrderOffset ?? null },
      ];
      setHasUndoSteps(true);

      const nextP1 = player === 'p1' ? String(Number(curP1 || 0) + 1) : (curP1 || '0');
      const nextP2 = player === 'p2' ? String(Number(curP2 || 0) + 1) : (curP2 || '0');
      const rotationSize = activeMatch.pair1?.p2 || activeMatch.pair2?.p2 ? 4 : 2;
      const nextServingOrderOffset = ((activeMatch.servingOrderOffset ?? 0) + 1) % rotationSize;

      applySetScore(setIdx, nextP1, nextP2, '0', '0', nextServingOrderOffset);
    },
    [canIncrementScore, activeMatch, getActiveSetIdx, scores, applySetScore]
  );

  const handleUndo = useCallback(() => {
    if (!canTapScore || !activeMatch) return;

    if (scoreHistoryRef.current.length > 0) {
      const prev = scoreHistoryRef.current[scoreHistoryRef.current.length - 1];
      scoreHistoryRef.current = scoreHistoryRef.current.slice(0, -1);
      setHasUndoSteps(scoreHistoryRef.current.length > 0);
      applySetScore(prev.setIdx, prev.p1, prev.p2, prev.gameP1, prev.gameP2, prev.servingOrderOffset);
      return;
    }

    // Se histórico local esvaziou mas ainda há pontos, decrementa até zerar
    const activeSetIdx = getActiveSetIdx();
    const cur = latestScoresRef.current[activeSetIdx] || {
      p1: scores[activeSetIdx]?.p1 !== null && scores[activeSetIdx]?.p1 !== undefined ? String(scores[activeSetIdx].p1) : '',
      p2: scores[activeSetIdx]?.p2 !== null && scores[activeSetIdx]?.p2 !== undefined ? String(scores[activeSetIdx].p2) : '',
    };
    const n1 = Number(cur.p1 || 0);
    const n2 = Number(cur.p2 || 0);

    if (n1 > 0 || n2 > 0) {
      let nextP1 = cur.p1;
      let nextP2 = cur.p2;
      if (n1 > n2) {
        nextP1 = String(Math.max(0, n1 - 1));
      } else if (n2 > n1) {
        nextP2 = String(Math.max(0, n2 - 1));
      } else {
        nextP2 = String(Math.max(0, n2 - 1));
      }
      if (nextP1 === '0' && nextP2 === '0') {
        nextP1 = '';
        nextP2 = '';
      }
      applySetScore(activeSetIdx, nextP1, nextP2, cur.gameP1 || '0', cur.gameP2 || '0');
    }
  }, [canTapScore, activeMatch, getActiveSetIdx, scores, applySetScore]);

  const handleScoreInput = (setIdx: number, player: 'p1' | 'p2', val: string) => {
    if (!activeMatch) return;
    const existing = latestScoresRef.current[setIdx] || {
      p1: scores[setIdx]?.p1 !== null && scores[setIdx]?.p1 !== undefined ? String(scores[setIdx].p1) : '0',
      p2: scores[setIdx]?.p2 !== null && scores[setIdx]?.p2 !== undefined ? String(scores[setIdx].p2) : '0',
    };
    scoreHistoryRef.current = [
      ...scoreHistoryRef.current,
      { setIdx, p1: existing.p1, p2: existing.p2, gameP1: scores[setIdx]?.gameP1 || '0', gameP2: scores[setIdx]?.gameP2 || '0' },
    ];
    setHasUndoSteps(true);

    const nextP1 = player === 'p1' ? val : existing.p1;
    const nextP2 = player === 'p2' ? val : existing.p2;
    applySetScore(setIdx, nextP1, nextP2, scores[setIdx]?.gameP1 || '0', scores[setIdx]?.gameP2 || '0');
  };

  const isAnyScorePositive = scores.some(
    (s) => (s.p1 !== null && Number(s.p1) > 0) || (s.p2 !== null && Number(s.p2) > 0) || (s.gameP1 && s.gameP1 !== '0') || (s.gameP2 && s.gameP2 !== '0')
  );
  // Botão Undo permanece habilitado mesmo com vencedor (para permitir corrigir placar)
  const canUndo = canTapScore && (hasUndoSteps || isAnyScorePositive);

  // Detecta se o set atual está em tie-break (ambos os times >= threshold e set não finalizado)
  const tieBreakSetFlags = useMemo(() => {
    if (!tieBreak || !isBusy || !activeMatch) return scores.map(() => false);
    const [tbP1Str, tbP2Str] = tieBreakAt.split('-');
    const tbP1 = Number(tbP1Str ?? 6);
    const tbP2 = Number(tbP2Str ?? 6);
    return scores.map((s) => {
      if (s.p1 === null || s.p1 === undefined || s.p2 === null || s.p2 === undefined) return false;
      const n1 = Number(s.p1);
      const n2 = Number(s.p2);
      if (isSetWonByScore(n1, n2)) return false;
      return n1 >= tbP1 && n2 >= tbP2;
    });
  }, [tieBreak, tieBreakAt, isBusy, activeMatch, scores, isSetWonByScore]);

  return (
    <div
      className={`rounded-3xl border shadow-sm p-4 flex flex-col gap-2.5 transition-all overflow-hidden ${
        isFree
          ? 'bg-white border-emerald-200 hover:border-emerald-400'
          : isBusy
          ? 'bg-amber-50/40 border-amber-200 hover:border-amber-400'
          : 'bg-red-50/40 border-red-200'
      }`}
    >
      {/* Linha Superior da Quadra: Identificação e Status */}
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
              Ocupada (ao vivo)
            </span>
          )}
          {isBusy && activeMatch && (
            <MatchTimer
              startedAt={activeMatch.courtStartedAt || activeMatch.startedAt}
              averageMinutes={resolveCourtMinutes(sportRules).courtMinutes}
            />
          )}
          {isInterdicted && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black border bg-red-100 text-red-800 border-red-300 whitespace-nowrap">
              <Ban size={10} />
              Interditada
            </span>
          )}
        </div>
      </div>

      {/* Botões de Ação */}
      <div className="flex items-center w-full mt-2 gap-2">
        <div className="flex-1 flex justify-start">
          {isBusy && activeMatch && (
            <button
              type="button"
              disabled={isReadOnly}
              onClick={() => onFreeCourtMatch(activeMatch.id, false)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 active:scale-95 text-slate-600 font-black text-xs rounded-xl border border-slate-200 transition-all whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none"
              title="Desvincular da quadra e devolver para a fila de espera"
            >
              <ArrowLeft size={13} />
              Voltar para fila
            </button>
          )}
        </div>

        <div className="flex-1 flex justify-end">
          <button
            type="button"
            disabled={isReadOnly}
            onClick={() => onToggleInterdictCourt(court.courtName)}
            className={`flex items-center gap-1.5 text-xs font-black px-3 py-1.5 rounded-xl border transition-all active:scale-95 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none ${
              isInterdicted
                ? 'bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-50'
                : 'bg-white text-slate-500 border-slate-200 hover:text-red-600 hover:border-red-200'
            }`}
            title={isInterdicted ? 'Liberar quadra para jogos' : 'Interditar esta quadra'}
          >
            {isInterdicted ? <ShieldOff size={13} /> : <ShieldAlert size={13} />}
            {isInterdicted ? 'Desinterditar' : 'Interditar'}
          </button>
        </div>
      </div>

      {/* Partida em Andamento e Placar */}
      {isBusy && activeMatch && (
        <div className="mt-1 p-3 bg-white/95 rounded-2xl border border-amber-200/80 shadow-xs space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                style={categoryColor ? {
                  backgroundColor: categoryColor.backgroundColor,
                  borderColor: categoryColor.borderColor,
                  color: categoryColor.color,
                } : undefined}
                className={`inline-flex items-center gap-1.5 text-[10px] font-black border px-2 py-0.5 rounded-lg whitespace-nowrap ${categoryColor ? '' : 'text-slate-600 bg-amber-50 border-amber-200'}`}
              >
                {categoryColor && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: categoryColor.indicatorColor }} />}
                {activeCat?.abbreviation || activeCat?.name || ''}
                {activeCat && ' · '}
                {phaseLabel}
              </span>
              {activeMatch.startedAt && (
                <span className="text-[10px] font-bold text-slate-500 whitespace-nowrap">
                  Início: {new Date(activeMatch.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-black text-slate-800 whitespace-nowrap">
                [{matchCodeLabel}] {phaseLabel ? `[${phaseLabel}]` : ''}
              </span>
              <button
                type="button"
                onClick={() => onRefreshEventScore(activeMatch.id)}
                disabled={refreshingMatchId === activeMatch.id}
                className="w-8 h-8 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-blue-600 active:scale-95 transition-all flex items-center justify-center disabled:opacity-60"
                title="Atualizar placar"
              >
                <RefreshCw size={14} className={refreshingMatchId === activeMatch.id ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {courtStage === 'warmup' && activeMatch && (
            <div className="space-y-2 py-2">
              <h5 className="px-1 text-sm font-black text-slate-800">1. Etapa: aquecimento</h5>
              <div className={`rounded-2xl p-3 text-sm font-black ${t1Style.bar} ${t1Style.text}`}>
                <span className={`inline-flex items-center gap-1 ${servingTeam === 'p1' ? 'rounded px-1 bg-[#bef264] text-[#1a1a1a]' : ''}`}>{team1FirstName}{servingTeam === 'p1' && <span className="w-5 h-5 rounded-full bg-white text-sky-600 flex items-center justify-center shrink-0"><CircleDot size={12} /></span>}</span>{team1SecondName && <><span className="my-1 block h-px w-full bg-white/80" />{team1SecondName}</>}
              </div>
              <div className="flex items-center justify-center gap-1.5">
                <div className="inline-flex items-center gap-1 rounded-xl border border-sky-200 bg-sky-50 px-2 py-1.5 text-sky-800">
                  <Hourglass size={15} />
                  <WarmupCountdown startedAt={activeMatch.warmupStartedAt} minutes={resolveCourtMinutes(sportRules).warmupMinutes} />
                </div>
                {!activeMatch.warmupStartedAt && <button type="button" disabled={isReadOnly} onClick={() => void onStartCourtWarmup(activeMatch.id)} className="w-8 h-8 rounded-lg bg-lime-400 text-emerald-800 flex items-center justify-center disabled:opacity-40" title="Iniciar aquecimento"><Play size={15} fill="currentColor" /></button>}
                <button type="button" disabled={isReadOnly} onClick={() => void onAdvanceCourtMatchStage(activeMatch.id, 'serve_draw')} className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center disabled:opacity-40" title="Encerrar aquecimento">
                  <Trash2 size={14} />
                </button>
              </div>
              <div className={`rounded-2xl p-3 text-sm font-black ${t2Style.bar} ${t2Style.text}`}>
                <span className={`inline-flex items-center gap-1 ${servingTeam === 'p2' ? 'rounded px-1 bg-[#bef264] text-[#1a1a1a]' : ''}`}>{team2FirstName}{servingTeam === 'p2' && <span className="w-5 h-5 rounded-full bg-white text-sky-600 flex items-center justify-center shrink-0"><CircleDot size={12} /></span>}</span>{team2SecondName && <><span className="my-1 block h-px w-full bg-white/80" />{team2SecondName}</>}
              </div>
            </div>
          )}

          {courtStage === 'serve_draw' && activeMatch && (
            <div className="flex flex-col gap-2 py-2">
              <h5 className="px-1 text-sm font-black text-slate-800">2. Etapa: sorteio e definição ordem dos sacadores</h5>
              <div className={`${servingTeam === 'p2' ? 'order-3' : 'order-1'} rounded-2xl p-3 text-sm font-black ${t1Style.bar} ${t1Style.text}`}>
                <span className={`inline-flex items-center gap-1 ${servingTeam === 'p1' ? 'rounded px-1 bg-[#bef264] text-[#1a1a1a]' : ''}`}>{team1FirstName}{servingTeam === 'p1' && <span className="w-5 h-5 rounded-full bg-white text-sky-600 flex items-center justify-center shrink-0"><CircleDot size={12} /></span>}</span>{team1SecondName && <><span className="my-1 block h-px w-full bg-white/80" />{team1SecondName}</>}
                {team1P2Name && <button type="button" disabled={isReadOnly} onClick={() => toggleServeOrder('p1')} className="ml-2 inline-flex rounded-full bg-white/90 p-1 text-slate-700" title="Trocar a ordem dos sacadores"><ArrowRightLeft size={12} /></button>}
                {servingTeam === 'p1' && <span className="mt-1 block w-full rounded-md bg-lime-300 px-1.5 py-0.5 text-center text-[9px] text-slate-900">Começa sacando</span>}
                {servingTeam === 'p2' && <span className="mt-1 block w-full rounded-md border border-slate-300 bg-slate-200 px-1.5 py-0.5 text-center text-[9px] text-slate-900">Escolhe quadra</span>}
              </div>
              <div className="order-2 flex items-center justify-center gap-2">
                {supportsServerDraw ? <button type="button" onClick={drawStartingServer} disabled={isDrawingServer || isReadOnly} className="h-10 rounded-xl bg-sky-500 px-3 text-white flex items-center gap-1.5 disabled:opacity-50">
                  {isDrawingServer ? <Loader2 size={15} className="animate-spin" /> : <Dices size={15} />}
                  <span className="text-[10px] font-black text-center">{isDrawingServer ? `Time ${(drawPreview ?? 0) + 1}` : <>Sortear<br />sacador</>}</span>
                </button> : <span className="text-[10px] font-bold text-slate-500">Preparar jogo</span>}
                <button type="button" onClick={() => void onAdvanceCourtMatchStage(activeMatch.id, 'match')} disabled={isReadOnly || (supportsServerDraw && activeMatch.servingOrderOffset === undefined) || isDrawingServer} className="h-9 rounded-lg bg-green-700 px-3 text-xs font-black text-white flex items-center gap-1.5 disabled:opacity-40" title="Iniciar partida"><Play size={14} fill="currentColor" /> Iniciar partida</button>
              </div>
              <div className={`${servingTeam === 'p2' ? 'order-1' : 'order-3'} rounded-2xl p-3 text-sm font-black ${t2Style.bar} ${t2Style.text}`}>
                <span className={`inline-flex items-center gap-1 ${servingTeam === 'p2' ? 'rounded px-1 bg-[#bef264] text-[#1a1a1a]' : ''}`}>{team2FirstName}{servingTeam === 'p2' && <span className="w-5 h-5 rounded-full bg-white text-sky-600 flex items-center justify-center shrink-0"><CircleDot size={12} /></span>}</span>{team2SecondName && <><span className="my-1 block h-px w-full bg-white/80" />{team2SecondName}</>}
                {team2P2Name && <button type="button" disabled={isReadOnly} onClick={() => toggleServeOrder('p2')} className="ml-2 inline-flex rounded-full bg-white/90 p-1 text-slate-700" title="Trocar a ordem dos sacadores"><ArrowRightLeft size={12} /></button>}
                {servingTeam === 'p2' && <span className="mt-1 block w-full rounded-md bg-lime-300 px-1.5 py-0.5 text-center text-[9px] text-slate-900">Começa sacando</span>}
                {servingTeam === 'p1' && <span className="mt-1 block w-full rounded-md border border-slate-300 bg-slate-200 px-1.5 py-0.5 text-center text-[9px] text-slate-900">Escolhe quadra</span>}
              </div>
            </div>
          )}

          {/* Placar */}
          {courtStage === 'match' && (
          totalSets === 1 ? (
            <div className="flex flex-col gap-2">
              {/* Equipe 1 — clique fora do input incrementa +1 */}
              <div
                className={`${team1MatchOrderClass} rounded-2xl p-3 flex items-center justify-between gap-3 shadow-xs ${t1Style.bar} ${
                  canIncrementScore ? 'cursor-pointer select-none active:brightness-90 transition-all' : ''
                }`}
                onClick={(e) => {
                  if ((e.target as HTMLElement).tagName === 'INPUT') return;
                  handleTapScore('p1', 0);
                }}
              >
                <div className="min-w-0 flex-1">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <p className={`text-sm font-black leading-tight truncate ${servingTeam === 'p1' && !servingPartner ? 'bg-[#bef264] text-[#1a1a1a] px-1 rounded' : t1Style.text}`}>
                        {team1FirstName}
                      </p>
                      {servingTeam === 'p1' && !servingPartner && <span className="w-5 h-5 rounded-full bg-white text-sky-600 flex items-center justify-center shrink-0" title="Sacador atual"><CircleDot size={12} /></span>}
                    </div>
                    {team1SecondName && <div className="my-1 h-px w-full bg-white/80" />}
                    {team1SecondName && (
                      <div className="flex items-center gap-1">
                        <p className={`text-sm font-black leading-tight truncate ${servingTeam === 'p1' && servingPartner ? 'bg-[#bef264] text-[#1a1a1a] px-1 rounded' : t1Style.text}`}>
                          {team1SecondName}
                        </p>
                        {servingTeam === 'p1' && servingPartner && <span className="w-5 h-5 rounded-full bg-white text-sky-600 flex items-center justify-center shrink-0" title="Sacador atual"><CircleDot size={12} /></span>}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {team1Code && <p className={`text-xs font-bold ${t1Style.subText}`}>[{team1Code}]</p>}
                    {team1P2Name && <button type="button" disabled={isReadOnly} onClick={(e) => { e.stopPropagation(); toggleServeOrder('p1'); }} className="w-6 h-6 rounded-full bg-white text-slate-700 shadow-sm flex items-center justify-center disabled:opacity-40" title="Trocar a ordem de saque dos parceiros"><ArrowRightLeft size={12} /></button>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={2}
                    disabled={isReadOnly}
                    readOnly={isReadOnly}
                    value={scores[0]?.p1 !== null && scores[0]?.p1 !== undefined ? scores[0].p1 : ''}
                    onChange={(e) => handleScoreInput(0, 'p1', e.target.value)}
                    onBlur={() => onScoreBlur(activeMatch?.id)}
                    onClick={(e) => e.stopPropagation()}
                    className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center text-center font-black text-sm outline-none transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                      !scores[0]?.inProgress && scores[0]?.p1 !== null && scores[0]?.p1 !== undefined && scores[0]?.p2 !== null && scores[0]?.p2 !== undefined && isSetWonByScore(Number(scores[0].p1), Number(scores[0].p2)) && Number(scores[0].p1) > Number(scores[0].p2)
                        ? t1Style.wonInput
                        : t1Style.input
                    }`}
                  />
                  {(sportId === 'tennis' || sportId === 'beach-tennis') && (
                    <button type="button" disabled={!canIncrementScore} onClick={(e) => { e.stopPropagation(); handleTapGame('p1', 0); }}
                      className={`w-11 h-11 sm:w-12 sm:h-12 shrink-0 rounded-lg font-black text-sm ${t1Style.input}  disabled:opacity-50`}
                      style={{ borderColor: '#ffd400', borderWidth: 3 }}
                      title="Adicionar ponto ao game do Time 1">
                      {scores[0]?.gameP1 || '0'}
                    </button>
                  )}
                </div>
              </div>

              {/* Linha central: label set1 + botão undo */}
              <div className="order-2 flex items-center gap-1 px-1 py-0.5">
                <div className="flex flex-1 min-w-0 items-center justify-start gap-1">
                <div className="flex items-center gap-1">
                  {(sportId === 'tennis' || sportId === 'beach-tennis') && (
                    <button type="button" onClick={resetCurrentMatch} disabled={isReadOnly}
                      className="min-w-[64px] h-9 px-1.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-600 flex items-center justify-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Zerar partida">
                      <RefreshCw size={13} />
                      <span className="text-[9px] leading-tight font-black">0 x 0</span>
                    </button>
                  )}
                  {(sportId === 'tennis' || sportId === 'beach-tennis') && activeMatch.servingOrderOffset === undefined && canDrawStartingServer && (
                    <button type="button" onClick={drawStartingServer} disabled={isDrawingServer}
                      className="min-w-[110px] h-9 px-1.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-white shadow-sm flex items-center justify-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Sortear qual time inicia sacando">
                      {isDrawingServer ? <Loader2 size={14} className="animate-spin shrink-0" /> : <Dices size={14} className="text-yellow-300 shrink-0" />}
                      <span className="text-[9px] leading-tight font-black text-center">{isDrawingServer ? `Time ${(drawPreview ?? 0) + 1} inicia sacando` : <>Sortear<br />sacador</>}</span>
                    </button>
                  )}
                </div>
                {canTapScore && hasAnyScoreActivity ? (
                  <button
                    type="button"
                    onClick={handleUndo}
                    disabled={!canUndo}
                    className={`h-8 px-1.5 rounded-xl border flex items-center justify-center gap-1 transition-all active:scale-90 ${
                      canUndo
                        ? 'bg-amber-50 border border-amber-300 text-amber-600 hover:bg-amber-100 hover:border-amber-400 hover:text-amber-700 shadow-sm cursor-pointer'
                        : 'bg-slate-50 border border-slate-200 text-slate-300 cursor-not-allowed'
                    }`}
                    title={canUndo ? 'Voltar' : 'Nenhum ponto para desfazer'}
                  >
                    <RotateCcw size={14} />
                    <span className="text-[9px] font-black">Voltar</span>
                  </button>
                ) : null}
                <ScoreStopwatch startedAt={activeMatch.scoreStartedAt} finishedAt={activeMatch.scoreFinishedAt} />
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <ScoreSyncIndicator status={saveStatus} />
                  <span className="w-9 sm:w-10 text-center text-[10px] sm:text-xs font-bold text-slate-400">set1</span>
                  {(sportId === 'tennis' || sportId === 'beach-tennis') && (
                    <span className="w-11 sm:w-12 text-center text-[10px] sm:text-xs font-bold text-[#b7ff3c]">game</span>
                  )}
                  {tieBreakSetFlags[0] && (
                    <span className="text-[9px] font-black text-amber-600 animate-pulse leading-none">TB</span>
                  )}
                </div>
              </div>

              {/* Equipe 2 — clique fora do input incrementa +1 */}
              <div
                className={`${team2MatchOrderClass} rounded-2xl p-3 flex items-center justify-between gap-3 shadow-xs ${t2Style.bar} ${
                  canIncrementScore ? 'cursor-pointer select-none active:brightness-90 transition-all' : ''
                }`}
                onClick={(e) => {
                  if ((e.target as HTMLElement).tagName === 'INPUT') return;
                  handleTapScore('p2', 0);
                }}
              >
                <div className="min-w-0 flex-1">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <p className={`text-sm font-black leading-tight truncate ${servingTeam === 'p2' && !servingPartner ? 'bg-[#bef264] text-[#1a1a1a] px-1 rounded' : t2Style.text}`}>
                        {team2FirstName}
                      </p>
                      {servingTeam === 'p2' && !servingPartner && <span className="w-5 h-5 rounded-full bg-white text-sky-600 flex items-center justify-center shrink-0" title="Sacador atual"><CircleDot size={12} /></span>}
                    </div>
                    {team2SecondName && <div className="my-1 h-px w-full bg-white/80" />}
                    {team2SecondName && (
                      <div className="flex items-center gap-1">
                        <p className={`text-sm font-black leading-tight truncate ${servingTeam === 'p2' && servingPartner ? 'bg-[#bef264] text-[#1a1a1a] px-1 rounded' : t2Style.text}`}>
                          {team2SecondName}
                        </p>
                        {servingTeam === 'p2' && servingPartner && <span className="w-5 h-5 rounded-full bg-white text-sky-600 flex items-center justify-center shrink-0" title="Sacador atual"><CircleDot size={12} /></span>}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {team2Code && <p className={`text-xs font-bold ${t2Style.subText}`}>[{team2Code}]</p>}
                    {team2P2Name && <button type="button" disabled={isReadOnly} onClick={(e) => { e.stopPropagation(); toggleServeOrder('p2'); }} className="w-6 h-6 rounded-full bg-white text-slate-700 shadow-sm flex items-center justify-center disabled:opacity-40" title="Trocar a ordem de saque dos parceiros"><ArrowRightLeft size={12} /></button>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={2}
                    disabled={isReadOnly}
                    readOnly={isReadOnly}
                    value={scores[0]?.p2 !== null && scores[0]?.p2 !== undefined ? scores[0].p2 : ''}
                    onChange={(e) => handleScoreInput(0, 'p2', e.target.value)}
                    onBlur={onScoreBlur}
                    onClick={(e) => e.stopPropagation()}
                    className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center text-center font-black text-sm outline-none transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                      !scores[0]?.inProgress && scores[0]?.p1 !== null && scores[0]?.p1 !== undefined && scores[0]?.p2 !== null && scores[0]?.p2 !== undefined && isSetWonByScore(Number(scores[0].p1), Number(scores[0].p2)) && Number(scores[0].p2) > Number(scores[0].p1)
                        ? t2Style.wonInput
                        : t2Style.input
                    }`}
                  />
                  {(sportId === 'tennis' || sportId === 'beach-tennis') && (
                    <button type="button" disabled={!canIncrementScore} onClick={(e) => { e.stopPropagation(); handleTapGame('p2', 0); }}
                      className={`w-11 h-11 sm:w-12 sm:h-12 shrink-0 rounded-lg font-black text-sm ${t2Style.input}  disabled:opacity-50`}
                      style={{ borderColor: '#ffd400', borderWidth: 3 }}
                      title="Adicionar ponto ao game do Time 2">
                      {scores[0]?.gameP2 || '0'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {/* Equipe 1 — clique fora do input incrementa +1 */}
              <div
                className={`${team1MatchOrderClass} rounded-2xl p-3 flex items-center justify-between gap-3 shadow-xs ${t1Style.bar} ${
                  canIncrementScore ? 'cursor-pointer select-none active:brightness-90 transition-all' : ''
                }`}
                onClick={(e) => {
                  if ((e.target as HTMLElement).tagName === 'INPUT') return;
                  handleTapScore('p1');
                }}
              >
                <div className="min-w-0 flex-1">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <p className={`text-sm font-black leading-tight truncate ${servingTeam === 'p1' && !servingPartner ? 'bg-[#bef264] text-[#1a1a1a] px-1 rounded' : t1Style.text}`}>{team1FirstName}</p>
                      {servingTeam === 'p1' && !servingPartner && <span className="w-5 h-5 rounded-full bg-white text-sky-600 flex items-center justify-center shrink-0" title="Sacador atual"><CircleDot size={12} /></span>}
                    </div>
                    {team1SecondName && <div className="my-1 h-px w-full bg-white/80" />}
                    {team1SecondName && (
                      <div className="flex items-center gap-1">
                        <p className={`text-sm font-black leading-tight truncate ${servingTeam === 'p1' && servingPartner ? 'bg-[#bef264] text-[#1a1a1a] px-1 rounded' : t1Style.text}`}>{team1SecondName}</p>
                        {servingTeam === 'p1' && servingPartner && <span className="w-5 h-5 rounded-full bg-white text-sky-600 flex items-center justify-center shrink-0" title="Sacador atual"><CircleDot size={12} /></span>}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {team1Code && <p className={`text-xs font-bold ${t1Style.subText}`}>[{team1Code}]</p>}
                    {team1P2Name && <button type="button" disabled={isReadOnly} onClick={(e) => { e.stopPropagation(); toggleServeOrder('p1'); }} className="w-6 h-6 rounded-full bg-white text-slate-700 shadow-sm flex items-center justify-center disabled:opacity-40" title="Trocar a ordem de saque dos parceiros"><ArrowRightLeft size={12} /></button>}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`w-5 text-center text-sm font-black ${t1Style.text}`}>{setsWon1}</span>
                  {scores.map((setScore, setIdx) => {
                    const isSetWon =
                      !setScore.inProgress &&
                      setScore.p1 !== null &&
                      setScore.p1 !== undefined &&
                      setScore.p2 !== null &&
                      setScore.p2 !== undefined &&
                      isSetWonByScore(Number(setScore.p1), Number(setScore.p2)) &&
                      Number(setScore.p1) > Number(setScore.p2);

                    return (
                      <input
                        key={`p1_set_${setIdx}`}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={2}
                        disabled={isReadOnly}
                        readOnly={isReadOnly}
                        value={setScore.p1 !== null && setScore.p1 !== undefined ? setScore.p1 : ''}
                        onChange={(e) => handleScoreInput(setIdx, 'p1', e.target.value)}
                        onBlur={() => onScoreBlur(activeMatch?.id)}
                        onClick={(e) => e.stopPropagation()}
                        className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center text-center font-black text-sm outline-none transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                          isSetWon ? t1Style.wonInput : t1Style.input
                        }`}
                      />
                    );
                  })}
                  {(sportId === 'tennis' || sportId === 'beach-tennis') && (
                    <button type="button" disabled={!canIncrementScore} onClick={(e) => { e.stopPropagation(); handleTapGame('p1', getActiveSetIdx()); }}
                      className={`w-11 h-11 sm:w-12 sm:h-12 shrink-0 rounded-lg font-black text-sm ${t1Style.input}  disabled:opacity-50`}
                      style={{ borderColor: '#ffd400', borderWidth: 3 }}
                      title="Adicionar ponto ao game atual do Time 1">
                      {scores[getActiveSetIdx()]?.gameP1 || '0'}
                    </button>
                  )}
                </div>
              </div>

              {/* Labels dos sets + botão undo */}
              <div className="order-2 flex items-center gap-1 px-1 py-0.5">
                <div className="flex flex-1 min-w-0 items-center justify-start gap-1">
                <div className="flex items-center gap-1">
                  {(sportId === 'tennis' || sportId === 'beach-tennis') && (
                    <button type="button" onClick={resetCurrentMatch} disabled={isReadOnly}
                      className="min-w-[64px] h-9 px-1.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-600 flex items-center justify-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Zerar partida">
                      <RefreshCw size={13} />
                      <span className="text-[9px] leading-tight font-black">0 x 0</span>
                    </button>
                  )}
                  {(sportId === 'tennis' || sportId === 'beach-tennis') && activeMatch.servingOrderOffset === undefined && canDrawStartingServer && (
                    <button type="button" onClick={drawStartingServer} disabled={isDrawingServer}
                      className="min-w-[110px] h-9 px-1.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-white shadow-sm flex items-center justify-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Sortear qual time inicia sacando">
                      {isDrawingServer ? <Loader2 size={14} className="animate-spin shrink-0" /> : <Dices size={14} className="text-yellow-300 shrink-0" />}
                      <span className="text-[9px] leading-tight font-black text-center">{isDrawingServer ? `Time ${(drawPreview ?? 0) + 1} inicia sacando` : <>Sortear<br />sacador</>}</span>
                    </button>
                  )}
                </div>
                {canTapScore && hasAnyScoreActivity ? (
                  <button
                    type="button"
                    onClick={handleUndo}
                    disabled={!canUndo}
                    className={`h-8 px-1.5 rounded-xl border flex items-center justify-center gap-1 transition-all active:scale-90 ${
                      canUndo
                        ? 'bg-amber-50 border border-amber-300 text-amber-600 hover:bg-amber-100 hover:border-amber-400 hover:text-amber-700 shadow-sm cursor-pointer'
                        : 'bg-slate-50 border border-slate-200 text-slate-300 cursor-not-allowed'
                    }`}
                    title={canUndo ? 'Voltar' : 'Nenhum ponto para desfazer'}
                  >
                    <RotateCcw size={14} />
                    <span className="text-[9px] font-black">Voltar</span>
                  </button>
                ) : null}
                <ScoreStopwatch startedAt={activeMatch.scoreStartedAt} finishedAt={activeMatch.scoreFinishedAt} />
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="w-5" />
                  <ScoreSyncIndicator status={saveStatus} />
                  {scores.map((_, setIdx) => (
                    <div
                      key={`label_set_${setIdx}`}
                      className="w-9 sm:w-10 flex flex-col items-center justify-center"
                    >
                      {tieBreakSetFlags[setIdx] && (
                        <span className="text-[9px] font-black text-amber-600 animate-pulse leading-none mb-0.5">TB</span>
                      )}
                      <span className="text-[10px] sm:text-xs font-bold text-slate-400">
                        set{setIdx + 1}
                      </span>
                    </div>
                  ))}
                  {(sportId === 'tennis' || sportId === 'beach-tennis') && (
                    <span className="w-11 sm:w-12 text-center text-[10px] sm:text-xs font-bold text-[#b7ff3c]">game</span>
                  )}
                </div>
              </div>

              {/* Equipe 2 — clique fora do input incrementa +1 */}
              <div
                className={`${team2MatchOrderClass} rounded-2xl p-3 flex items-center justify-between gap-3 shadow-xs ${t2Style.bar} ${
                  canIncrementScore ? 'cursor-pointer select-none active:brightness-90 transition-all' : ''
                }`}
                onClick={(e) => {
                  if ((e.target as HTMLElement).tagName === 'INPUT') return;
                  handleTapScore('p2');
                }}
              >
                <div className="min-w-0 flex-1">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <p className={`text-sm font-black leading-tight truncate ${servingTeam === 'p2' && !servingPartner ? 'bg-[#bef264] text-[#1a1a1a] px-1 rounded' : t2Style.text}`}>{team2FirstName}</p>
                      {servingTeam === 'p2' && !servingPartner && <span className="w-5 h-5 rounded-full bg-white text-sky-600 flex items-center justify-center shrink-0" title="Sacador atual"><CircleDot size={12} /></span>}
                    </div>
                    {team2SecondName && <div className="my-1 h-px w-full bg-white/80" />}
                    {team2SecondName && (
                      <div className="flex items-center gap-1">
                        <p className={`text-sm font-black leading-tight truncate ${servingTeam === 'p2' && servingPartner ? 'bg-[#bef264] text-[#1a1a1a] px-1 rounded' : t2Style.text}`}>{team2SecondName}</p>
                        {servingTeam === 'p2' && servingPartner && <span className="w-5 h-5 rounded-full bg-white text-sky-600 flex items-center justify-center shrink-0" title="Sacador atual"><CircleDot size={12} /></span>}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {team2Code && <p className={`text-xs font-bold ${t2Style.subText}`}>[{team2Code}]</p>}
                    {team2P2Name && <button type="button" disabled={isReadOnly} onClick={(e) => { e.stopPropagation(); toggleServeOrder('p2'); }} className="w-6 h-6 rounded-full bg-white text-slate-700 shadow-sm flex items-center justify-center disabled:opacity-40" title="Trocar a ordem de saque dos parceiros"><ArrowRightLeft size={12} /></button>}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`w-5 text-center text-sm font-black ${t2Style.text}`}>{setsWon2}</span>
                  {scores.map((setScore, setIdx) => {
                    const isSetWon =
                      !setScore.inProgress &&
                      setScore.p1 !== null &&
                      setScore.p1 !== undefined &&
                      setScore.p2 !== null &&
                      setScore.p2 !== undefined &&
                      isSetWonByScore(Number(setScore.p1), Number(setScore.p2)) &&
                      Number(setScore.p2) > Number(setScore.p1);

                    return (
                      <input
                        key={`p2_set_${setIdx}`}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={2}
                        disabled={isReadOnly}
                        readOnly={isReadOnly}
                        value={setScore.p2 !== null && setScore.p2 !== undefined ? setScore.p2 : ''}
                        onChange={(e) => handleScoreInput(setIdx, 'p2', e.target.value)}
                        onBlur={onScoreBlur}
                        onClick={(e) => e.stopPropagation()}
                        className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center text-center font-black text-sm outline-none transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                          isSetWon ? t2Style.wonInput : t2Style.input
                        }`}
                      />
                    );
                  })}
                  {(sportId === 'tennis' || sportId === 'beach-tennis') && (
                    <button type="button" disabled={!canIncrementScore} onClick={(e) => { e.stopPropagation(); handleTapGame('p2', getActiveSetIdx()); }}
                      className={`w-11 h-11 sm:w-12 sm:h-12 shrink-0 rounded-lg font-black text-sm ${t2Style.input}  disabled:opacity-50`}
                      style={{ borderColor: '#ffd400', borderWidth: 3 }}
                      title="Adicionar ponto ao game atual do Time 2">
                      {scores[getActiveSetIdx()]?.gameP2 || '0'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
          )}

          {courtStage === 'match' && <>
          {/* Data da Partida e Finalização */}
          <div className="pt-2 border-t border-amber-100 space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-[11px] font-black text-slate-500 shrink-0 flex items-center gap-1">
                <Calendar size={13} className="text-sky-600" /> Data da partida:
              </label>
              <input
                type="date"
                value={activeMatch.matchDate || ''}
                disabled={isReadOnly}
                onClick={(e) => {
                  try { (e.target as any).showPicker?.(); } catch {}
                }}
                onChange={(e) => onMatchDateChange(activeMatch.id, e.target.value)}
                className="flex-1 h-9 text-xs font-bold bg-slate-50 border-2 border-slate-200 focus:border-sky-500 focus:bg-white rounded-xl outline-none px-3 text-slate-700 cursor-pointer disabled:opacity-40"
              />
            </div>
            <button
              type="button"
              disabled={isReadOnly || !hasWinnerDefined}
              onClick={() => onFinishCourtMatch(activeMatch.id)}
              className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-2xl text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95 transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none"
              title={
                hasWinnerDefined
                  ? 'Registrar placar final e liberar a quadra'
                  : 'Defina um vencedor no placar para poder finalizar a partida'
              }
            >
              <Check size={14} />
              Finalizar partida
            </button>
          </div>
          </>}
        </div>
      )}

      {isFree && (
        <p className="text-xs font-bold text-slate-400 whitespace-nowrap truncate">
          Aguardando chamada de jogos · quadra pronta para receber a próxima partida.
        </p>
      )}

      {isInterdicted && (
        <p className="text-xs font-black text-red-700 whitespace-nowrap truncate">
          Quadra interditada para manutenção ou indisponível para jogos.
        </p>
      )}
    </div>
  );
};
