import React, { useCallback, useRef, useState } from 'react';
import { Trophy, Clock, Trash2, Calendar, Check, Wifi, Play, MapPin, RotateCcw } from 'lucide-react';
import type { TournamentMatch, TournamentPair } from '../../types';
import { getPhaseLabel, parseMatchSets } from '../../domain/brackets';
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
  liveScore?: { p1Score: number | string; p2Score: number | string };
  queuePosition?: number;

  canSubmitScore?: boolean;
  canManage?: boolean;
  isReadOnly?: boolean;
  allCategoryFinished?: boolean;
  onScoreChange?: LegacyScoreChangeHandler | SetScoreChangeHandler;
  /**
   * Chamado pelo undo do tap-to-score com p1 e p2 do set juntos,
   * de forma atômica (evita race condition de dois onScoreChange sequenciais).
   */
  onUndoScore?: (matchId: string, setIndex: number, p1Val: string, p2Val: string) => void;
  onScoreBlur?: () => void;
  onMatchDateChange?: (matchId: string, date: string) => void;
  onFinishMatch?: (matchId: string) => void;
  onReopenMatch?: (matchId: string) => void;
  onDeleteMatch?: (matchId: string) => void;
  onStartLiveMatch?: (match: TournamentMatch, pair1: TournamentPair, pair2: TournamentPair) => void;
}

