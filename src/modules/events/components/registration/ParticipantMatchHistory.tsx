import React, { useState } from 'react';
import { Trophy, X, Play, Clock, ChevronDown, ChevronUp, Swords, UsersRound, Calendar, MapPin } from 'lucide-react';
import type { TournamentEntry, TournamentMatch, TournamentPair, EventCategory } from '../../types';
import { parseScoresFromMatch } from '../../services/matchProgression';
import { formatMatchNumber, getPhaseLabel } from '../../services/matchGenerator';

export interface ParticipantMatchHistoryProps {
  entry: TournamentEntry;
  matches: TournamentMatch[];
  categories?: EventCategory[];
  category?: EventCategory;
  pairsById?: Record<string, TournamentPair>;
  allPairs?: TournamentPair[];
  defaultExpanded?: boolean;
}

export interface AthleteMatchDetail {
  match: TournamentMatch;
  isPair1: boolean;
  myPair?: TournamentPair;
  oppPair?: TournamentPair;
  partner?: Partial<TournamentEntry>;
  partnerName?: string;
  opponents: Partial<TournamentEntry>[];
  opponentsName: string;
  isFinished: boolean;
  isInProgress: boolean;
  isWaiting: boolean;
  isWinner: boolean;
  scoreDisplay: string;
  phaseLabel: string;
  matchCode: string;
}

const normalizeStr = (s?: string | null) => (s || '').toLowerCase().trim();

export const isAthleteMatch = (
  entry: TournamentEntry,
  athlete?: Partial<TournamentEntry> | null
): boolean => {
  if (!athlete) return false;
  const eEmail = normalizeStr(entry.email);
  const aEmail = normalizeStr(athlete.email);
  if (eEmail && aEmail && eEmail === aEmail) return true;

  const ePin = (entry.pin || '').toUpperCase().trim();
  const aPin = (athlete.pin || '').toUpperCase().trim();
  if (ePin && aPin && ePin === aPin) return true;

  const eName = normalizeStr(entry.name);
  const aName = normalizeStr(athlete.name);
  if (eName && aName && eName === aName) return true;

  const eNick = normalizeStr(entry.nickname);
  const aNick = normalizeStr(athlete.nickname);
  if (eNick && aNick && eNick === aNick) return true;

  return false;
};

export const isAthleteInPair = (
  entry: TournamentEntry,
  pair?: TournamentPair | null
): boolean => {
  if (!pair) return false;
  return isAthleteMatch(entry, pair.p1) || isAthleteMatch(entry, pair.p2);
};

export const getMatchPair = (
  match: TournamentMatch,
  side: 1 | 2,
  pairsById?: Record<string, TournamentPair>,
  allPairs?: TournamentPair[]
): TournamentPair | undefined => {
  if (side === 1) {
    if (match.pair1) return match.pair1;
    if (match.pair1Id) {
      if (pairsById && pairsById[match.pair1Id]) return pairsById[match.pair1Id];
      if (allPairs) return allPairs.find((p) => p.id === match.pair1Id);
    }
  } else {
    if (match.pair2) return match.pair2;
    if (match.pair2Id) {
      if (pairsById && pairsById[match.pair2Id]) return pairsById[match.pair2Id];
      if (allPairs) return allPairs.find((p) => p.id === match.pair2Id);
    }
  }
  return undefined;
};

export const formatFriendlyPhaseName = (phase?: string): string => {
  if (!phase) return '';
  const lower = phase.toLowerCase().trim();
  if (lower === 'chave1' || lower === 'chave 1') return 'Chave 1';
  if (lower === 'chave2' || lower === 'chave 2') return 'Chave 2';
  if (lower === 'semifinal' || lower === 'semi') return 'Semifinal';
  if (lower === 'final') return 'Final';
  if (lower === '3lugar' || lower === '3º lugar' || lower === 'terceiro_lugar') return '3º Lugar';
  if (lower.startsWith('rodada')) {
    const num = lower.replace(/\D/g, '');
    return num ? `Rodada ${num}` : phase;
  }
  if (lower.startsWith('super8d_fase1_')) {
    const parts = lower.replace('super8d_fase1_', '').split('_r');
    const group = parts[0]?.toUpperCase() || '';
    const round = parts[1] || '';
    return `Grupo ${group}${round ? ` · R${round}` : ''}`;
  }
  if (lower.startsWith('super8d_semi_ouro')) {
    const n = lower.replace('super8d_semi_ouro_', '');
    return `Semi Ouro ${n}`;
  }
  if (lower.startsWith('super8d_semi_prata')) {
    const n = lower.replace('super8d_semi_prata_', '');
    return `Semi Prata ${n}`;
  }
  if (lower.startsWith('super8d_final_ouro')) return 'Final Ouro';
  if (lower.startsWith('super8d_final_prata')) return 'Final Prata';
  if (lower.startsWith('super8d_3lugar_ouro')) return '3º Lugar Ouro';
  if (lower.startsWith('super8d_3lugar_prata')) return '3º Lugar Prata';
  return getPhaseLabel(phase) || phase;
};

