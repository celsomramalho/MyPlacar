import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import type { TournamentMatch, TournamentPair, MatchSetScore } from '@modules/events/types';
import type { CourtState } from '@modules/events/services/queueManager';
import { getCourtColors } from '../../../../constants.ts';

export const COURT_TEAM_STYLES: Record<
  string,
  { bar: string; input: string; text: string; subText: string; wonInput: string }
> = {
  azul: {
    bar: 'bg-[#0095ff] text-white',
    input: 'bg-[#0055ff] text-white placeholder-white/50 border-2 border-black focus:bg-blue-600',
    wonInput: 'bg-[#22c55e] text-white border-2 border-black',
    text: 'text-white',
    subText: 'text-white/80',
  },
  vermelho: {
    bar: 'bg-[#ff0055] text-white',
    input: 'bg-[#cc0044] text-white placeholder-white/50 border-2 border-black focus:bg-red-600',
    wonInput: 'bg-[#22c55e] text-white border-2 border-black',
    text: 'text-white',
    subText: 'text-white/80',
  },
  amarelo: {
    bar: 'bg-yellow-400 text-slate-900',
    input: 'bg-yellow-300 text-slate-900 placeholder-slate-600 border-2 border-black focus:bg-yellow-200',
    wonInput: 'bg-[#22c55e] text-white border-2 border-black',
    text: 'text-slate-900',
    subText: 'text-slate-700',
  },
  lilas: {
    bar: 'bg-violet-500 text-white',
    input: 'bg-violet-700 text-white placeholder-white/50 border-2 border-black focus:bg-violet-600',
    wonInput: 'bg-[#22c55e] text-white border-2 border-black',
    text: 'text-white',
    subText: 'text-white/80',
  },
  laranja: {
    bar: 'bg-orange-500 text-white',
    input: 'bg-orange-700 text-white placeholder-white/50 border-2 border-black focus:bg-orange-600',
    wonInput: 'bg-[#22c55e] text-white border-2 border-black',
    text: 'text-white',
    subText: 'text-white/80',
  },
  verde: {
    bar: 'bg-emerald-500 text-white',
    input: 'bg-emerald-700 text-white placeholder-white/50 border-2 border-black focus:bg-emerald-600',
    wonInput: 'bg-[#22c55e] text-white border-2 border-black',
    text: 'text-white',
    subText: 'text-white/80',
  },
  marrom: {
    bar: 'bg-amber-800 text-white',
    input: 'bg-amber-950 text-white placeholder-white/50 border-2 border-black focus:bg-amber-900',
    wonInput: 'bg-[#22c55e] text-white border-2 border-black',
    text: 'text-white',
    subText: 'text-white/80',
  },
  roxo: {
    bar: 'bg-purple-600 text-white',
    input: 'bg-purple-800 text-white placeholder-white/50 border-2 border-black focus:bg-purple-700',
    wonInput: 'bg-[#22c55e] text-white border-2 border-black',
    text: 'text-white',
    subText: 'text-white/80',
  },
};

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

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  const isOvertime = averageMinutes && mins >= averageMinutes;

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

export interface CourtCardProps {
  court: CourtState;
  index: number;
  isReadOnly: boolean;
  pairsById: Record<string, TournamentPair>;
  totalSets: number;
  gamesPerSet: number;
  averageMatchDurationMinutes: number;
  refreshingMatchId: string | null;
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
  onScoreBlur: () => void;
  onMatchDateChange: (matchId: string, matchDate: string) => void;
  onFinishCourtMatch: (matchId: string) => void;
}

