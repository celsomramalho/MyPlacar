import React from 'react';
import { X, Trash2, UsersRound, AlertTriangle } from 'lucide-react';
import type { TournamentMatch, TournamentPair } from '@modules/events/types';

interface CategorySelectionActionBarProps {
  isSuper8: boolean;
  isSuper8Duplas: boolean;
  selectedEntries: Set<string>;
  onClearSelectedEntries: () => void;
  isReadOnly: boolean;
  selectedPair: TournamentPair | null;
  onFormTeam: () => void;
  genderValidation: { valid: boolean; message?: string };
  isManualMatchDraw: boolean;
  isRanking: boolean;
  selectedTeamIds: Set<string>;
  onClearSelectedTeams: () => void;
  categoryMatches: TournamentMatch[];
  onDeleteMatch: (matchId: string) => void;
  onCreateManualMatch: () => void;
}

export const CategorySelectionActionBar: React.FC<CategorySelectionActionBarProps> = ({
  isSuper8,
  isSuper8Duplas,
  selectedEntries,
  onClearSelectedEntries,
  isReadOnly,
  selectedPair,
  onFormTeam,
  genderValidation,
  isManualMatchDraw,
  isRanking,
  selectedTeamIds,
  onClearSelectedTeams,
  categoryMatches,
  onDeleteMatch,
  onCreateManualMatch,
}) => {
  return (
    <>
      {/* Selection Header for ENTRIES (Formar time / Desfazer time) */}
      {!isSuper8 && !isSuper8Duplas && selectedEntries.size > 0 && (
        <header className="px-6 py-5 flex items-center justify-between bg-sky-600 text-white fixed top-0 left-0 right-0 z-[60] shadow-lg animate-in slide-in-from-top duration-200">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={onClearSelectedEntries}
              className="p-2 -ml-2 active:scale-90 transition-transform text-white hover:text-sky-100 cursor-pointer"
              title="Limpar seleção"
            >
              <X size={24} />
            </button>
            <h1 className="text-lg font-bold text-white">
              {selectedEntries.size} {selectedEntries.size === 1 ? 'Selecionado' : 'Selecionados'}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {!isReadOnly && (
              selectedPair ? (
                <button
                  type="button"
                  onClick={onFormTeam}
                  className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2.5 rounded-xl text-xs font-black shadow-md active:scale-95 transition-all cursor-pointer"
                  title="Desfazer time existente"
                >
                  <Trash2 size={16} />
                  <span>Desfazer time</span>
                </button>
              ) : selectedEntries.size === 2 ? (
                <button
                  type="button"
                  onClick={onFormTeam}
                  className={`flex items-center gap-2 text-white px-4 py-2.5 rounded-xl text-xs font-black shadow-md active:scale-95 transition-all cursor-pointer ${
                    genderValidation.valid
                      ? 'bg-emerald-500 hover:bg-emerald-600'
                      : 'bg-amber-500 hover:bg-amber-600'
                  }`}
                  title={genderValidation.valid ? 'Formar time' : genderValidation.message}
                >
                  {genderValidation.valid ? <UsersRound size={16} /> : <AlertTriangle size={16} />}
                  <span>Formar time</span>
                </button>
              ) : (
                <span className="text-xs font-bold text-sky-100 bg-sky-700/60 px-3 py-2 rounded-xl">
                  Selecione +1
                </span>
              )
            )}
          </div>
        </header>
      )}

      {/* Top Selection Action Bar for TEAMS (Manual Match Generation & Ranking Formar/Desfazer Partida) */}
      {(isManualMatchDraw || isRanking) && selectedTeamIds.size > 0 && (() => {
        const selectedTeamIdsArray = Array.from(selectedTeamIds);
        const existingMatchBetweenSelectedTeams = selectedTeamIdsArray.length === 2
          ? categoryMatches.find(
              (m) =>
                (m.pair1Id === selectedTeamIdsArray[0] && m.pair2Id === selectedTeamIdsArray[1]) ||
                (m.pair1Id === selectedTeamIdsArray[1] && m.pair2Id === selectedTeamIdsArray[0])
            )
          : null;

        return (
          <header className="px-6 py-5 flex items-center justify-between bg-sky-600 text-white fixed top-0 left-0 right-0 z-[60] shadow-lg animate-in slide-in-from-top duration-200">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={onClearSelectedTeams}
                className="p-2 -ml-2 active:scale-90 transition-transform text-white hover:text-sky-100 cursor-pointer"
                title="Limpar seleção"
              >
                <X size={24} />
              </button>
              <h1 className="text-lg font-bold text-white">
                {selectedTeamIds.size} {selectedTeamIds.size === 1 ? 'Selecionado' : 'Selecionados'}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              {!isReadOnly && (
                selectedTeamIds.size === 2 ? (
                  existingMatchBetweenSelectedTeams ? (
                    <button
                      type="button"
                      onClick={() => {
                        onDeleteMatch(existingMatchBetweenSelectedTeams.id);
                        onClearSelectedTeams();
                      }}
                      className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2.5 rounded-xl text-xs font-black shadow-md active:scale-95 transition-all cursor-pointer"
                      title="Desfazer partida entre os times selecionados"
                    >
                      <Trash2 size={16} />
                      <span>Desfazer partida</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={onCreateManualMatch}
                      className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-xs font-black shadow-md active:scale-95 transition-all cursor-pointer"
                      title="Formar partida com os 2 times selecionados"
                    >
                      <UsersRound size={16} />
                      <span>{isRanking ? 'Formar partida' : 'Gerar partida'}</span>
                    </button>
                  )
                ) : (
                  <span className="text-xs font-bold text-sky-100 bg-sky-700/60 px-3 py-2 rounded-xl">
                    Selecione +1 time
                  </span>
                )
              )}
            </div>
          </header>
        );
      })()}
    </>
  );
};