export const extractAthleteMatchDetail = (
  entry: TournamentEntry,
  match: TournamentMatch,
  pairsById?: Record<string, TournamentPair>,
  allPairs?: TournamentPair[]
): AthleteMatchDetail | null => {
  const p1 = getMatchPair(match, 1, pairsById, allPairs);
  const p2 = getMatchPair(match, 2, pairsById, allPairs);

  const inPair1 = isAthleteInPair(entry, p1);
  const inPair2 = isAthleteInPair(entry, p2);

  if (!inPair1 && !inPair2) return null;

  const isPair1 = inPair1;
  const myPair = isPair1 ? p1 : p2;
  const oppPair = isPair1 ? p2 : p1;

  // Parceiro
  let partner: Partial<TournamentEntry> | undefined;
  if (myPair) {
    if (isAthleteMatch(entry, myPair.p1) && myPair.p2 && !isAthleteMatch(entry, myPair.p2)) {
      partner = myPair.p2;
    } else if (isAthleteMatch(entry, myPair.p2) && myPair.p1 && !isAthleteMatch(entry, myPair.p1)) {
      partner = myPair.p1;
    }
  }
  const partnerName = partner ? (partner.nickname || partner.name) : undefined;

  // Adversários
  const opponents: Partial<TournamentEntry>[] = [];
  if (oppPair) {
    if (oppPair.p1) opponents.push(oppPair.p1);
    if (oppPair.p2) opponents.push(oppPair.p2);
  }
  let opponentsName = 'A definir';
  if (opponents.length === 2) {
    const opp1 = opponents[0].nickname || opponents[0].name || 'Atleta 1';
    const opp2 = opponents[1].nickname || opponents[1].name || 'Atleta 2';
    opponentsName = `${opp1} & ${opp2}`;
  } else if (opponents.length === 1) {
    opponentsName = opponents[0].nickname || opponents[0].name || 'Adversário';
  } else if (oppPair?.teamCode) {
    opponentsName = oppPair.teamCode;
  }

  // Status & Scores
  const isFinished = match.status === 'finished';
  const isInProgress = match.status === 'in_progress';
  const isWaiting = !isFinished && !isInProgress;

  const { g1, g2, s1, s2 } = parseScoresFromMatch(match);
  let isWinner = false;
  if (isFinished) {
    if (match.winnerPairId) {
      if (myPair && match.winnerPairId === myPair.id) {
        isWinner = true;
      } else if (isPair1 && match.winnerPairId === match.pair1Id) {
        isWinner = true;
      } else if (!isPair1 && match.winnerPairId === match.pair2Id) {
        isWinner = true;
      }
    } else {
      isWinner = isPair1 ? (g1 > g2 || s1 > s2) : (g2 > g1 || s2 > s1);
    }
  }

  // Display do Placar
  let scoreDisplay = '';
  if (match.scores && Array.isArray(match.scores) && match.scores.length > 0) {
    const validScores = match.scores.filter((s) => s && s.p1 !== null && s.p2 !== null);
    if (validScores.length > 0) {
      scoreDisplay = validScores
        .map((s) => `${isPair1 ? s.p1 : s.p2} x ${isPair1 ? s.p2 : s.p1}`)
        .join(', ');
    }
  }
  if (!scoreDisplay && match.result) {
    const parts = match.result.trim().split(/[\s,]+/);
    scoreDisplay = parts
      .map((p) => {
        const m = p.match(/(\d+)[\/xX\-](\d+)/);
        if (m) {
          return `${isPair1 ? m[1] : m[2]} x ${isPair1 ? m[2] : m[1]}`;
        }
        return p;
      })
      .join(', ');
  }
  if (!scoreDisplay) {
    if (isFinished) {
      scoreDisplay = `${isPair1 ? g1 : g2} x ${isPair1 ? g2 : g1}`;
    } else if (isInProgress) {
      scoreDisplay = g1 > 0 || g2 > 0 ? `${isPair1 ? g1 : g2} x ${isPair1 ? g2 : g1}` : 'Ao vivo';
    } else {
      scoreDisplay = 'Aguardando';
    }
  }

  const rawPhase = match.phase || '';
  const phaseLabel = formatFriendlyPhaseName(rawPhase);
  const matchCode = match.matchCode || formatMatchNumber(match.matchNumber || 0);

  return {
    match,
    isPair1,
    myPair,
    oppPair,
    partner,
    partnerName,
    opponents,
    opponentsName,
    isFinished,
    isInProgress,
    isWaiting,
    isWinner,
    scoreDisplay,
    phaseLabel,
    matchCode,
  };
};

