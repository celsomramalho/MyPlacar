import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Trophy, Clock, Trash2, Calendar, Check, Wifi, Play, MapPin, RotateCcw, ArrowRightLeft, CircleDot, Dices, Loader2, RefreshCw, Watch } from 'lucide-react';
import type { TournamentEvent, TournamentMatch, TournamentPair } from '../../types';
import { getPhaseLabel, parseMatchSets, isSetScoreComplete } from '../../domain/brackets';
import { resolveCourtMinutes, resolveMatchRules } from '../../domain/rules/eventMatchRules';
import { formatWaitDuration } from '../../domain/queue/utils/formatWaitDuration';
import { COURT_COLOR_PAIRS, COURT_TEAM_STYLES, getCourtColors } from '../../../../constants';

type LegacyScoreChangeHandler = (matchId: string, player: 'p1' | 'p2', value: string) => void;
type SetScoreChangeHandler = (
  matchId: string,
  setIndex: number,
  player: 'p1' | 'p2',
  value: string
) => void;

export interface MatchCardProps {
  match: TournamentMatch;
  pairsById?: Map<string, TournamentPair> | Record<string, TournamentPair>;
  variant?: 'compact' | 'detailed';
  colorIndex?: number;
  isRanking?: boolean;
  totalSets?: number;
  gamesPerSet?: number;
  isTotalGamesSet?: boolean;
  tieBreak?: boolean;
  tieBreakAt?: string;
  liveScore?: { p1Score: number | string; p2Score: number | string };
  queuePosition?: number;
  estimatedWaitMinutes?: number;
  scoreSaveStatus?: 'saved' | 'saving' | 'error';

  canSubmitScore?: boolean;
  canManage?: boolean;
  isReadOnly?: boolean;
  allCategoryFinished?: boolean;
  onScoreChange?: LegacyScoreChangeHandler | SetScoreChangeHandler;
  /**
   * Chamado pelo undo do tap-to-score com p1 e p2 do set juntos,
   * de forma atômica (evita race condition de dois onScoreChange sequenciais).
   */
  onUndoScore?: (matchId: string, setIndex: number, p1Val: string, p2Val: string, gameP1?: string, gameP2?: string, servingOrderOffset?: number | null) => void;
  sportId?: string;
  sportRules?: TournamentEvent['sportRules'];
  onServeSettingsChange?: (matchId: string, settings: Partial<Pick<TournamentMatch, 'servingOrderOffset' | 'serveOrderP1Reversed' | 'serveOrderP2Reversed'>>) => void;
  onResetMatch?: (matchId: string) => void | Promise<void>;
  onScoreBlur?: () => void;
  onMatchDateChange?: (matchId: string, date: string) => void;
  onFinishMatch?: (matchId: string) => void;
  onReopenMatch?: (matchId: string) => void;
  onDeleteMatch?: (matchId: string) => void;
  onStartLiveMatch?: (match: TournamentMatch, pair1: TournamentPair, pair2: TournamentPair) => void;
  onOpenWatchMode?: () => void;
}

