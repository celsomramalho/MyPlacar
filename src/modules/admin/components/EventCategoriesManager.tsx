import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, Tag } from 'lucide-react';
import {
  minifyPairForStorage,
  type EventCategory,
  type TournamentEntry,
  type TournamentEvent,
  type TournamentPair,
  type TournamentMatch,
} from '@modules/events/types';
import {
  updatePlayoffProgression,
  useCategoryBoard,
  useMatchAdminActions,
  useTeamFormationActions,
} from '@modules/events/domain/brackets';
import { updateSuper8DuplasProgression } from '@modules/events/services/matchProgression';
import { isRankingEvent, isSuper8Event, isSuper8DuplasEvent } from '@modules/events/services/eventTypeHelpers';
import type { FirebaseAdminSportIcon } from '@infra/firebase/adminIcons';
import { getDb } from '@infra/firebase';
import { updateEvent, saveEventEntry, deleteEventEntry } from '@infra/firebase/events';
import type { Firestore } from 'firebase/firestore';
import { useUI } from '@modules/ui';

import {
  CategoryAccordionItem,
  CategoryBoardPanel,
  CategoryFormModal,
  CategorySelectionActionBar,
  Super8DuplasDrawModal,
} from './category';

interface Props {
  event: TournamentEvent;
  activeSports: FirebaseAdminSportIcon[];
  onUpdateCategories: (categories: EventCategory[]) => void;
  onUpdateEvent: (event: TournamentEvent) => void;
  isReadOnly?: boolean;
}