export const ParticipantMatchHistory: React.FC<ParticipantMatchHistoryProps> = ({
  entry,
  matches,
  categories,
  category,
  pairsById,
  allPairs,
  defaultExpanded = true,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const athleteMatches = React.useMemo(() => {
    if (!matches || matches.length === 0) return [];
    const list: AthleteMatchDetail[] = [];
    matches.forEach((m) => {
      const detail = extractAthleteMatchDetail(entry, m, pairsById, allPairs);
      if (detail) {
        list.push(detail);
      }
    });

    // Ordena partidas: por número da partida ou ordem da rodada
    list.sort((a, b) => {
      const numA = a.match.matchNumber || 0;
      const numB = b.match.matchNumber || 0;
      if (numA !== numB) return numA - numB;
      return (a.match.id || '').localeCompare(b.match.id || '');
    });

    return list;
  }, [entry, matches, pairsById, allPairs]);

  // Agrupa as partidas por categoria
  const matchesByCategory = React.useMemo(() => {
    if (athleteMatches.length === 0) return [];

    const map = new Map<string, {
      categoryId: string;
      categoryName: string;
      categoryAbbreviation?: string;
      matches: AthleteMatchDetail[];
    }>();

    athleteMatches.forEach((detail) => {
      const catId = detail.match.categoryId || category?.id || 'default';
      const catObj = categories?.find((c) => c.id === catId) || (category?.id === catId ? category : undefined);
      const categoryName = catObj?.name || (catId !== 'default' ? 'Categoria' : 'Partidas do Evento');
      const categoryAbbreviation = catObj?.abbreviation;

      if (!map.has(catId)) {
        map.set(catId, {
          categoryId: catId,
          categoryName,
          categoryAbbreviation,
          matches: [],
        });
      }
      map.get(catId)!.matches.push(detail);
    });

    return Array.from(map.values());
  }, [athleteMatches, categories, category]);

  if (athleteMatches.length === 0) {
    return null;
  }

  const finishedMatches = athleteMatches.filter((m) => m.isFinished);
  const inProgressMatches = athleteMatches.filter((m) => m.isInProgress);
  const totalWins = finishedMatches.filter((m) => m.isWinner).length;
  const totalLosses = finishedMatches.length - totalWins;

  return (
    <div className="mt-2.5 pt-2.5 border-t border-slate-100/90 space-y-2">
      {/* Botão / Cabeçalho do Histórico */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsExpanded(!isExpanded);
        }}
        className="w-full flex items-center justify-between gap-2 p-1.5 -mx-1.5 rounded-xl hover:bg-slate-100/70 transition-all text-left cursor-pointer group"
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
          <Swords size={13} className="text-slate-500 shrink-0 group-hover:text-emerald-600 transition-colors" />
          <span className="text-[11px] font-black text-slate-700 tracking-tight">
            Histórico de partidas ({athleteMatches.length})
          </span>
          {matchesByCategory.length > 1 && (
            <span className="text-[10px] font-bold text-slate-400">
              ({matchesByCategory.length} categorias)
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {finishedMatches.length > 0 && (
            <span className="text-[10px] font-black text-slate-600 bg-slate-100 border border-slate-200/80 px-2 py-0.5 rounded-md">
              <strong className="text-emerald-700 font-black">{totalWins}V</strong>{' '}
              <strong className="text-rose-600 font-black">{totalLosses}D</strong>
            </span>
          )}

          {inProgressMatches.length > 0 && (
            <span className="text-[10px] font-black text-sky-700 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-md animate-pulse flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
              {inProgressMatches.length} ao vivo
            </span>
          )}

          <div className="text-slate-400 group-hover:text-slate-700 transition-colors">
            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
        </div>
      </button>

      {/* Lista de Partidas Separadas por Categoria */}
      {isExpanded && (
        <div className="space-y-2.5">
          {matchesByCategory.map((catGroup) => {
            const catFinished = catGroup.matches.filter((m) => m.isFinished);
            const catWins = catFinished.filter((m) => m.isWinner).length;
            const catLosses = catFinished.length - catWins;

            return (
              <div
                key={catGroup.categoryId}
                className="rounded-2xl border border-slate-200/80 overflow-hidden bg-white shadow-2xs"
              >
                {/* Cabeçalho da Categoria */}
                <div className="bg-slate-50/90 px-3 py-1.5 border-b border-slate-200/60 flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-wide">
                      Categoria:
                    </span>
                    <span className="text-[11px] font-black text-slate-800 truncate">
                      {catGroup.categoryName}
                    </span>
                    {catGroup.categoryAbbreviation && (
                      <span className="bg-slate-200 text-slate-700 font-black px-1.5 py-0.2 rounded text-[9px]">
                        {catGroup.categoryAbbreviation}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 shrink-0">
                    <span>{catGroup.matches.length} {catGroup.matches.length === 1 ? 'jogo' : 'jogos'}</span>
                    {catFinished.length > 0 && (
                      <span className="text-[9px] font-black bg-white border border-slate-200 px-1.5 py-0.2 rounded text-slate-600">
                        {catWins}V {catLosses}D
                      </span>
                    )}
                  </div>
                </div>

                {/* Jogos da Categoria */}
                <div className="divide-y divide-slate-100">
                  {catGroup.matches.map((detail) => {
                    const {
                      match,
                      partnerName,
                      opponentsName,
                      isFinished,
                      isInProgress,
                      isWinner,
                      scoreDisplay,
                      phaseLabel,
                      matchCode,
                    } = detail;

                    return (
                      <div
                        key={match.id}
                        onClick={(e) => e.stopPropagation()}
                        className={`p-2.5 transition-colors text-xs ${
                          isFinished
                            ? isWinner
                              ? 'bg-emerald-50/30 hover:bg-emerald-50/60'
                              : 'bg-rose-50/25 hover:bg-rose-50/50'
                            : isInProgress
                            ? 'bg-sky-50/50 hover:bg-sky-50/80 ring-1 ring-inset ring-sky-300'
                            : 'bg-white hover:bg-slate-50'
                        }`}
                      >
                        {/* Linha 1: Fase / Código + Badge de Resultado + Placar */}
                        <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                          <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                            {phaseLabel && (
                              <span className="text-[10px] font-black text-slate-700 bg-slate-100 border border-slate-200/70 px-2 py-0.5 rounded-md shrink-0">
                                {phaseLabel}
                              </span>
                            )}

                            {matchCode && (
                              <span className="text-[10px] font-mono font-bold text-slate-400">
                                #{matchCode}
                              </span>
                            )}

                            {isFinished ? (
                              <span
                                className={`inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-md border ${
                                  isWinner
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                    : 'bg-rose-100 text-rose-800 border-rose-200'
                                }`}
                              >
                                {isWinner ? <Trophy size={10} className="shrink-0 text-emerald-700" /> : <X size={10} className="shrink-0 text-rose-600" />}
                                {isWinner ? 'Vitória' : 'Derrota'}
                              </span>
                            ) : isInProgress ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-md bg-sky-100 text-sky-800 border border-sky-200">
                                <Play size={10} className="fill-sky-700 text-sky-700" />
                                Ao vivo
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 border border-slate-200">
                                <Clock size={10} />
                                Aguardando
                              </span>
                            )}
                          </div>

                          {/* Placar em Destaque */}
                          <div className="shrink-0 font-mono font-black text-xs text-slate-800 bg-white/80 border border-slate-200/70 px-2 py-0.5 rounded-md shadow-2xs">
                            {scoreDisplay}
                          </div>
                        </div>

                        {/* Linha 2: Informações de Parceiro e Adversários */}
                        <div className="flex flex-col gap-0.5 pt-0.5 text-[11px]">
                          {partnerName && (
                            <div className="flex items-center gap-1 text-slate-600 font-bold">
                              <UsersRound size={11} className="text-slate-400 shrink-0" />
                              <span>Com:</span>
                              <span className="font-black text-slate-800">{partnerName}</span>
                            </div>
                          )}

                          <div className="flex items-center gap-1 text-slate-600 font-bold truncate">
                            <span className="text-slate-400 font-black">vs</span>
                            <span className="font-black text-slate-800 truncate">{opponentsName}</span>
                          </div>

                          {(match.court || match.matchDate) && (
                            <div className="flex items-center gap-2 pt-0.5 text-[10px] text-slate-400 font-bold">
                              {match.court && (
                                <span className="flex items-center gap-0.5">
                                  <MapPin size={9} /> {match.court}
                                </span>
                              )}
                              {match.matchDate && (
                                <span className="flex items-center gap-0.5">
                                  <Calendar size={9} />
                                  {new Date(match.matchDate + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