const MatchCourtTimer: React.FC<{ startedAt?: string; averageMinutes?: number }> = ({ startedAt, averageMinutes }) => {
  const [elapsed, setElapsed] = useState(() => startedAt ? Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)) : 0);
  useEffect(() => {
    if (!startedAt) return;
    const tick = () => {
      const start = new Date(startedAt).getTime();
      setElapsed(Math.max(0, Number.isFinite(start) ? Math.floor((Date.now() - start) / 1000) : 0));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);
  const totalMinutes = Math.floor(elapsed / 60);
  const overtime = averageMinutes !== undefined && totalMinutes >= averageMinutes;
  const time = [Math.floor(elapsed / 3600), Math.floor((elapsed % 3600) / 60), elapsed % 60]
    .map((part) => String(part).padStart(2, '0')).join(':');
  return <span title="Tempo total de ocupação da quadra" className={'inline-flex items-center justify-center gap-1 rounded-lg border px-2 py-1 font-mono text-[10px] font-black tabular-nums whitespace-nowrap ' + (overtime ? 'border-rose-300 bg-rose-100 text-rose-800' : 'border-amber-300 bg-amber-100 text-amber-900')}><Clock size={11} />{time}{averageMinutes !== undefined && <span className="font-sans text-[9px] opacity-75">(~{averageMinutes}m)</span>}</span>;
};

const MatchQueueForecast: React.FC<{ minutes?: number }> = ({ minutes }) => {
  if (minutes === undefined) return <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-500 whitespace-nowrap"><Clock size={11} />Previsão indisponível</span>;
  if (minutes === 0) return <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-100 px-2 py-1 text-[10px] font-black text-emerald-800 whitespace-nowrap"><Play size={10} fill="currentColor" />Chamada imediata</span>;
  return <span title={'Previsão de chamada em aproximadamente ' + minutes + ' minutos'} className="inline-flex items-center gap-1 rounded-lg border border-sky-300 bg-sky-100 px-2 py-1 text-[10px] font-black text-sky-800 whitespace-nowrap"><Clock size={11} />Previsão: em ~{minutes} min (~{formatWaitDuration(minutes)})</span>;
};

const syncBorderClass = (status: 'saved' | 'saving' | 'error') => status === 'saving'
  ? 'border-4 border-blue-600 animate-pulse'
  : status === 'error'
    ? 'border-4 border-red-600'
    : 'border-4 border-emerald-600';

const syncStatusLabel = (status: 'saved' | 'saving' | 'error') => status === 'saving'
  ? 'Salvando no Firebase'
  : status === 'error'
    ? 'Falha ao salvar no Firebase'
    : 'Salvo no Firebase';

export const MatchCard: React.FC<MatchCardProps> = ({
  match,
  pairsById,
  variant = 'detailed',
  colorIndex,
  isRanking = false,
  totalSets = 1,
  gamesPerSet = 6,
  isTotalGamesSet = false,
  tieBreak = false,
  tieBreakAt = '6-6',
  liveScore,
  queuePosition = 0,
  estimatedWaitMinutes,
  scoreSaveStatus = 'saved',
  canSubmitScore = false,
  canManage = false,
  isReadOnly = false,
  allCategoryFinished = false,
  onScoreChange,
  onUndoScore,
  sportId,
  sportRules,
  onServeSettingsChange,
  onResetMatch,
  onScoreBlur,
  onMatchDateChange,
  onFinishMatch,
  onReopenMatch,
  onDeleteMatch,
  onStartLiveMatch,
  onOpenWatchMode,
}) => {
  const getPair = (pairId?: string, embedded?: TournamentPair): TournamentPair | undefined => {
    if (embedded) return embedded;
    if (!pairId || !pairsById) return undefined;
    if (pairsById instanceof Map) return pairsById.get(pairId);
    return pairsById[pairId];
  };

  const pair1 = getPair(match.pair1Id, match.pair1);
  const pair2 = getPair(match.pair2Id, match.pair2);

  const team1P1Name = pair1 ? pair1.p1.nickname || pair1.p1.name : '';
  const team1P2Name = pair1?.p2 ? pair1.p2.nickname || pair1.p2.name : '';
  const team1Name = pair1
    ? (team1P2Name ? `${team1P1Name} & ${team1P2Name}` : team1P1Name)
    : match.pair1Label || 'A definir';
  const team1Code = pair1?.teamCode || (pair1?.teamNumber ? `Time ${pair1.teamNumber}` : '');

  const team2P1Name = pair2 ? pair2.p1.nickname || pair2.p1.name : '';
  const team2P2Name = pair2?.p2 ? pair2.p2.nickname || pair2.p2.name : '';
  const team2Name = pair2
    ? (team2P2Name ? `${team2P1Name} & ${team2P2Name}` : team2P1Name)
    : match.pair2Label || 'A definir';
  const team2Code = pair2?.teamCode || (pair2?.teamNumber ? `Time ${pair2.teamNumber}` : '');

  const isFinished = match.status === 'finished';
  const isLive = match.status === 'live';
  const isWaiting = match.status === 'waiting';

  const code = match.matchCode || String(match.matchNumber || 1).padStart(2, '0');
  const rawPhase = match.phase ? getPhaseLabel(match.phase) || match.phase : '';
  const phaseStr = isRanking ? 'Ranking' : rawPhase;

  const statusLabel = isLive ? 'Ao vivo' : isFinished ? 'Finalizado' : 'Aguardando';
  const statusColor = isLive
    ? 'bg-red-50 text-red-600 border-red-100 animate-pulse'
    : isFinished
    ? 'bg-blue-50 text-blue-700 border-blue-200'
    : 'bg-slate-100 text-slate-500 border-slate-200';

  const isInQueue = isWaiting && queuePosition > 0;

  // Badges de final e 3º lugar
  let p1FinalBadge: string | null = null;
  let p2FinalBadge: string | null = null;
  if (allCategoryFinished && isFinished && match.winnerPairId) {
    if (match.phase === 'final') {
      p1FinalBadge = match.winnerPairId === match.pair1Id ? '🏆 Campeão' : '🥈 Vice-campeão';
      p2FinalBadge = match.winnerPairId === match.pair2Id ? '🏆 Campeão' : '🥈 Vice-campeão';
    } else if (match.phase === '3lugar') {
      p1FinalBadge = match.winnerPairId === match.pair1Id ? '🥉 3º lugar' : '4º lugar';
      p2FinalBadge = match.winnerPairId === match.pair2Id ? '🥉 3º lugar' : '4º lugar';
    }
  }

  // Cores dos times:
  // Se a partida foi para a quadra no gerenciar filas (match.court definido) -> usa as cores da quadra
  // Se não foi para a quadra -> intercala os pares de cores de COURT_COLOR_PAIRS
  const courtColors = match.court
    ? getCourtColors(match.court)
    : COURT_COLOR_PAIRS[
        (colorIndex !== undefined
          ? Math.abs(colorIndex)
          : match.matchNumber
          ? Math.max(0, match.matchNumber - 1)
          : 0) % COURT_COLOR_PAIRS.length
      ];

  const t1Style = COURT_TEAM_STYLES[courtColors.p1Color] || COURT_TEAM_STYLES.azul;
  const t2Style = COURT_TEAM_STYLES[courtColors.p2Color] || COURT_TEAM_STYLES.vermelho;

  // Dados de Sets e Pontuações
  const completionRules = { isTotalGamesSet, tieBreak, tieBreakAt };
  const { scores, setsWon1, setsWon2 } = parseMatchSets(match, totalSets, gamesPerSet, completionRules);
  const isSetWonByScore = (p1: number, p2: number) => isSetScoreComplete(p1, p2, gamesPerSet, completionRules);

  // ── Tap-to-score e Undo com histórico fiel de ambos os times ──────────────
  // Guarda a pilha de estados anteriores: { setIdx, p1, p2 }
  const scoreHistoryRef = useRef<Array<{ setIdx: number; p1: string; p2: string; gameP1: string; gameP2: string; servingOrderOffset?: number | null }>>([]);
  const [hasUndoSteps, setHasUndoSteps] = useState(false);
  const [isDrawingServer, setIsDrawingServer] = useState(false);
  const [drawPreview, setDrawPreview] = useState<0 | 1 | null>(null);
  const drawTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const drawFinalizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestServingOffsetRef = useRef<number | null>(match.servingOrderOffset ?? null);
  const isTennisOrBeach = sportId === 'tennis' || sportId === 'beach-tennis';
  const servingOffset = match.servingOrderOffset;
  const servingTeam = servingOffset === undefined ? null : servingOffset % 2 === 0 ? 'p1' : 'p2';
  const servingPartner = servingOffset !== undefined && servingOffset >= 2;
  const team1FirstName = match.serveOrderP1Reversed ? team1P2Name || team1P1Name || team1Name : team1P1Name || team1Name;
  const team1SecondName = match.serveOrderP1Reversed ? team1P1Name : team1P2Name;
  const team2FirstName = match.serveOrderP2Reversed ? team2P2Name || team2P1Name || team2Name : team2P1Name || team2Name;
  const team2SecondName = match.serveOrderP2Reversed ? team2P1Name : team2P2Name;

  useEffect(() => () => {
    if (drawTimerRef.current) clearInterval(drawTimerRef.current);
    if (drawFinalizeTimerRef.current) clearTimeout(drawFinalizeTimerRef.current);
  }, []);

  useEffect(() => {
    latestServingOffsetRef.current = match.servingOrderOffset ?? null;
  }, [match.id, match.servingOrderOffset]);

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

  const canTapScore = canSubmitScore && !isFinished && (!!onUndoScore || !!onScoreChange);
  const hasAnyScoreActivity = scores.some((score) => Number(score.p1 || 0) > 0 || Number(score.p2 || 0) > 0 || (score.gameP1 && score.gameP1 !== '0') || (score.gameP2 && score.gameP2 !== '0'));
  const canDrawStartingServer = canTapScore && isTennisOrBeach && !hasAnyScoreActivity;

  const resetCurrentMatch = () => {
    if (!onResetMatch || !canTapScore || isReadOnly) return;
    if (!window.confirm('Deseja zerar a partida? Esta ação não pode ser desfeita.')) return;
    scoreHistoryRef.current = [];
    latestScoresRef.current = {};
    latestServingOffsetRef.current = null;
    setHasUndoSteps(false);
    void onResetMatch(match.id);
  };

  const drawStartingServer = () => {
    if (!onServeSettingsChange || !canDrawStartingServer || isDrawingServer) return;
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
          latestServingOffsetRef.current = finalOffset;
          onServeSettingsChange(match.id, { servingOrderOffset: finalOffset });
        }, 260);
      }
    }, 220);
  };

  const toggleServeOrder = (team: 'p1' | 'p2') => {
    if (!onServeSettingsChange) return;
    const field = team === 'p1' ? 'serveOrderP1Reversed' : 'serveOrderP2Reversed';
    onServeSettingsChange(match.id, { [field]: !match[field] });
  };

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

  // Botões de incremento só habilitados se canTapScore e ainda NÃO houver vencedor
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
    (setIdx: number, p1Val: string, p2Val: string, gameP1 = '0', gameP2 = '0', servingOrderOffset: number | null | undefined = latestServingOffsetRef.current) => {
      latestScoresRef.current[setIdx] = { p1: p1Val, p2: p2Val, gameP1, gameP2 };
      latestServingOffsetRef.current = servingOrderOffset ?? null;

      if (onUndoScore) {
        onUndoScore(match.id, setIdx, p1Val, p2Val, gameP1, gameP2, servingOrderOffset);
      } else if (onScoreChange) {
        if (onScoreChange.length <= 3) {
          (onScoreChange as LegacyScoreChangeHandler)(match.id, 'p1', p1Val);
          (onScoreChange as LegacyScoreChangeHandler)(match.id, 'p2', p2Val);
        } else {
          (onScoreChange as SetScoreChangeHandler)(match.id, setIdx, 'p1', p1Val);
          (onScoreChange as SetScoreChangeHandler)(match.id, setIdx, 'p2', p2Val);
        }
      }
    },
    [match.id, match.servingOrderOffset, onUndoScore, onScoreChange]
  );

  const handleTapGame = useCallback((player: 'p1' | 'p2', setIdx: number) => {
    if (!canIncrementScore || !isTennisOrBeach) return;
    const score = scores[setIdx];
    if (!score) return;
    const latest = latestScoresRef.current[setIdx];
    const oldP1 = latest?.p1 ?? String(score.p1 ?? '');
    const oldP2 = latest?.p2 ?? String(score.p2 ?? '');
    const oldGameP1 = latest?.gameP1 || score.gameP1 || '0';
    const oldGameP2 = latest?.gameP2 || score.gameP2 || '0';
    const previousServingOffset = latestServingOffsetRef.current;
    const servingOrderOffset = previousServingOffset ?? 0;
    scoreHistoryRef.current = [...scoreHistoryRef.current, { setIdx, p1: oldP1, p2: oldP2, gameP1: oldGameP1, gameP2: oldGameP2, servingOrderOffset: previousServingOffset }];
    setHasUndoSteps(true);

    const rules = resolveMatchRules(sportRules, match.phase, totalSets as 1 | 3 | 5, gamesPerSet, sportId);
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
      if (!wonGame && (a + b) % 2 === 1) nextServingOrderOffset = (nextServingOrderOffset + 1) % (pair1?.p2 || pair2?.p2 ? 4 : 2);
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
      if (!inTieBreak) nextServingOrderOffset = (nextServingOrderOffset + 1) % (pair1?.p2 || pair2?.p2 ? 4 : 2);
      if (isSetScoreComplete(n1, n2, rules.gamesPerSet, { isTotalGamesSet, tieBreak: rules.tieBreak, tieBreakAt: rules.tieBreakAt })) { g1 = '0'; g2 = '0'; }
    }
    applySetScore(setIdx, nextP1, nextP2, g1, g2, nextServingOrderOffset);
  }, [canIncrementScore, isTennisOrBeach, scores, match, sportRules, totalSets, gamesPerSet, sportId, isTotalGamesSet, pair1, pair2, applySetScore]);

  const handleTapScore = useCallback(
    (player: 'p1' | 'p2', setIdxOverride?: number) => {
      if (!canIncrementScore) return;
      const setIdx = setIdxOverride !== undefined ? setIdxOverride : getActiveSetIdx();

      const existing = latestScoresRef.current[setIdx] || {
        p1: scores[setIdx]?.p1 !== null && scores[setIdx]?.p1 !== undefined ? String(scores[setIdx].p1) : '',
        p2: scores[setIdx]?.p2 !== null && scores[setIdx]?.p2 !== undefined ? String(scores[setIdx].p2) : '',
      };
      const curP1 = existing.p1;
      const curP2 = existing.p2;

      // Salva o snapshot EXATO do placar de ambos os times ANTES do ponto
      scoreHistoryRef.current = [
        ...scoreHistoryRef.current,
        { setIdx, p1: curP1, p2: curP2, gameP1: existing.gameP1 || scores[setIdx]?.gameP1 || '0', gameP2: existing.gameP2 || scores[setIdx]?.gameP2 || '0', servingOrderOffset: latestServingOffsetRef.current },
      ];
      setHasUndoSteps(true);

      const nextP1 = player === 'p1' ? String(Number(curP1 || 0) + 1) : (curP1 || '0');
      const nextP2 = player === 'p2' ? String(Number(curP2 || 0) + 1) : (curP2 || '0');
      const nextServingOrderOffset = ((latestServingOffsetRef.current ?? 0) + 1) % (pair1?.p2 || pair2?.p2 ? 4 : 2);

      applySetScore(setIdx, nextP1, nextP2, '0', '0', nextServingOrderOffset);
    },
    [canIncrementScore, getActiveSetIdx, scores, pair1, pair2, applySetScore]
  );

  const handleUndo = useCallback(() => {
    if (!canTapScore) return;

    // Se temos passos gravados no histórico, restaura o último passo
    if (scoreHistoryRef.current.length > 0) {
      const prev = scoreHistoryRef.current[scoreHistoryRef.current.length - 1];
      scoreHistoryRef.current = scoreHistoryRef.current.slice(0, -1);
      setHasUndoSteps(scoreHistoryRef.current.length > 0);
      applySetScore(prev.setIdx, prev.p1, prev.p2, prev.gameP1, prev.gameP2, prev.servingOrderOffset);
      return;
    }

    // Se o histórico local esvaziou (ou a página já abriu com pontos),
    // permite decrementar até zerar ("voltar ao placar anterior até zerar")
    const activeSetIdx = getActiveSetIdx();
    const cur = latestScoresRef.current[activeSetIdx] || {
      p1: scores[activeSetIdx]?.p1 !== null && scores[activeSetIdx]?.p1 !== undefined ? String(scores[activeSetIdx].p1) : '',
      p2: scores[activeSetIdx]?.p2 !== null && scores[activeSetIdx]?.p2 !== undefined ? String(scores[activeSetIdx].p2) : '',
      gameP1: scores[activeSetIdx]?.gameP1 || '0',
      gameP2: scores[activeSetIdx]?.gameP2 || '0',
    };
    const previousGamePoint = (value: string) => value === 'Ad' ? '40' : value === '40' ? '30' : value === '30' ? '15' : value === '15' ? '0' : '0';
    if ((cur.gameP1 && cur.gameP1 !== '0') || (cur.gameP2 && cur.gameP2 !== '0')) {
      applySetScore(activeSetIdx, cur.p1, cur.p2, previousGamePoint(cur.gameP1 || '0'), previousGamePoint(cur.gameP2 || '0'));
      return;
    }
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
      applySetScore(activeSetIdx, nextP1, nextP2);
    }
  }, [canTapScore, getActiveSetIdx, scores, applySetScore]);

  const handleScoreInput = (setIdx: number, player: 'p1' | 'p2', val: string) => {
    if (!onScoreChange && !onUndoScore) return;

    // Registra no histórico para permitir desfazer digitação direta também
    const existing = latestScoresRef.current[setIdx] || {
      p1: scores[setIdx]?.p1 !== null && scores[setIdx]?.p1 !== undefined ? String(scores[setIdx].p1) : '0',
      p2: scores[setIdx]?.p2 !== null && scores[setIdx]?.p2 !== undefined ? String(scores[setIdx].p2) : '0',
    };
    scoreHistoryRef.current = [
      ...scoreHistoryRef.current,
      { setIdx, p1: existing.p1, p2: existing.p2, gameP1: scores[setIdx]?.gameP1 || '0', gameP2: scores[setIdx]?.gameP2 || '0', servingOrderOffset: latestServingOffsetRef.current },
    ];
    setHasUndoSteps(true);

    const nextP1 = player === 'p1' ? val : existing.p1;
    const nextP2 = player === 'p2' ? val : existing.p2;
    applySetScore(setIdx, nextP1, nextP2);
  };

  const isAnyScorePositive = scores.some(
    (s) => (s.p1 !== null && Number(s.p1) > 0) || (s.p2 !== null && Number(s.p2) > 0) || (s.gameP1 && s.gameP1 !== '0') || (s.gameP2 && s.gameP2 !== '0')
  );
  // Botão Undo permanece habilitado mesmo com vencedor (para permitir corrigir/voltar placar)
  const canUndo = canTapScore && (hasUndoSteps || isAnyScorePositive);

  // Detecta se algum set ativo está em tie-break
  // tieBreakAt é uma string no formato "X-Y" (ex: "6-6")
  const tieBreakSetFlags = useMemo(() => {
    if (!tieBreak || !isLive) return scores.map(() => false);
    const [tbP1Str, tbP2Str] = tieBreakAt.split('-');
    const tbP1 = Number(tbP1Str ?? 6);
    const tbP2 = Number(tbP2Str ?? 6);
    return scores.map((s) => {
      if (s.p1 === null || s.p1 === undefined || s.p2 === null || s.p2 === undefined) return false;
      const n1 = Number(s.p1);
      const n2 = Number(s.p2);
      // Está em TB se ambos atingiram o threshold e o set ainda não foi finalizado
      if (isSetWonByScore(n1, n2)) return false;
      return n1 >= tbP1 && n2 >= tbP2;
    });
  }, [tieBreak, tieBreakAt, isLive, scores, isSetWonByScore]);

  const isSet1WonByP1 =
    scores[0]?.p1 !== null &&
    scores[0]?.p1 !== undefined &&
    scores[0]?.p2 !== null &&
    scores[0]?.p2 !== undefined &&
    (isSetWonByScore(Number(scores[0].p1), Number(scores[0].p2)) && Number(scores[0].p1) > Number(scores[0].p2) ||
      (isFinished && match.winnerPairId === match.pair1Id));

  const isSet1WonByP2 =
    scores[0]?.p1 !== null &&
    scores[0]?.p1 !== undefined &&
    scores[0]?.p2 !== null &&
    scores[0]?.p2 !== undefined &&
    (isSetWonByScore(Number(scores[0].p1), Number(scores[0].p2)) && Number(scores[0].p2) > Number(scores[0].p1) ||
      (isFinished && match.winnerPairId === match.pair2Id));

  // Metadados de Início e Duração
  const startDate = match.startedAt ? new Date(match.startedAt) : undefined;
  const validStartDate = startDate && !isNaN(startDate.getTime()) ? startDate : undefined;
  const startFormatted = validStartDate
    ? `${validStartDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${validStartDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : null;

  let durationMinutes = match.durationMinutes;
  if (durationMinutes === undefined && match.startedAt && match.finishedAt) {
    const s = new Date(match.startedAt).getTime();
    const f = new Date(match.finishedAt).getTime();
    if (!isNaN(s) && !isNaN(f) && f > s) {
      durationMinutes = Math.max(1, Math.round((f - s) / 60000));
    }
  }
  const durationFormatted = durationMinutes !== undefined ? `${durationMinutes} min` : null;

  // ==========================================
  // RENDERIZAÇÃO 1: VARIANTE COMPACTA (IMAGEM 1)
  // Usada no lado do usuário para torneios regulares
  // ==========================================
  if (variant === 'compact') {
    return (
      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm hover:border-slate-200 transition-all">
        {/* Header do Card */}
        <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-100">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-black text-slate-800 tracking-tight">
              [{code}] {phaseStr ? `[${phaseStr}]` : ''}
            </p>
            {match.court && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black bg-slate-100 text-slate-700 border border-slate-200">
                <MapPin size={10} className="text-slate-500" />
                {match.court}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <span className={`px-2.5 py-1 rounded-xl text-[10px] font-black border ${statusColor}`}>
              {statusLabel}
            </span>
            {isLive && onOpenWatchMode && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onOpenWatchMode(); }}
                className="w-9 h-9 inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white text-emerald-600 hover:bg-emerald-50 active:scale-95 transition-all"
                title="Ver partida no modo relógio"
                aria-label="Ver partida no modo relógio"
              >
                <Watch size={17} />
              </button>
            )}
            {isRanking && isWaiting && canSubmitScore && onStartLiveMatch && pair1 && pair2 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onStartLiveMatch(match, pair1, pair2);
                }}
                className="w-8 h-8 inline-flex items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 active:scale-95 transition-all"
                title="Iniciar partida"
                aria-label="Iniciar partida"
              >
                <Play size={15} className="fill-current" />
              </button>
            )}
            {isInQueue && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[10px] font-black border bg-sky-50 text-sky-700 border-sky-200 whitespace-nowrap">
                <Clock size={10} />
                #{queuePosition} na fila
              </span>
            )}
            {canManage && onDeleteMatch && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteMatch(match.id);
                }}
                className="p-1 text-slate-400 hover:text-red-500 rounded-lg active:scale-90 transition-all cursor-pointer"
                title="Excluir partida"
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
        </div>

        {/* Conteúdo Central: Equipes e Placar Compacto */}
        <div className="flex items-center justify-between gap-3">
          {/* Equipe 1 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${t1Style.bar.split(' ')[0]}`} />
              <p className="text-xs font-black text-slate-800 leading-tight truncate">
                {team1Name}
              </p>
              {isFinished && match.winnerPairId === match.pair1Id && (
                <Trophy size={14} className="text-amber-500 shrink-0" fill="currentColor" />
              )}
              {p1FinalBadge && (
                <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                  {p1FinalBadge}
                </span>
              )}
            </div>
            {team1Code && <p className="text-[10px] font-bold text-slate-400 truncate">{team1Code}</p>}
          </div>

          {/* Placar Central ou 'vs' */}
          <div className="shrink-0 text-center px-1">
            {isLive ? (
              <div className="flex flex-col items-center gap-1">
                {liveScore && <div className="flex items-center gap-1"><Wifi size={14} className="text-red-500 animate-pulse" /><p className="text-lg font-black text-sky-600">{liveScore.p1Score}-{liveScore.p2Score}</p></div>}
                <MatchCourtTimer startedAt={match.courtStartedAt || match.startedAt} averageMinutes={resolveCourtMinutes(sportRules).courtMinutes} />
              </div>
            ) : isFinished ? (
              <span className="bg-slate-900 text-white px-3 py-1 rounded-xl text-xs font-black">
                {match.result || '-'}
              </span>
            ) : (
              estimatedWaitMinutes !== undefined ? <MatchQueueForecast minutes={estimatedWaitMinutes} /> : <span className="text-xs font-black text-slate-300">vs</span>
            )}
          </div>

          {/* Equipe 2 */}
          <div className="flex-1 min-w-0 text-right">
            <div className="flex items-center justify-end gap-1.5 flex-wrap">
              {p2FinalBadge && (
                <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                  {p2FinalBadge}
                </span>
              )}
              {isFinished && match.winnerPairId === match.pair2Id && (
                <Trophy size={14} className="text-amber-500 shrink-0" fill="currentColor" />
              )}
              <p className="text-xs font-black text-slate-800 leading-tight truncate">
                {team2Name}
              </p>
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${t2Style.bar.split(' ')[0]}`} />
            </div>
            {team2Code && <p className="text-[10px] font-bold text-slate-400 truncate">{team2Code}</p>}
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // RENDERIZAÇÃO 2: VARIANTE DETALHADA (IMAGENS 2 E 3)
  // Usada no Admin (todos os eventos) e no Usuário (apenas Ranking)
  // ==========================================
  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-4 sm:p-5 shadow-sm transition-all hover:border-slate-200">
      {/* Top row: Match Code & Phase on Left, Status Badge & Delete on Right */}
      <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-100">
        <div className="text-sm font-black text-slate-800 tracking-tight flex flex-wrap items-center gap-1.5">
          <span>[{code}]</span>
          {phaseStr && <span>[{phaseStr}]</span>}
          {match.court && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black bg-slate-100 text-slate-700 border border-slate-200">
              <MapPin size={10} className="text-slate-500" />
              {match.court}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <span className={`px-2.5 py-1 rounded-xl text-[10px] font-black border ${statusColor}`}>
            {statusLabel}
          </span>
          {isLive && onOpenWatchMode && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onOpenWatchMode(); }}
              className="w-9 h-9 inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white text-emerald-600 hover:bg-emerald-50 active:scale-95 transition-all"
              title="Ver partida no modo relógio"
              aria-label="Ver partida no modo relógio"
            >
              <Watch size={17} />
            </button>
          )}
          {isRanking && isWaiting && canSubmitScore && onStartLiveMatch && pair1 && pair2 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onStartLiveMatch(match, pair1, pair2);
              }}
              className="w-8 h-8 inline-flex items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 active:scale-95 transition-all"
              title="Iniciar partida"
              aria-label="Iniciar partida"
            >
              <Play size={15} className="fill-current" />
            </button>
          )}
          {isInQueue && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[10px] font-black border bg-sky-50 text-sky-700 border-sky-200 whitespace-nowrap">
              <Clock size={10} />
              #{queuePosition} na fila
            </span>
          )}
          {canManage && onDeleteMatch && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteMatch(match.id);
              }}
              className="p-1.5 text-slate-300 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
              title="Excluir partida"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>

      {totalSets === 1 ? (
        /* Layout para 1 set com cores de quadra / pares intercalados + tap-to-score */
        <div className="space-y-2">
          {/* Equipe 1 — clique fora do input incrementa +1 */}
          <div
            className={`rounded-2xl p-3 flex items-center justify-between gap-3 shadow-xs ${t1Style.bar} ${canIncrementScore ? 'cursor-pointer select-none active:brightness-90 transition-all' : ''}`}
            onClick={(e) => {
              // Não aciona se o clique foi diretamente no input
              if ((e.target as HTMLElement).tagName === 'INPUT') return;
              handleTapScore('p1', 0);
            }}
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1">
                    <p className={`text-sm font-black leading-tight truncate ${servingTeam === 'p1' && !servingPartner ? 'bg-[#bef264] text-[#1a1a1a] px-1 rounded' : t1Style.text}`}>{team1FirstName}</p>
                    {servingTeam === 'p1' && !servingPartner && <span className="w-5 h-5 rounded-full bg-white text-sky-600 flex items-center justify-center shrink-0" title="Sacador atual"><CircleDot size={12} /></span>}
                  </div>
                  {team1SecondName && <div className="flex items-center gap-1"><p className={`text-sm font-black leading-tight truncate ${servingTeam === 'p1' && servingPartner ? 'bg-[#bef264] text-[#1a1a1a] px-1 rounded' : t1Style.text}`}>{team1SecondName}</p>{servingTeam === 'p1' && servingPartner && <span className="w-5 h-5 rounded-full bg-white text-sky-600 flex items-center justify-center shrink-0" title="Sacador atual"><CircleDot size={12} /></span>}</div>}
                </div>
                {isFinished && match.winnerPairId === match.pair1Id && (
                  <Trophy size={14} className="text-amber-300 shrink-0" fill="currentColor" />
                )}
                {p1FinalBadge && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-black border shrink-0 bg-white/20 text-white border-white/30">
                    {p1FinalBadge}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">{team1Code && <p className={`text-xs font-bold ${t1Style.subText}`}>[{team1Code}]</p>}{team1P2Name && isTennisOrBeach && <button type="button" disabled={isReadOnly} onClick={(e) => { e.stopPropagation(); toggleServeOrder('p1'); }} className="w-6 h-6 rounded-full bg-white text-slate-700 shadow-sm flex items-center justify-center disabled:opacity-40" title="Trocar a ordem de saque dos parceiros"><ArrowRightLeft size={12} /></button>}</div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className={`w-5 text-center text-sm font-black ${t1Style.text}`}>
                {setsWon1}
              </span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={2}
                disabled={!canSubmitScore || isFinished}
                value={scores[0]?.p1 !== null && scores[0]?.p1 !== undefined ? scores[0].p1 : ''}
                onChange={(e) => handleScoreInput(0, 'p1', e.target.value)}
                onBlur={onScoreBlur}
                onClick={(e) => e.stopPropagation()}
                className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center text-center font-black text-sm outline-none transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                  isSet1WonByP1
                    ? t1Style.wonInput
                    : t1Style.input
                }`}
              />
              {isTennisOrBeach && <button type="button" disabled={!canIncrementScore} onClick={(e) => { e.stopPropagation(); handleTapGame('p1', 0); }} className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg font-black text-sm ${t1Style.input} disabled:opacity-50`} style={{ borderColor: '#ffd400', borderWidth: 3 }} title="Adicionar ponto ao game atual do Time 1">{scores[0]?.gameP1 || '0'}</button>}
            </div>
          </div>

          {/* Linha central: label set1 + botão undo */}
          <div className="flex items-center gap-1 px-1 py-0.5">
            <div className="flex items-center gap-1">
              {isTennisOrBeach && onResetMatch && <button type="button" onClick={resetCurrentMatch} disabled={!canTapScore || isReadOnly} className={'min-w-[64px] h-9 px-1.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-600 flex items-center justify-center gap-1 disabled:opacity-40 ' + syncBorderClass(scoreSaveStatus)} title={'Zerar partida — ' + syncStatusLabel(scoreSaveStatus)}><RefreshCw size={13} /><span className="text-[9px] leading-tight font-black">0 x 0</span></button>}
              {isTennisOrBeach && canDrawStartingServer && <button type="button" onClick={drawStartingServer} disabled={isDrawingServer} className="min-w-[110px] h-9 px-1.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-white shadow-sm flex items-center justify-center gap-1 disabled:opacity-40" title="Sortear qual time inicia sacando">{isDrawingServer ? <Loader2 size={14} className="animate-spin shrink-0" /> : <Dices size={14} className="text-yellow-300 shrink-0" />}<span className="text-[9px] leading-tight font-black text-center">{isDrawingServer ? `Time ${(drawPreview ?? 0) + 1} inicia sacando` : <>Sortear<br />sacador</>}</span></button>}
            </div>
            {canTapScore && isAnyScorePositive ? (
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
            ) : (
              <div />
            )}
            <div className="flex-1 min-w-0 flex justify-center px-1">{isLive ? <MatchCourtTimer startedAt={match.courtStartedAt || match.startedAt} averageMinutes={resolveCourtMinutes(sportRules).courtMinutes} /> : isWaiting ? <MatchQueueForecast minutes={estimatedWaitMinutes} /> : null}</div>
            <div className="flex items-center gap-1 w-9 sm:w-10 justify-center">
              {tieBreakSetFlags[0] && (
                <span className="text-[9px] font-black text-amber-600 animate-pulse leading-none">TB</span>
              )}
              <span className="text-[10px] sm:text-xs font-bold text-slate-400">
                set1
              </span>
            </div>
            {isTennisOrBeach && <span className="w-9 sm:w-10 text-center text-[10px] sm:text-xs font-bold text-[#b7ff3c]">game</span>}
          </div>

          {/* Equipe 2 — clique fora do input incrementa +1 */}
          <div
            className={`rounded-2xl p-3 flex items-center justify-between gap-3 shadow-xs ${t2Style.bar} ${canIncrementScore ? 'cursor-pointer select-none active:brightness-90 transition-all' : ''}`}
            onClick={(e) => {
              if ((e.target as HTMLElement).tagName === 'INPUT') return;
              handleTapScore('p2', 0);
            }}
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1"><p className={`text-sm font-black leading-tight truncate ${servingTeam === 'p2' && !servingPartner ? 'bg-[#bef264] text-[#1a1a1a] px-1 rounded' : t2Style.text}`}>{team2FirstName}</p>{servingTeam === 'p2' && !servingPartner && <span className="w-5 h-5 rounded-full bg-white text-sky-600 flex items-center justify-center shrink-0" title="Sacador atual"><CircleDot size={12} /></span>}</div>
                  {team2SecondName && <div className="flex items-center gap-1"><p className={`text-sm font-black leading-tight truncate ${servingTeam === 'p2' && servingPartner ? 'bg-[#bef264] text-[#1a1a1a] px-1 rounded' : t2Style.text}`}>{team2SecondName}</p>{servingTeam === 'p2' && servingPartner && <span className="w-5 h-5 rounded-full bg-white text-sky-600 flex items-center justify-center shrink-0" title="Sacador atual"><CircleDot size={12} /></span>}</div>}
                </div>
                {isFinished && match.winnerPairId === match.pair2Id && (
                  <Trophy size={14} className="text-amber-300 shrink-0" fill="currentColor" />
                )}
                {p2FinalBadge && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-black border shrink-0 bg-white/20 text-white border-white/30">
                    {p2FinalBadge}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">{team2Code && <p className={`text-xs font-bold ${t2Style.subText}`}>[{team2Code}]</p>}{team2P2Name && isTennisOrBeach && <button type="button" disabled={isReadOnly} onClick={(e) => { e.stopPropagation(); toggleServeOrder('p2'); }} className="w-6 h-6 rounded-full bg-white text-slate-700 shadow-sm flex items-center justify-center disabled:opacity-40" title="Trocar a ordem de saque dos parceiros"><ArrowRightLeft size={12} /></button>}</div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className={`w-5 text-center text-sm font-black ${t2Style.text}`}>
                {setsWon2}
              </span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={2}
                disabled={!canSubmitScore || isFinished}
                value={scores[0]?.p2 !== null && scores[0]?.p2 !== undefined ? scores[0].p2 : ''}
                onChange={(e) => handleScoreInput(0, 'p2', e.target.value)}
                onBlur={onScoreBlur}
                onClick={(e) => e.stopPropagation()}
                className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center text-center font-black text-sm outline-none transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                  isSet1WonByP2
                    ? t2Style.wonInput
                    : t2Style.input
                }`}
              />
              {isTennisOrBeach && <button type="button" disabled={!canIncrementScore} onClick={(e) => { e.stopPropagation(); handleTapGame('p2', 0); }} className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg font-black text-sm ${t2Style.input} disabled:opacity-50`} style={{ borderColor: '#ffd400', borderWidth: 3 }} title="Adicionar ponto ao game atual do Time 2">{scores[0]?.gameP2 || '0'}</button>}
            </div>
          </div>
        </div>
      ) : (
        /* Layout para múltiplos sets com cores de quadra / pares intercalados + tap-to-score */
        <div className="space-y-2">
          {/* Equipe 1 */}
          <div
            className={`rounded-2xl p-3 flex items-center justify-between gap-3 shadow-xs ${t1Style.bar} ${canIncrementScore ? 'cursor-pointer select-none active:brightness-90 transition-all' : ''}`}
            onClick={(e) => {
              if ((e.target as HTMLElement).tagName === 'INPUT') return;
              handleTapScore('p1');
            }}
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1"><p className={`text-sm font-black leading-tight truncate ${servingTeam === 'p1' && !servingPartner ? 'bg-[#bef264] text-[#1a1a1a] px-1 rounded' : t1Style.text}`}>{team1FirstName}</p>{servingTeam === 'p1' && !servingPartner && <span className="w-5 h-5 rounded-full bg-white text-sky-600 flex items-center justify-center shrink-0" title="Sacador atual"><CircleDot size={12} /></span>}</div>
                  {team1SecondName && <div className="flex items-center gap-1"><p className={`text-sm font-black leading-tight truncate ${servingTeam === 'p1' && servingPartner ? 'bg-[#bef264] text-[#1a1a1a] px-1 rounded' : t1Style.text}`}>{team1SecondName}</p>{servingTeam === 'p1' && servingPartner && <span className="w-5 h-5 rounded-full bg-white text-sky-600 flex items-center justify-center shrink-0" title="Sacador atual"><CircleDot size={12} /></span>}</div>}
                </div>
                {isFinished && match.winnerPairId === match.pair1Id && (
                  <Trophy size={14} className="text-amber-300 shrink-0" fill="currentColor" />
                )}
                {p1FinalBadge && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-black border shrink-0 bg-white/20 text-white border-white/30">
                    {p1FinalBadge}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">{team1Code && <p className={`text-xs font-bold ${t1Style.subText}`}>[{team1Code}]</p>}{team1P2Name && isTennisOrBeach && <button type="button" disabled={isReadOnly} onClick={(e) => { e.stopPropagation(); toggleServeOrder('p1'); }} className="w-6 h-6 rounded-full bg-white text-slate-700 shadow-sm flex items-center justify-center disabled:opacity-40" title="Trocar a ordem de saque dos parceiros"><ArrowRightLeft size={12} /></button>}</div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <span className={`w-5 text-center text-sm font-black ${t1Style.text}`}>
                {setsWon1}
              </span>
              {scores.map((setScore, setIdx) => {
                const isSetWon =
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
                    disabled={!canSubmitScore || isFinished}
                    value={setScore.p1 !== null && setScore.p1 !== undefined ? setScore.p1 : ''}
                    onChange={(e) => handleScoreInput(setIdx, 'p1', e.target.value)}
                    onBlur={onScoreBlur}
                    onClick={(e) => e.stopPropagation()}
                    className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center text-center font-black text-sm outline-none transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                      isSetWon
                        ? t1Style.wonInput
                        : t1Style.input
                    }`}
                  />
                );
              })}
              {isTennisOrBeach && <button type="button" disabled={!canIncrementScore} onClick={(e) => { e.stopPropagation(); handleTapGame('p1', getActiveSetIdx()); }} className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg font-black text-sm ${t1Style.input} disabled:opacity-50`} style={{ borderColor: '#ffd400', borderWidth: 3 }} title="Adicionar ponto ao game atual do Time 1">{scores[getActiveSetIdx()]?.gameP1 || '0'}</button>}
            </div>
          </div>

          {/* Labels dos sets + botão undo */}
          <div className="flex items-center gap-1 px-1 py-0.5">
            <div className="flex items-center gap-1">
              {isTennisOrBeach && onResetMatch && <button type="button" onClick={resetCurrentMatch} disabled={!canTapScore || isReadOnly} className={'min-w-[64px] h-9 px-1.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-600 flex items-center justify-center gap-1 disabled:opacity-40 ' + syncBorderClass(scoreSaveStatus)} title={'Zerar partida — ' + syncStatusLabel(scoreSaveStatus)}><RefreshCw size={13} /><span className="text-[9px] leading-tight font-black">0 x 0</span></button>}
              {isTennisOrBeach && canDrawStartingServer && <button type="button" onClick={drawStartingServer} disabled={isDrawingServer} className="min-w-[110px] h-9 px-1.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-white shadow-sm flex items-center justify-center gap-1 disabled:opacity-40" title="Sortear qual time inicia sacando">{isDrawingServer ? <Loader2 size={14} className="animate-spin shrink-0" /> : <Dices size={14} className="text-yellow-300 shrink-0" />}<span className="text-[9px] leading-tight font-black text-center">{isDrawingServer ? `Time ${(drawPreview ?? 0) + 1} inicia sacando` : <>Sortear<br />sacador</>}</span></button>}
            </div>
            {canTapScore && isAnyScorePositive ? (
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
            ) : (
              <div />
            )}
            <div className="flex-1 min-w-0 flex justify-center px-1">{isLive ? <MatchCourtTimer startedAt={match.courtStartedAt || match.startedAt} averageMinutes={resolveCourtMinutes(sportRules).courtMinutes} /> : isWaiting ? <MatchQueueForecast minutes={estimatedWaitMinutes} /> : null}</div>
            <div className="flex items-center gap-1.5">
              <span className="w-5" />
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
              {isTennisOrBeach && <span className="w-9 sm:w-10 text-center text-[10px] sm:text-xs font-bold text-[#b7ff3c]">game</span>}
            </div>
          </div>

          {/* Equipe 2 */}
          <div
            className={`rounded-2xl p-3 flex items-center justify-between gap-3 shadow-xs ${t2Style.bar} ${canIncrementScore ? 'cursor-pointer select-none active:brightness-90 transition-all' : ''}`}
            onClick={(e) => {
              if ((e.target as HTMLElement).tagName === 'INPUT') return;
              handleTapScore('p2');
            }}
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1"><p className={`text-sm font-black leading-tight truncate ${servingTeam === 'p2' && !servingPartner ? 'bg-[#bef264] text-[#1a1a1a] px-1 rounded' : t2Style.text}`}>{team2FirstName}</p>{servingTeam === 'p2' && !servingPartner && <span className="w-5 h-5 rounded-full bg-white text-sky-600 flex items-center justify-center shrink-0" title="Sacador atual"><CircleDot size={12} /></span>}</div>
                  {team2SecondName && <div className="flex items-center gap-1"><p className={`text-sm font-black leading-tight truncate ${servingTeam === 'p2' && servingPartner ? 'bg-[#bef264] text-[#1a1a1a] px-1 rounded' : t2Style.text}`}>{team2SecondName}</p>{servingTeam === 'p2' && servingPartner && <span className="w-5 h-5 rounded-full bg-white text-sky-600 flex items-center justify-center shrink-0" title="Sacador atual"><CircleDot size={12} /></span>}</div>}
                </div>
                {isFinished && match.winnerPairId === match.pair2Id && (
                  <Trophy size={14} className="text-amber-300 shrink-0" fill="currentColor" />
                )}
                {p2FinalBadge && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-black border shrink-0 bg-white/20 text-white border-white/30">
                    {p2FinalBadge}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">{team2Code && <p className={`text-xs font-bold ${t2Style.subText}`}>[{team2Code}]</p>}{team2P2Name && isTennisOrBeach && <button type="button" disabled={isReadOnly} onClick={(e) => { e.stopPropagation(); toggleServeOrder('p2'); }} className="w-6 h-6 rounded-full bg-white text-slate-700 shadow-sm flex items-center justify-center disabled:opacity-40" title="Trocar a ordem de saque dos parceiros"><ArrowRightLeft size={12} /></button>}</div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <span className={`w-5 text-center text-sm font-black ${t2Style.text}`}>
                {setsWon2}
              </span>
              {scores.map((setScore, setIdx) => {
                const isSetWon =
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
                    disabled={!canSubmitScore || isFinished}
                    value={setScore.p2 !== null && setScore.p2 !== undefined ? setScore.p2 : ''}
                    onChange={(e) => handleScoreInput(setIdx, 'p2', e.target.value)}
                    onBlur={onScoreBlur}
                    onClick={(e) => e.stopPropagation()}
                    className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center text-center font-black text-sm outline-none transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                      isSetWon
                        ? t2Style.wonInput
                        : t2Style.input
                    }`}
                  />
                );
              })}
              {isTennisOrBeach && <button type="button" disabled={!canIncrementScore} onClick={(e) => { e.stopPropagation(); handleTapGame('p2', getActiveSetIdx()); }} className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg font-black text-sm ${t2Style.input} disabled:opacity-50`} style={{ borderColor: '#ffd400', borderWidth: 3 }} title="Adicionar ponto ao game atual do Time 2">{scores[getActiveSetIdx()]?.gameP2 || '0'}</button>}
            </div>
          </div>
        </div>
      )}

      {/* Footer: Data da partida e Finalizar partida (se não finalizado) */}
      {!isFinished ? (
        canSubmitScore && (
          <div className="pt-3 mt-3 border-t border-slate-100 space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-[11px] font-black text-slate-500 shrink-0 flex items-center gap-1">
                <Calendar size={13} className="text-sky-600" /> Data da partida:
              </label>
              <input
                type="date"
                value={match.matchDate || ''}
                onClick={(e) => {
                  try {
                    e.currentTarget.showPicker?.();
                  } catch {}
                }}
                onChange={(e) => onMatchDateChange?.(match.id, e.target.value)}
                className="flex-1 h-9 text-xs font-bold bg-slate-50 border-2 border-slate-200 focus:border-sky-500 focus:bg-white rounded-xl outline-none px-3 text-slate-700 cursor-pointer"
              />
            </div>
            {onFinishMatch && (
              <button
                type="button"
                disabled={!hasWinnerDefined}
                onClick={() => onFinishMatch(match.id)}
                className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-2xl text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95 transition-all shadow-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none"
                title={
                  hasWinnerDefined
                    ? 'Registrar placar final e concluir partida'
                    : 'Defina um vencedor no placar para poder finalizar a partida'
                }
              >
                <Check size={14} />
                Finalizar partida
              </button>
            )}
          </div>
        )
      ) : (
        /* Footer quando finalizado (Imagem 3) */
        <div className="pt-3 mt-3 border-t border-slate-100 space-y-2">
          {(startFormatted || durationFormatted || match.matchDate) && (
            <div className="flex items-center gap-2 text-[11px] text-slate-600 flex-wrap bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-100">
              {match.matchDate && (
                <span className="inline-flex items-center gap-1 font-bold">
                  <Calendar size={12} className="text-sky-600" />
                  <span>
                    Data:{' '}
                    <strong className="font-black text-slate-800">
                      {new Date(match.matchDate + 'T12:00:00').toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </strong>
                  </span>
                </span>
              )}
              {match.matchDate && (startFormatted || durationFormatted) && (
                <span className="text-slate-300">·</span>
              )}
              {startFormatted && (
                <span className="inline-flex items-center gap-1 font-bold">
                  <Clock size={12} className="text-slate-400 shrink-0" />
                  <span>
                    Início: <strong className="font-black text-slate-800">{startFormatted}</strong>
                  </span>
                </span>
              )}
              {startFormatted && durationFormatted && (
                <span className="text-slate-300">·</span>
              )}
              {durationFormatted && (
                <span className="inline-flex items-center gap-1 font-bold">
                  <Clock size={12} className="text-slate-400 shrink-0" />
                  <span>
                    Duração: <strong className="font-black text-slate-800">{durationFormatted}</strong>
                  </span>
                </span>
              )}
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
              <Check size={13} className="text-emerald-500" /> Partida finalizada
            </span>
            {!isReadOnly && canSubmitScore && onReopenMatch && (
              <button
                type="button"
                onClick={() => onReopenMatch(match.id)}
                className="text-[11px] font-black text-slate-400 hover:text-blue-600 hover:underline transition-colors cursor-pointer"
                title="Reabrir partida para alteração de placar"
              >
                Reabrir partida
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
