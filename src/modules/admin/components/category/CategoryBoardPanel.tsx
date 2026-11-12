import React from 'react';
import { Trash2 } from 'lucide-react';
import type {
  EventCategory,
  PlayerStanding,
  TournamentEntry,
  TournamentEvent,
  TournamentMatch,
  TournamentPair,
} from '@modules/events/types';
import type { TeamStanding } from '@modules/events/domain/brackets';
import { CategoryEntriesTab } from './CategoryEntriesTab';
import { CategoryTeamsTab } from './CategoryTeamsTab';
import { CategoryMatchesTab } from './CategoryMatchesTab';

export type CategoryPanelView = 'entries' | 'teams' | 'matches';

export interface CategoryBoardPanelProps {
  category: EventCategory;
  categoryPanelView: CategoryPanelView;
  event: TournamentEvent;

  // Entries tab props
  visibleCategoryEntries: TournamentEntry[];
  selectionFilterGender?: string;
  categoryMatches: TournamentMatch[];
  pairsById: Record<string, TournamentPair>;
  playerStandingsMap?: Map<string, PlayerStanding>;
  sortBy: 'name' | 'team';
  isIndividualRanking: boolean;
  isRanking: boolean;
  isSuper8: boolean;
  isSuper8Duplas: boolean;
  isReadOnly: boolean;
  selectedEntries: Set<string>;
  expandedRegistrationEmail: string | null;
  onSortChange: (sort: any) => void;
  onToggleEntrySelection: (entry: TournamentEntry) => void;
  onToggleExpandedRegistration: (email: string | null) => void;
  onSaveExpandedEntry: (entryData: TournamentEntry, originalEntryOrPin: TournamentEntry | string, isDraft?: boolean) => Promise<void> | void;
  onDeleteEntry: (targetPin: string) => void;
  onDeleteAllCategoryEntries?: () => void;
  onGenerateTemporaryEntries?: () => void;
  temporaryDataCounts: { entries: number; pairs: number; matches: number };
  onDeleteTemporaryData: () => void;
  onUpdateEvent: (event: TournamentEvent) => void;
  onToggleCheckIn: (entry: TournamentEntry) => void;
  canCheckInParticipants?: boolean;

  // Teams tab props
  categoryPairs: TournamentPair[];
  bracketOnePairs: TournamentPair[];
  bracketTwoPairs: TournamentPair[];
  b1StandingsMap: Map<string, TeamStanding>;
  b2StandingsMap: Map<string, TeamStanding>;
  /** Standings for Super 8 categories with scoreTarget === 'Time' (fixed pairs). */
  super8StandingsMap?: Map<string, TeamStanding>;
  b1Finished: boolean;
  b2Finished: boolean;
  b1MatchesCount: number;
  b2MatchesCount: number;
  b1FinishedCount: number;
  b2FinishedCount: number;
  isSystemDraw: boolean;
  onRandomizeCategoryDraw: () => Promise<void>;
  onUndoPair: (pairId: string) => void;
  onDeleteAllCategoryPairs?: () => void;
  onToggleTeamBracket: (pair: TournamentPair) => Promise<void>;
  onMoveTeamPosition: (pair: TournamentPair, direction: 'up' | 'down') => Promise<void>;
  selectedTeamIds: Set<string>;
  canSelectTeams: boolean;
  onToggleTeamSelection: (pair: TournamentPair) => void;

  // Matches tab props
  totalSets: number;
  queuePosByMatchId: Map<string, number>;
  onScoreChange: (matchId: string, setIndex: number, player: 'p1' | 'p2', rawVal: string) => void;
  onUndoScore?: (matchId: string, setIndex: number, p1Val: string, p2Val: string) => void;
  onMatchDateChange: (matchId: string, dateVal: string) => void;
  onFinishMatch: (matchId: string) => void;
  onReopenMatch: (matchId: string) => Promise<void>;
  onDeleteMatch: (matchId: string) => void;
  onGenerateMatches: () => Promise<void>;
  onGenerateBlankPdf: () => void;
  onGenerateCalculationPdf: () => void;
  onDeleteAllCategoryMatches: () => void;
  onImportMatches: (pairs: TournamentPair[], matches: TournamentMatch[]) => Promise<void>;
}

