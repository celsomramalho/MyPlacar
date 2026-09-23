import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, Tag, X, Trash2, UsersRound, AlertTriangle } from 'lucide-react';
import {
  minifyEntryForPair,
  minifyPairForStorage,
  orderPairEntriesForMixed,
  type EventCategory,
  type TournamentEntry,
  type TournamentEvent,
  type TournamentPair,
  type TournamentMatch,
  type MatchSetScore,
  type PlayerStanding,
} from '@modules/events/types';
import {
  generateSystemMatchesForCategory,
  generateSuper8MatchesForCategory,
  createManualMatch,
} from '@modules/events/services/matchGenerator';
import {
  updatePlayoffProgression,
  calculateBracketStandings,
  calculateSuper8PlayerStandings,
  type TeamStanding,
} from '@modules/events/services/matchProgression';
import { exportCategoryMatchesBlankPdf } from '@modules/events/services/tournamentPdfExport';
import { calculateQueueState } from '@modules/events/services/queueManager';
import type { FirebaseAdminSportIcon } from '@infra/firebase/adminIcons';
import { getDb } from '@infra/firebase';
import { updateEvent, saveEventEntry, deleteEventEntry } from '@infra/firebase/events';
import type { Firestore } from 'firebase/firestore';
import { useUI } from '@modules/ui';

import {
  CategoryAccordionItem,
  CategoryEntriesTab,
  CategoryFormModal,
  CategoryMatchesTab,
  CategoryTeamsTab,
} from './category';

interface Props {
  event: TournamentEvent;
  activeSports: FirebaseAdminSportIcon[];
  onUpdateCategories: (categories: EventCategory[]) => void;
  onUpdateEvent: (event: TournamentEvent) => void;
  isReadOnly?: boolean;
}

const getParticipantKey = (entry?: Partial<TournamentEntry> | null) =>
  (entry?.email || entry?.pin || entry?.name || '').toLowerCase().trim();