export const EventCategoriesManager: React.FC<Props> = ({
  event,
  activeSports,
  onUpdateCategories,
  onUpdateEvent,
  isReadOnly = false,
}) => {
  const { setModalConfig } = useUI();
  type CategoryPanelView = 'entries' | 'teams' | 'matches';

  const categories = event.categories || [];
  const entries = event.entries || [];
  const pairs = event.pairs || [];
  const matches = event.matches || [];

  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [categoryPanelView, setCategoryPanelView] = useState<CategoryPanelView>('entries');
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set());
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<'name' | 'team'>('team');
  const [expandedRegistrationEmail, setExpandedRegistrationEmail] = useState<string | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [format, setFormat] = useState<'Simples' | 'Duplas'>('Duplas');
  const [priority, setPriority] = useState<number>(categories.length + 1);
  const [sportId, setSportId] = useState<string>(activeSports[0]?.id || 'beach-tennis');
  const [abbreviation, setAbbreviation] = useState('');
  const [gender1, setGender1] = useState<'M' | 'F'>('M');
  const [gender2, setGender2] = useState<'M' | 'F'>('M');
  const [maxPlayers, setMaxPlayers] = useState<number>(event.maxPlayersPerCategory ?? 8);

  const isSuper8 = isSuper8Event(event);
  const isSuper8Duplas = isSuper8DuplasEvent(event);

  // Sincroniza e corrige os confrontos de playoffs caso placares anteriores tenham sido zerados
  useEffect(() => {
    if (!matches || matches.length === 0) return;
    const progressed = isSuper8Duplas
      ? updateSuper8DuplasProgression(entries, matches)
      : updatePlayoffProgression(pairs, matches);
    const hasDifference = progressed.some((m, idx) => {
      const orig = matches[idx];
      return (
        m.pair1Id !== orig?.pair1Id ||
        m.pair2Id !== orig?.pair2Id ||
        m.pair1Label !== orig?.pair1Label ||
        m.pair2Label !== orig?.pair2Label
      );
    });
    if (hasDifference) {
      onUpdateEvent({ ...event, matches: progressed });
      const db = getDb();
      if (db) {
        updateEvent(db as Firestore, event.pin, { matches: progressed }).catch((err) =>
          console.error('Erro ao sincronizar progressão de playoffs:', err)
        );
      }
    }
  }, [matches, pairs, entries, event.pin, isSuper8Duplas]);

  const resetForm = () => {
    setName('');
    setDescription('');
    setFormat('Duplas');
    setPriority(categories.length + 1);
    setSportId(activeSports[0]?.id || 'beach-tennis');
    setAbbreviation('');
    setGender1('M');
    setGender2('M');
    setMaxPlayers(event.maxPlayersPerCategory ?? 8);
    setIsAdding(false);
    setEditingId(null);
  };

  const handleStartAdd = () => {
    resetForm();
    setIsAdding(true);
  };

  const handleStartEdit = (cat: EventCategory) => {
    if (isAdding && editingId === cat.id) {
      resetForm();
      return;
    }
    setName(cat.name);
    setDescription(cat.description || '');
    setFormat(cat.format);
    setPriority(cat.priority);
    setSportId(cat.sportId);
    setAbbreviation(cat.abbreviation || '');
    setGender1(cat.gender1 || 'M');
    setGender2(cat.gender2 || 'M');
    setMaxPlayers(cat.maxPlayers ?? event.maxPlayersPerCategory ?? 8);
    setEditingId(cat.id);
    setIsAdding(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    let updated: EventCategory[];
    const selectedSport = activeSports.find((s) => s.id === sportId);
    const sportName = selectedSport?.name || '';

    if (editingId) {
      updated = categories.map((c) =>
        c.id === editingId
          ? {
              ...c,
              name: name.trim(),
              description: description.trim(),
              format,
              priority,
              sportId,
              sportName,
              abbreviation: abbreviation.trim(),
              gender1,
              gender2: format === 'Duplas' ? gender2 : undefined,
              maxPlayers: maxPlayers > 0 ? maxPlayers : (event.maxPlayersPerCategory ?? 8),
            }
          : c
      );
    } else {
      const newCategory: EventCategory = {
        id: `cat_${Date.now()}`,
        name: name.trim(),
        description: description.trim(),
        format,
        priority,
        sportId,
        sportName,
        abbreviation: abbreviation.trim(),
        gender1,
        gender2: format === 'Duplas' ? gender2 : undefined,
        maxPlayers: maxPlayers > 0 ? maxPlayers : (event.maxPlayersPerCategory ?? 8),
      };
      updated = [...categories, newCategory];
    }

    updated.sort((a, b) => a.priority - b.priority);
    onUpdateCategories(updated);
    resetForm();
  };

  const handleDelete = (id: string) => {
    const categoryToDelete = categories.find((c) => c.id === id);
    setModalConfig({
      title: 'Excluir categoria?',
      message: categoryToDelete
        ? `Deseja excluir a categoria "${categoryToDelete.name}"?`
        : 'Tem certeza que deseja excluir esta categoria?',
      confirmLabel: 'Excluir',
      variant: 'danger',
      onConfirm: () => {
        setModalConfig(null);
        const updated = categories.filter((c) => c.id !== id);
        onUpdateCategories(updated);
        if (selectedCategoryId === id) {
          setSelectedCategoryId(null);
        }
      },
      onCancel: () => setModalConfig(null),
    });
  };

  const isRanking = isRankingEvent(event);
  const isIndividualRanking = isSuper8 || isSuper8Duplas || isRanking;
  const isManualMatchDraw = event.matchDrawType === 'Manual';
  const isSystemDraw = event.matchDrawType === 'Sistema' || !event.matchDrawType;
  const totalSets = (event.setsCount || event.config?.sets || 1) as number;

  const openCategoryPanel = (categoryId: string, view: CategoryPanelView) => {
    setSelectedEntries(new Set());
    setSelectedTeamIds(new Set());
    if (selectedCategoryId === categoryId && categoryPanelView === view) {
      setSelectedCategoryId(null);
      return;
    }
    setSelectedCategoryId(categoryId);
    setCategoryPanelView(view);
  };

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId);
  const {
    categoryEntries,
    categoryMatches,
    categoryPairs,
    pairsById,
    queuePosByMatchId,
    playerStandings,
    playerStandingsMap,
    visibleCategoryEntries,
    selectionFilterGender,
    pairForEntry,
    selectedPair,
    bracketOnePairs,
    bracketTwoPairs,
    b1Matches,
    b2Matches,
    b1Standings,
    b2Standings,
    b1StandingsMap,
    b2StandingsMap,
    b1Finished,
    b2Finished,
    b1FinishedCount,
    b2FinishedCount,
  } = useCategoryBoard({
    event,
    categories,
    selectedCategoryId,
    selectedEntries,
    sortBy,
    isRanking,
    isIndividualRanking,
    totalSets,
  });

  const toggleEntrySelection = (entry: TournamentEntry) => {
    // Jogadores com inscrição desativada ou cancelada não podem ser selecionados para formar times
    if (entry.disabled || entry.paymentStatus === 'Cancelado') return;

    const existingPair = pairForEntry(entry);
    if (!isRanking && existingPair) {
      const isAlreadySelected =
        selectedEntries.has(existingPair.p1.email) &&
        selectedEntries.has(existingPair.p2.email);
      if (isAlreadySelected) {
        setSelectedEntries(new Set());
      } else {
        setSelectedEntries(new Set([existingPair.p1.email, existingPair.p2.email]));
      }
      return;
    }

    const next = new Set(selectedEntries);
    if (next.has(entry.email)) {
      next.delete(entry.email);
    } else {
      if (next.size >= 2) {
        const first = Array.from(next)[0];
        next.clear();
        next.add(first);
      }
      next.add(entry.email);
    }
    setSelectedEntries(next);
  };

  const toggleTeamSelection = (pair: TournamentPair) => {
    if (!isManualMatchDraw && !isRanking) return;
    const next = new Set(selectedTeamIds);
    if (next.has(pair.id)) {
      next.delete(pair.id);
    } else {
      if (next.size >= 2) {
        next.clear();
      }
      next.add(pair.id);
    }
    setSelectedTeamIds(next);
  };

  const {
    selectedEntriesList,
    genderValidation,
    handleFormTeam,
    handleToggleTeamBracket,
    handleRandomizeCategoryDraw,
    handleMoveTeamPosition,
  } = useTeamFormationActions({
    event,
    selectedCategory,
    selectedEntries,
    selectedPair,
    categoryEntries,
    categoryPairs,
    pairs,
    matches,
    onUpdateEvent,
    setSelectedEntries,
    setModalConfig,
  });


  const {
    isSuper8dDrawModalOpen,
    setIsSuper8dDrawModalOpen,
    handleCreateManualMatch,
    handleGenerateSystemMatches,
    handleConfirmSuper8DuplasDraw,
    handleDeleteMatch,
    handleDeleteAllCategoryMatches,
    handleScoreInputChange,
    handleMatchDateChange,
    handleFinishMatchWithValidation,
    handleReopenMatch,
    handleGenerateBlankPdf,
  } = useMatchAdminActions({
    event,
    selectedCategory,
    categoryEntries,
    categoryPairs,
    categoryMatches,
    pairs,
    pairsById,
    matches,
    selectedTeamIds,
    totalSets,
    isRanking,
    isSuper8,
    isSuper8Duplas,
    onUpdateEvent,
    setSelectedTeamIds,
    setModalConfig,
  });

  const handleSaveExpandedEntry = async (entryData: TournamentEntry, originalPin: string) => {
    const updatedEntries = entries.map((e) =>
      e.pin === originalPin || e.email === entryData.email ? { ...e, ...entryData } : e
    );
    onUpdateEvent({ ...event, entries: updatedEntries });
    setExpandedRegistrationEmail(null);
    const db = getDb();
    if (db && event.pin && entryData.email) {
      try {
        await saveEventEntry(db as Firestore, event.pin, entryData as any);
      } catch (err) {
        console.error('Erro ao salvar inscrição expandida no Firestore:', err);
      }
    }
  };

  const handleDeleteEntry = (targetPin: string) => {
    const targetEntry = entries.find((e) => e.pin === targetPin);
    setModalConfig({
      title: 'Excluir inscrição?',
      message: targetEntry
        ? `Deseja excluir a inscrição de "${targetEntry.name}"?`
        : 'Tem certeza que deseja excluir esta inscrição?',
      confirmLabel: 'Excluir',
      variant: 'danger',
      onConfirm: async () => {
        setModalConfig(null);
        const updatedEntries = entries.filter((e) => e.pin !== targetPin);
        onUpdateEvent({ ...event, entries: updatedEntries });
        const db = getDb();
        if (db && event.pin && targetEntry?.email) {
          try {
            await deleteEventEntry(db as Firestore, event.pin, targetEntry.email);
          } catch (err) {
            console.error('Erro ao excluir inscrição no Firestore:', err);
          }
        }
      },
      onCancel: () => setModalConfig(null),
    });
  };



  return (
    <div className="space-y-6">
      <CategorySelectionActionBar
        isSuper8={isSuper8}
        isSuper8Duplas={isSuper8Duplas}
        selectedEntries={selectedEntries}
        onClearSelectedEntries={() => setSelectedEntries(new Set())}
        isReadOnly={Boolean(isReadOnly)}
        selectedPair={selectedPair}
        onFormTeam={handleFormTeam}
        genderValidation={genderValidation}
        isManualMatchDraw={isManualMatchDraw}
        isRanking={isRanking}
        selectedTeamIds={selectedTeamIds}
        onClearSelectedTeams={() => setSelectedTeamIds(new Set())}
        categoryMatches={categoryMatches}
        onDeleteMatch={(matchId) => {
          handleDeleteMatch(matchId);
          setSelectedTeamIds(new Set());
        }}
        onCreateManualMatch={handleCreateManualMatch}
      />

      {/* Top Banner & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
        <div>
          <h2 className="text-xl font-black text-slate-800 tracking-tight">Categorias</h2>
          <p className="text-xs text-slate-400 font-bold mt-0.5">
            Defina formato, descrição e prioridade de cada disputa do evento.
          </p>
        </div>
        {!isAdding && !isReadOnly && (
          <button
            onClick={handleStartAdd}
            className="flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-black text-xs px-5 py-3 rounded-2xl shadow-sm transition-all self-start sm:self-auto cursor-pointer"
          >
            <Plus size={18} /> Categoria
          </button>
        )}
      </div>

      {/* Category Registration Form Modal (Adicionar) */}
      {isAdding && !editingId && (
        <CategoryFormModal
          editingId={null}
          name={name}
          description={description}
          format={format}
          sportId={sportId}
          abbreviation={abbreviation}
          priority={priority}
          gender1={gender1}
          gender2={gender2}
          maxPlayers={maxPlayers}
          activeSports={activeSports}
          onNameChange={setName}
          onDescriptionChange={setDescription}
          onFormatChange={setFormat}
          onSportIdChange={setSportId}
          onAbbreviationChange={setAbbreviation}
          onPriorityChange={setPriority}
          onGender1Change={setGender1}
          onGender2Change={setGender2}
          onMaxPlayersChange={setMaxPlayers}
          onSave={handleSave}
          onCancel={resetForm}
        />
      )}

      {/* Category Cards Grid */}
      {categories.length === 0 ? (
        <div className="bg-white p-10 rounded-3xl border border-slate-100 shadow-sm text-center space-y-2">
          <Tag className="mx-auto text-slate-300" size={32} />
          <p className="text-sm font-bold text-slate-400">Nenhuma categoria cadastrada ainda.</p>
          <p className="text-xs text-slate-300">Clique em &ldquo;+ Categoria&rdquo; para cadastrar a primeira disputa.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {categories.map((cat) => {
            const inscritosCount = entries.filter((e) =>
              e.categoryIds?.includes(cat.id)
            ).length;
            const timesCount = pairs.filter((p) =>
              p.categoryId === cat.id || (!p.categoryId && (p.p1.categoryIds?.includes(cat.id) || p.p2.categoryIds?.includes(cat.id)))
            ).length;
            const partidasCount = matches.filter((m) =>
              m.categoryId === cat.id || (!m.categoryId && pairs.some((p) => (p.id === m.pair1Id || p.id === m.pair2Id) && p.categoryId === cat.id))
            ).length;
            const isEditing = editingId === cat.id && isAdding;
            const isSelectedCategory = selectedCategoryId === cat.id;

            return (
              <React.Fragment key={cat.id}>
                <CategoryAccordionItem
                  cat={cat}
                  isEditing={isEditing}
                  isSelectedCategory={isSelectedCategory}
                  isReadOnly={isReadOnly}
                  categoryPanelView={categoryPanelView}
                  inscritosCount={inscritosCount}
                  timesCount={timesCount}
                  partidasCount={partidasCount}
                  onOpenPanel={openCategoryPanel}
                  onStartEdit={handleStartEdit}
                />

                {isEditing && (
                  <CategoryFormModal
                    editingId={editingId}
                    name={name}
                    description={description}
                    format={format}
                    sportId={sportId}
                    abbreviation={abbreviation}
                    priority={priority}
                    gender1={gender1}
                    gender2={gender2}
                    maxPlayers={maxPlayers}
                    activeSports={activeSports}
                    onNameChange={setName}
                    onDescriptionChange={setDescription}
                    onFormatChange={setFormat}
                    onSportIdChange={setSportId}
                    onAbbreviationChange={setAbbreviation}
                    onPriorityChange={setPriority}
                    onGender1Change={setGender1}
                    onGender2Change={setGender2}
                    onMaxPlayersChange={setMaxPlayers}
                    onSave={handleSave}
                    onDelete={handleDelete}
                    onCancel={resetForm}
                  />
                )}

                {selectedCategoryId === cat.id && (
                  <CategoryBoardPanel
                    category={cat}
                    categoryPanelView={categoryPanelView}
                    event={event}
                    visibleCategoryEntries={visibleCategoryEntries}
                    selectionFilterGender={selectionFilterGender}
                    categoryMatches={categoryMatches}
                    pairsById={pairsById}
                    playerStandingsMap={playerStandingsMap}
                    sortBy={sortBy}
                    isIndividualRanking={isIndividualRanking}
                    isRanking={isRanking}
                    isSuper8={isSuper8}
                    isSuper8Duplas={isSuper8Duplas}
                    isReadOnly={Boolean(isReadOnly)}
                    selectedEntries={selectedEntries}
                    expandedRegistrationEmail={expandedRegistrationEmail}
                    onSortChange={setSortBy}
                    onToggleEntrySelection={toggleEntrySelection}
                    onToggleExpandedRegistration={setExpandedRegistrationEmail}
                    onSaveExpandedEntry={handleSaveExpandedEntry}
                    onDeleteEntry={handleDeleteEntry}
                    onUpdateEvent={onUpdateEvent}
                    categoryPairs={categoryPairs}
                    bracketOnePairs={bracketOnePairs}
                    bracketTwoPairs={bracketTwoPairs}
                    b1StandingsMap={b1StandingsMap}
                    b2StandingsMap={b2StandingsMap}
                    b1Finished={b1Finished}
                    b2Finished={b2Finished}
                    b1MatchesCount={b1Matches.length}
                    b2MatchesCount={b2Matches.length}
                    b1FinishedCount={b1FinishedCount}
                    b2FinishedCount={b2FinishedCount}
                    isSystemDraw={isSystemDraw}
                    onRandomizeCategoryDraw={handleRandomizeCategoryDraw}
                    onUndoPair={(pairId) => {
                      const updatedPairs = pairs.filter((p) => p.id !== pairId);
                      const updatedMatches = matches.filter((m) => m.pair1Id !== pairId && m.pair2Id !== pairId);
                      onUpdateEvent({ ...event, pairs: updatedPairs, matches: updatedMatches });
                    }}
                    onToggleTeamBracket={handleToggleTeamBracket}
                    onMoveTeamPosition={handleMoveTeamPosition}
                    selectedTeamIds={selectedTeamIds}
                    canSelectTeams={isManualMatchDraw || Boolean(isRanking)}
                    onToggleTeamSelection={toggleTeamSelection}
                    totalSets={totalSets}
                    queuePosByMatchId={queuePosByMatchId}
                    onScoreChange={handleScoreInputChange}
                    onMatchDateChange={handleMatchDateChange}
                    onFinishMatch={handleFinishMatchWithValidation}
                    onReopenMatch={handleReopenMatch}
                    onDeleteMatch={handleDeleteMatch}
                    onGenerateMatches={handleGenerateSystemMatches}
                    onGenerateBlankPdf={handleGenerateBlankPdf}
                    onDeleteAllCategoryMatches={handleDeleteAllCategoryMatches}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}

      {/* Super 8 Duplas Draw Modal */}
      {isSuper8dDrawModalOpen && selectedCategory && (
        <Super8DuplasDrawModal
          isOpen={isSuper8dDrawModalOpen}
          category={selectedCategory}
          categoryEntries={categoryEntries}
          groupsPerBracket={event.groupsPerBracket ?? 2}
          initialDrawType={event.bracketDrawType}
          onClose={() => setIsSuper8dDrawModalOpen(false)}
          onConfirm={handleConfirmSuper8DuplasDraw}
        />
      )}
    </div>
  );
};
