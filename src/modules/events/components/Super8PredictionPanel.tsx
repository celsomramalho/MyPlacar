import React, { useMemo } from 'react';
import { ChevronDown, Sparkles, Star, Trophy } from 'lucide-react';
import type {
  EventCategory,
  PlayerStanding,
  Super8StandingsOptions,
  TournamentEntry,
  TournamentMatch,
  TournamentPair,
  TournamentEvent,
} from '../types';
import { calculateSuper8Prediction, canUseSuper8Predictor, getPredictorEntryKey } from '../services/super8Predictor';

interface Props {
  event: TournamentEvent;
  category: EventCategory;
  entries: TournamentEntry[];
  matches: TournamentMatch[];
  pairsById: Record<string, TournamentPair>;
  standings: PlayerStanding[];
  standingsOptions: Super8StandingsOptions;
  isSevenGamesFormat: boolean;
  enabled: boolean;
  accessMessage?: string;
  premiumAthleteEmail?: string;
  premiumAthletePin?: string;
}

const athleteName = (entry?: TournamentEntry) => entry?.nickname || entry?.name || 'Atleta';
const formatSkill = (value: number) => value.toFixed(1);
const isPremiumEntry = (
  entry: TournamentEntry,
  email?: string,
  pin?: string
) => Boolean(
  (email && entry.email?.trim().toLowerCase() === email.trim().toLowerCase()) ||
  (pin && entry.pin?.trim().toUpperCase() === pin.trim().toUpperCase())
);

const podiumRankClass = (rank?: number) => {
  if (rank === 1) return 'text-amber-600';
  if (rank === 2) return 'text-slate-500';
  if (rank === 3) return 'text-orange-700';
  if (rank !== undefined && rank >= 4 && rank <= 8) return 'text-indigo-600';
  return 'text-slate-400';
};

