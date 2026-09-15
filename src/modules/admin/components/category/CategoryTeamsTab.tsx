import React from 'react';
import { Shuffle } from 'lucide-react';
import type { EventCategory, TournamentPair, TournamentMatch } from '@modules/events/types';
import type { TeamStanding } from '@modules/events/services/matchProgression';
import { TeamCard } from '@modules/events/components/teams/TeamCard';

export interface CategoryTeamsTabProps {
  category: EventCategory;
  categoryPairs: TournamentPair[];
  categoryMatches: TournamentMatch[];
  pairsById: Record<string, TournamentPair>;
  bracketOneList: TournamentPair[];
  bracketTwoList: TournamentPair[];
  b1StandingsMap: Map<string, TeamStanding>;
  b2StandingsMap: Map<string, TeamStanding>;
  b1Finished: boolean;
  b2Finished: boolean;
  b1MatchesCount: number;
  b2MatchesCount: number;
  b1FinishedCount: number;
  b2FinishedCount: number;
  hasCategoryMatches: boolean;
  isRanking: boolean;
  isSuper8: boolean;
  isReadOnly: boolean;
  isSystemDraw: boolean;
  onRandomizeCategoryDraw: () => void;
  onUndoPair: (pairId: string) => void;
  onToggleTeamBracket?: (pair: TournamentPair) => void;
  onMoveTeamPosition?: (pair: TournamentPair, direction: 'up' | 'down') => void;
  selectedTeamIds?: Set<string>;
  canSelectTeams?: boolean;
  onToggleTeamSelection?: (pair: TournamentPair) => void;
}