export const CourtCard: React.FC<CourtCardProps> = ({
  court,
  index,
  isReadOnly,
  pairsById,
  totalSets,
  gamesPerSet,
  averageMatchDurationMinutes,
  refreshingMatchId,
  getPlayerNick,
  parseMatchSets,
  onFreeCourtMatch,
  onOpenMatchRules,
  onToggleInterdictCourt,
  onRefreshEventScore,
  onScoreInputChange,
  onScoreBlur,
  onMatchDateChange,
  onFinishCourtMatch,
}) => {
  const isFree = court.status === 'free';
  const isBusy = court.status === 'busy';
  const isInterdicted = court.status === 'interdicted';

  const activeMatch = court.activeMatch;
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
  const matchCodeLabel = activeMatch ? activeMatch.matchCode || String(activeMatch.matchNumber || 1).padStart(2, '0') : '';
  const phaseLabel = activeMatch?.phase === 'chave1' ? 'Chave 1' : activeMatch?.phase === 'chave2' ? 'Chave 2' : activeMatch?.phase || 'Jogo';

  const courtColors = getCourtColors(court.courtName || index);
  const t1Style = COURT_TEAM_STYLES[courtColors.p1Color] || COURT_TEAM_STYLES.azul;
  const t2Style = COURT_TEAM_STYLES[courtColors.p2Color] || COURT_TEAM_STYLES.vermelho;

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
              Ocupada (Ao vivo)
            </span>
          )}
          {isBusy && activeMatch && (
            <MatchTimer startedAt={activeMatch.startedAt} averageMinutes={averageMatchDurationMinutes} />
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

        <div className="flex justify-center shrink-0">
          {isBusy && activeMatch && (
            <button
              type="button"
              disabled={isReadOnly}
              onClick={() => onOpenMatchRules(activeMatch)}
              className="w-9 h-9 bg-[#fff8e6] hover:bg-emerald-50 active:scale-95 text-emerald-500 rounded-xl transition-all flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none"
              title="Abrir regras com os jogadores desta partida"
            >
              <Play size={18} className="fill-emerald-500" />
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
              <span className="inline-flex items-center text-[10px] font-black text-slate-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg whitespace-nowrap">
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

          {/* Placar */}
          {totalSets === 1 ? (
            <div className="space-y-2">
              <div className={`rounded-2xl p-3 flex items-center justify-between gap-3 shadow-xs ${t1Style.bar}`}>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-black leading-tight truncate ${t1Style.text}`}>{team1Name}</p>
                  {team1Code && <p className={`text-xs font-bold ${t1Style.subText}`}>[{team1Code}]</p>}
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
                    onChange={(e) => onScoreInputChange(activeMatch.id, 0, 'p1', e.target.value)}
                    onBlur={onScoreBlur}
                    className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center text-center font-black text-sm outline-none transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                      !scores[0]?.inProgress && scores[0]?.p1 !== null && scores[0]?.p1 !== undefined && scores[0]?.p2 !== null && scores[0]?.p2 !== undefined && Number(scores[0].p1) >= gamesPerSet && Number(scores[0].p1) > Number(scores[0].p2)
                        ? t1Style.wonInput
                        : t1Style.input
                    }`}
                  />
                </div>
              </div>

              <div className={`rounded-2xl p-3 flex items-center justify-between gap-3 shadow-xs ${t2Style.bar}`}>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-black leading-tight truncate ${t2Style.text}`}>{team2Name}</p>
                  {team2Code && <p className={`text-xs font-bold ${t2Style.subText}`}>[{team2Code}]</p>}
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
                    onChange={(e) => onScoreInputChange(activeMatch.id, 0, 'p2', e.target.value)}
                    onBlur={onScoreBlur}
                    className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center text-center font-black text-sm outline-none transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                      !scores[0]?.inProgress && scores[0]?.p1 !== null && scores[0]?.p1 !== undefined && scores[0]?.p2 !== null && scores[0]?.p2 !== undefined && Number(scores[0].p2) >= gamesPerSet && Number(scores[0].p2) > Number(scores[0].p1)
                        ? t2Style.wonInput
                        : t2Style.input
                    }`}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className={`rounded-2xl p-3 flex items-center justify-between gap-3 shadow-xs ${t1Style.bar}`}>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-black leading-tight truncate ${t1Style.text}`}>{team1Name}</p>
                  {team1Code && <p className={`text-xs font-bold ${t1Style.subText}`}>[{team1Code}]</p>}
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
                      Number(setScore.p1) >= gamesPerSet &&
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
                        onChange={(e) => onScoreInputChange(activeMatch.id, setIdx, 'p1', e.target.value)}
                        onBlur={onScoreBlur}
                        className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center text-center font-black text-sm outline-none transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                          isSetWon ? t1Style.wonInput : t1Style.input
                        }`}
                      />
                    );
                  })}
                </div>
              </div>

              <div className={`rounded-2xl p-3 flex items-center justify-between gap-3 shadow-xs ${t2Style.bar}`}>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-black leading-tight truncate ${t2Style.text}`}>{team2Name}</p>
                  {team2Code && <p className={`text-xs font-bold ${t2Style.subText}`}>[{team2Code}]</p>}
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
                      Number(setScore.p2) >= gamesPerSet &&
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
                        onChange={(e) => onScoreInputChange(activeMatch.id, setIdx, 'p2', e.target.value)}
                        onBlur={onScoreBlur}
                        className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center text-center font-black text-sm outline-none transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                          isSetWon ? t2Style.wonInput : t2Style.input
                        }`}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          )}

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
              disabled={isReadOnly}
              onClick={() => onFinishCourtMatch(activeMatch.id)}
              className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-2xl text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95 transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none"
              title="Registrar placar final e liberar a quadra"
            >
              <Check size={14} />
              Finalizar partida
            </button>
          </div>
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
};
