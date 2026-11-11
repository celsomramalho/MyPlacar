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
}) => {
  const isSuper8Like = isSuper8 || isSuper8Duplas;
  const isSuper8Rotating = isSuper8Like && category.scoreTarget !== 'Time';
  const [expandedStatsEmail, setExpandedStatsEmail] = React.useState<string | null>(null);
  const [isDrawModalOpen, setIsDrawModalOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const maxPlayers = category.maxPlayers && category.maxPlayers > 0 ? category.maxPlayers : 8;
  const canGenerateMore = entries.length < maxPlayers;
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

  const hasTechnicalTie = React.useMemo(() => {
    return allStandings.some(
      (st) => st.isTechnicalTie || Boolean(st.tieBreakNote && st.tieBreakNote.toLowerCase().includes('sorteio'))
    );
  }, [allStandings]);

  const hasAwaitingDraw = React.useMemo(() => {
    return allStandings.some(
      (st) => st.isTechnicalTie && Boolean(st.tieBreakNote && st.tieBreakNote.toLowerCase().includes('aguardando sorteio'))
    );
  }, [allStandings]);

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
            placeholder="Pesquisar inscrito por nome..."
          />
        )}

        {/* Banner de Sorteio de Desempate Técnico */}
        {event.technicalTieBreak === 'Sorteio' && (hasTechnicalTie || currentDrawWinners.length > 0) && (
          <div className="p-3.5 bg-amber-50/90 border border-amber-200 rounded-2xl shadow-2xs space-y-2.5">
            <div className="flex items-start gap-2.5">
              <span className="text-xl shrink-0">🎲</span>
              <div>
                <p className="text-xs font-black text-amber-900">
                  Desempate técnico por sorteio
                </p>
                <p className="text-[11px] font-bold text-amber-700 leading-tight">
                  {hasAwaitingDraw
                    ? 'Há atletas com estatísticas idênticas aguardando a indicação do sorteio manual.'
                    : 'Ganhador do sorteio já definido e aplicado à classificação.'}
                </p>
              </div>
            </div>
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
                    pair={pair}
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
                    checkInStatus={{ checked: isEntryCheckedInToday(entry, event.matches, pairsById, today), disabled: isReadOnly || !tournamentActive, onToggle: onToggleCheckIn }}
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
          {visibleEntries.length === 0 ? (
            <div className="p-8 text-center text-xs font-bold text-slate-400">Nenhum inscrito encontrado.</div>
          ) : visibleEntries.map((entry) => {
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
                  pair={pair}
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
                  checkInStatus={{ checked: isEntryCheckedInToday(entry, event.matches, pairsById, today), disabled: isReadOnly || !tournamentActive, onToggle: onToggleCheckIn }}
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