const pairHasSameParticipants = (pair: TournamentPair, first: TournamentEntry, second: TournamentEntry) => {
  const pairP1 = getParticipantKey(pair.p1);
  const pairP2 = getParticipantKey(pair.p2);
  const firstKey = getParticipantKey(first);
  const secondKey = getParticipantKey(second);
  if (!pairP1 || !pairP2 || !firstKey || !secondKey) return false;
  return (
    (pairP1 === firstKey && pairP2 === secondKey) ||
    (pairP1 === secondKey && pairP2 === firstKey)
  );
};

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

  const saveMatchesTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pairsById = useMemo(() => {
    const map: Record<string, TournamentPair> = {};
    pairs.forEach((p) => {
      map[p.id] = p;
    });
    return map;
  }, [pairs]);

  // Sincroniza e corrige os confrontos de playoffs caso placares anteriores tenham sido zerados
  useEffect(() => {
    if (!matches || matches.length === 0) return;
    const progressed = updatePlayoffProgression(pairs, matches);
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
  }, [matches, pairs, event.pin]);

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

  const isSuper8 = event.eventType === 'Super 8';
  const isRanking = event.eventType === 'Ranking';
  const isIndividualRanking = isSuper8 || isRanking;
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
  const categoryEntries = useMemo(() => {
    return entries.filter((e) =>
      selectedCategory ? e.categoryIds?.includes(selectedCategory.id) : false
    );
  }, [entries, selectedCategory]);

  const categoryMatches = useMemo(() => {
    return matches.filter(
      (m) =>
        selectedCategory &&
        (m.categoryId === selectedCategory.id ||
          (!m.categoryId && pairs.some((p) => (p.id === m.pair1Id || p.id === m.pair2Id) && p.categoryId === selectedCategory.id)))
    );
  }, [matches, pairs, selectedCategory]);

  const categoryPairs = useMemo(() => {
    if (!selectedCategory) return [];
    return pairs.filter(
      (p) =>
        p.categoryId === selectedCategory.id ||
        (!p.categoryId && (p.p1.categoryIds?.includes(selectedCategory.id) || p.p2.categoryIds?.includes(selectedCategory.id)))
    );
  }, [pairs, selectedCategory]);

  const orderedQueue = useMemo(() => {
    try {
      return calculateQueueState(event).orderedQueue;
    } catch {
      return [];
    }
  }, [event]);

  const queuePosByMatchId = useMemo(() => {
    const map = new Map<string, number>();
    orderedQueue.forEach((item, idx) => {
      map.set(item.match.id, idx + 1);
    });
    return map;
  }, [orderedQueue]);

  const playerStandings = useMemo(() => {
    if (!isIndividualRanking || !selectedCategory) return [];
    return calculateSuper8PlayerStandings(categoryEntries, categoryMatches, isRanking ? 'rankingPoints' : 'wins');
  }, [isIndividualRanking, isRanking, selectedCategory, categoryEntries, categoryMatches]);

  const playerStandingsMap = useMemo(() => {
    const map = new Map<string, PlayerStanding>();
    playerStandings.forEach((st) => {
      const k1 = (st.entry.email || '').toLowerCase().trim();
      const k2 = (st.entry.pin || '').toLowerCase().trim();
      if (k1) map.set(k1, st);
      if (k2) map.set(k2, st);
    });
    return map;
  }, [playerStandings]);

  const sortedCategoryEntries = useMemo(() => {
    if (isIndividualRanking) {
      return [...categoryEntries].sort((a, b) => {
        const kA = (a.email || a.pin || '').toLowerCase().trim();
        const kB = (b.email || b.pin || '').toLowerCase().trim();
        const rA = playerStandingsMap.get(kA)?.rank ?? 9999;
        const rB = playerStandingsMap.get(kB)?.rank ?? 9999;
        if (rA !== rB) return rA - rB;
        return (a.name || '').localeCompare(b.name || '');
      });
    }
    if (sortBy === 'name') {
      return [...categoryEntries].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }
    return [...categoryEntries].sort((a, b) => {
      const pairA = pairs.find((p) =>
        p.categoryId === selectedCategory?.id &&
        (p.p1.email === a.email || p.p2.email === a.email || p.p1.pin === a.pin || p.p2.pin === a.pin)
      );
      const pairB = pairs.find((p) =>
        p.categoryId === selectedCategory?.id &&
        (p.p1.email === b.email || p.p2.email === b.email || p.p1.pin === b.pin || p.p2.pin === b.pin)
      );
      if (pairA && pairB) {
        const numA = pairA.teamNumber || 0;
        const numB = pairB.teamNumber || 0;
        if (numA !== numB) return numA - numB;
      }
      if (pairA && !pairB) return -1;
      if (!pairA && pairB) return 1;
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [isIndividualRanking, categoryEntries, sortBy, playerStandingsMap, pairs, selectedCategory?.id]);

  const pairForEntry = (entry: TournamentEntry) => {
    return pairs.find(
      (p) =>
        (p.categoryId === selectedCategory?.id || !p.categoryId) &&
        (p.p1.email === entry.email || p.p2.email === entry.email || p.p1.pin === entry.pin || p.p2.pin === entry.pin)
    );
  };

  const selectedPair = useMemo(() => {
    if (isRanking || selectedEntries.size !== 2) return null;
    const [e1, e2] = Array.from(selectedEntries);
    const found = pairs.find(
      (p) =>
        (p.categoryId === selectedCategory?.id || !p.categoryId) &&
        ((p.p1.email === e1 && p.p2.email === e2) || (p.p1.email === e2 && p.p2.email === e1))
    );
    if (!found) return null;
    const isPairSelected =
      selectedEntries.has(found.p1.email) && selectedEntries.has(found.p2.email);
    return isPairSelected ? found : null;
  }, [isRanking, pairs, selectedCategory?.id, selectedEntries]);

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

  const validateCategoryGenders = (
    cat: EventCategory,
    selectedPlayers: TournamentEntry[]
  ): { valid: boolean; message?: string } => {
    if (selectedPlayers.length !== 2) {
      return { valid: false, message: 'Selecione exatamente 2 jogadores.' };
    }

    const mCount = selectedPlayers.filter((p) => p.gender === 'M').length;
    const fCount = selectedPlayers.filter((p) => p.gender === 'F').length;

    const catNameLower = (cat.name || '').toLowerCase();
    const catDescLower = (cat.description || '').toLowerCase();
    const isExplicitMixed =
      (cat.gender1 === 'M' && cat.gender2 === 'F') ||
      (cat.gender1 === 'F' && cat.gender2 === 'M');
    const isTextMixed =
      catNameLower.includes('misto') ||
      catNameLower.includes('mista') ||
      catNameLower.includes('mix') ||
      catDescLower.includes('misto') ||
      catDescLower.includes('mista');

    if (isExplicitMixed || isTextMixed) {
      if (mCount !== 1 || fCount !== 1) {
        return {
          valid: false,
          message: `A categoria "${cat.name}" é mista e exige 1 atleta masculino e 1 jogadora feminina.`,
        };
      }
      return { valid: true };
    }

    const isExplicitFemale = cat.gender1 === 'F' && cat.gender2 === 'F';
    const isTextFemale =
      (catNameLower.includes('fem') || catDescLower.includes('fem')) &&
      !isTextMixed;

    if (isExplicitFemale || isTextFemale) {
      if (fCount !== 2) {
        return {
          valid: false,
          message: `A categoria "${cat.name}" é feminina e exige 2 atletas do gênero feminino.`,
        };
      }
      return { valid: true };
    }

    const isExplicitMale = cat.gender1 === 'M' && cat.gender2 === 'M';
    const isTextMale =
      (catNameLower.includes('masc') || catDescLower.includes('masc')) &&
      !isTextMixed;

    if (isExplicitMale || isTextMale) {
      if (mCount !== 2) {
        return {
          valid: false,
          message: `A categoria "${cat.name}" é masculina e exige 2 atletas do gênero masculino.`,
        };
      }
      return { valid: true };
    }

    if (cat.gender1 && cat.gender2) {
      const requiredM = (cat.gender1 === 'M' ? 1 : 0) + (cat.gender2 === 'M' ? 1 : 0);
      const requiredF = (cat.gender1 === 'F' ? 1 : 0) + (cat.gender2 === 'F' ? 1 : 0);
      if (mCount !== requiredM || fCount !== requiredF) {
        return {
          valid: false,
          message: `Os atletas selecionados (${mCount} masc / ${fCount} fem) não correspondem à categoria "${cat.name}".`,
        };
      }
    }

    return { valid: true };
  };

  const selectedEntriesList = useMemo(() => {
    return Array.from(selectedEntries)
      .map((email) => categoryEntries.find((entry) => entry.email === email))
      .filter(Boolean) as TournamentEntry[];
  }, [selectedEntries, categoryEntries]);

  const genderValidation = selectedCategory && selectedEntriesList.length === 2 && !selectedPair
    ? validateCategoryGenders(selectedCategory, selectedEntriesList)
    : { valid: true };

  const handleFormTeam = async () => {
    const db = getDb();
    if (selectedPair) {
      setModalConfig({
        title: 'Desfazer time?',
        message: selectedPair.teamCode
          ? `Deseja desfazer o time ${selectedPair.teamCode}?`
          : 'Deseja desfazer o time selecionado?',
        confirmLabel: 'Desfazer',
        variant: 'danger',
        onConfirm: async () => {
          setModalConfig(null);
          const nextPairs = pairs.filter((pair) => pair.id !== selectedPair.id);
          onUpdateEvent({ ...event, pairs: nextPairs });
          setSelectedEntries(new Set());
          if (db) {
            try {
              await updateEvent(db as Firestore, event.pin, { pairs: nextPairs });
            } catch (err) {
              console.error('Erro ao atualizar pairs no Firestore:', err);
            }
          }
        },
        onCancel: () => setModalConfig(null),
      });
      return;
    }
    if (!selectedCategory || selectedEntries.size !== 2) return;
    const selected = Array.from(selectedEntries).map((email) => categoryEntries.find((entry) => entry.email === email)).filter(Boolean) as TournamentEntry[];
    if (selected.length !== 2) return;

    if (selected.some((e) => e.disabled || e.paymentStatus === 'Cancelado')) {
      setModalConfig({
        title: 'Inscrição cancelada',
        message: 'Não é possível formar time com participantes com inscrição cancelada ou desativada.',
        onConfirm: () => setModalConfig(null),
      });
      return;
    }

    const validation = validateCategoryGenders(selectedCategory, selected);
    if (!validation.valid) {
      setModalConfig({
        title: 'Atenção',
        message: validation.message || 'Formação de time incompatível com os requisitos da categoria.',
        onConfirm: () => setModalConfig(null),
      });
      return;
    }
    const alreadyFormedPair = categoryPairs.find((pair) =>
      pairHasSameParticipants(pair, selected[0], selected[1])
    );
    if (alreadyFormedPair) {
      setModalConfig({
        title: 'Time já formado',
        message: `Este time já existe em ${alreadyFormedPair.teamCode || 'Times'}. Selecione uma combinação diferente de jogadores.`,
        onConfirm: () => setModalConfig(null),
      });
      return;
    }

    const teamNumber = Math.max(
      0,
      ...pairs.map((pair, index) => pair.teamNumber || Number(pair.teamCode?.match(/^\d{3}/)?.[0]) || index + 1)
    ) + 1;
    const teamCode = `${String(teamNumber).padStart(3, '0')} - ${selectedCategory.abbreviation}`;
    const [orderedP1, orderedP2] = orderPairEntriesForMixed(selected[0], selected[1]);
    const newPair: TournamentPair = {
      id: `pair_${Date.now()}`,
      p1: minifyEntryForPair(orderedP1),
      p2: minifyEntryForPair(orderedP2),
      categoryId: selectedCategory.id,
      teamNumber,
      teamCode,
    };
    const nextPairs = [...pairs.map(minifyPairForStorage), newPair];
    onUpdateEvent({ ...event, pairs: nextPairs });
    setSelectedEntries(new Set());
    if (db) {
      try {
        await updateEvent(db as Firestore, event.pin, { pairs: nextPairs });
      } catch (err) {
        console.error('Erro ao salvar novo pair no Firestore:', err);
      }
    }
  };

  const handleToggleTeamBracket = async (pair: TournamentPair) => {
    const hasCatMatches = matches.some(
      (m) =>
        m.categoryId === selectedCategory?.id ||
        (!m.categoryId && (m.pair1Id === pair.id || m.pair2Id === pair.id))
    );
    if (hasCatMatches) {
      window.alert('As chaves estão bloqueadas pois as partidas desta categoria já foram geradas.');
      return;
    }
    const nextBracket: 1 | 2 = (pair.bracket ?? 1) === 1 ? 2 : 1;
    const destBracketCount = categoryPairs.filter((p) => (p.bracket ?? 1) === nextBracket && p.id !== pair.id).length;
    const nextPairs = pairs.map((p) =>
      p.id === pair.id ? { ...p, bracket: nextBracket, bracketOrder: destBracketCount + 1 } : p
    );
    onUpdateEvent({
      ...event,
      pairs: nextPairs,
    });
    const db = getDb();
    if (db) {
      try {
        await updateEvent(db as Firestore, event.pin, { pairs: nextPairs });
      } catch (err) {
        console.error('Erro ao alternar chave no Firestore:', err);
      }
    }
  };

  const handleRandomizeCategoryDraw = async () => {
    if (!selectedCategory) return;
    const hasCatMatches = matches.some(
      (m) =>
        m.categoryId === selectedCategory.id ||
        (!m.categoryId && pairs.some((p) => (p.id === m.pair1Id || p.id === m.pair2Id) && p.categoryId === selectedCategory.id))
    );
    if (hasCatMatches) {
      window.alert('As chaves estão bloqueadas pois as partidas já foram geradas.');
      return;
    }

    const shuffled = [...categoryPairs].sort(() => Math.random() - 0.5);
    const half = Math.ceil(shuffled.length / 2);
    const bracket1Pairs = shuffled.slice(0, half);
    const bracket2Pairs = shuffled.slice(half);

    const updatedPairs = pairs.map((p) => {
      const idx1 = bracket1Pairs.findIndex((b1) => b1.id === p.id);
      if (idx1 !== -1) {
        return { ...p, bracket: 1 as const, bracketOrder: idx1 + 1 };
      }
      const idx2 = bracket2Pairs.findIndex((b2) => b2.id === p.id);
      if (idx2 !== -1) {
        return { ...p, bracket: 2 as const, bracketOrder: idx2 + 1 };
      }
      return p;
    });

    onUpdateEvent({ ...event, pairs: updatedPairs });
    const db = getDb();
    if (db) {
      try {
        await updateEvent(db as Firestore, event.pin, { pairs: updatedPairs });
      } catch (err) {
        console.error('Erro ao sortear chaves no Firestore:', err);
      }
    }
  };

  const handleMoveTeamPosition = async (pair: TournamentPair, direction: 'up' | 'down') => {
    const currentBracket = pair.bracket ?? 1;
    const bracketPairs = categoryPairs
      .filter((p) => (p.bracket ?? 1) === currentBracket)
      .sort((a, b) => {
        if (a.bracketOrder !== undefined && b.bracketOrder !== undefined) {
          return a.bracketOrder - b.bracketOrder;
        }
        if (a.bracketOrder !== undefined) return -1;
        if (b.bracketOrder !== undefined) return 1;
        return (a.teamNumber || 0) - (b.teamNumber || 0);
      });

    const currentIndex = bracketPairs.findIndex((p) => p.id === pair.id);
    if (currentIndex === -1) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= bracketPairs.length) return;

    const targetPair = bracketPairs[targetIndex];

    const updatedPairs = pairs.map((p) => {
      if (p.id === pair.id) {
        return { ...p, bracketOrder: targetIndex + 1 };
      }
      if (p.id === targetPair.id) {
        return { ...p, bracketOrder: currentIndex + 1 };
      }
      return p;
    });

    onUpdateEvent({ ...event, pairs: updatedPairs });
    const db = getDb();
    if (db) {
      try {
        await updateEvent(db as Firestore, event.pin, { pairs: updatedPairs });
      } catch (err) {
        console.error('Erro ao mover posição do time no Firestore:', err);
      }
    }
  };

  const handleCreateManualMatch = async () => {
    if (selectedTeamIds.size !== 2 || !selectedCategory) return;
    const [t1Id, t2Id] = Array.from(selectedTeamIds);
    const p1 = pairs.find((p) => p.id === t1Id);
    const p2 = pairs.find((p) => p.id === t2Id);
    if (!p1 || !p2) return;

    const rankingMatchesLimit = Number(event.rankingMatchesPerTeam || 0);
    if (isRanking && rankingMatchesLimit > 0) {
      const blockedPair = [p1, p2].find((pair) =>
        categoryMatches.filter((m) => m.pair1Id === pair.id || m.pair2Id === pair.id).length >= rankingMatchesLimit
      );
      if (blockedPair) {
        setModalConfig({
          title: 'Limite de partidas atingido',
          message: `${blockedPair.teamCode || 'Este time'} já atingiu o limite de ${rankingMatchesLimit} ${rankingMatchesLimit === 1 ? 'partida permitida' : 'partidas permitidas'}.`,
          onConfirm: () => setModalConfig(null),
        });
        return;
      }
    }

    const newMatch = createManualMatch(p1, p2, selectedCategory, matches);
    if (isRanking) {
      newMatch.phase = 'ranking';
    }
    const nextMatches = [...matches, newMatch];

    onUpdateEvent({ ...event, matches: nextMatches });
    setSelectedTeamIds(new Set());

    const db = getDb();
    if (db) {
      try {
        await updateEvent(db as Firestore, event.pin, { matches: nextMatches });
      } catch (err) {
        console.error('Erro ao salvar partida manual no Firestore:', err);
      }
    }
  };

  const handleGenerateSystemMatches = async () => {
    if (!selectedCategory) return;
    let newCategoryMatches: TournamentMatch[] = [];

    if (isSuper8) {
      newCategoryMatches = generateSuper8MatchesForCategory(selectedCategory, categoryEntries, matches);
    } else {
      newCategoryMatches = generateSystemMatchesForCategory(selectedCategory, categoryPairs, matches);
    }

    const otherMatches = matches.filter(
      (m) =>
        m.categoryId !== selectedCategory.id &&
        !pairs.some((p) => (p.id === m.pair1Id || p.id === m.pair2Id) && p.categoryId === selectedCategory.id)
    );

    const nextMatches = [...otherMatches, ...newCategoryMatches];
    onUpdateEvent({ ...event, matches: nextMatches });

    const db = getDb();
    if (db) {
      try {
        await updateEvent(db as Firestore, event.pin, { matches: nextMatches });
      } catch (err) {
        console.error('Erro ao gerar partidas pelo sistema no Firestore:', err);
      }
    }
  };

  const handleDeleteMatch = (matchId: string) => {
    setModalConfig({
      title: 'Excluir partida?',
      message: 'Tem certeza que deseja excluir esta partida?',
      confirmLabel: 'Excluir',
      variant: 'danger',
      onConfirm: async () => {
        setModalConfig(null);
        const nextMatches = matches.filter((m) => m.id !== matchId);
        onUpdateEvent({ ...event, matches: nextMatches });
        const db = getDb();
        if (db) {
          try {
            await updateEvent(db as Firestore, event.pin, { matches: nextMatches });
          } catch (err) {
            console.error('Erro ao excluir partida no Firestore:', err);
          }
        }
      },
      onCancel: () => setModalConfig(null),
    });
  };

  const handleDeleteAllCategoryMatches = () => {
    if (!selectedCategory) return;
    setModalConfig({
      title: 'Limpar todos os confrontos?',
      message: `Deseja apagar todos os jogos gerados da categoria "${selectedCategory.name}"?`,
      confirmLabel: 'Limpar tudo',
      variant: 'danger',
      onConfirm: async () => {
        setModalConfig(null);
        const remainingMatches = matches.filter(
          (m) =>
            m.categoryId !== selectedCategory.id &&
            !pairs.some((p) => (p.id === m.pair1Id || p.id === m.pair2Id) && p.categoryId === selectedCategory.id)
        );
        onUpdateEvent({ ...event, matches: remainingMatches });
        const db = getDb();
        if (db) {
          try {
            await updateEvent(db as Firestore, event.pin, { matches: remainingMatches });
          } catch (err) {
            console.error('Erro ao limpar partidas da categoria no Firestore:', err);
          }
        }
      },
      onCancel: () => setModalConfig(null),
    });
  };

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

  const parseMatchSets = (match: TournamentMatch, totalSetsCount: number) => {
    const gamesPerSet = Number(event.gamesPerSet || event.config?.gamesPerSet || (event.eventType === 'Super 8' ? 4 : 6));
    const scores: MatchSetScore[] = Array.from({ length: totalSetsCount }, (_, i) => {
      if (match.scores && match.scores[i]) {
        return match.scores[i];
      }
      if (match.result) {
        const parts = match.result.trim().split(/[\s,]+/);
        if (parts[i]) {
          const matchParts = parts[i].match(/(\d+)[\/xX\-](\d+)/);
          if (matchParts) {
            return { p1: Number(matchParts[1]), p2: Number(matchParts[2]) };
          }
        }
      }
      return { p1: null, p2: null };
    });

    let setsWon1 = 0;
    let setsWon2 = 0;

    scores.forEach((s) => {
      if (s.inProgress && match.status !== 'finished') return;
      if (s.p1 !== null && s.p1 !== undefined && s.p2 !== null && s.p2 !== undefined) {
        const n1 = Number(s.p1);
        const n2 = Number(s.p2);
        if (n1 >= gamesPerSet && n1 > n2) {
          setsWon1 += 1;
        } else if (n2 >= gamesPerSet && n2 > n1) {
          setsWon2 += 1;
        }
      }
    });

    return { scores, setsWon1, setsWon2 };
  };

  const handleScoreInputChange = (
    matchId: string,
    setIndex: number,
    player: 'p1' | 'p2',
    rawVal: string
  ) => {
    const setsToWin = Math.ceil(totalSets / 2);
    const gamesPerSet = Number(event.gamesPerSet || event.config?.gamesPerSet || (event.eventType === 'Super 8' ? 4 : 6));

    const nextMatches = matches.map((m) => {
      if (m.id !== matchId) return m;

      const currentScores: MatchSetScore[] = Array.from({ length: totalSets }, (_, i) => {
        const existing = m.scores?.[i] || {};
        return {
          p1: existing.p1 !== undefined ? existing.p1 : null,
          p2: existing.p2 !== undefined ? existing.p2 : null,
        };
      });

      const parsedNum = rawVal.trim() === '' ? null : parseInt(rawVal, 10);
      const val = isNaN(parsedNum as number) ? null : parsedNum;

      currentScores[setIndex] = {
        ...currentScores[setIndex],
        [player]: val,
      };

      let setsWon1 = 0;
      let setsWon2 = 0;
      const resultParts: string[] = [];
      let hasAnyScore = false;

      currentScores.forEach((s) => {
        if (s.p1 !== null && s.p1 !== undefined && s.p2 !== null && s.p2 !== undefined) {
          resultParts.push(`${s.p1}/${s.p2}`);
          hasAnyScore = true;
          const n1 = Number(s.p1);
          const n2 = Number(s.p2);
          if (n1 >= gamesPerSet && n1 > n2) {
            setsWon1 += 1;
          } else if (n2 >= gamesPerSet && n2 > n1) {
            setsWon2 += 1;
          }
        } else if (s.p1 !== null || s.p2 !== null) {
          hasAnyScore = true;
        }
      });

      let status: 'waiting' | 'live' | 'finished' = m.status === 'finished' ? 'finished' : (hasAnyScore ? 'live' : 'waiting');
      let winnerPairId: string | undefined = m.winnerPairId;
      let loserPairId: string | undefined = m.loserPairId;

      if (status === 'finished') {
        if (setsWon1 > setsWon2) {
          winnerPairId = m.pair1Id;
          loserPairId = m.pair2Id;
        } else if (setsWon2 > setsWon1) {
          winnerPairId = m.pair2Id;
          loserPairId = m.pair1Id;
        }
      }

      return {
        ...m,
        scores: currentScores,
        result: resultParts.join(' '),
        status,
        winnerPairId,
        loserPairId,
      };
    });

    onUpdateEvent({ ...event, matches: nextMatches });

    if (saveMatchesTimeoutRef.current) clearTimeout(saveMatchesTimeoutRef.current);
    saveMatchesTimeoutRef.current = setTimeout(async () => {
      const db = getDb();
      if (db) {
        try {
          await updateEvent(db as Firestore, event.pin, { matches: nextMatches });
        } catch (err) {
          console.error('Erro ao salvar placar no Firestore debounce:', err);
        }
      }
    }, 1000);
  };

  const handleMatchDateChange = (matchId: string, dateVal: string) => {
    const nextMatches = matches.map((m) =>
      m.id !== matchId ? m : { ...m, matchDate: dateVal || undefined }
    );
    onUpdateEvent({ ...event, matches: nextMatches });

    if (saveMatchesTimeoutRef.current) clearTimeout(saveMatchesTimeoutRef.current);
    saveMatchesTimeoutRef.current = setTimeout(async () => {
      const db = getDb();
      if (db) {
        try {
          await updateEvent(db as Firestore, event.pin, { matches: nextMatches });
        } catch (err) {
          console.error('Erro ao salvar data da partida no Firestore:', err);
        }
      }
    }, 600);
  };

  const handleFinishMatch = async (matchId: string) => {
    const nowIso = new Date().toISOString();
    const nextMatches = matches.map((m) => {
      if (m.id !== matchId) return m;
      const { setsWon1, setsWon2, scores } = parseMatchSets(m, totalSets);
      let winnerPairId = m.winnerPairId;
      let loserPairId = m.loserPairId;

      if (setsWon1 > setsWon2) {
        winnerPairId = m.pair1Id;
        loserPairId = m.pair2Id;
      } else if (setsWon2 > setsWon1) {
        winnerPairId = m.pair2Id;
        loserPairId = m.pair1Id;
      } else if (scores[0]?.p1 !== null && scores[0]?.p2 !== null) {
        const n1 = Number(scores[0]?.p1 ?? 0);
        const n2 = Number(scores[0]?.p2 ?? 0);
        if (n1 > n2) {
          winnerPairId = m.pair1Id;
          loserPairId = m.pair2Id;
        } else if (n2 > n1) {
          winnerPairId = m.pair2Id;
          loserPairId = m.pair1Id;
        }
      }

      const p1Obj = m.pair1 || (m.pair1Id ? pairs.find((p) => p.id === m.pair1Id) : undefined);
      const p2Obj = m.pair2 || (m.pair2Id ? pairs.find((p) => p.id === m.pair2Id) : undefined);

      let durationMinutes: number | undefined = undefined;
      if (m.startedAt) {
        const startMs = new Date(m.startedAt).getTime();
        const endMs = new Date(nowIso).getTime();
        if (!isNaN(startMs) && !isNaN(endMs) && endMs >= startMs) {
          durationMinutes = Math.max(1, Math.round((endMs - startMs) / 60000));
        }
      }

      return {
        ...m,
        status: 'finished' as const,
        winnerPairId: winnerPairId || m.pair1Id,
        loserPairId: loserPairId || m.pair2Id,
        pair1: p1Obj ? minifyPairForStorage(p1Obj) : m.pair1,
        pair2: p2Obj ? minifyPairForStorage(p2Obj) : m.pair2,
        finishedAt: nowIso,
        durationMinutes: durationMinutes ?? m.durationMinutes,
      };
    });

    const progressedMatches = isRanking ? nextMatches : updatePlayoffProgression(pairs, nextMatches);
    onUpdateEvent({ ...event, matches: progressedMatches, pairs });

    const db = getDb();
    if (db) {
      try {
        await updateEvent(db as Firestore, event.pin, { matches: progressedMatches, pairs });
      } catch (err) {
        console.error('Erro ao finalizar partida no Firestore:', err);
      }
    }
  };

  const handleFinishMatchWithValidation = (matchId: string) => {
    const setsToWin = Math.ceil(totalSets / 2);
    const gamesPerSet = Number(event.gamesPerSet || event.config?.gamesPerSet || (event.eventType === 'Super 8' ? 4 : 6));

    const match = matches.find((m) => m.id === matchId);
    if (!match) return;

    if (!match.matchDate) {
      setModalConfig({
        title: 'Data obrigatória',
        message: 'Informe a data da partida antes de finalizar.',
        onConfirm: () => setModalConfig(null),
        variant: 'info',
      });
      return;
    }

    const { scores, setsWon1, setsWon2 } = parseMatchSets(match, totalSets);

    const hasAnyScore = scores.some((s) => s.p1 !== null || s.p2 !== null);
    if (!hasAnyScore) {
      setModalConfig({
        title: 'Placar não informado',
        message: 'Digite o placar antes de finalizar a partida.',
        onConfirm: () => setModalConfig(null),
        variant: 'info',
      });
      return;
    }

    if (isRanking) {
      handleFinishMatch(matchId);
      return;
    }

    const scoreWarnings: string[] = [];
    scores.forEach((s, idx) => {
      if (s.p1 === null || s.p2 === null) return;
      const n1 = Number(s.p1);
      const n2 = Number(s.p2);
      const maxScore = Math.max(n1, n2);
      const minScore = Math.min(n1, n2);
      if (maxScore < gamesPerSet) {
        scoreWarnings.push(`Set ${idx + 1}: vencedor tem ${maxScore} games, esperado ${gamesPerSet}`);
      } else if (maxScore > gamesPerSet && !(maxScore === gamesPerSet + 1 && minScore === gamesPerSet - 1)) {
        scoreWarnings.push(`Set ${idx + 1}: placar ${n1}x${n2} parece inválido para ${gamesPerSet} games por set`);
      }
    });

    const winnerDefined = setsWon1 >= setsToWin || setsWon2 >= setsToWin;
    if (!winnerDefined && totalSets > 1) {
      scoreWarnings.push(`Nenhum time atingiu ${setsToWin} set(s) para vencer (melhor de ${totalSets})`);
    }

    if (scoreWarnings.length > 0) {
      setModalConfig({
        title: 'Placar irregular',
        message: (
          <>
            <span className="block font-bold mb-2">O placar informado parece incorreto:</span>
            {scoreWarnings.map((w, i) => (
              <span key={i} className="block text-sm text-slate-700">• {w}</span>
            ))}
            <span className="block mt-3 text-sm">Deseja finalizar mesmo assim?</span>
          </>
        ),
        confirmLabel: 'Finalizar assim mesmo',
        cancelLabel: 'Corrigir placar',
        onConfirm: () => {
          setModalConfig(null);
          handleFinishMatch(matchId);
        },
        onCancel: () => setModalConfig(null),
        variant: 'danger',
      });
      return;
    }

    handleFinishMatch(matchId);
  };

  const handleReopenMatch = async (matchId: string) => {
    const targetMatch = matches.find((m) => m.id === matchId);
    const nextMatches = matches.map((m) => {
      if (m.id !== matchId) return m;
      return {
        ...m,
        status: 'live' as const,
        winnerPairId: undefined,
        loserPairId: undefined,
      };
    });

    let nextPairs = pairs;
    if (isRanking && targetMatch) {
      const toAdd = [targetMatch.pair1, targetMatch.pair2].filter(
        (p): p is TournamentPair => Boolean(p && !pairs.some((ep) => ep.id === p.id))
      );
      if (toAdd.length > 0) {
        nextPairs = [...pairs, ...toAdd.map(minifyPairForStorage)];
      }
    }

    const progressedMatches = isRanking ? nextMatches : updatePlayoffProgression(nextPairs, nextMatches);
    onUpdateEvent({ ...event, matches: progressedMatches, pairs: nextPairs });

    const db = getDb();
    if (db) {
      try {
        await updateEvent(db as Firestore, event.pin, { matches: progressedMatches, pairs: nextPairs });
      } catch (err) {
        console.error('Erro ao reabrir partida no Firestore:', err);
      }
    }
  };

  const handleGenerateBlankPdf = () => {
    if (!selectedCategory) return;
    exportCategoryMatchesBlankPdf(event, selectedCategory, categoryMatches, pairsById);
  };

  // Prepara dados de chaves para a aba Times
  const bracketOnePairs = useMemo(() => {
    return categoryPairs
      .filter((pair) => (pair.bracket ?? 1) === 1)
      .sort((a, b) => {
        if (a.bracketOrder !== undefined && b.bracketOrder !== undefined) {
          return a.bracketOrder - b.bracketOrder;
        }
        if (a.bracketOrder !== undefined) return -1;
        if (b.bracketOrder !== undefined) return 1;
        return (a.teamNumber || 0) - (b.teamNumber || 0);
      });
  }, [categoryPairs]);

  const bracketTwoPairs = useMemo(() => {
    return categoryPairs
      .filter((pair) => pair.bracket === 2)
      .sort((a, b) => {
        if (a.bracketOrder !== undefined && b.bracketOrder !== undefined) {
          return a.bracketOrder - b.bracketOrder;
        }
        if (a.bracketOrder !== undefined) return -1;
        if (b.bracketOrder !== undefined) return 1;
        return (a.teamNumber || 0) - (b.teamNumber || 0);
      });
  }, [categoryPairs]);

  const b1Matches = useMemo(() => categoryMatches.filter((m) => m.phase === 'chave1'), [categoryMatches]);
  const b2Matches = useMemo(() => categoryMatches.filter((m) => m.phase === 'chave2'), [categoryMatches]);

  const b1Standings = useMemo(() => calculateBracketStandings(bracketOnePairs, b1Matches, totalSets), [bracketOnePairs, b1Matches, totalSets]);
  const b2Standings = useMemo(() => calculateBracketStandings(bracketTwoPairs, b2Matches, totalSets), [bracketTwoPairs, b2Matches, totalSets]);

  const b1StandingsMap = useMemo(() => new Map<string, TeamStanding>(b1Standings.map((s) => [s.pair.id, s])), [b1Standings]);
  const b2StandingsMap = useMemo(() => new Map<string, TeamStanding>(b2Standings.map((s) => [s.pair.id, s])), [b2Standings]);

  const b1Finished = b1Matches.length > 0 && b1Matches.every((m) => m.status === 'finished');
  const b2Finished = b2Matches.length > 0 && b2Matches.every((m) => m.status === 'finished');

  const b1FinishedCount = b1Matches.filter((m) => m.status === 'finished').length;
  const b2FinishedCount = b2Matches.filter((m) => m.status === 'finished').length;

  return (
    <div className="space-y-6">
      {/* Selection Header (Formar time / Desfazer time) */}
      {!isSuper8 && selectedEntries.size > 0 && (
        <header className="px-6 py-5 flex items-center justify-between bg-sky-600 text-white fixed top-0 left-0 right-0 z-[60] shadow-lg animate-in slide-in-from-top duration-200">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setSelectedEntries(new Set())}
              className="p-2 -ml-2 active:scale-90 transition-transform text-white hover:text-sky-100"
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
                  onClick={handleFormTeam}
                  className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2.5 rounded-xl text-xs font-black shadow-md active:scale-95 transition-all"
                  title="Desfazer time existente"
                >
                  <Trash2 size={16} />
                  <span>Desfazer time</span>
                </button>
              ) : selectedEntries.size === 2 ? (
                <button
                  type="button"
                  onClick={handleFormTeam}
                  className={`flex items-center gap-2 text-white px-4 py-2.5 rounded-xl text-xs font-black shadow-md active:scale-95 transition-all ${
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
                onClick={() => setSelectedTeamIds(new Set())}
                className="p-2 -ml-2 active:scale-90 transition-transform text-white hover:text-sky-100"
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
                        handleDeleteMatch(existingMatchBetweenSelectedTeams.id);
                        setSelectedTeamIds(new Set());
                      }}
                      className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2.5 rounded-xl text-xs font-black shadow-md active:scale-95 transition-all"
                      title="Desfazer partida entre os times selecionados"
                    >
                      <Trash2 size={16} />
                      <span>Desfazer partida</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleCreateManualMatch}
                      className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-xs font-black shadow-md active:scale-95 transition-all"
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
                  <div className="mt-2 space-y-4">
                    {categoryPanelView === 'entries' && (
                      <CategoryEntriesTab
                        category={cat}
                        event={event}
                        entries={sortedCategoryEntries}
                        categoryMatches={categoryMatches}
                        playerStandingsMap={playerStandingsMap}
                        sortBy={sortBy}
                        isIndividualRanking={isIndividualRanking}
                        isRanking={isRanking}
                        isSuper8={isSuper8}
                        isReadOnly={isReadOnly}
                        selectedEntries={selectedEntries}
                        expandedRegistrationEmail={expandedRegistrationEmail}
                        onSortChange={setSortBy}
                        onToggleEntrySelection={toggleEntrySelection}
                        onToggleExpandedRegistration={setExpandedRegistrationEmail}
                        onSaveExpandedEntry={handleSaveExpandedEntry}
                        onDeleteEntry={handleDeleteEntry}
                        onUpdateEvent={onUpdateEvent}
                      />
                    )}

                    {categoryPanelView === 'teams' && (
                      <CategoryTeamsTab
                        category={cat}
                        categoryPairs={categoryPairs}
                        categoryMatches={categoryMatches}
                        pairsById={pairsById}
                        bracketOneList={bracketOnePairs}
                        bracketTwoList={bracketTwoPairs}
                        b1StandingsMap={b1StandingsMap}
                        b2StandingsMap={b2StandingsMap}
                        b1Finished={b1Finished}
                        b2Finished={b2Finished}
                        b1MatchesCount={b1Matches.length}
                        b2MatchesCount={b2Matches.length}
                        b1FinishedCount={b1FinishedCount}
                        b2FinishedCount={b2FinishedCount}
                        hasCategoryMatches={categoryMatches.length > 0}
                        isRanking={isRanking}
                        isSuper8={isSuper8}
                        isReadOnly={isReadOnly}
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
                      />
                    )}

                    {categoryPanelView === 'matches' && (
                      <CategoryMatchesTab
                        category={cat}
                        categoryMatches={categoryMatches}
                        pairsById={pairsById}
                        isRanking={isRanking}
                        isSuper8={isSuper8}
                        isReadOnly={isReadOnly}
                        totalSets={totalSets}
                        allCategoryFinished={categoryMatches.length > 0 && categoryMatches.every((m) => m.status === 'finished')}
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
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
};
