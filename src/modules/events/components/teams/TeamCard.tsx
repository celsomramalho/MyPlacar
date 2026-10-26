import React from 'react';
import { Trophy, UserRound, Check, X, Clock } from 'lucide-react';
import type { TournamentPair, TournamentMatch, EventCategory } from '../../types';
import type { TeamStanding } from '../../domain/brackets';
import { BracketTeamStatsBlock } from '../BracketTeamStatsBlock';

export interface TeamCardProps {
  pair: TournamentPair;
  category?: EventCategory;
  standing?: TeamStanding;
  isChaveFinished?: boolean;
  hasCategoryMatches?: boolean;
  categoryMatches?: TournamentMatch[];
  pairsById?: Map<string, TournamentPair> | Record<string, TournamentPair>;
  allCategoryFinished?: boolean;
  finalMatch?: TournamentMatch;
  thirdMatch?: TournamentMatch;
  index?: number;
  isSelected?: boolean;
  canSelect?: boolean;
  canManage?: boolean;
  onToggleSelect?: (pair: TournamentPair) => void;
  canChangeBracket?: boolean;
  onToggleBracket?: (pair: TournamentPair) => void;
  onUndoPair?: (pairId: string) => void;
  isRanking?: boolean;
}

export const TeamCard: React.FC<TeamCardProps> = ({
  pair,
  category,
  standing,
  isChaveFinished = false,
  hasCategoryMatches = false,
  categoryMatches = [],
  pairsById,
  allCategoryFinished = false,
  finalMatch,
  thirdMatch,
  index = 0,
  isSelected = false,
  canSelect = false,
  canManage = false,
  onToggleSelect,
  canChangeBracket = false,
  onToggleBracket,
  onUndoPair,
  isRanking = false,
}) => {
  const getPair = (pairId?: string, embedded?: TournamentPair): TournamentPair | undefined => {
    if (embedded) return embedded;
    if (!pairId || !pairsById) return undefined;
    if (pairsById instanceof Map) return pairsById.get(pairId);
    return pairsById[pairId];
  };

  let finalPositionBadge: string | null = null;
  if (allCategoryFinished) {
    if (finalMatch?.winnerPairId === pair.id) finalPositionBadge = '🏆 Campeão';
    else if (finalMatch && (finalMatch.pair1Id === pair.id || finalMatch.pair2Id === pair.id))
      finalPositionBadge = '🥈 Vice-campeão';
    else if (thirdMatch?.winnerPairId === pair.id) finalPositionBadge = '🥉 3º lugar';
    else if (thirdMatch && (thirdMatch.pair1Id === pair.id || thirdMatch.pair2Id === pair.id))
      finalPositionBadge = '4º lugar';
  }

  const formatMatchScore = (match: TournamentMatch): string => {
    if (!match.result) return '';
    const isP1 = match.pair1Id === pair.id;
    const parts = match.result.trim().split(/[\s,]+/);
    return parts
      .map((part) => {
        const m = part.match(/(\d+)[\/xX\-](\d+)/);
        if (!m) return part;
        return isP1 ? `${m[1]} x ${m[2]}` : `${m[2]} x ${m[1]}`;
      })
      .join('  ');
  };

  const getOppName = (match: TournamentMatch): string => {
    const isP1 = match.pair1Id === pair.id;
    const opp = isP1
      ? match.pair2 || getPair(match.pair2Id)
      : match.pair1 || getPair(match.pair1Id);
    if (!opp) return 'A definir';
    return `${opp.p1.nickname || opp.p1.name} & ${opp.p2.nickname || opp.p2.name}`;
  };

  const semiMatch = categoryMatches.find(
    (m) =>
      m.phase === 'semifinal' &&
      m.status === 'finished' &&
      (m.pair1Id === pair.id || m.pair2Id === pair.id)
  );
  const wonSemi = semiMatch?.winnerPairId === pair.id;

  const nextMatch = categoryMatches.find(
    (m) =>
      (m.phase === 'final' || m.phase === '3lugar') &&
      m.status === 'finished' &&
      (m.pair1Id === pair.id || m.pair2Id === pair.id)
  );

  const catAbbr = category?.abbreviation || '';
  const code =
    pair.teamCode || `${String(pair.teamNumber || index + 1).padStart(3, '0')}${catAbbr ? ` - ${catAbbr}` : ''}`;

  return (
    <div
      onClick={() => canSelect && onToggleSelect?.(pair)}
      className={`rounded-2xl border bg-white p-4 shadow-sm transition-all ${
        canSelect ? 'cursor-pointer hover:border-slate-300' : ''
      } ${isSelected ? 'border-sky-500 ring-2 ring-sky-100 bg-sky-50/20' : 'border-slate-100'}`}
    >
      {/* Linha do Cabeçalho: Nomes à esquerda, Chave e Ações à direita */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {canSelect && (
              <div
                className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                  isSelected ? 'bg-sky-500 border-sky-600 text-white' : 'border-slate-300 bg-white'
                }`}
              >
                {isSelected && <Check size={12} className="stroke-[3]" />}
              </div>
            )}
            <p className="text-[15px] font-black text-slate-800 leading-tight">
              {pair.p1.nickname || pair.p1.name} & {pair.p2.nickname || pair.p2.name}
            </p>
            {finalPositionBadge && (
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-bold shrink-0 border ${
                  finalPositionBadge.includes('🏆')
                    ? 'bg-amber-100 text-amber-900 border-amber-300'
                    : finalPositionBadge.includes('🥈')
                    ? 'bg-slate-100 text-slate-600 border-slate-300'
                    : finalPositionBadge.includes('🥉')
                    ? 'bg-orange-100 text-orange-800 border-orange-300'
                    : 'bg-slate-50 text-slate-500 border-slate-200'
                }`}
              >
                {finalPositionBadge}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs font-bold text-slate-400 truncate">{code}</p>
        </div>

        {/* Lado Direito: Badge da Chave e Ação de Desfazer Time */}
        <div className="flex items-center gap-2 shrink-0 pt-0.5">
          {canChangeBracket && onToggleBracket ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleBracket(pair);
              }}
              title={`Trocar para Chave ${(pair.bracket ?? 1) === 1 ? 2 : 1}`}
              aria-label={`Chave ${pair.bracket ?? 1}. Trocar chave`}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold border shadow-xs transition-colors hover:ring-2 hover:ring-offset-1 ${
                (pair.bracket ?? 1) === 1
                  ? 'bg-emerald-50/70 text-emerald-700 border-emerald-200 hover:ring-emerald-200'
                  : 'bg-blue-50/70 text-blue-700 border-blue-200 hover:ring-blue-200'
              }`}
            >
              Chave {pair.bracket ?? 1}
            </button>
          ) : (
            <span
              className={`rounded-xl px-3 py-1.5 text-xs font-bold border shadow-xs ${
              (pair.bracket ?? 1) === 1
                ? 'bg-emerald-50/70 text-emerald-700 border-emerald-200'
                : 'bg-blue-50/70 text-blue-700 border-blue-200'
              }`}
            >
              Chave {pair.bracket ?? 1}
            </span>
          )}
          {canManage && onUndoPair && !categoryMatches.some(
            (m) => m.status === 'finished' && (m.pair1Id === pair.id || m.pair2Id === pair.id)
          ) && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onUndoPair(pair.id);
              }}
              className="p-1 text-slate-300 hover:text-emerald-600 rounded-lg hover:bg-emerald-50 transition-colors"
              title="Desfazer time"
            >
              <UserRound size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Informações da fase de chaves — ocupa 100% da largura do card */}
      {hasCategoryMatches && (
        <div className="mt-2.5 pt-2 border-t border-slate-100/90 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-1 text-xs font-bold text-slate-500">
            <span className="text-xs font-bold text-slate-500">Fase de chaves:</span>
            {standing && standing.played > 0 && (
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-bold shrink-0 border ${
                  standing.rank === 1
                    ? 'bg-amber-100 text-amber-900 border-amber-300'
                    : standing.rank === 2
                    ? 'bg-sky-100 text-sky-900 border-sky-300'
                    : 'bg-slate-100 text-slate-600 border-slate-200'
                }`}
                title={
                  isChaveFinished
                    ? `${standing.rank}º lugar - ${
                        standing.rank <= 2 ? 'Classificado para semifinal' : 'Fase de chaves finalizada'
                      }`
                    : `${standing.rank}º lugar parcial`
                }
              >
                {standing.rank === 1 ? '🥇 1º lugar' : standing.rank === 2 ? '🥈 2º lugar' : `${standing.rank}º lugar`}
                {isChaveFinished && (standing.rank === 1 || standing.rank === 2) && ' (Classificado)'}
              </span>
            )}
          </div>

          {/* Tabela de estatísticas com largura total */}
          {standing && standing.played > 0 && <BracketTeamStatsBlock standing={standing} />}

          {/* Placar da semifinal */}
          {semiMatch && (
            <div className="pt-1 space-y-0.5">
              <p className="text-xs font-bold text-slate-400">Semifinal:</p>
              <p
                className={`text-xs font-bold leading-snug ${
                  wonSemi ? 'text-emerald-700' : 'text-rose-700'
                }`}
              >
                {getOppName(semiMatch)}{' '}
                <strong>{formatMatchScore(semiMatch)}</strong>
                <span className="ml-1 font-black">{wonSemi ? '✓' : '✗'}</span>
              </p>
            </div>
          )}

          {/* Placar da final ou 3º lugar */}
          {nextMatch && (
            <div className="pt-1 space-y-0.5">
              <p className="text-xs font-bold text-slate-400">
                {nextMatch.phase === 'final' ? 'Final:' : '3º lugar:'}
              </p>
              <p
                className={`text-xs font-bold leading-snug ${
                  nextMatch.winnerPairId === pair.id ? 'text-emerald-700' : 'text-rose-700'
                }`}
              >
                {getOppName(nextMatch)}{' '}
                <strong>{formatMatchScore(nextMatch)}</strong>
                <span className="ml-1 font-black">
                  {nextMatch.winnerPairId === pair.id ? '✓' : '✗'}
                </span>
              </p>
            </div>
          )}
        </div>
      )}

      {/* Histórico de partidas — apenas para Ranking */}
      {isRanking && (() => {
        const teamMatches = categoryMatches.filter(
          (m) => m.pair1Id === pair.id || m.pair2Id === pair.id
        );
        if (teamMatches.length === 0) return null;
        const finishedMatches = teamMatches.filter((m) => m.status === 'finished');
        const wins = finishedMatches.filter((m) => m.winnerPairId === pair.id).length;
        const losses = finishedMatches.length - wins;
        const hasLive = teamMatches.some((m) => m.status === 'live');
        return (
          <div className="mt-2.5 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] font-black text-slate-400 tracking-wide">Histórico de partidas</p>
              <div className="flex items-center gap-1.5">
                {hasLive && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-black text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-lg animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                    Ao vivo
                  </span>
                )}
                {finishedMatches.length > 0 && (
                  <span className="text-[10px] font-black text-slate-500 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-lg">
                    {wins}V {losses}D
                  </span>
                )}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200/80 overflow-hidden divide-y divide-slate-200/60">
              {teamMatches.map((m) => {
                const isFinished = m.status === 'finished';
                const isLive = m.status === 'live';
                const isWaiting = !isFinished && !isLive;
                const isWinner = isFinished && m.winnerPairId === pair.id;

                const isP1 = m.pair1Id === pair.id;
                const resultParts = (m.result || '').split('/');
                const myResultScore = isP1 ? resultParts[0] : resultParts[1];
                const oppResultScore = isP1 ? resultParts[1] : resultParts[0];

                const s1 = m.scores?.[0]?.p1;
                const s2 = m.scores?.[0]?.p2;
                const myLiveScore = isP1 ? s1 : s2;
                const oppLiveScore = isP1 ? s2 : s1;

                let rowBg = 'bg-slate-50/60 hover:bg-slate-50';
                if (isLive) {
                  rowBg = 'bg-red-50/60 hover:bg-red-50';
                } else if (isFinished) {
                  rowBg = isWinner ? 'bg-emerald-50/60 hover:bg-emerald-50' : 'bg-red-50/50 hover:bg-red-50';
                }

                return (
                  <div
                    key={m.id}
                    onClick={(e) => e.stopPropagation()}
                    className={`flex items-center justify-between gap-2 px-2.5 py-1.5 text-[11px] transition-colors ${rowBg}`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      {isLive ? (
                        <>
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
                          <span className="font-black shrink-0 text-red-600">
                            Ao vivo
                          </span>
                        </>
                      ) : isWaiting ? (
                        <>
                          <Clock size={11} className="text-slate-400 shrink-0" />
                          <span className="font-black shrink-0 text-slate-500">
                            Aguardando
                          </span>
                        </>
                      ) : (
                        <>
                          {isWinner ? (
                            <Trophy size={11} className="text-emerald-600 shrink-0" />
                          ) : (
                            <X size={11} className="text-red-400 shrink-0" />
                          )}
                          <span className={`font-black shrink-0 ${isWinner ? 'text-emerald-700' : 'text-red-500'}`}>
                            {isWinner ? 'Vitória' : 'Derrota'}
                          </span>
                        </>
                      )}
                      <span className="text-slate-500 font-bold truncate">
                        vs {getOppName(m)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isFinished ? (
                        <span className="font-black text-slate-700">
                          {myResultScore || '?'} x {oppResultScore || '?'}
                        </span>
                      ) : isLive ? (
                        <span className="font-black text-red-600">
                          {myLiveScore !== undefined && oppLiveScore !== undefined && myLiveScore !== null && oppLiveScore !== null
                            ? `${myLiveScore} x ${oppLiveScore}`
                            : m.result || '0 x 0'}
                        </span>
                      ) : (
                        <span className="font-bold text-slate-400 text-[10px]">
                          {m.court ? `Quadra ${m.court}` : 'Aguardando'}
                        </span>
                      )}
                      {m.matchDate && (
                        <span className="text-slate-400 font-bold text-[10px]">
                          {new Date(m.matchDate + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
};