export const CategoryBoardPanel: React.FC<CategoryBoardPanelProps> = ({
  category,
  categoryPanelView,
  event,
  visibleCategoryEntries,
  selectionFilterGender,
  categoryMatches,
  pairsById,
  playerStandingsMap,
  sortBy,
  isIndividualRanking,
  isRanking,
  isSuper8,
  isSuper8Duplas,
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
  temporaryDataCounts,
  onDeleteTemporaryData,
  onUpdateEvent,
  onToggleCheckIn,
  canCheckInParticipants = true,
  categoryPairs,
  bracketOnePairs,
  bracketTwoPairs,
  b1StandingsMap,
  b2StandingsMap,
  super8StandingsMap,
  b1Finished,
  b2Finished,
  b1MatchesCount,
  b2MatchesCount,
  b1FinishedCount,
  b2FinishedCount,
  isSystemDraw,
  onRandomizeCategoryDraw,
  onUndoPair,
  onDeleteAllCategoryPairs,
  onToggleTeamBracket,
  onMoveTeamPosition,
  selectedTeamIds,
  canSelectTeams,
  onToggleTeamSelection,
  totalSets,
  queuePosByMatchId,
  onScoreChange,
  onUndoScore,
  onMatchDateChange,
  onFinishMatch,
  onReopenMatch,
  onDeleteMatch,
  onGenerateMatches,
  onGenerateBlankPdf,
  onGenerateCalculationPdf,
  onDeleteAllCategoryMatches,
  onImportMatches,
}) => {
  return (
    <div className="mt-2 space-y-4">
      {!isReadOnly && (temporaryDataCounts.entries + temporaryDataCounts.pairs + temporaryDataCounts.matches > 0) && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-xs font-bold text-amber-800">
            Temporários encontrados: {temporaryDataCounts.entries} inscritos, {temporaryDataCounts.pairs} times e {temporaryDataCounts.matches} partidas.
          </p>
          <button
            type="button"
            onClick={onDeleteTemporaryData}
            className="flex items-center justify-center gap-2 rounded-xl border-2 border-red-500 bg-white px-3.5 py-2 text-xs font-black text-red-600 transition-all hover:bg-red-50 active:scale-95"
            title="Excluir inscrições com PIN TEMP e seus times e partidas vinculados"
          >
            <Trash2 size={15} />
            Excluir temporários
          </button>
        </div>
      )}

      {categoryPanelView === 'entries' && (
        <CategoryEntriesTab
          category={category}
          event={event}
          entries={visibleCategoryEntries}
          emptyMessage={
            selectionFilterGender
              ? 'Nenhum inscrito do gênero oposto disponível nesta categoria.'
              : undefined
          }
          categoryMatches={categoryMatches}
          pairsById={pairsById}
          playerStandingsMap={playerStandingsMap ?? new Map()}
          sortBy={sortBy}
          isIndividualRanking={isIndividualRanking}
          isRanking={isRanking}
          isSuper8={isSuper8}
          isSuper8Duplas={isSuper8Duplas}
          isReadOnly={isReadOnly}
          selectedEntries={selectedEntries}
          expandedRegistrationEmail={expandedRegistrationEmail}
          onSortChange={onSortChange}
          onToggleEntrySelection={onToggleEntrySelection}
          onToggleExpandedRegistration={onToggleExpandedRegistration}
          onSaveExpandedEntry={onSaveExpandedEntry}
          onDeleteEntry={onDeleteEntry}
          onDeleteAllCategoryEntries={onDeleteAllCategoryEntries}
          onGenerateTemporaryEntries={onGenerateTemporaryEntries}
          onUpdateEvent={onUpdateEvent}
          onToggleCheckIn={onToggleCheckIn}
          canCheckInParticipants={canCheckInParticipants}
        />
      )}

      {categoryPanelView === 'teams' && (
        <CategoryTeamsTab
          category={category}
          categoryPairs={categoryPairs}
          categoryMatches={categoryMatches}
          pairsById={pairsById}
          bracketOneList={bracketOnePairs}
          bracketTwoList={bracketTwoPairs}
          b1StandingsMap={b1StandingsMap}
          b2StandingsMap={b2StandingsMap}
          super8StandingsMap={super8StandingsMap}
          b1Finished={b1Finished}
          b2Finished={b2Finished}
          b1MatchesCount={b1MatchesCount}
          b2MatchesCount={b2MatchesCount}
          b1FinishedCount={b1FinishedCount}
          b2FinishedCount={b2FinishedCount}
          hasCategoryMatches={categoryMatches.length > 0}
          isRanking={isRanking}
          isSuper8={isSuper8}
          isReadOnly={isReadOnly}
          isSystemDraw={isSystemDraw}
          onRandomizeCategoryDraw={onRandomizeCategoryDraw}
          onUndoPair={onUndoPair}
          onDeleteAllCategoryPairs={onDeleteAllCategoryPairs}
          onToggleTeamBracket={onToggleTeamBracket}
          onMoveTeamPosition={onMoveTeamPosition}
          selectedTeamIds={selectedTeamIds}
          canSelectTeams={canSelectTeams}
          onToggleTeamSelection={onToggleTeamSelection}
        />
      )}

      {categoryPanelView === 'matches' && (
        <CategoryMatchesTab
          event={event}
          category={category}
          categoryMatches={categoryMatches}
          pairsById={pairsById}
          isRanking={isRanking}
          isSuper8={isSuper8}
          isSuper8Duplas={isSuper8Duplas}
          isReadOnly={isReadOnly}
          totalSets={totalSets}
          allCategoryFinished={
            categoryMatches.length > 0 &&
            categoryMatches.every((m) => m.status === 'finished')
          }
          queuePosByMatchId={queuePosByMatchId}
          onScoreChange={onScoreChange}
          onUndoScore={onUndoScore}
          onMatchDateChange={onMatchDateChange}
          onFinishMatch={onFinishMatch}
          onReopenMatch={onReopenMatch}
          onDeleteMatch={onDeleteMatch}
          onGenerateMatches={onGenerateMatches}
          onGenerateBlankPdf={onGenerateBlankPdf}
          onGenerateCalculationPdf={onGenerateCalculationPdf}
          onDeleteAllCategoryMatches={onDeleteAllCategoryMatches}
          onImportMatches={onImportMatches}
        />
      )}
    </div>
  );
};