export const MatchCard: React.FC<MatchCardProps> = ({
  match,
  pairsById,
  variant = 'detailed',
  colorIndex,
  isRanking = false,
  totalSets = 1,
  gamesPerSet = 6,
  liveScore,
  queuePosition = 0,
  canSubmitScore = false,
  canManage = false,
  isReadOnly = false,
  allCategoryFinished = false,
  onScoreChange,
  onUndoScore,
  onScoreBlur,
  onMatchDateChange,
  onFinishMatch,
  onReopenMatch,
  onDeleteMatch,
  onStartLiveMatch,
}) => {
  const getPair = (pairId?: string, embedded?: TournamentPair): TournamentPair | undefined => {
    if (embedded) return embedded;
    if (!pairId || !pairsById) return undefined;
    if (pairsById instanceof Map) return pairsById.get(pairId);
    return pairsById[pairId];
  };

  const pair1 = getPair(match.pair1Id, match.pair1);
  const pair2 = getPair(match.pair2Id, match.pair2);

  const team1Name = pair1
    ? `${pair1.p1.nickname || pair1.p1.name} & ${pair1.p2.nickname || pair1.p2.name}`
    : match.pair1Label || 'A definir';
  const team1Code = pair1?.teamCode || (pair1?.teamNumber ? `Time ${pair1.teamNumber}` : '');

  const team2Name = pair2
    ? `${pair2.p1.nickname || pair2.p1.name} & ${pair2.p2.nickname || pair2.p2.name}`
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
  const { scores, setsWon1, setsWon2 } = parseMatchSets(match, totalSets, gamesPerSet);

  // ── Tap-to-score: histórico local de pontuações para undo ──────────────────
  // Armazenamos o histórico como pares [p1, p2] por set. Só usado no variant=detailed.
  const scoreHistoryRef = useRef<Array<{ setIdx: number; p1: string; p2: string }>>([]);
  // hasUndoSteps só é necessário para re-render do botão undo
  const [hasUndoSteps, setHasUndoSteps] = useState(false);

  const canTapScore = canSubmitScore && !isFinished && !!onScoreChange;

  const handleTapScore = useCallback(
    (player: 'p1' | 'p2', setIdx: number) => {
      if (!canTapScore) return;
      const currentScore = scores[setIdx];
      const curP1 = currentScore?.p1 !== null && currentScore?.p1 !== undefined ? String(currentScore.p1) : '0';
      const curP2 = currentScore?.p2 !== null && currentScore?.p2 !== undefined ? String(currentScore.p2) : '0';

      // Guarda estado anterior para undo
      scoreHistoryRef.current = [
        ...scoreHistoryRef.current,
        { setIdx, p1: curP1, p2: curP2 },
      ];
      setHasUndoSteps(true);

      const newVal = String(Number(player === 'p1' ? curP1 : curP2) + 1);
      if (onScoreChange!.length <= 3) {
        (onScoreChange as LegacyScoreChangeHandler)(match.id, player, newVal);
      } else {
        (onScoreChange as SetScoreChangeHandler)(match.id, setIdx, player, newVal);
      }
    },
    [canTapScore, scores, onScoreChange, match.id]
  );

  const handleUndo = useCallback(() => {
    if (!canTapScore || scoreHistoryRef.current.length === 0) return;
    const prev = scoreHistoryRef.current[scoreHistoryRef.current.length - 1];
    scoreHistoryRef.current = scoreHistoryRef.current.slice(0, -1);
    setHasUndoSteps(scoreHistoryRef.current.length > 0);

    // Restaura p1 e p2 atomicamente via onUndoScore (handler dedicado),
    // ou cai no onScoreChange legado se onUndoScore não for fornecido.
    if (onUndoScore) {
      onUndoScore(match.id, prev.setIdx, prev.p1, prev.p2);
    } else if (onScoreChange) {
      // Fallback: duas chamadas sequenciais (pode ter race condition em handlers async)
      if (onScoreChange.length <= 3) {
        (onScoreChange as LegacyScoreChangeHandler)(match.id, 'p1', prev.p1);
        (onScoreChange as LegacyScoreChangeHandler)(match.id, 'p2', prev.p2);
      } else {
        (onScoreChange as SetScoreChangeHandler)(match.id, prev.setIdx, 'p1', prev.p1);
        (onScoreChange as SetScoreChangeHandler)(match.id, prev.setIdx, 'p2', prev.p2);
      }
    }
  }, [canTapScore, onUndoScore, onScoreChange, match.id]);

  const handleScoreInput = (setIdx: number, player: 'p1' | 'p2', val: string) => {
    if (!onScoreChange) return;
    if (onScoreChange.length <= 3) {
      (onScoreChange as LegacyScoreChangeHandler)(match.id, player, val);
    } else {
      (onScoreChange as SetScoreChangeHandler)(match.id, setIdx, player, val);
    }
  };

  const isSet1WonByP1 =
    scores[0]?.p1 !== null &&
    scores[0]?.p1 !== undefined &&
    scores[0]?.p2 !== null &&
    scores[0]?.p2 !== undefined &&
    ((Number(scores[0].p1) >= gamesPerSet && Number(scores[0].p1) > Number(scores[0].p2)) ||
      (isFinished && match.winnerPairId === match.pair1Id));

  const isSet1WonByP2 =
    scores[0]?.p1 !== null &&
    scores[0]?.p1 !== undefined &&
    scores[0]?.p2 !== null &&
    scores[0]?.p2 !== undefined &&
    ((Number(scores[0].p2) >= gamesPerSet && Number(scores[0].p2) > Number(scores[0].p1)) ||
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
            {isLive && liveScore ? (
              <div className="flex items-center gap-1">
                <Wifi size={14} className="text-red-500 animate-pulse" />
                <p className="text-lg font-black text-sky-600">{liveScore.p1Score}-{liveScore.p2Score}</p>
              </div>
            ) : isFinished ? (
              <span className="bg-slate-900 text-white px-3 py-1 rounded-xl text-xs font-black">
                {match.result || '-'}
              </span>
            ) : (
              <span className="text-xs font-black text-slate-300">vs</span>
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
            className={`rounded-2xl p-3 flex items-center justify-between gap-3 shadow-xs ${t1Style.bar} ${canTapScore ? 'cursor-pointer select-none active:brightness-90 transition-all' : ''}`}
            onClick={(e) => {
              // Não aciona se o clique foi diretamente no input
              if ((e.target as HTMLElement).tagName === 'INPUT') return;
              handleTapScore('p1', 0);
            }}
          >
            <div className="min-w-0 flex-1 pointer-events-none">
              <div className="flex flex-wrap items-center gap-2">
                <p className={`text-sm font-black leading-tight truncate ${t1Style.text}`}>
                  {team1Name}
                </p>
                {isFinished && match.winnerPairId === match.pair1Id && (
                  <Trophy size={14} className="text-amber-300 shrink-0" fill="currentColor" />
                )}
                {p1FinalBadge && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-black border shrink-0 bg-white/20 text-white border-white/30">
                    {p1FinalBadge}
                  </span>
                )}
              </div>
              {team1Code && (
                <p className={`text-xs font-bold mt-0.5 ${t1Style.subText}`}>
                  [{team1Code}]
                </p>
              )}
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
            </div>
          </div>

          {/* Linha central: label set1 + botão undo */}
          <div className="flex items-center justify-between px-3 py-0.5">
            <div className="w-9 sm:w-10" />
            {canTapScore ? (
              <button
                type="button"
                onClick={handleUndo}
                disabled={!hasUndoSteps}
                className={`w-8 h-8 rounded-xl border flex items-center justify-center transition-all active:scale-90 ${
                  hasUndoSteps
                    ? 'bg-white/90 border-slate-200 text-slate-600 hover:text-red-500 hover:border-red-200 shadow-sm cursor-pointer'
                    : 'bg-white/30 border-white/20 text-white/30 cursor-not-allowed'
                }`}
                title="Desfazer último ponto"
              >
                <RotateCcw size={14} />
              </button>
            ) : (
              <div />
            )}
            <span className="w-9 sm:w-10 text-center text-[10px] sm:text-xs font-bold text-slate-400">
              set1
            </span>
          </div>

          {/* Equipe 2 — clique fora do input incrementa +1 */}
          <div
            className={`rounded-2xl p-3 flex items-center justify-between gap-3 shadow-xs ${t2Style.bar} ${canTapScore ? 'cursor-pointer select-none active:brightness-90 transition-all' : ''}`}
            onClick={(e) => {
              if ((e.target as HTMLElement).tagName === 'INPUT') return;
              handleTapScore('p2', 0);
            }}
          >
            <div className="min-w-0 flex-1 pointer-events-none">
              <div className="flex flex-wrap items-center gap-2">
                <p className={`text-sm font-black leading-tight truncate ${t2Style.text}`}>
                  {team2Name}
                </p>
                {isFinished && match.winnerPairId === match.pair2Id && (
                  <Trophy size={14} className="text-amber-300 shrink-0" fill="currentColor" />
                )}
                {p2FinalBadge && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-black border shrink-0 bg-white/20 text-white border-white/30">
                    {p2FinalBadge}
                  </span>
                )}
              </div>
              {team2Code && (
                <p className={`text-xs font-bold mt-0.5 ${t2Style.subText}`}>
                  [{team2Code}]
                </p>
              )}
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
            </div>
          </div>
        </div>
      ) : (
        /* Layout para múltiplos sets com cores de quadra / pares intercalados + tap-to-score */
        <div className="space-y-2">
          {/* Equipe 1 */}
          <div
            className={`rounded-2xl p-3 flex items-center justify-between gap-3 shadow-xs ${t1Style.bar} ${canTapScore ? 'cursor-pointer select-none active:brightness-90 transition-all' : ''}`}
            onClick={(e) => {
              if ((e.target as HTMLElement).tagName === 'INPUT') return;
              // Para multi-set: incrementa o primeiro set ainda não finalizado
              const activeSetIdx = scores.findIndex(
                (s) => s.inProgress || (s.p1 === null && s.p2 === null)
              );
              handleTapScore('p1', activeSetIdx >= 0 ? activeSetIdx : 0);
            }}
          >
            <div className="min-w-0 flex-1 pointer-events-none">
              <div className="flex flex-wrap items-center gap-2">
                <p className={`text-sm font-black leading-tight truncate ${t1Style.text}`}>
                  {team1Name}
                </p>
                {isFinished && match.winnerPairId === match.pair1Id && (
                  <Trophy size={14} className="text-amber-300 shrink-0" fill="currentColor" />
                )}
                {p1FinalBadge && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-black border shrink-0 bg-white/20 text-white border-white/30">
                    {p1FinalBadge}
                  </span>
                )}
              </div>
              {team1Code && (
                <p className={`text-xs font-bold mt-0.5 ${t1Style.subText}`}>[{team1Code}]</p>
              )}
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
                  Number(setScore.p1) >= gamesPerSet &&
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
            </div>
          </div>

          {/* Labels dos sets + botão undo */}
          <div className="flex items-center justify-between px-3 py-0.5">
            <div />
            {canTapScore ? (
              <button
                type="button"
                onClick={handleUndo}
                disabled={!hasUndoSteps}
                className={`w-8 h-8 rounded-xl border flex items-center justify-center transition-all active:scale-90 ${
                  hasUndoSteps
                    ? 'bg-white/90 border-slate-200 text-slate-600 hover:text-red-500 hover:border-red-200 shadow-sm cursor-pointer'
                    : 'bg-slate-100 border-slate-200 text-slate-300 cursor-not-allowed'
                }`}
                title="Desfazer último ponto"
              >
                <RotateCcw size={14} />
              </button>
            ) : (
              <div />
            )}
            <div className="flex items-center gap-1.5">
              <span className="w-5" />
              {scores.map((_, setIdx) => (
                <span
                  key={`label_set_${setIdx}`}
                  className="w-9 sm:w-10 text-center text-[10px] sm:text-xs font-bold text-slate-400"
                >
                  set{setIdx + 1}
                </span>
              ))}
            </div>
          </div>

          {/* Equipe 2 */}
          <div
            className={`rounded-2xl p-3 flex items-center justify-between gap-3 shadow-xs ${t2Style.bar} ${canTapScore ? 'cursor-pointer select-none active:brightness-90 transition-all' : ''}`}
            onClick={(e) => {
              if ((e.target as HTMLElement).tagName === 'INPUT') return;
              const activeSetIdx = scores.findIndex(
                (s) => s.inProgress || (s.p1 === null && s.p2 === null)
              );
              handleTapScore('p2', activeSetIdx >= 0 ? activeSetIdx : 0);
            }}
          >
            <div className="min-w-0 flex-1 pointer-events-none">
              <div className="flex flex-wrap items-center gap-2">
                <p className={`text-sm font-black leading-tight truncate ${t2Style.text}`}>
                  {team2Name}
                </p>
                {isFinished && match.winnerPairId === match.pair2Id && (
                  <Trophy size={14} className="text-amber-300 shrink-0" fill="currentColor" />
                )}
                {p2FinalBadge && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-black border shrink-0 bg-white/20 text-white border-white/30">
                    {p2FinalBadge}
                  </span>
                )}
              </div>
              {team2Code && (
                <p className={`text-xs font-bold mt-0.5 ${t2Style.subText}`}>[{team2Code}]</p>
              )}
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
                  Number(setScore.p2) >= gamesPerSet &&
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
                onClick={() => onFinishMatch(match.id)}
                className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-2xl text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95 transition-all shadow-sm cursor-pointer"
                title="Registrar placar final e concluir partida"
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
