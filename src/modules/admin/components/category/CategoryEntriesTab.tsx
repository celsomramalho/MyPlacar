import React from 'react';
import { ArrowUpDown, Sparkles, Trash2, UserPlus } from 'lucide-react';
import { ParticipantSearchInput } from '@modules/events/components/ParticipantSearchInput';
import { filterEntriesByParticipantSearch } from '@modules/events/domain/brackets';
import { isSimplifiedEntry } from '@modules/events/types';
import type { EventCategory, TournamentEntry, TournamentEvent, PlayerStanding, TournamentMatch, TournamentPair } from '@modules/events/types';
import { ParticipantRow } from '@modules/events/components/registration/ParticipantRow';
import { TechnicalTieDrawModal } from '@modules/events/components/TechnicalTieDrawModal';
import { EventRegistrationForm } from '@modules/events/domain/registration';
import { isEntryCheckedInToday, isTournamentPeriodActive, getTodayDateStr } from '@modules/events/services/eventRegistrationPeriod';

export interface CategoryEntriesTabProps {
  category: EventCategory;
  event: TournamentEvent;
  entries: TournamentEntry[];
  emptyMessage?: string;
  categoryMatches: TournamentMatch[];
  pairsById?: Record<string, TournamentPair>;
  playerStandingsMap: Map<string, PlayerStanding>;
  sortBy: 'team' | 'name';
  isIndividualRanking: boolean;
  isRanking: boolean;
  isSuper8: boolean;
  isSuper8Duplas?: boolean;
  isReadOnly: boolean;
  selectedEntries: Set<string>;
  expandedRegistrationEmail: string | null;
  onSortChange: (mode: 'team' | 'name') => void;
  onToggleEntrySelection: (entry: TournamentEntry) => void;
  onToggleExpandedRegistration: (email: string | null) => void;
  onSaveExpandedEntry: (entryData: TournamentEntry, originalEntryOrPin: TournamentEntry | string, isDraft?: boolean) => Promise<void> | void;
  onDeleteEntry: (targetPin: string) => void;
  onDeleteAllCategoryEntries?: () => void;
  onGenerateTemporaryEntries?: () => void;
  onUpdateEvent: (event: TournamentEvent) => void;
  onToggleCheckIn: (entry: TournamentEntry) => void;
  canCheckInParticipants?: boolean;
}

