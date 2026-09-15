import React from 'react';
import { ArrowUpDown, Sparkles } from 'lucide-react';
import type { EventCategory, TournamentEntry, TournamentEvent, PlayerStanding, TournamentMatch } from '@modules/events/types';
import { ParticipantRow } from '@modules/events/components/registration/ParticipantRow';
import { EventRegistrationForm } from '@modules/events/components/EventRegistrationForm';

export interface CategoryEntriesTabProps {
  category: EventCategory;
  event: TournamentEvent;
  entries: TournamentEntry[];
  categoryMatches: TournamentMatch[];
  playerStandingsMap: Map<string, PlayerStanding>;
  sortBy: 'team' | 'name';
  isIndividualRanking: boolean;
  isRanking: boolean;
  isSuper8: boolean;
  isReadOnly: boolean;
  selectedEntries: Set<string>;
  expandedRegistrationEmail: string | null;
  onSortChange: (mode: 'team' | 'name') => void;
  onToggleEntrySelection: (entry: TournamentEntry) => void;
  onToggleExpandedRegistration: (email: string | null) => void;
  onSaveExpandedEntry: (entryData: TournamentEntry, originalPin: string) => Promise<void> | void;
  onDeleteEntry: (targetPin: string) => void;
  onUpdateEvent: (event: TournamentEvent) => void;
}

export const CategoryEntriesTab: React.FC<CategoryEntriesTabProps> = ({
  category,
  event,
  entries,
  categoryMatches,
  playerStandingsMap,
  sortBy,
  isIndividualRanking,
  isRanking,
  isSuper8,
  isReadOnly,
  selectedEntries,
  expandedRegistrationEmail,
  onSortChange,
  onToggleEntrySelection,
  onToggleExpandedRegistration,
  onSaveExpandedEntry,
  onDeleteEntry,
  onUpdateEvent,
}) => {
  return (
    <section className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden animate-in fade-in">
      <div className="p-5 border-b border-slate-100 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-black text-slate-800">Inscritos ({category.name})</h3>
          <p className="text-xs text-slate-400 font-bold mt-0.5">
            {isSuper8 || isRanking
              ? 'Classificação individual e estatísticas dos atletas.'
              : 'Clique nos participantes para formar ou desfazer times.'}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 px-4 py-3 bg-slate-50 border-b border-slate-100">
        {isSuper8 || isRanking ? (
          <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 border border-emerald-200/60 px-2.5 py-1 rounded-lg">
            Classificação {isRanking ? 'Ranking' : 'Super 8'}
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
          Nenhum inscrito nesta categoria.
        </div>
      ) : isRanking ? (
        <div>
          <div className="px-4 py-2 bg-emerald-50 border-b border-emerald-100 flex items-center gap-2">
            <Sparkles size={13} className="text-emerald-600" />
            <span className="text-[11px] font-black text-emerald-700">
              Disponíveis para formar novos times ({entries.length})
            </span>
          </div>
          <div className="divide-y divide-emerald-100/40">
            {entries.map((entry) => {
              const standingKey = (entry.email || entry.pin || '').toLowerCase().trim();
              const standing = isIndividualRanking ? playerStandingsMap.get(standingKey) : null;
              const isExpanded = expandedRegistrationEmail === entry.email;

              return (
                <div key={entry.email || entry.pin}>
                  <ParticipantRow
                    entry={entry}
                    category={category}
                    standing={standing}
                    isIndividualRanking={isIndividualRanking}
                    isRanking={isRanking}
                    isSuper8={isSuper8}
                    isSelected={selectedEntries.has(entry.email)}
                    canSelect={!isSuper8 && !isReadOnly}
                    hasCategoryMatches={categoryMatches.length > 0}
                    onToggleSelect={onToggleEntrySelection}
                    onEdit={() => onToggleExpandedRegistration(isExpanded ? null : entry.email)}
                  />
                  {isExpanded && (
                    <div className="bg-white px-3.5 sm:px-4 pb-4 pt-1">
                      <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
                        <EventRegistrationForm
                          event={event}
                          mode="admin"
                          entry={entry}
                          onUpdateEvent={onUpdateEvent}
                          onSave={async (updated) => { await onSaveExpandedEntry(updated, entry.pin); }}
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
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {entries.map((entry) => {
            const standingKey = (entry.email || entry.pin || '').toLowerCase().trim();
            const standing = isIndividualRanking ? playerStandingsMap.get(standingKey) : null;
            const isExpanded = expandedRegistrationEmail === entry.email;

            return (
              <div key={entry.email || entry.pin}>
                <ParticipantRow
                  entry={entry}
                  category={category}
                  standing={standing}
                  isIndividualRanking={isIndividualRanking}
                  isRanking={isRanking}
                  isSuper8={isSuper8}
                  isSelected={selectedEntries.has(entry.email)}
                  canSelect={!isSuper8 && !isReadOnly}
                  hasCategoryMatches={categoryMatches.length > 0}
                  onToggleSelect={onToggleEntrySelection}
                  onEdit={() => onToggleExpandedRegistration(isExpanded ? null : entry.email)}
                />
                {isExpanded && (
                  <div className="bg-white px-3.5 sm:px-4 pb-4 pt-1">
                    <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
                      <EventRegistrationForm
                        event={event}
                        mode="admin"
                        entry={entry}
                        onUpdateEvent={onUpdateEvent}
                        onSave={async (updated) => { await onSaveExpandedEntry(updated, entry.pin); }}
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
    </section>
  );
};
