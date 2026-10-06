import React from 'react';
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
  onSaveExpandedEntry: (entryData: TournamentEntry, originalPin: string) => Promise<void>;
  onDeleteEntry: (targetPin: string) => void;
  onUpdateEvent: (event: TournamentEvent) => void;

  // Teams tab props
  categoryPairs: TournamentPair[];
  bracketOnePairs: TournamentPair[];
  bracketTwoPairs: TournamentPair[];
  b1StandingsMap: Map<string, TeamStanding>;
  b2StandingsMap: Map<string, TeamStanding>;
  b1Finished: boolean;
  b2Finished: boolean;
  b1MatchesCount: number;
  b2MatchesCount: number;
  b1FinishedCount: number;
  b2FinishedCount: number;
  isSystemDraw: boolean;
  onRandomizeCategoryDraw: () => Promise<void>;
  onUndoPair: (pairId: string) => void;
  onToggleTeamBracket: (pair: TournamentPair) => Promise<void>;
  onMoveTeamPosition: (pair: TournamentPair, direction: 'up' | 'down') => Promise<void>;
  selectedTeamIds: Set<string>;
  canSelectTeams: boolean;
  onToggleTeamSelection: (pair: TournamentPair) => void;

  // Matches tab props
  totalSets: number;
  queuePosByMatchId: Map<string, number>;
  onScoreChange: (matchId: string, setIndex: number, player: 'p1' | 'p2', rawVal: string) => void;
  onMatchDateChange: (matchId: string, dateVal: string) => void;
  onFinishMatch: (matchId: string) => void;
  onReopenMatch: (matchId: string) => Promise<void>;
  onDeleteMatch: (matchId: string) => void;
  onGenerateMatches: () => Promise<void>;
  onGenerateBlankPdf: () => void;
  onDeleteAllCategoryMatches: () => void;
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
  onUpdateEvent,
  categoryPairs,
  bracketOnePairs,
  bracketTwoPairs,
  b1StandingsMap,
  b2StandingsMap,
  b1Finished,
  b2Finished,
  b1MatchesCount,
  b2MatchesCount,
  b1FinishedCount,
  b2FinishedCount,
  isSystemDraw,
  onRandomizeCategoryDraw,
  onUndoPair,
  onToggleTeamBracket,
  onMoveTeamPosition,
  selectedTeamIds,
  canSelectTeams,
  onToggleTeamSelection,
  totalSets,
  queuePosByMatchId,
  onScoreChange,
  onMatchDateChange,
  onFinishMatch,
  onReopenMatch,
  onDeleteMatch,
  onGenerateMatches,
  onGenerateBlankPdf,
  onDeleteAllCategoryMatches,
}) => {
  return (
    <div className="mt-2 space-y-4">
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
          onUpdateEvent={onUpdateEvent}
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
          onToggleTeamBracket={onToggleTeamBracket}
          onMoveTeamPosition={onMoveTeamPosition}
          selectedTeamIds={selectedTeamIds}
          canSelectTeams={canSelectTeams}
          onToggleTeamSelection={onToggleTeamSelection}
        />
      )}

      {categoryPanelView === 'matches' && (
        <CategoryMatchesTab
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
          onMatchDateChange={onMatchDateChange}
          onFinishMatch={onFinishMatch}
          onReopenMatch={onReopenMatch}
          onDeleteMatch={onDeleteMatch}
          onGenerateMatches={onGenerateMatches}
          onGenerateBlankPdf={onGenerateBlankPdf}
          onDeleteAllCategoryMatches={onDeleteAllCategoryMatches}
        />
      )}
    </div>
  );
};