export const CategoryTeamsTab: React.FC<CategoryTeamsTabProps> = ({
  category,
  categoryPairs,
  categoryMatches,
  pairsById,
  bracketOneList,
  bracketTwoList,
  b1StandingsMap,
  b2StandingsMap,
  b1Finished,
  b2Finished,
  b1MatchesCount,
  b2MatchesCount,
  b1FinishedCount,
  b2FinishedCount,
  hasCategoryMatches,
  isRanking,
  isSuper8,
  isReadOnly,
  isSystemDraw,
  onRandomizeCategoryDraw,
  onUndoPair,
  onToggleTeamBracket,
  onMoveTeamPosition,
  selectedTeamIds,
  canSelectTeams,
  onToggleTeamSelection,
}) => {
  return (
    <section className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden animate-in fade-in">
      <div className="p-5 border-b border-slate-100 flex flex-col gap-3.5">
        <div>
          <h3 className="text-base font-black text-slate-800">Times ({category.name})</h3>
          <p className="text-xs text-slate-400 font-bold mt-0.5">
            {isSuper8
              ? 'No Super 8, as duplas são formadas automaticamente a cada partida.'
              : isRanking
              ? 'Classificação do ranking e times formados nesta categoria.'
              : hasCategoryMatches
              ? 'Times formados (chaves e posições bloqueadas pois as partidas já foram geradas).'
              : 'Defina as chaves e use as setas ▲/▼ para ordenar a sequência dos confrontos.'}
          </p>
        </div>

        {!isReadOnly && !isRanking && !isSuper8 && !hasCategoryMatches && isSystemDraw && categoryPairs.length >= 2 && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onRandomizeCategoryDraw}
              className="flex items-center justify-center gap-2 border-2 border-emerald-500 text-emerald-600 bg-white hover:bg-emerald-50 px-4 py-2.5 rounded-2xl text-xs font-black shadow-xs transition-all active:scale-95 shrink-0 cursor-pointer"
              title="Sortear aleatoriamente os times entre a Chave 1 e a Chave 2 e suas posições"
            >
              <Shuffle size={16} className="text-emerald-500" />
              <span>Sortear chaves</span>
            </button>
          </div>
        )}
      </div>

      {isSuper8 ? (
        categoryMatches.length === 0 ? (
          <div className="p-10 text-center text-sm font-bold text-slate-400">
            Nenhuma partida gerada ainda. As duplas são formadas automaticamente ao gerar as partidas na aba Partidas.
          </div>
        ) : (
          <div className="flex flex-col gap-2 p-4">
            {categoryMatches.map((m, i) => {
              const p1 = m.pair1 || (m.pair1Id ? pairsById[m.pair1Id] : undefined);
              const p2 = m.pair2 || (m.pair2Id ? pairsById[m.pair2Id] : undefined);
              const getName = (p: typeof p1) =>
                p ? `${p.p1.nickname || p.p1.name} & ${p.p2.nickname || p.p2.name}` : 'A definir';
              return (
                <div
                  key={m.id}
                  className="rounded-2xl border border-slate-100 bg-slate-50 p-3.5 flex items-center gap-3"
                >
                  <span className="text-[10px] font-black text-slate-400 w-5 text-center shrink-0">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-slate-700 truncate">{getName(p1)}</p>
                    <p className="text-[10px] font-bold text-slate-400 mt-0.5">vs</p>
                    <p className="text-xs font-black text-slate-700 truncate">{getName(p2)}</p>
                  </div>
                  {m.status === 'finished' && m.result && (
                    <span className="text-[11px] font-black text-slate-600 bg-white border border-slate-200 px-2 py-1 rounded-lg shrink-0">
                      {m.result}
                    </span>
                  )}
                  {m.status === 'finished' && (
                    <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-lg shrink-0">
                      ✓ Finalizada
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : isRanking ? (
        categoryPairs.length === 0 ? (
          <div className="p-10 text-center text-sm font-bold text-slate-400">
            Nenhum time formado no momento. Na aba "Inscritos", selecione 2 atletas disponíveis para formar um time para a partida.
          </div>
        ) : (
          <div className="flex flex-col gap-3 p-4">
            <p className="text-[11px] font-bold text-slate-400">
              Selecione 2 times para formar partida ou desfazer confronto existente.
            </p>
            {categoryPairs.map((pair, index) => (
              <TeamCard
                key={pair.id}
                pair={pair}
                category={category}
                hasCategoryMatches={hasCategoryMatches}
                categoryMatches={categoryMatches}
                pairsById={pairsById}
                index={index}
                isRanking={isRanking}
                canManage={!isReadOnly}
                isSelected={selectedTeamIds?.has(pair.id)}
                canSelect={canSelectTeams}
                onToggleSelect={() => onToggleTeamSelection?.(pair)}
                onUndoPair={onUndoPair}
              />
            ))}
          </div>
        )
      ) : categoryPairs.length === 0 ? (
        <div className="p-10 text-center text-sm font-bold text-slate-400">Nenhum time formado nesta categoria.</div>
      ) : (
        <div className="flex flex-col gap-4 p-4">
          {[
            {
              label: 'Chave 1',
              list: bracketOneList,
              standingsMap: b1StandingsMap,
              isFinished: b1Finished,
              matchesCount: b1MatchesCount,
              finishedCount: b1FinishedCount,
            },
            {
              label: 'Chave 2',
              list: bracketTwoList,
              standingsMap: b2StandingsMap,
              isFinished: b2Finished,
              matchesCount: b2MatchesCount,
              finishedCount: b2FinishedCount,
            },
          ].map((bracket) => (
            <div key={bracket.label} className="rounded-2xl border border-slate-100 bg-slate-50 p-3.5 space-y-3">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h4 className="text-xs font-black text-slate-800">{bracket.label}</h4>
                  {hasCategoryMatches && bracket.matchesCount > 0 && (
                    <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                      {bracket.isFinished
                        ? '✅ 1ª Fase finalizada'
                        : `⏱️ ${bracket.finishedCount} de ${bracket.matchesCount} partidas finalizadas`}
                    </p>
                  )}
                </div>
                <span className="text-[10px] font-black text-slate-400 self-start sm:self-auto">
                  {bracket.list.length} times
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {bracket.list.length === 0 ? (
                  <p className="py-6 text-center text-xs font-bold text-slate-300">Sem times nesta chave.</p>
                ) : (
                  bracket.list.map((pair, index) => (
                    <div key={pair.id} className="space-y-1">
                      <TeamCard
                        pair={pair}
                        category={category}
                        standing={bracket.standingsMap.get(pair.id)}
                        isChaveFinished={bracket.isFinished}
                        hasCategoryMatches={hasCategoryMatches}
                        categoryMatches={categoryMatches}
                        pairsById={pairsById}
                        index={index}
                        canManage={!isReadOnly}
                        isSelected={selectedTeamIds?.has(pair.id)}
                        canSelect={canSelectTeams}
                        onToggleSelect={() => onToggleTeamSelection?.(pair)}
                        onUndoPair={onUndoPair}
                      />
                      {!hasCategoryMatches && !isReadOnly && (
                        <div className="flex items-center justify-between px-3 py-1 bg-white/80 border border-slate-200 rounded-xl text-xs">
                          {onToggleTeamBracket && (
                            <button
                              type="button"
                              onClick={() => onToggleTeamBracket(pair)}
                              className="text-[10px] font-black text-sky-600 hover:text-sky-800 cursor-pointer"
                            >
                              Alternar para Chave {(pair.bracket ?? 1) === 1 ? 2 : 1}
                            </button>
                          )}
                          {onMoveTeamPosition && (
                            <div className="ml-auto flex items-center gap-1 font-bold text-[10px] text-slate-400">
                              <span>Mover:</span>
                              <button
                                type="button"
                                disabled={index === 0}
                                onClick={() => onMoveTeamPosition(pair, 'up')}
                                className="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded disabled:opacity-30 cursor-pointer"
                                title="Subir posição"
                              >
                                ▲
                              </button>
                              <button
                                type="button"
                                disabled={index === bracket.list.length - 1}
                                onClick={() => onMoveTeamPosition(pair, 'down')}
                                className="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded disabled:opacity-30 cursor-pointer"
                                title="Descer posição"
                              >
                                ▼
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