const RankName: React.FC<{
  entry: TournamentEntry;
  ranks: Map<string, number | undefined>;
  premiumAthleteEmail?: string;
  premiumAthletePin?: string;
}> = ({ entry, ranks, premiumAthleteEmail, premiumAthletePin }) => {
  const rank = ranks.get(getPredictorEntryKey(entry));
  const isPremiumAthlete = isPremiumEntry(entry, premiumAthleteEmail, premiumAthletePin);
  return (
    <span className={`font-black ${isPremiumAthlete ? 'text-blue-700' : 'text-slate-800'}`}>
      {athleteName(entry)}{isPremiumAthlete && <Star size={10} fill="currentColor" className="ml-1 inline-block text-blue-600" />}{' '}
      <span className={podiumRankClass(rank)}>(#{rank ?? '—'})</span>
    </span>
  );
};

export const Super8PredictionPanel: React.FC<Props> = ({
  event,
  category,
  entries,
  matches,
  pairsById,
  standings,
  standingsOptions,
  isSevenGamesFormat,
  enabled,
  accessMessage,
  premiumAthleteEmail,
  premiumAthletePin,
}) => {
  const result = useMemo(() => {
    if (!enabled || !canUseSuper8Predictor(event, category, isSevenGamesFormat)) return null;
    return calculateSuper8Prediction({
      entries,
      matches,
      pairsById,
      standingsOptions,
      isSevenGamesFormat,
      seedKey: `${event.pin || event.name}:${category.id}`,
    });
  }, [
    enabled,
    event,
    category,
    entries,
    matches,
    pairsById,
    standingsOptions,
    isSevenGamesFormat,
  ]);

  const ranks = useMemo(() => {
    const map = new Map<string, number | undefined>();
    standings.forEach((standing) => map.set(getPredictorEntryKey(standing.entry), standing.rank));
    return map;
  }, [standings]);

  if (!enabled) {
    return (
      <section className="rounded-3xl border border-amber-100 bg-amber-50/70 p-4 shadow-sm">
        <div className="flex items-center gap-2 text-amber-700">
          <Sparkles size={17} />
          <h4 className="text-sm font-black">Previsões do Super 8 · Premium</h4>
        </div>
        <p className="mt-2 text-xs font-medium leading-relaxed text-slate-600">
          {accessMessage || 'As previsões aparecem para usuários Premium inscritos nesta categoria.'}
        </p>
      </section>
    );
  }
  if (!result?.eligible) {
    return (
      <section className="rounded-3xl border border-sky-100 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 text-sky-700">
          <Sparkles size={17} />
          <h4 className="text-sm font-black">Previsões do Super 8 · Premium</h4>
        </div>
        <p className="mt-2 text-xs font-medium leading-relaxed text-slate-600">
          Disponíveis nesta categoria quando houver 8 atletas e 14 partidas, com 2 jogos em cada uma das 7 rodadas e placares que somem 7 games.
        </p>
      </section>
    );
  }

  const orderedStandings = [...standings].sort((a, b) => {
    if (a.rank !== undefined && b.rank !== undefined && a.rank !== b.rank) return a.rank - b.rank;
    if (a.rank !== undefined && b.rank === undefined) return -1;
    if (a.rank === undefined && b.rank !== undefined) return 1;
    return athleteName(a.entry).localeCompare(athleteName(b.entry));
  });

  const progressLabel = result.completedMatches === 0
    ? 'Antes da Rodada 1'
    : `Após ${result.completedMatches} de 14 partidas`;
  const skillColumnLabel = result.completedMatches === 14 ? 'Skill final' : 'Skill';

  const premiumSkillValue = result.nextMatches.reduce<number | undefined>((found, prediction) => {
    if (found !== undefined) return found;
    const candidates = [
      [prediction.pair1.p1, prediction.skills1[0]],
      [prediction.pair1.p2, prediction.skills1[1]],
      [prediction.pair2.p1, prediction.skills2[0]],
      [prediction.pair2.p2, prediction.skills2[1]],
    ] as const;
    return candidates.find(([entry]) => isPremiumEntry(entry, premiumAthleteEmail, premiumAthletePin))?.[1];
  }, undefined);

  const renderSkillValue = (entry: TournamentEntry, value: number) => {
    const isPremiumAthlete = isPremiumEntry(entry, premiumAthleteEmail, premiumAthletePin);
    const meetsPremiumSkill = !isPremiumAthlete && premiumSkillValue !== undefined && value >= premiumSkillValue;
    return (
      <span className={isPremiumAthlete ? 'font-black text-blue-700' : meetsPremiumSkill ? 'font-black text-emerald-600' : ''}>
        {athleteName(entry)}{isPremiumAthlete && <Star size={9} fill="currentColor" className="ml-0.5 inline-block text-blue-600" />}{' '}
        {formatSkill(value)}
      </span>
    );
  };

  const correctWinnerCount = result.matchReview.filter((review) => review.winnerCorrect).length;
  const exactScoreCount = result.matchReview.filter((review) => review.scoreCorrect).length;

  return (
    <section className="overflow-hidden rounded-3xl border border-sky-100 bg-white shadow-sm">
      <div className="bg-gradient-to-r from-sky-600 to-blue-600 px-4 py-4 text-white">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles size={17} className="shrink-0" />
            <h4 className="text-sm font-black">Previsões do Super 8</h4>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[9px] font-black tracking-wide">
            <Star size={10} fill="currentColor" /> Premium
          </span>
        </div>
        <p className="mt-1 text-[11px] font-semibold text-sky-100">
          {progressLabel} · {result.remainingMatches} {result.remainingMatches === 1 ? 'partida restante' : 'partidas restantes'}
        </p>
      </div>

      <div className="space-y-5 p-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-slate-800">
            <Trophy size={15} className="text-amber-500" />
            <h5 className="text-xs font-black">Classificação atual e chance de pódio</h5>
          </div>
          <div className="overflow-hidden rounded-2xl border border-slate-100">
            <div className="grid grid-cols-[1.8rem_minmax(0,1fr)_2.8rem_3rem_3.8rem] items-center gap-1.5 bg-slate-50 px-3 py-2 text-[8px] font-black uppercase tracking-wide text-slate-400">
              <span>Pos.</span><span>Atleta</span><span className="text-center">V / SG</span><span className="text-center normal-case">{skillColumnLabel}</span><span className="text-right">Pódio</span>
            </div>
            {orderedStandings.map((standing) => {
              const chance = result.podiumChanceByEntry.get(getPredictorEntryKey(standing.entry)) ?? 0;
              const width = Math.max(0, Math.min(100, chance));
              return (
                <div
                  key={getPredictorEntryKey(standing.entry)}
                  className="grid grid-cols-[1.8rem_minmax(0,1fr)_2.8rem_3rem_3.8rem] items-center gap-1.5 border-t border-slate-100 px-3 py-2.5"
                >
                  <span className="text-[11px] font-black text-slate-500">{standing.rank ?? '—'}</span>
                  <span className="truncate text-xs font-extrabold text-slate-800">{athleteName(standing.entry)}</span>
                  <span className="text-center text-[10px] font-bold text-slate-500">
                    {standing.wins} / {standing.gamesDiff > 0 ? `+${standing.gamesDiff}` : standing.gamesDiff}
                  </span>
                  <span className="text-center text-[10px] font-black text-slate-700">
                    {formatSkill(result.skillByEntry.get(getPredictorEntryKey(standing.entry)) ?? 25)}
                  </span>
                  <span className="text-right text-[11px] font-black text-sky-700">{chance.toFixed(1)}%</span>
                  <div className="col-span-4 -mt-1 h-1 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-sky-500 transition-[width]" style={{ width: `${width}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-1.5 text-[10px] font-medium leading-relaxed text-slate-400">
            Estimativa calculada a partir dos placares lançados e dos critérios de classificação desta categoria.
          </p>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h5 className="text-xs font-black text-slate-800">
              {result.currentRound
                ? `Previsões da Rodada ${result.currentRound}`
                : result.matchReview.length > 0 ? 'Conferência das previsões' : 'Classificação projetada'}
            </h5>
            {result.currentRound > 0 && <span className="text-[10px] font-bold text-slate-400">antes dos próximos jogos</span>}
          </div>

          {result.nextMatches.length === 0 ? (
            result.matchReview.length > 0 ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2">
                    <span className="block text-[9px] font-bold text-emerald-700">Vencedores corretos</span>
                    <span className="text-sm font-black text-emerald-800">{correctWinnerCount}/{result.matchReview.length}</span>
                  </div>
                  <div className="rounded-xl border border-sky-100 bg-sky-50 px-3 py-2">
                    <span className="block text-[9px] font-bold text-sky-700">Placar exato</span>
                    <span className="text-sm font-black text-sky-800">{exactScoreCount}/{result.matchReview.length}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  {result.matchReview.map((review) => (
                    <article key={review.matchId} className="space-y-2 rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                        <span className="text-[9px] font-black uppercase tracking-wide text-slate-400">
                          Rodada {review.round} · Jogo {review.matchNumber}
                        </span>
                        <div className="flex flex-wrap gap-1">
                          <span className={`rounded-full px-2 py-0.5 text-[8px] font-black ${review.winnerCorrect ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                            {review.winnerCorrect ? '✓ Vencedor' : '× Vencedor'}
                          </span>
                          <span className={`rounded-full px-2 py-0.5 text-[8px] font-black ${review.scoreCorrect ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'}`}>
                            {review.scoreCorrect ? '✓ Placar exato' : 'Placar diferente'}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-[minmax(0,1fr)_2.5rem_3rem] items-center gap-x-2 gap-y-1.5">
                        <span className="col-start-2 text-center text-[8px] font-black uppercase text-slate-400">Real</span>
                        <span className="col-start-3 text-center text-[8px] font-black text-slate-400">Estimado</span>
                        <div className="col-start-1 row-start-2 flex min-w-0 flex-wrap items-center gap-x-1 text-[10px] leading-relaxed">
                          <RankName entry={review.pair1.p1} ranks={ranks} premiumAthleteEmail={premiumAthleteEmail} premiumAthletePin={premiumAthletePin} />
                          <span className="text-slate-400">/</span>
                          <RankName entry={review.pair1.p2} ranks={ranks} premiumAthleteEmail={premiumAthleteEmail} premiumAthletePin={premiumAthletePin} />
                        </div>
                        <span className={`col-start-2 row-start-2 rounded-lg border border-slate-200 bg-white px-1 py-1 text-center text-xs font-black ${review.actualGames1 > review.actualGames2 ? 'text-green-700' : 'text-red-600'}`}>
                          {review.actualGames1}
                        </span>
                        <span className={`col-start-3 row-start-2 rounded-lg border border-slate-200 bg-white px-1 py-1 text-center text-xs font-black ${review.estimatedGames1 > review.estimatedGames2 ? 'text-green-700' : 'text-red-600'}`}>
                          {review.estimatedGames1}
                        </span>
                        <div className="col-start-1 row-start-3 flex min-w-0 flex-wrap items-center gap-x-1 text-[10px] leading-relaxed">
                          <RankName entry={review.pair2.p1} ranks={ranks} premiumAthleteEmail={premiumAthleteEmail} premiumAthletePin={premiumAthletePin} />
                          <span className="text-slate-400">/</span>
                          <RankName entry={review.pair2.p2} ranks={ranks} premiumAthleteEmail={premiumAthleteEmail} premiumAthletePin={premiumAthletePin} />
                        </div>
                        <span className={`col-start-2 row-start-3 rounded-lg border border-slate-200 bg-white px-1 py-1 text-center text-xs font-black ${review.actualGames2 > review.actualGames1 ? 'text-green-700' : 'text-red-600'}`}>
                          {review.actualGames2}
                        </span>
                        <span className={`col-start-3 row-start-3 rounded-lg border border-slate-200 bg-white px-1 py-1 text-center text-xs font-black ${review.estimatedGames2 > review.estimatedGames1 ? 'text-green-700' : 'text-red-600'}`}>
                          {review.estimatedGames2}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ) : (
              <p className="rounded-2xl bg-emerald-50 px-3 py-3 text-center text-xs font-bold text-emerald-700">
                Torneio concluído. As chances refletem a classificação final.
              </p>
            )
          ) : (
            <div className="space-y-2.5">
              {result.nextMatches.map((prediction, index) => {
                const pair1Players = [prediction.pair1.p1, prediction.pair1.p2];
                const pair2Players = [prediction.pair2.p1, prediction.pair2.p2];
                const pair1IsFavorite = prediction.chance1 >= prediction.chance2;
                const pair1OutcomeClass = pair1IsFavorite ? 'text-green-700' : 'text-red-600';
                const pair2OutcomeClass = pair1IsFavorite ? 'text-red-600' : 'text-green-700';
                const pair1BarClass = pair1IsFavorite ? 'bg-green-600' : 'bg-red-500';
                const pair2BarClass = pair1IsFavorite ? 'bg-red-500' : 'bg-green-600';
                return (
                  <article key={prediction.match.id} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
                    <p className="mb-2 flex items-center justify-between text-[9px] font-black uppercase tracking-wide text-slate-400">
                      <span>Jogo {prediction.match.matchNumber || index + 1}</span>
                      {!prediction.completed && <span className="w-11 text-center">Est.</span>}
                    </p>
                    <div className={`grid gap-x-2 gap-y-1.5 ${prediction.completed ? 'grid-cols-1' : 'grid-cols-[minmax(0,1fr)_2.75rem]'}`}>
                      <div className="col-start-1 row-start-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] leading-relaxed">
                        <RankName entry={prediction.pair1.p1} ranks={ranks} premiumAthleteEmail={premiumAthleteEmail} premiumAthletePin={premiumAthletePin} />
                        <span className="text-slate-400">/</span>
                        <RankName entry={prediction.pair1.p2} ranks={ranks} premiumAthleteEmail={premiumAthleteEmail} premiumAthletePin={premiumAthletePin} />
                      </div>
                      <p className="col-start-1 row-start-2 text-[9px] font-black uppercase tracking-wide text-slate-300">contra</p>
                      <div className="col-start-1 row-start-3 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] leading-relaxed">
                        <RankName entry={prediction.pair2.p1} ranks={ranks} premiumAthleteEmail={premiumAthleteEmail} premiumAthletePin={premiumAthletePin} />
                        <span className="text-slate-400">/</span>
                        <RankName entry={prediction.pair2.p2} ranks={ranks} premiumAthleteEmail={premiumAthleteEmail} premiumAthletePin={premiumAthletePin} />
                      </div>
                      {!prediction.completed && (
                        <div className="col-start-2 row-span-3 row-start-1 flex w-11 flex-col justify-between overflow-hidden rounded-xl border border-slate-200 bg-white py-0.5 text-center">
                          <span className={`text-xs font-black leading-5 ${pair1OutcomeClass}`}>{prediction.estimatedGames1}</span>
                          <span className={`text-xs font-black leading-5 ${pair2OutcomeClass}`}>{prediction.estimatedGames2}</span>
                        </div>
                      )}
                    </div>

                    {prediction.completed ? (
                      <div className="mt-3 flex items-center justify-between rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2">
                        <span className="text-[10px] font-black text-emerald-700">Resultado</span>
                        <span className="text-xs font-black text-slate-800">{prediction.actualGames1}×{prediction.actualGames2}</span>
                      </div>
                    ) : (
                      <>
                        <div className="mt-3">
                          <div className="mb-1 flex justify-between text-[10px] font-black">
                              <span className={pair1OutcomeClass}>{prediction.chance1.toFixed(1)}%</span>
                              <span className="text-slate-400">Chance de vitória</span>
                              <span className={pair2OutcomeClass}>{prediction.chance2.toFixed(1)}%</span>
                          </div>
                          <div className="flex h-1.5 overflow-hidden rounded-full bg-slate-200">
                            <div className={pair1BarClass} style={{ width: `${prediction.chance1}%` }} />
                            <div className={pair2BarClass} style={{ width: `${prediction.chance2}%` }} />
                          </div>
                        </div>

                        <details className="group mt-2.5 border-t border-slate-200 pt-2">
                          <summary className="flex cursor-pointer list-none items-center justify-between text-[10px] font-extrabold text-sky-700">
                            Detalhes da previsão
                            <ChevronDown size={13} className="transition-transform group-open:rotate-180" />
                          </summary>
                          <div className="mt-2 space-y-1.5 text-[10px] text-slate-600">
                            <p><b>Força efetiva:</b> {formatSkill(prediction.effectiveStrength1)} × {formatSkill(prediction.effectiveStrength2)}</p>
                            <p><b>Skill:</b> {renderSkillValue(pair1Players[0], prediction.skills1[0])} · {renderSkillValue(pair1Players[1], prediction.skills1[1])}</p>
                            <p><b>Skill:</b> {renderSkillValue(pair2Players[0], prediction.skills2[0])} · {renderSkillValue(pair2Players[1], prediction.skills2[1])}</p>
                          </div>
                        </details>
                      </>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

