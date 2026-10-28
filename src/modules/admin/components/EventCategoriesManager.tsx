import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, Tag } from 'lucide-react';
import {
  minifyPairForStorage,
  getNextRegistrationId,
  type EventCategory,
  type TournamentEntry,
  type TournamentEvent,
  type TournamentPair,
  type TournamentMatch,
} from '@modules/events/types';
import {
  pairsSharePlayer,
  updatePlayoffProgression,
  useCategoryBoard,
  useMatchAdminActions,
  useTeamFormationActions,
} from '@modules/events/domain/brackets';
import { updateSuper8DuplasProgression } from '@modules/events/services/matchProgression';
import { isRankingEvent, isSuper8Event, isSuper8DuplasEvent } from '@modules/events/services/eventTypeHelpers';
import type { FirebaseAdminSportIcon } from '@infra/firebase/adminIcons';
import { getDb, getAuthInstance } from '@infra/firebase';
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
  adminEmail?: string;
}

export const EventCategoriesManager: React.FC<Props> = ({
  event,
  activeSports,
  onUpdateCategories,
  onUpdateEvent,
  isReadOnly = false,
  adminEmail,
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
  const [maxPlayers, setMaxPlayers] = useState<number>(8);

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
    setMaxPlayers(8);
    setIsAdding(false);
    setEditingId(null);
  };

  const handleImportMatches = async (nextPairs: TournamentPair[], nextMatches: TournamentMatch[]) => {
    const pairsById = new Map(nextPairs.map((pair) => [pair.id, pair]));
    const pairFromMatch = (pair: TournamentPair | undefined, categoryId?: string) => {
      if (!pair) return;
      const normalizedPair = { ...pair, categoryId: pair.categoryId || categoryId };
      pairsById.set(normalizedPair.id, normalizedPair);
    };
    nextMatches.forEach((match) => {
      if (match.categoryId !== selectedCategoryId) return;
      pairFromMatch(match.pair1, match.categoryId);
      pairFromMatch(match.pair2, match.categoryId);
    });
    const allPairs = Array.from(pairsById.values());
    const matchesWithPairs = nextMatches.map((match) => match.categoryId !== selectedCategoryId ? match : ({
      ...match,
      pair1: match.pair1 || (match.pair1Id ? pairsById.get(match.pair1Id) : undefined),
      pair2: match.pair2 || (match.pair2Id ? pairsById.get(match.pair2Id) : undefined),
    }));
    const nextEvent = { ...event, pairs: allPairs, matches: matchesWithPairs };
    const db = getDb();
    if (!db) throw new Error('Não foi possível conectar ao banco de dados.');
    await updateEvent(db as Firestore, event.pin, { pairs: allPairs, matches: matchesWithPairs });
    onUpdateEvent(nextEvent);
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
    setMaxPlayers(cat.maxPlayers ?? 8);
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
              maxPlayers: maxPlayers > 0 ? maxPlayers : 8,
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
        maxPlayers: maxPlayers > 0 ? maxPlayers : 8,
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
      const p1Key = existingPair.p1.email || existingPair.p1.pin || '';
      const p2Key = existingPair.p2.email || existingPair.p2.pin || '';
      const isAlreadySelected =
        ((existingPair.p1.email && selectedEntries.has(existingPair.p1.email)) || (existingPair.p1.pin && selectedEntries.has(existingPair.p1.pin))) &&
        ((existingPair.p2.email && selectedEntries.has(existingPair.p2.email)) || (existingPair.p2.pin && selectedEntries.has(existingPair.p2.pin)));
      if (isAlreadySelected) {
        setSelectedEntries(new Set());
      } else {
        setSelectedEntries(new Set([p1Key, p2Key].filter(Boolean)));
      }
      return;
    }

    const entryKey = entry.email || entry.pin;
    if (!entryKey) return;
    const next = new Set(selectedEntries);
    const hasKey = Boolean(
      (entry.email && next.has(entry.email)) ||
      (entry.pin && next.has(entry.pin))
    );
    if (hasKey) {
      if (entry.email) next.delete(entry.email);
      if (entry.pin) next.delete(entry.pin);
    } else {
      if (next.size >= 2) {
        const first = Array.from(next)[0];
        next.clear();
        next.add(first);
      }
      next.add(entryKey);
    }
    setSelectedEntries(next);
  };

  const toggleTeamSelection = (pair: TournamentPair) => {
    if (!isManualMatchDraw && !isRanking) return;
    const next = new Set(selectedTeamIds);
    if (next.has(pair.id)) {
      next.delete(pair.id);
    } else {
      if (next.size === 1) {
        const firstId = Array.from(next)[0];
        const firstPair = pairs.find((p) => p.id === firstId);
        if (firstPair && pairsSharePlayer(firstPair, pair)) {
          return;
        }
      }
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
    handleScoreUndoChange,
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

  const handleSaveExpandedEntry = async (
    entryData: TournamentEntry,
    originalEntryOrPin: TournamentEntry | string,
    isDraft = false
  ) => {
    const originalEntry =
      typeof originalEntryOrPin === 'object' && originalEntryOrPin !== null
        ? originalEntryOrPin
        : entries.find((e) =>
            (originalEntryOrPin && e.pin?.toUpperCase().trim() === String(originalEntryOrPin).toUpperCase().trim()) ||
            (entryData.email && e.email?.toLowerCase().trim() === entryData.email.toLowerCase().trim())
          );

    const oldEmail = (originalEntry?.email || '').toLowerCase().trim();
    const oldPin = (
      originalEntry?.pin ||
      (typeof originalEntryOrPin === 'string' ? originalEntryOrPin : '') ||
      ''
    ).toUpperCase().trim();
    const oldRegId = originalEntry?.registrationId;

    const newEmail = (entryData.email || '').toLowerCase().trim();
    const newPin = (entryData.pin || '').toUpperCase().trim();

    const isRealAthlete = Boolean(newEmail && !newEmail.includes('@simplificada.local') && !newPin.startsWith('TEMP'));
    const finalEntry: TournamentEntry = {
      ...entryData,
      registrationId: entryData.registrationId || oldRegId || getNextRegistrationId(entries),
      ...(isRealAthlete ? { isSimplified: false } : {}),
    };

    const db = getDb();
    if (db && event.pin) {
      try {
        const { deleteAdminEventEntry, saveAdminEventEntry, saveUserEventRegistration, deleteUserEventRegistration } = await import('@infra/firebase/events');

        // Se o email mudou (ex: de temporário para o email real do atleta vinculado)
        if (oldEmail && newEmail && oldEmail !== newEmail) {
          await deleteAdminEventEntry(
            db as Firestore,
            event.pin,
            oldEmail,
            oldPin || undefined,
            adminEmail || getAuthInstance()?.currentUser?.email || undefined
          ).catch((err) => console.error('Erro ao excluir inscrição temporária anterior:', err));
          await deleteUserEventRegistration(db as Firestore, oldEmail, event.pin).catch(() => {});
        }

        await saveAdminEventEntry(
          db as Firestore,
          event.pin,
          finalEntry,
          adminEmail || getAuthInstance()?.currentUser?.email || undefined
        );

        if (newEmail && !newEmail.includes('@simplificada.local')) {
          await saveUserEventRegistration(db as Firestore, newEmail, event.pin, {
            pin: event.pin,
            name: event.name || event.pin,
            joinedAt: finalEntry.joinedAt || Date.now(),
            bannerUrl: event.bannerUrl || null,
            paymentStatus: finalEntry.paymentStatus,
          }).catch(() => {});
        }
      } catch (err) {
        console.error('Erro ao salvar inscrição expandida no Firestore:', err);
      }
    }

    // Sincronizar duplas se o atleta já participava de alguma
    let pairsChanged = false;
    const updatedPairs = (event.pairs || []).map((pair) => {
      let pChanged = false;
      const p1 = { ...pair.p1 };
      const p2 = { ...pair.p2 };
      const matchP1 =
        (oldRegId && p1.registrationId && p1.registrationId === oldRegId) ||
        (oldEmail && p1.email?.toLowerCase().trim() === oldEmail) ||
        (oldPin && p1.pin?.toUpperCase().trim() === oldPin);
      if (matchP1) {
        p1.email = finalEntry.email;
        p1.pin = finalEntry.pin || p1.pin;
        p1.name = finalEntry.name || p1.name;
        p1.nickname = finalEntry.nickname || p1.nickname;
        p1.registrationId = finalEntry.registrationId || p1.registrationId;
        p1.isSimplified = false;
        if (finalEntry.gender) p1.gender = finalEntry.gender as 'M' | 'F';
        pChanged = true;
      }
      const matchP2 =
        (oldRegId && p2.registrationId && p2.registrationId === oldRegId) ||
        (oldEmail && p2.email?.toLowerCase().trim() === oldEmail) ||
        (oldPin && p2.pin?.toUpperCase().trim() === oldPin);
      if (matchP2) {
        p2.email = finalEntry.email;
        p2.pin = finalEntry.pin || p2.pin;
        p2.name = finalEntry.name || p2.name;
        p2.nickname = finalEntry.nickname || p2.nickname;
        p2.registrationId = finalEntry.registrationId || p2.registrationId;
        p2.isSimplified = false;
        if (finalEntry.gender) p2.gender = finalEntry.gender as 'M' | 'F';
        pChanged = true;
      }
      if (pChanged) pairsChanged = true;
      return pChanged ? { ...pair, p1, p2 } : pair;
    });

    // Sincronizar partidas já disputadas ou agendadas com os dados do atleta atualizado
    let matchesChanged = false;
    const isMatchAthlete = (a?: Partial<TournamentEntry>) => {
      if (!a) return false;
      if (oldRegId && a.registrationId && a.registrationId === oldRegId) return true;
      if (oldPin && a.pin && a.pin.toUpperCase().trim() === oldPin) return true;
      if (oldEmail && a.email && a.email.toLowerCase().trim() === oldEmail) return true;
      return false;
    };

    const updateAthleteObj = (a: TournamentEntry): TournamentEntry => ({
      ...a,
      name: finalEntry.name || a.name,
      nickname: finalEntry.nickname || a.nickname,
      email: finalEntry.email,
      pin: finalEntry.pin || a.pin,
      gender: (finalEntry.gender as any) || a.gender,
      registrationId: finalEntry.registrationId || a.registrationId,
      isSimplified: false,
    });

    const updatedMatches = (event.matches || []).map((match) => {
      let mChanged = false;
      let p1 = match.pair1 ? { ...match.pair1 } : undefined;
      let p2 = match.pair2 ? { ...match.pair2 } : undefined;

      if (p1) {
        let p1Changed = false;
        let p1p1 = p1.p1;
        let p1p2 = p1.p2;
        if (isMatchAthlete(p1p1)) {
          p1p1 = updateAthleteObj(p1p1);
          p1Changed = true;
        }
        if (p1p2 && isMatchAthlete(p1p2)) {
          p1p2 = updateAthleteObj(p1p2);
          p1Changed = true;
        }
        if (p1Changed) {
          p1 = { ...p1, p1: p1p1, ...(p1p2 ? { p2: p1p2 } : {}) };
          mChanged = true;
        }
      }

      if (p2) {
        let p2Changed = false;
        let p2p1 = p2.p1;
        let p2p2 = p2.p2;
        if (isMatchAthlete(p2p1)) {
          p2p1 = updateAthleteObj(p2p1);
          p2Changed = true;
        }
        if (p2p2 && isMatchAthlete(p2p2)) {
          p2p2 = updateAthleteObj(p2p2);
          p2Changed = true;
        }
        if (p2Changed) {
          p2 = { ...p2, p1: p2p1, ...(p2p2 ? { p2: p2p2 } : {}) };
          mChanged = true;
        }
      }

      if (mChanged) matchesChanged = true;
      return mChanged ? { ...match, pair1: p1, pair2: p2 } : match;
    });

    const isTargetEntry = (item: TournamentEntry) => {
      if (oldRegId && item.registrationId && item.registrationId === oldRegId) return true;
      if (oldPin && item.pin && item.pin.toUpperCase().trim() === oldPin) return true;
      if (oldEmail && item.email && item.email.toLowerCase().trim() === oldEmail) return true;
      return false;
    };

    const hasMatch = entries.some(isTargetEntry);
    const updatedEntries = hasMatch
      ? entries.map((item) => (isTargetEntry(item) ? finalEntry : item))
      : [...entries, finalEntry];

    onUpdateEvent({
      ...event,
      entries: updatedEntries,
      ...(pairsChanged ? { pairs: updatedPairs } : {}),
      ...(matchesChanged ? { matches: updatedMatches } : {}),
    });

    if (db && event.pin && (pairsChanged || matchesChanged)) {
      import('@infra/firebase/events').then(({ updateEvent: persistUpdateEvent }) => {
        persistUpdateEvent(db as Firestore, event.pin, {
          ...(pairsChanged ? { pairs: updatedPairs } : {}),
          ...(matchesChanged ? { matches: updatedMatches } : {}),
        }).catch((err) => console.error('Erro ao sincronizar duplas/partidas no Firestore:', err));
      });
    }

    if (!isDraft) {
      setExpandedRegistrationEmail(null);
      setModalConfig({
        title: 'Sucesso',
        message: 'Inscrição atualizada com sucesso!',
        variant: 'success',
        onConfirm: () => setModalConfig(null),
      });
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
        if (db && event.pin && (targetEntry?.email || targetEntry?.pin)) {
          try {
            const { deleteAdminEventEntry } = await import('@infra/firebase/events');
            await deleteAdminEventEntry(
              db as Firestore,
              event.pin,
              targetEntry.email || '',
              targetEntry.pin,
              adminEmail || getAuthInstance()?.currentUser?.email || undefined
            );
          } catch (err) {
            console.error('Erro ao excluir inscrição no Firestore:', err);
          }
        }
      },
      onCancel: () => setModalConfig(null),
    });
  };

  const handleDeleteAllCategoryEntries = () => {
    if (!selectedCategory) return;
    if (categoryEntries.length === 0) return;

    setModalConfig({
      title: 'Limpar todos os inscritos?',
      message: `Deseja excluir todos os ${categoryEntries.length} inscritos da categoria "${selectedCategory.name}"? Os times e partidas vinculados a eles nesta categoria também serão removidos.`,
      confirmLabel: 'Limpar tudo',
      variant: 'danger',
      onConfirm: async () => {
        setModalConfig(null);
        setSelectedEntries(new Set());

        const catId = selectedCategory.id;
        const entriesToDeleteFromDb: TournamentEntry[] = [];
        const nextEntries: TournamentEntry[] = [];

        for (const entry of entries) {
          const inThisCategory = entry.categoryIds?.includes(catId);
          if (!inThisCategory) {
            nextEntries.push(entry);
            continue;
          }

          const remainingCatIds = (entry.categoryIds || []).filter((id) => id !== catId);
          if (remainingCatIds.length > 0) {
            nextEntries.push({ ...entry, categoryIds: remainingCatIds });
          } else {
            entriesToDeleteFromDb.push(entry);
          }
        }

        const catPairIds = new Set(categoryPairs.map((p) => p.id));
        const remainingPairs = pairs.filter((p) => !catPairIds.has(p.id) && p.categoryId !== catId);
        const remainingMatches = matches.filter(
          (m) =>
            m.categoryId !== catId &&
            (!m.pair1Id || !catPairIds.has(m.pair1Id)) &&
            (!m.pair2Id || !catPairIds.has(m.pair2Id))
        );

        onUpdateEvent({
          ...event,
          entries: nextEntries,
          pairs: remainingPairs,
          matches: remainingMatches,
        });

        const db = getDb();
        if (db && event.pin) {
          try {
            const { deleteAdminEventEntry, deleteUserEventRegistration, updateEvent: persistUpdateEvent, saveAdminEventEntry } = await import('@infra/firebase/events');

            await Promise.all(
              entriesToDeleteFromDb.map(async (entry) => {
                await deleteAdminEventEntry(
                  db as Firestore,
                  event.pin,
                  entry.email || '',
                  entry.pin,
                  adminEmail || getAuthInstance()?.currentUser?.email || undefined
                ).catch(() => {});
                if (entry.email) {
                  await deleteUserEventRegistration(db as Firestore, entry.email, event.pin).catch(() => {});
                }
              })
            );

            await Promise.all(
              nextEntries
                .filter((e) => entries.find((orig) => orig.pin === e.pin && orig.categoryIds?.includes(catId)))
                .map((e) =>
                  saveAdminEventEntry(
                    db as Firestore,
                    event.pin,
                    e as any,
                    adminEmail || getAuthInstance()?.currentUser?.email || undefined
                  ).catch(() => {})
                )
            );

            await persistUpdateEvent(db as Firestore, event.pin, {
              pairs: remainingPairs.map(minifyPairForStorage),
              matches: remainingMatches,
            });
          } catch (err) {
            console.error('Erro ao excluir inscritos da categoria no Firestore:', err);
          }
        }
      },
      onCancel: () => setModalConfig(null),
    });
  };

  const handleDeleteAllCategoryPairs = () => {
    if (!selectedCategory) return;
    if (categoryPairs.length === 0) return;

    setModalConfig({
      title: 'Limpar todos os times?',
      message: `Deseja apagar todos os times formados da categoria "${selectedCategory.name}"? As partidas vinculadas a estes times também serão removidas.`,
      confirmLabel: 'Limpar tudo',
      variant: 'danger',
      onConfirm: async () => {
        setModalConfig(null);
        const catPairIds = new Set(categoryPairs.map((p) => p.id));
        const remainingPairs = pairs.filter((p) => !catPairIds.has(p.id) && p.categoryId !== selectedCategory.id);
        const remainingMatches = matches.filter(
          (m) =>
            m.categoryId !== selectedCategory.id &&
            (!m.pair1Id || !catPairIds.has(m.pair1Id)) &&
            (!m.pair2Id || !catPairIds.has(m.pair2Id))
        );

        onUpdateEvent({ ...event, pairs: remainingPairs, matches: remainingMatches });
        const db = getDb();
        if (db && event.pin) {
          try {
            const { updateEvent: persistUpdateEvent } = await import('@infra/firebase/events');
            await persistUpdateEvent(db as Firestore, event.pin, {
              pairs: remainingPairs.map(minifyPairForStorage),
              matches: remainingMatches,
            });
          } catch (err) {
            console.error('Erro ao excluir times da categoria no Firestore:', err);
          }
        }
      },
      onCancel: () => setModalConfig(null),
    });
  };

  const handleGenerateTemporaryCategoryEntries = () => {
    if (!selectedCategory) return;
    const limit = selectedCategory.maxPlayers && selectedCategory.maxPlayers > 0 ? selectedCategory.maxPlayers : 8;
    const currentCount = categoryEntries.length;
    const countToGenerate = limit - currentCount;

    if (countToGenerate <= 0) {
      setModalConfig({
        title: 'Limite atingido',
        message: `A categoria "${selectedCategory.name}" já atingiu o limite de ${limit} jogadores inscritos.`,
        variant: 'info',
        onConfirm: () => setModalConfig(null),
      });
      return;
    }

    const rawPrefix = (selectedCategory.abbreviation || selectedCategory.name || 'Atleta').trim();
    const prefix = rawPrefix.replace(/[^a-zA-Z0-9_-]/g, '') || 'Atleta';
    const cleanPrefixForEmail = prefix.toLowerCase().replace(/[^a-z0-9]/g, '') || 'atleta';

    // Determinar quais números já foram usados por atletas no padrão prefix_XXX
    const usedNumbers = new Set<number>();
    const prefixRegex = new RegExp(`^${prefix}_(\\d+)$`, 'i');
    for (const entry of entries) {
      const match = (entry.nickname || entry.name || '').match(prefixRegex);
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num)) usedNumbers.add(num);
      }
    }

    // Achar os próximos números livres
    const numbersToUse: number[] = [];
    let candidate = 1;
    while (numbersToUse.length < countToGenerate) {
      if (!usedNumbers.has(candidate)) {
        numbersToUse.push(candidate);
      }
      candidate++;
    }

    const startNumStr = String(numbersToUse[0]).padStart(3, '0');
    const endNumStr = String(numbersToUse[numbersToUse.length - 1]).padStart(3, '0');

    setModalConfig({
      title: 'Gerar inscrições temporárias?',
      message: `Deseja gerar ${countToGenerate} inscrição(ões) temporária(s) (${prefix}_${startNumStr}${countToGenerate > 1 ? ` a ${prefix}_${endNumStr}` : ''}) para preencher as ${limit} vagas da categoria "${selectedCategory.name}"?`,
      confirmLabel: 'Gerar inscritos',
      variant: 'success',
      onConfirm: async () => {
        setModalConfig(null);

        const isMixed =
          (selectedCategory.gender1 === 'M' && selectedCategory.gender2 === 'F') ||
          (selectedCategory.gender1 === 'F' && selectedCategory.gender2 === 'M') ||
          (selectedCategory.format === 'Duplas' &&
            Boolean(selectedCategory.gender1) &&
            Boolean(selectedCategory.gender2) &&
            selectedCategory.gender1 !== selectedCategory.gender2);

        let targetMales = 0;
        let targetFemales = 0;
        if (isMixed) {
          const halfLimit = Math.floor(limit / 2);
          const currentMales = categoryEntries.filter((e) => e.gender === 'M').length;
          const currentFemales = categoryEntries.filter((e) => e.gender === 'F').length;
          targetMales = Math.max(0, halfLimit - currentMales);
          targetFemales = Math.max(0, limit - halfLimit - currentFemales);
        }

        const isOnlyFemale =
          selectedCategory.gender1 === 'F' && (!selectedCategory.gender2 || selectedCategory.gender2 === 'F');
        const isOnlyMale =
          selectedCategory.gender1 === 'M' && (!selectedCategory.gender2 || selectedCategory.gender2 === 'M');

        let nextRegistrationIdSeq = getNextRegistrationId(entries);
        const newEntries: TournamentEntry[] = [];
        let maleAssigned = 0;

        for (let i = 0; i < countToGenerate; i++) {
          const num = numbersToUse[i];
          const paddedNum = String(num).padStart(3, '0');
          const athleteName = `${prefix}_${paddedNum}`;
          const uniqueToken = Math.random().toString(36).slice(2, 7).toUpperCase();

          let gender: 'M' | 'F' = 'M';
          if (isMixed) {
            if (maleAssigned < targetMales) {
              gender = 'M';
              maleAssigned++;
            } else {
              gender = 'F';
            }
          } else if (isOnlyFemale) {
            gender = 'F';
          } else if (isOnlyMale) {
            gender = 'M';
          } else {
            gender = i % 2 === 0 ? 'M' : 'F';
          }

          const entry: TournamentEntry = {
            name: athleteName,
            nickname: athleteName,
            pin: `TEMP${uniqueToken}`,
            email: `${cleanPrefixForEmail}_${paddedNum}_${Date.now().toString(36)}_${uniqueToken.toLowerCase()}@simplificada.local`,
            phone: '',
            shirtSize: 'M',
            gender,
            categoryIds: [selectedCategory.id],
            joinedAt: Date.now() + i,
            regulationAccepted: true,
            dueAmount: 0,
            paidAmount: 0,
            paymentStatus: 'Confirmado',
            payments: [],
            isSimplified: true,
            registrationId: nextRegistrationIdSeq++,
          };

          newEntries.push(entry);
        }

        const updatedEntries = [...entries, ...newEntries];
        onUpdateEvent({ ...event, entries: updatedEntries });

        const db = getDb();
        if (db && event.pin) {
          try {
            const { saveEventEntry: persistSaveEntry } = await import('@infra/firebase/events');
            await Promise.all(
              newEntries.map((e) =>
                persistSaveEntry(db as Firestore, event.pin, e as any).catch((err) => {
                  console.error('Erro ao salvar inscrição temporária no Firestore:', err);
                })
              )
            );
          } catch (err) {
            console.error('Erro ao salvar lote de inscrições temporárias no Firestore:', err);
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
        categoryPairs={categoryPairs}
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

      {/* Seletor de categorias — mesmo padrão usado na visão do participante */}
      {categories.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {[...categories]
            .sort((a, b) => a.priority - b.priority)
            .map((cat) => {
              const isSelected = selectedCategoryId === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => openCategoryPanel(cat.id, 'entries')}
                  className={`min-h-[44px] rounded-xl border px-3 py-2 text-xs font-black transition-all active:scale-[0.98] ${
                    isSelected
                      ? 'border-slate-900 bg-slate-900 text-white shadow-md'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {cat.name}{cat.abbreviation ? ` (${cat.abbreviation})` : ''}
                </button>
              );
            })}
        </div>
      )}

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
          {categories
            .filter((cat) => !selectedCategoryId || cat.id === selectedCategoryId)
            .map((cat) => {
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
                    onDeleteAllCategoryEntries={handleDeleteAllCategoryEntries}
                    onGenerateTemporaryEntries={handleGenerateTemporaryCategoryEntries}
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
                    onDeleteAllCategoryPairs={handleDeleteAllCategoryPairs}
                    onToggleTeamBracket={handleToggleTeamBracket}
                    onMoveTeamPosition={handleMoveTeamPosition}
                    selectedTeamIds={selectedTeamIds}
                    canSelectTeams={isManualMatchDraw || Boolean(isRanking)}
                    onToggleTeamSelection={toggleTeamSelection}
                    totalSets={totalSets}
                    queuePosByMatchId={queuePosByMatchId}
                    onScoreChange={handleScoreInputChange}
                    onUndoScore={handleScoreUndoChange}
                    onMatchDateChange={handleMatchDateChange}
                    onFinishMatch={handleFinishMatchWithValidation}
                    onReopenMatch={handleReopenMatch}
                    onDeleteMatch={handleDeleteMatch}
                    onGenerateMatches={handleGenerateSystemMatches}
                    onGenerateBlankPdf={handleGenerateBlankPdf}
                    onDeleteAllCategoryMatches={handleDeleteAllCategoryMatches}
                    onImportMatches={handleImportMatches}
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