export const CategoryEntriesTab: React.FC<CategoryEntriesTabProps> = ({
  category,
  event,
  entries,
  emptyMessage,
  categoryMatches,
  pairsById,
  playerStandingsMap,
  sortBy,
  isIndividualRanking,
  isRanking,
  isSuper8,
  isSuper8Duplas = false,
  isReadOnly,
  selectedEntries,
  expandedRegistrationEmail,
  onSortChange,
  onToggleEntrySelection,
  onToggleExpandedRegistration,
  onSaveExpandedEntry,
  onDeleteEntry,
  onDeleteAllCategoryEntries,
  onGenerateTemporaryEntries,
  onUpdateEvent,
  onToggleCheckIn,
  canCheckInParticipants = true,
}) => {
  const isSuper8Like = isSuper8 || isSuper8Duplas;
  const isSuper8Rotating = isSuper8Like && category.scoreTarget !== 'Time';
  const [expandedStatsEmail, setExpandedStatsEmail] = React.useState<string | null>(null);
  const [isDrawModalOpen, setIsDrawModalOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [isClassifiedView, setIsClassifiedView] = React.useState(false);
  const maxPlayers = category.maxPlayers && category.maxPlayers > 0 ? category.maxPlayers : 8;
  const canGenerateMore = entries.length < maxPlayers;
  const allCategoryMatchesFinished = categoryMatches.length > 0 && categoryMatches.every((match) => match.status === 'finished');
  const today = getTodayDateStr();
  const tournamentActive = isTournamentPeriodActive(event);

  const allStandings = React.useMemo(() => {
    const seen = new Set<string>();
    const list: PlayerStanding[] = [];
    playerStandingsMap.forEach((st) => {
      const key = (
        st.entry.pin ||
        st.entry.email ||
        (st.entry.registrationId ? `reg_${st.entry.registrationId}` : '') ||
        st.entry.name ||
        ''
      )
        .toLowerCase()
        .trim();
      if (key && !seen.has(key)) {
        seen.add(key);
        list.push(st);
      }
    });
    return list;
  }, [playerStandingsMap]);

  const awaitingDrawStandings = React.useMemo(
    () => allStandings.filter((st) => st.isTechnicalTie && Boolean(st.tieBreakNote?.toLowerCase().includes('aguardando sorteio'))),
    [allStandings]
  );
  const hasAwaitingDraw = allCategoryMatchesFinished && awaitingDrawStandings.length > 0;

  const currentDrawWinners = React.useMemo(() => {
    return (
      category.technicalTieDrawWinners ||
      (category.id && event.technicalTieDrawWinners ? event.technicalTieDrawWinners[category.id] : undefined) ||
      []
    );
  }, [category.technicalTieDrawWinners, category.id, event.technicalTieDrawWinners]);

  const handleConfirmDrawWinners = (winners: string[]) => {
    const updatedCategories = (event.categories || []).map((cat) =>
      cat.id === category.id ? { ...cat, technicalTieDrawWinners: winners } : cat
    );
    const updatedEvent: TournamentEvent = {
      ...event,
      categories: updatedCategories,
      technicalTieDrawWinners: {
        ...(event.technicalTieDrawWinners || {}),
        [category.id]: winners,
      },
    };
    onUpdateEvent(updatedEvent);
  };

  const visibleEntries = filterEntriesByParticipantSearch(entries, searchQuery);
  const firstSelectedPartner = selectedEntries.size === 1
    ? entries.find((entry) =>
        Boolean((entry.email && selectedEntries.has(entry.email)) || (entry.pin && selectedEntries.has(entry.pin))),
      )
    : undefined;
  const shouldFilterSuper8MixedPairCandidates = Boolean(
    firstSelectedPartner &&
    firstSelectedPartner.gender &&
    isSuper8Like &&
    !isSuper8Rotating &&
    category.format === 'Duplas' &&
    category.gender1 &&
    category.gender2 &&
    category.gender1 !== category.gender2,
  );
  const hasPairInCurrentCategory = (entry: TournamentEntry) =>
    (event.pairs || []).some((pair) => {
      if (pair.categoryId !== category.id) return false;
      return [pair.p1, pair.p2].some((member) => {
        if (!member) return false;
        const sameEmail = Boolean(entry.email && member.email && entry.email.toLowerCase().trim() === member.email.toLowerCase().trim());
        const samePin = Boolean(entry.pin && member.pin && entry.pin.toUpperCase().trim() === member.pin.toUpperCase().trim());
        const sameRegistrationId = Boolean(entry.registrationId && member.registrationId && entry.registrationId === member.registrationId);
        return sameEmail || samePin || sameRegistrationId;
      });
    });
  const partnerCandidates = shouldFilterSuper8MixedPairCandidates && firstSelectedPartner
    ? visibleEntries.filter((candidate) => {
        const isFirstPartner = Boolean(
          (candidate.email && firstSelectedPartner.email && candidate.email.toLowerCase().trim() === firstSelectedPartner.email.toLowerCase().trim()) ||
          (candidate.pin && firstSelectedPartner.pin && candidate.pin.toUpperCase().trim() === firstSelectedPartner.pin.toUpperCase().trim()),
        );
        const requiredGender = firstSelectedPartner.gender === 'F' ? 'M' : 'F';
        const hasOppositeGender = candidate.gender === requiredGender;
        return !isFirstPartner && hasOppositeGender && !hasPairInCurrentCategory(candidate);
      })
    : visibleEntries;
  const selectableEntries = shouldFilterSuper8MixedPairCandidates && firstSelectedPartner
    ? [firstSelectedPartner, ...partnerCandidates]
    : visibleEntries;
  const classifiedEntries = React.useMemo(() => [...selectableEntries].sort((a, b) => {
    const standingFor = (entry: TournamentEntry) => {
      const key = (entry.email || entry.pin || '').toLowerCase().trim();
      return playerStandingsMap.get(key) || (entry.registrationId ? playerStandingsMap.get(`reg_${entry.registrationId}`) : undefined);
    };
    const rankA = standingFor(a)?.rank ?? Number.MAX_SAFE_INTEGER;
    const rankB = standingFor(b)?.rank ?? Number.MAX_SAFE_INTEGER;
    if (rankA !== rankB) return rankA - rankB;
    return (a.name || a.nickname || '').localeCompare(b.name || b.nickname || '');
  }), [selectableEntries, playerStandingsMap]);
  const technicalTieBreak = category.technicalTieBreak || event.technicalTieBreak;
  const pairHighlightColors = [
    'bg-amber-100/80 border-l-4 border-l-amber-400',
    'bg-green-200/80 border-l-4 border-l-green-500',
  ];
  const getPairHighlightClass = (pair: TournamentPair | null) => {
    if (!pair) return undefined;
    const orderedPairIds: string[] = [];
    entries.forEach((entry) => {
      const entryEmail = entry.email?.toLowerCase().trim();
      const entryPin = entry.pin?.toUpperCase().trim();
      const entryPair = (event.pairs || []).find((candidate) =>
        candidate.categoryId === category.id && (
          (entryEmail && (candidate.p1?.email?.toLowerCase().trim() === entryEmail || candidate.p2?.email?.toLowerCase().trim() === entryEmail)) ||
          (entryPin && (candidate.p1?.pin?.toUpperCase().trim() === entryPin || candidate.p2?.pin?.toUpperCase().trim() === entryPin))
        )
      );
      if (entryPair && !orderedPairIds.includes(entryPair.id)) orderedPairIds.push(entryPair.id);
    });
    const pairIndex = orderedPairIds.indexOf(pair.id);
    return pairIndex < 0 ? undefined : pairHighlightColors[pairIndex % pairHighlightColors.length];
  };

  return (
    <section className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden animate-in fade-in">
      <div className="p-5 border-b border-slate-100 flex flex-col gap-3.5">
        <div>
          <h3 className="text-base font-black text-slate-800">Inscritos ({category.name})</h3>
          <p className="text-xs text-slate-400 font-bold mt-0.5">
            {isSuper8Rotating || isRanking
              ? 'Classificação individual e estatísticas dos atletas.'
              : 'Clique nos participantes para formar ou desfazer times.'}
          </p>
        </div>

        {!isReadOnly && ((canGenerateMore && onGenerateTemporaryEntries) || (entries.length > 0 && onDeleteAllCategoryEntries)) && (
          <div className="flex flex-wrap items-center gap-2">
            {canGenerateMore && onGenerateTemporaryEntries && (
              <button
                type="button"
                onClick={onGenerateTemporaryEntries}
                className="flex items-center justify-center gap-2 border-2 border-emerald-500 text-emerald-600 bg-white hover:bg-emerald-50 px-4 py-2.5 rounded-2xl text-xs font-black shadow-xs transition-all active:scale-95 shrink-0 cursor-pointer"
                title={`Gerar inscrições temporárias até atingir o limite de ${maxPlayers} vagas`}
              >
                <UserPlus size={16} className="text-emerald-500" />
                <span>Gerar temporários</span>
              </button>
            )}

            {entries.length > 0 && onDeleteAllCategoryEntries && (
              <button
                type="button"
                onClick={onDeleteAllCategoryEntries}
                className="flex items-center justify-center gap-2 border-2 border-red-500 text-red-600 bg-white hover:bg-red-50 px-4 py-2.5 rounded-2xl text-xs font-black shadow-xs transition-all active:scale-95 shrink-0 cursor-pointer"
                title="Deletar todos os inscritos desta categoria"
              >
                <Trash2 size={16} className="text-red-500" />
                <span>Deletar</span>
              </button>
            )}
          </div>
        )}

        {/* Campo de pesquisa */}
        {entries.length > 0 && (
          <ParticipantSearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            resultCount={visibleEntries.length}
            placeholder="Pesquisar inscrito por nome..."
          />
        )}

        {/* Banner de Sorteio de Desempate Técnico */}
        {technicalTieBreak === 'Sorteio' && (hasAwaitingDraw || currentDrawWinners.length > 0) && (
          <div className={`p-4 border-2 rounded-2xl shadow-sm space-y-3 ${hasAwaitingDraw ? 'bg-amber-100 border-amber-400 ring-2 ring-amber-200' : 'bg-emerald-50 border-emerald-300'}`}>
            <div className="flex items-start gap-2.5">
              <span className="text-xl shrink-0">🎲</span>
              <div>
                <p className={`text-sm font-black ${hasAwaitingDraw ? 'text-amber-950' : 'text-emerald-900'}`}>
                  {hasAwaitingDraw ? 'Empate técnico — sorteio necessário' : 'Desempate por sorteio aplicado'}
                </p>
                <p className={`text-[11px] font-bold leading-tight ${hasAwaitingDraw ? 'text-amber-900' : 'text-emerald-800'}`}>
                  {hasAwaitingDraw
                    ? 'Os participantes abaixo seguem empatados nos critérios matemáticos e precisam do sorteio da comissão.'
                    : 'Ganhador do sorteio já definido e aplicado à classificação.'}
                </p>
              </div>
            </div>
            {hasAwaitingDraw && (
              <div className="flex flex-wrap gap-2">
                {awaitingDrawStandings.map((standing) => (
                  <span key={standing.entry.pin || standing.entry.email || standing.entry.registrationId} className="rounded-xl border border-amber-300 bg-white/80 px-2.5 py-1.5 text-[10px] font-black text-amber-950">
                    {standing.entry.nickname || standing.entry.name} · {standing.wins} vitórias · saldo {standing.gamesDiff > 0 ? `+${standing.gamesDiff}` : standing.gamesDiff} · {standing.gamesWon} pró / {standing.gamesLost} contra
                  </span>
                ))}
              </div>
            )}
            {!isReadOnly && (
              <button
                type="button"
                onClick={() => setIsDrawModalOpen(true)}
                className="w-full px-3.5 py-2 text-xs font-black text-white bg-amber-600 hover:bg-amber-700 active:scale-95 rounded-xl shadow-xs transition-all cursor-pointer"
              >
                {hasAwaitingDraw ? 'Apontar ganhador' : 'Alterar sorteio'}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 px-4 py-3 bg-slate-50 border-b border-slate-100">
        {isSuper8Rotating || isRanking ? (
          <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 border border-emerald-200/60 px-2.5 py-1 rounded-lg">
            Classificação {isRanking ? 'Ranking' : isSuper8Duplas ? 'Super 8 Duplas' : 'Super 8'}
          </span>
        ) : (
          <>
            <span className="text-[10px] font-black text-slate-400">Classificar por</span>
            <button
              type="button"
              onClick={() => onSortChange(sortBy === 'team' ? 'name' : 'team')}
              className="flex items-center gap-1.5 text-[10px] font-black text-blue-600 bg-white border border-slate-200 px-2.5 py-1.5 rounded-lg transition-all hover:bg-slate-50 cursor-pointer"
            >
              {sortBy === 'team' ? 'Time' : 'Participante'} <ArrowUpDown size={12} />
            </button>
          </>
        )}
        {isIndividualRanking && categoryMatches.length > 0 && (
          <button
            type="button"
            onClick={() => setIsClassifiedView((current) => !current)}
            disabled={!allCategoryMatchesFinished && !isClassifiedView}
            title={allCategoryMatchesFinished ? 'Ordenar participantes pela classificação calculada' : 'Encerre todas as partidas para aplicar a classificação final'}
            className={`rounded-lg px-3 py-1.5 text-[10px] font-black transition-all ${
              isClassifiedView
                ? 'border border-emerald-300 bg-emerald-100 text-emerald-800 hover:bg-emerald-200 cursor-pointer'
                : allCategoryMatchesFinished
                ? 'bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            {isClassifiedView ? 'Voltar à ordem original' : 'Classificar'}
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="p-10 text-center text-sm font-bold text-slate-400">
          {emptyMessage || 'Nenhum inscrito nesta categoria.'}
        </div>
      ) : isRanking ? (
        <div>
          <div className="px-4 py-2 bg-emerald-50 border-b border-emerald-100 flex items-center gap-2">
            <Sparkles size={13} className="text-emerald-600" />
            <span className="text-[11px] font-black text-emerald-700">
              Disponíveis para formar novos times ({visibleEntries.length})
            </span>
          </div>
          {visibleEntries.length === 0 ? (
            <div className="p-8 text-center text-xs font-bold text-slate-400">Nenhum inscrito encontrado.</div>
          ) : (
          <div className="divide-y divide-emerald-100/40">
            {visibleEntries.map((entry) => {
              const standingKey = (entry.email || entry.pin || '').toLowerCase().trim();
              const standing = isIndividualRanking
                ? playerStandingsMap.get(standingKey) || (entry.registrationId ? playerStandingsMap.get(`reg_${entry.registrationId}`) : null)
                : null;
              const isExpanded = expandedRegistrationEmail === entry.email;
              const isStatsExpanded = expandedStatsEmail === (entry.email || entry.pin);
              const isSimplified = isSimplifiedEntry(entry, event);
              const pair = isRanking
                ? null
                : (event.pairs || []).find(
                    (p) =>
                      p.categoryId === category.id &&
                      ((p.p1?.email && entry.email && p.p1.email.toLowerCase().trim() === entry.email.toLowerCase().trim()) ||
                        (p.p2?.email && entry.email && p.p2.email.toLowerCase().trim() === entry.email.toLowerCase().trim()) ||
                        (p.p1?.pin && entry.pin && p.p1.pin.toUpperCase().trim() === entry.pin.toUpperCase().trim()) ||
                        (p.p2?.pin && entry.pin && p.p2.pin.toUpperCase().trim() === entry.pin.toUpperCase().trim()))
                  );

              return (
                <div key={entry.email || entry.pin}>
                  <ParticipantRow
                    entry={entry}
                    category={category}
                    categories={event.categories}
                    pair={pair ?? null}
                    pairHighlightClassName={getPairHighlightClass(pair ?? null)}
                    standing={standing}
                    isIndividualRanking={isIndividualRanking}
                    isRanking={isRanking}
                    isSuper8={isSuper8Rotating}
                    isSimplified={isSimplified}
                    canViewHistory={!isReadOnly}
                    isSelected={Boolean((entry.email && selectedEntries.has(entry.email)) || (entry.pin && selectedEntries.has(entry.pin)))}
                    isExpanded={isStatsExpanded}
                    canSelect={!isSuper8Rotating && !isReadOnly}
                    hasCategoryMatches={categoryMatches.length > 0}
                    matches={categoryMatches}
                    pairsById={pairsById}
                    allPairs={event.pairs}
                    onToggleSelect={onToggleEntrySelection}
                    onToggleExpanded={() => setExpandedStatsEmail(isStatsExpanded ? null : (entry.email || entry.pin))}
                    onEdit={() => onToggleExpandedRegistration(isExpanded ? null : entry.email)}
                    checkInStatus={canCheckInParticipants ? { checked: isEntryCheckedInToday(entry, event.matches, pairsById, today), disabled: !tournamentActive, onToggle: onToggleCheckIn } : undefined}
                  />
                  {isExpanded && (
                    <div className="bg-white px-3.5 sm:px-4 pb-4 pt-1">
                      <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
                        <EventRegistrationForm
                          event={event}
                          mode="admin"
                          entry={entry}
                          onUpdateEvent={onUpdateEvent}
                          onSave={async (updated) => { await onSaveExpandedEntry(updated, entry, false); }}
                          onSaveDraft={async (updated) => { await onSaveExpandedEntry(updated, entry, true); }}
                          onDelete={isReadOnly ? undefined : () => onDeleteEntry(entry.pin)}
                          onCancel={() => onToggleExpandedRegistration(null)}
                          readOnly={isReadOnly}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          )}
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {selectableEntries.length === 0 ? (
            <div className="p-8 text-center text-xs font-bold text-slate-400">
              {shouldFilterSuper8MixedPairCandidates
                ? 'Nenhum parceiro disponível sem time formado nesta categoria.'
                : 'Nenhum inscrito encontrado.'}
            </div>
          ) : (isClassifiedView ? classifiedEntries : selectableEntries).map((entry, entryIndex) => {
            const standingKey = (entry.email || entry.pin || '').toLowerCase().trim();
            const standing = isIndividualRanking
              ? playerStandingsMap.get(standingKey) || (entry.registrationId ? playerStandingsMap.get(`reg_${entry.registrationId}`) : null)
              : null;
            const isExpanded = expandedRegistrationEmail === entry.email;
            const isStatsExpanded = expandedStatsEmail === (entry.email || entry.pin);
            const isSimplified = isSimplifiedEntry(entry, event);
            const pair = isRanking
              ? null
              : (event.pairs || []).find(
                  (p) =>
                    p.categoryId === category.id &&
                    ((p.p1?.email && entry.email && p.p1.email.toLowerCase().trim() === entry.email.toLowerCase().trim()) ||
                      (p.p2?.email && entry.email && p.p2.email.toLowerCase().trim() === entry.email.toLowerCase().trim()) ||
                      (p.p1?.pin && entry.pin && p.p1.pin.toUpperCase().trim() === entry.pin.toUpperCase().trim()) ||
                      (p.p2?.pin && entry.pin && p.p2.pin.toUpperCase().trim() === entry.pin.toUpperCase().trim()))
                );

            return (
              <div key={entry.email || entry.pin}>
                <ParticipantRow
                  entry={entry}
                  category={category}
                  categories={event.categories}
                pair={pair ?? null}
                  pairHighlightClassName={getPairHighlightClass(pair ?? null)}
                  standing={standing}
                  isIndividualRanking={isIndividualRanking}
                  isRanking={isRanking}
                  isSuper8={isSuper8Rotating}
                  isSimplified={isSimplified}
                  canViewHistory={!isReadOnly}
                  isSelected={Boolean((entry.email && selectedEntries.has(entry.email)) || (entry.pin && selectedEntries.has(entry.pin)))}
                  isExpanded={isStatsExpanded}
                  canSelect={!isSuper8Rotating && !isReadOnly}
                  hasCategoryMatches={categoryMatches.length > 0}
                  matches={categoryMatches}
                  pairsById={pairsById}
                  allPairs={event.pairs}
                  onToggleSelect={onToggleEntrySelection}
                  onToggleExpanded={() => setExpandedStatsEmail(isStatsExpanded ? null : (entry.email || entry.pin))}
                  onEdit={() => onToggleExpandedRegistration(isExpanded ? null : entry.email)}
                  checkInStatus={canCheckInParticipants ? { checked: isEntryCheckedInToday(entry, event.matches, pairsById, today), disabled: !tournamentActive, onToggle: onToggleCheckIn } : undefined}
                />
                {isExpanded && (
                  <div className="bg-white px-3.5 sm:px-4 pb-4 pt-1">
                    <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
                      <EventRegistrationForm
                        event={event}
                        mode="admin"
                        entry={entry}
                        onUpdateEvent={onUpdateEvent}
                        onSave={async (updated) => { await onSaveExpandedEntry(updated, entry, false); }}
                        onSaveDraft={async (updated) => { await onSaveExpandedEntry(updated, entry, true); }}
                        onDelete={isReadOnly ? undefined : () => onDeleteEntry(entry.pin)}
                        onCancel={() => onToggleExpandedRegistration(null)}
                        readOnly={isReadOnly}
                      />
                    </div>
                  </div>
                )}
                {shouldFilterSuper8MixedPairCandidates && entryIndex === 0 && (
                  <div className="border-t border-sky-100 bg-sky-50/70 px-4 py-2.5">
                    <p className="text-[10px] font-black text-sky-800">Parceiro selecionado acima</p>
                    <p className="mt-0.5 text-[10px] font-semibold text-slate-500">
                      Opções abaixo: gênero oposto e sem time formado nesta categoria.
                    </p>
                    {partnerCandidates.length === 0 && (
                      <p className="mt-1 text-[10px] font-bold text-amber-700">Nenhum parceiro disponível no momento.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {isDrawModalOpen && (
        <TechnicalTieDrawModal
          isOpen={isDrawModalOpen}
          categoryName={category.name}
          standings={allStandings}
          currentWinnerKeys={currentDrawWinners}
          onClose={() => setIsDrawModalOpen(false)}
          onConfirm={handleConfirmDrawWinners}
        />
      )}
    </section>
  );
};
