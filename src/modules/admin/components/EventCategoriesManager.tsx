import React, { useState, useEffect } from 'react';
import { Plus, Layers, Check, X, Trash2, Tag, Users, Trophy, ChevronDown, ChevronUp, ArrowUpDown, UserCheck, UserRound, UsersRound, Columns2, AlertTriangle, Swords, Sparkles, FileText, Shuffle } from 'lucide-react';
import { minifyEntryForPair, minifyPairForStorage, orderPairEntriesForMixed, formatRegistrationId, getNextRegistrationId, type EventCategory, type TournamentEntry, type TournamentEvent, type TournamentPair, type TournamentMatch, type MatchSetScore, type PlayerStanding } from '@modules/events/types';
import { generateSystemMatchesForCategory, generateSuper8MatchesForCategory, isCategoryMixed, createManualMatch, formatMatchDisplayString, formatMatchNumber, getPhaseLabel } from '@modules/events/services/matchGenerator';
import { updatePlayoffProgression, calculateBracketStandings, calculateSuper8PlayerStandings, type TeamStanding } from '@modules/events/services/matchProgression';
import { exportCategoryMatchesBlankPdf } from '@modules/events/services/tournamentPdfExport';
import { EventRegistrationForm } from '@modules/events/components/EventRegistrationForm';
import type { FirebaseAdminSportIcon } from '@infra/firebase/adminIcons';
import { MarsIcon, VenusIcon } from '@shared/components/GenderIcons';
import { getDb } from '@infra/firebase';
import { updateEvent } from '@infra/firebase/events';
import type { Firestore } from 'firebase/firestore';
import { useUI } from '@modules/ui';
import { maskPin } from '@shared/utils/formatters';

interface Props {
  event: TournamentEvent;
  activeSports: FirebaseAdminSportIcon[];
  onUpdateCategories: (categories: EventCategory[]) => void;
  onUpdateEvent: (event: TournamentEvent) => void;
}

export const EventCategoriesManager: React.FC<Props> = ({
  event,
  activeSports,
  onUpdateCategories,
  onUpdateEvent,
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

  const saveMatchesTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const pairsById = React.useMemo(() => {
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
    setIsAdding(false);
    setEditingId(null);
  };

  const handleStartAdd = () => {
    resetForm();
    setIsAdding(true);
  };

  const handleStartEdit = (cat: EventCategory) => {
    setName(cat.name);
    setDescription(cat.description || '');
    setFormat(cat.format);
    setPriority(cat.priority);
    setSportId(cat.sportId);
    setAbbreviation(cat.abbreviation || '');
    setGender1(cat.gender1 || 'M');
    setGender2(cat.gender2 || 'M');
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

  const openCategoryPanel = (categoryId: string, view: CategoryPanelView) => {
    setSelectedEntries(new Set());
    setSelectedTeamIds(new Set());
    const effectiveView = isSuper8 && view === 'teams' ? 'entries' : view;
    if (selectedCategoryId === categoryId && categoryPanelView === effectiveView) {
      setSelectedCategoryId(null);
      return;
    }
    setSelectedCategoryId(categoryId);
    setCategoryPanelView(effectiveView);
  };

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId);
  const categoryEntries = entries.filter((e) =>
    selectedCategory ? e.categoryIds?.includes(selectedCategory.id) : false
  );

  const categoryMatches = matches.filter(
    (m) =>
      selectedCategory &&
      (m.categoryId === selectedCategory.id ||
        (!m.categoryId && pairs.some((p) => (p.id === m.pair1Id || p.id === m.pair2Id) && p.categoryId === selectedCategory.id)))
  );

  const super8Standings = React.useMemo(() => {
    if (!isSuper8 || !selectedCategory) return [];
    return calculateSuper8PlayerStandings(categoryEntries, categoryMatches);
  }, [isSuper8, selectedCategory, categoryEntries, categoryMatches]);

  const super8StandingsMap = React.useMemo(() => {
    const map = new Map<string, PlayerStanding>();
    super8Standings.forEach((st) => {
      const k1 = (st.entry.email || '').toLowerCase().trim();
      const k2 = (st.entry.pin || '').toLowerCase().trim();
      if (k1) map.set(k1, st);
      if (k2) map.set(k2, st);
    });
    return map;
  }, [super8Standings]);

  const sortedCategoryEntries = React.useMemo(() => {
    if (isSuper8) {
      return [...categoryEntries].sort((a, b) => {
        const kA = (a.email || a.pin || '').toLowerCase().trim();
        const kB = (b.email || b.pin || '').toLowerCase().trim();
        const stA = super8StandingsMap.get(kA);
        const stB = super8StandingsMap.get(kB);
        if (stA?.rank !== undefined && stB?.rank !== undefined && stA.rank !== stB.rank) {
          return stA.rank - stB.rank;
        }
        return (a.name || '').localeCompare(b.name || '');
      });
    }
    return [...categoryEntries].sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      const pA = pairs.find((p) => (p.p1.email === a.email || p.p2.email === a.email) && p.categoryId === selectedCategory?.id);
      const pB = pairs.find((p) => (p.p1.email === b.email || p.p2.email === b.email) && p.categoryId === selectedCategory?.id);
      if (pA && !pB) return -1;
      if (!pA && pB) return 1;
      if (pA && pB) return (pA.teamNumber || 0) - (pB.teamNumber || 0);
      return a.name.localeCompare(b.name);
    });
  }, [categoryEntries, isSuper8, super8StandingsMap, sortBy, pairs, selectedCategory?.id]);

  const categoryPairs = pairs.filter((p) =>
    selectedCategory
      ? p.categoryId === selectedCategory.id ||
        (!p.categoryId && (p.p1.categoryIds?.includes(selectedCategory.id) || p.p2.categoryIds?.includes(selectedCategory.id)))
      : false
  );

  const sortedCategoryPairs = [...categoryPairs].sort(
    (a, b) => (a.teamNumber || 0) - (b.teamNumber || 0)
  );

  const pairForEntry = (entry: TournamentEntry) =>
    pairs.find(
      (p) =>
        (p.p1.email === entry.email || p.p2.email === entry.email) &&
        (p.categoryId === selectedCategory?.id || !p.categoryId)
    );

  const selectedPair = React.useMemo(() => {
    if (selectedEntries.size === 0) return null;
    const selectedEmail = Array.from(selectedEntries)[0];
    const found = pairs.find(
      (p) =>
        (p.p1.email === selectedEmail || p.p2.email === selectedEmail) &&
        (p.categoryId === selectedCategory?.id || !p.categoryId)
    );
    if (!found) return null;
    const isPairSelected =
      selectedEntries.has(found.p1.email) && selectedEntries.has(found.p2.email);
    return isPairSelected ? found : null;
  }, [pairs, selectedCategory?.id, selectedEntries]);

  const toggleEntrySelection = (entry: TournamentEntry) => {
    const existingPair = pairForEntry(entry);
    if (existingPair) {
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

  const isManualMatchDraw = event.matchDrawType === 'Manual';

  const toggleTeamSelection = (pair: TournamentPair) => {
    if (!isManualMatchDraw) return;
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

  const selectedEntriesList = Array.from(selectedEntries)
    .map((email) => categoryEntries.find((entry) => entry.email === email))
    .filter(Boolean) as TournamentEntry[];

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

    const validation = validateCategoryGenders(selectedCategory, selected);
    if (!validation.valid) {
      setModalConfig({
        title: 'Atenção',
        message: validation.message || 'Formação de time incompatível com os requisitos da categoria.',
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
        await updateEvent(db as Firestore, event.pin, { pairs: nextPairs.map(minifyPairForStorage) });
      } catch (err) {
        console.error('Erro ao atualizar bracket no Firestore:', err);
      }
    }
  };

  const handleRandomizeCategoryDraw = async () => {
    if (!selectedCategory) return;
    if (categoryPairs.length < 2) {
      setModalConfig({
        title: 'Atenção',
        message: 'É necessário ter pelo menos 2 times formados nesta categoria para realizar o sorteio.',
        onConfirm: () => setModalConfig(null),
      });
      return;
    }

    const hasCatMatches = matches.some((m) => m.categoryId === selectedCategory.id);
    if (hasCatMatches) {
      setModalConfig({
        title: 'Atenção',
        message: 'As partidas desta categoria já foram geradas. Para sortear novamente, exclua as partidas na aba Partidas.',
        onConfirm: () => setModalConfig(null),
      });
      return;
    }

    // 1. Embaralha todos os times da categoria aleatoriamente (Fisher-Yates)
    const shuffled = [...categoryPairs];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // 2. Divide entre Chave 1 e Chave 2 e define a ordem sequencial das posições
    const half = Math.ceil(shuffled.length / 2);
    const updatedCatPairs = shuffled.map((pair, index) => {
      const bracket: 1 | 2 = index < half ? 1 : 2;
      const bracketOrder = index < half ? index + 1 : index - half + 1;
      return {
        ...pair,
        bracket,
        bracketOrder,
      };
    });

    const updatedMap = new Map(updatedCatPairs.map((p) => [p.id, p]));
    const nextPairs = pairs.map((p) => updatedMap.get(p.id) || p);

    onUpdateEvent({ ...event, pairs: nextPairs });

    const db = getDb();
    if (db) {
      try {
        await updateEvent(db as Firestore, event.pin, { pairs: nextPairs.map(minifyPairForStorage) });
      } catch (err) {
        console.error('Erro ao salvar sorteio no Firestore:', err);
      }
    }

    setModalConfig({
      title: 'Sorteio realizado!',
      message: `Os ${categoryPairs.length} times foram sorteados com sucesso entre a Chave 1 (${half} times) e Chave 2 (${shuffled.length - half} times).`,
      onConfirm: () => setModalConfig(null),
    });
  };

  const handleMoveTeamPosition = async (pair: TournamentPair, direction: 'up' | 'down') => {
    if (!selectedCategory) return;
    const hasCatMatches = matches.some((m) => m.categoryId === selectedCategory.id);
    if (hasCatMatches) return;

    const currentBracket = (pair.bracket ?? 1) === 1 ? 1 : 2;
    const inSameBracket = categoryPairs
      .filter((p) => (p.bracket ?? 1) === currentBracket)
      .sort((a, b) => {
        if (a.bracketOrder !== undefined && b.bracketOrder !== undefined) {
          return a.bracketOrder - b.bracketOrder;
        }
        if (a.bracketOrder !== undefined) return -1;
        if (b.bracketOrder !== undefined) return 1;
        return (a.teamNumber || 0) - (b.teamNumber || 0);
      });

    const currentIndex = inSameBracket.findIndex((p) => p.id === pair.id);
    if (currentIndex === -1) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= inSameBracket.length) return;

    const reordered = [...inSameBracket];
    const temp = reordered[currentIndex];
    reordered[currentIndex] = reordered[targetIndex];
    reordered[targetIndex] = temp;

    const updatedInBracket = reordered.map((p, idx) => ({
      ...p,
      bracket: currentBracket as 1 | 2,
      bracketOrder: idx + 1,
    }));

    const updatedMap = new Map(updatedInBracket.map((p) => [p.id, p]));
    const nextPairs = pairs.map((p) => updatedMap.get(p.id) || p);

    onUpdateEvent({ ...event, pairs: nextPairs });

    const db = getDb();
    if (db) {
      try {
        await updateEvent(db as Firestore, event.pin, { pairs: nextPairs.map(minifyPairForStorage) });
      } catch (err) {
        console.error('Erro ao reordenar posição no Firestore:', err);
      }
    }
  };

  const handleCreateManualMatch = async () => {
    if (!selectedCategory || selectedTeamIds.size !== 2) return;
    const selectedPairsList = Array.from(selectedTeamIds)
      .map((id) => pairs.find((p) => p.id === id))
      .filter(Boolean) as TournamentPair[];
    if (selectedPairsList.length !== 2) return;

    const newMatch = createManualMatch(
      selectedPairsList[0],
      selectedPairsList[1],
      selectedCategory,
      matches
    );

    const nextMatches = [...matches, newMatch];
    onUpdateEvent({ ...event, matches: nextMatches });
    setSelectedTeamIds(new Set());
    setCategoryPanelView('matches');

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

    if (isSuper8) {
      const isMixedCat = isCategoryMixed(selectedCategory);
      if (isMixedCat) {
        const mEntries = categoryEntries.filter((e) => e.gender === 'M');
        const fEntries = categoryEntries.filter((e) => e.gender === 'F');
        if (mEntries.length < 4 || fEntries.length < 4) {
          setModalConfig({
            title: 'Atenção — Super 8 Misto',
            message: `Para gerar partidas do Super 8 Misto Puro, são necessários 4 homens e 4 mulheres inscritos nesta categoria (atualmente: ${mEntries.length} ${mEntries.length === 1 ? 'homem' : 'homens'} e ${fEntries.length} ${fEntries.length === 1 ? 'mulher' : 'mulheres'}).`,
            onConfirm: () => setModalConfig(null),
          });
          return;
        }
      } else {
        if (categoryEntries.length < 4) {
          setModalConfig({
            title: 'Atenção',
            message: 'É necessário ter pelo menos 4 inscritos (ideal 8) nesta categoria para gerar partidas do Super 8.',
            onConfirm: () => setModalConfig(null),
          });
          return;
        }
      }
    } else {
      const catPairs = pairs.filter(
        (p) =>
          p.categoryId === selectedCategory.id ||
          (!p.categoryId && (p.p1?.categoryIds?.includes(selectedCategory.id) || p.p2?.categoryIds?.includes(selectedCategory.id)))
      );

      if (catPairs.length < 2) {
        setModalConfig({
          title: 'Atenção',
          message: 'É necessário ter pelo menos 2 times formados nesta categoria para gerar partidas.',
          onConfirm: () => setModalConfig(null),
        });
        return;
      }
    }

    const executeGenerateMatches = async () => {
      let generated: TournamentMatch[] = [];
      if (isSuper8) {
        generated = generateSuper8MatchesForCategory(selectedCategory, categoryEntries, matches);
      } else {
        generated = generateSystemMatchesForCategory(selectedCategory, pairs, matches);
      }
      const otherMatches = matches.filter((m) => m.categoryId !== selectedCategory.id);
      const nextMatches = [...otherMatches, ...generated];

      onUpdateEvent({ ...event, matches: nextMatches });
      setSelectedTeamIds(new Set());
      setCategoryPanelView('matches');

      const db = getDb();
      if (db) {
        try {
          await updateEvent(db as Firestore, event.pin, { matches: nextMatches });
        } catch (err) {
          console.error('Erro ao gerar partidas por sistema no Firestore:', err);
        }
      }
    };

    const existingCatMatches = matches.filter((m) => m.categoryId === selectedCategory.id);
    if (existingCatMatches.length > 0) {
      setModalConfig({
        title: 'Regerar partidas?',
        message: `A categoria "${selectedCategory.name}" já possui ${existingCatMatches.length} partidas geradas. Deseja regerar todas as partidas desta categoria?`,
        confirmLabel: 'Regerar',
        variant: 'danger',
        onConfirm: () => {
          setModalConfig(null);
          void executeGenerateMatches();
        },
        onCancel: () => setModalConfig(null),
      });
      return;
    }

    await executeGenerateMatches();
  };

  const handleDeleteMatch = (matchId: string) => {
    setModalConfig({
      title: 'Excluir partida?',
      message: 'Deseja excluir esta partida?',
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
    const catMatches = categoryMatches;
    if (catMatches.length === 0) return;

    setModalConfig({
      title: 'Excluir partidas?',
      message: `Tem certeza que deseja excluir todas as ${catMatches.length} partidas da categoria "${selectedCategory.name}"?`,
      confirmLabel: 'Excluir',
      variant: 'danger',
      onConfirm: async () => {
        setModalConfig(null);
        const catMatchIds = new Set(catMatches.map((m) => m.id));
        const nextMatches = matches.filter((m) => !catMatchIds.has(m.id));
        onUpdateEvent({ ...event, matches: nextMatches });
        const db = getDb();
        if (db) {
          try {
            await updateEvent(db as Firestore, event.pin, { matches: nextMatches });
          } catch (err) {
            console.error('Erro ao excluir todas as partidas da categoria no Firestore:', err);
          }
        }
      },
      onCancel: () => setModalConfig(null),
    });
  };

  const handleSaveExpandedEntry = async (entryData: TournamentEntry, originalPin: string) => {
    const db = getDb();
    const finalEntry: TournamentEntry = {
      ...entryData,
      registrationId: entryData.registrationId || entries.find((e) => e.pin === originalPin)?.registrationId || getNextRegistrationId(entries),
    };
    if (db && event.pin) {
      try {
        const { saveAdminEventEntry, saveUserEventRegistration } = await import('@infra/firebase/events');
        await saveAdminEventEntry(db, event.pin, finalEntry);
        try {
          await saveUserEventRegistration(db, finalEntry.email, event.pin, {
            pin: event.pin,
            name: event.name,
            joinedAt: finalEntry.joinedAt,
            bannerUrl: event.bannerUrl || null,
          });
        } catch (error) {
          console.warn('Inscrição salva, mas não foi possível criar o índice auxiliar do usuário:', error);
        }
      } catch (err) {
        console.error('Erro ao salvar inscrição no Firestore:', err);
      }
    }
    const updatedEntries = entries.map((item) => (item.pin === originalPin ? finalEntry : item));
    onUpdateEvent({ ...event, entries: updatedEntries });
  };

  const handleDeleteEntry = (targetPin: string) => {
    const targetEntry = entries.find((e) => e.pin === targetPin);
    if (!targetEntry) return;

    setModalConfig({
      title: 'Excluir inscrição?',
      message: `Deseja excluir a inscrição de "${targetEntry.name}"?`,
      confirmLabel: 'Excluir',
      variant: 'danger',
      onConfirm: async () => {
        setModalConfig(null);
        setExpandedRegistrationEmail(null);
        const db = getDb();
        const targetEmailLower = targetEntry.email?.toLowerCase().trim();

        const updatedPairs = pairs.filter((p) => {
          const p1Email = p.p1.email?.toLowerCase().trim();
          const p2Email = p.p2.email?.toLowerCase().trim();
          return p1Email !== targetEmailLower && p2Email !== targetEmailLower;
        });

        if (db && event.pin) {
          try {
            const { deleteEventEntry, deleteUserEventRegistration } = await import('@infra/firebase/events');
            await deleteEventEntry(db, event.pin, targetEntry.email);
            try {
              await deleteUserEventRegistration(db, targetEntry.email, event.pin);
            } catch (error) {
              console.warn('Inscrição removida, mas não foi possível remover o índice do usuário:', error);
            }
          } catch (err) {
            console.error('Erro ao deletar inscrição no Firestore:', err);
          }
        }

        const updatedEntries = entries.filter((e) => e.pin !== targetPin);
        onUpdateEvent({ ...event, entries: updatedEntries, pairs: updatedPairs });
      },
      onCancel: () => setModalConfig(null),
    });
  };

  const renderTeamCard = (
    pair: TournamentPair,
    showBracketToggle = true,
    hasMatches = false,
    standing?: TeamStanding,
    isChaveFinished = false,
    allCategoryMatches: TournamentMatch[] = [],
    positionIndex?: number,
    totalInBracket?: number
  ) => {
    const isSelected = isManualMatchDraw && selectedTeamIds.has(pair.id);

    // Posição final no torneio (quando todas as partidas da categoria estiverem encerradas)
    const finalMatch = allCategoryMatches.find((m) => m.phase === 'final' && m.status === 'finished');
    const thirdMatch = allCategoryMatches.find((m) => m.phase === '3lugar' && m.status === 'finished');
    const allCatFinished = allCategoryMatches.length > 0 && allCategoryMatches.every((m) => m.status === 'finished');

    let finalPositionBadge: string | null = null;
    if (allCatFinished) {
      if (finalMatch?.winnerPairId === pair.id) finalPositionBadge = '🏆 Campeão';
      else if (finalMatch && (finalMatch.pair1Id === pair.id || finalMatch.pair2Id === pair.id)) finalPositionBadge = '🥈 Vice-campeão';
      else if (thirdMatch?.winnerPairId === pair.id) finalPositionBadge = '🥉 3º lugar';
      else if (thirdMatch && (thirdMatch.pair1Id === pair.id || thirdMatch.pair2Id === pair.id)) finalPositionBadge = '4º lugar';
    }

    // Helper: formata o placar de uma partida do ponto de vista deste time
    const formatMatchScore = (match: TournamentMatch): string => {
      if (!match.result) return '';
      const isP1 = match.pair1Id === pair.id;
      const parts = match.result.trim().split(/[\s,]+/);
      return parts.map((part) => {
        const m = part.match(/(\d+)[\/xX\-](\d+)/);
        if (!m) return part;
        return isP1 ? `${m[1]} x ${m[2]}` : `${m[2]} x ${m[1]}`;
      }).join('  ');
    };

    const getOppName = (match: TournamentMatch): string => {
      const isP1 = match.pair1Id === pair.id;
      const opp = isP1
        ? (match.pair2 || (match.pair2Id ? pairsById[match.pair2Id] : null))
        : (match.pair1 || (match.pair1Id ? pairsById[match.pair1Id] : null));
      if (!opp) return 'A definir';
      return `${opp.p1.nickname || opp.p1.name} & ${opp.p2.nickname || opp.p2.name}`;
    };

    const semiMatch = allCategoryMatches.find(
      (m) => m.phase === 'semifinal' && m.status === 'finished' &&
      (m.pair1Id === pair.id || m.pair2Id === pair.id)
    );
    const wonSemi = semiMatch?.winnerPairId === pair.id;
    const nextMatch = allCategoryMatches.find(
      (m) => (m.phase === 'final' || m.phase === '3lugar') && m.status === 'finished' &&
      (m.pair1Id === pair.id || m.pair2Id === pair.id)
    );

    return (
      <div
        key={pair.id}
        onClick={() => {
          if (isManualMatchDraw) toggleTeamSelection(pair);
        }}
        className={`rounded-2xl border bg-white p-4 shadow-sm transition-all ${
          isManualMatchDraw ? 'cursor-pointer select-none' : ''
        } ${
          isSelected
            ? 'border-sky-500 bg-sky-50/60 ring-2 ring-sky-300'
            : 'border-slate-100 hover:border-slate-200'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {!hasMatches && positionIndex !== undefined && (
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-black bg-slate-100 text-slate-700 border border-slate-200 shrink-0"
                  title={`Posição ${positionIndex + 1} na chave (determina a ordem dos confrontos)`}
                >
                  #{positionIndex + 1}
                </span>
              )}
              <p className="text-[15px] font-black text-slate-800 leading-tight">
                {pair.p1.nickname || pair.p1.name} & {pair.p2.nickname || pair.p2.name}
              </p>
              {/* Badge de classificação geral final (quando todo o torneio estiver finalizado) */}
              {finalPositionBadge && (
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-bold shrink-0 border ${
                    finalPositionBadge.includes('🏆')
                      ? 'bg-amber-100 text-amber-900 border-amber-300'
                      : finalPositionBadge.includes('🥈')
                      ? 'bg-slate-100 text-slate-600 border-slate-300'
                      : finalPositionBadge.includes('🥉')
                      ? 'bg-orange-100 text-orange-800 border-orange-300'
                      : 'bg-slate-50 text-slate-500 border-slate-200'
                  }`}
                >
                  {finalPositionBadge}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs font-bold text-slate-400 truncate">
              {pair.teamCode || `Time ${pair.teamNumber || ''}`}
            </p>

            {/* Informações da fase de chaves */}
            {hasMatches && (
              <div className="mt-2.5 pt-2 border-t border-slate-100/90 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-1 text-xs font-bold text-slate-500">
                  <span className="text-xs font-bold text-slate-500">
                    Fase de chaves:
                  </span>
                  {standing && standing.played > 0 && (
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-bold shrink-0 border ${
                        standing.rank === 1
                          ? 'bg-amber-100 text-amber-900 border-amber-300'
                          : standing.rank === 2
                          ? 'bg-sky-100 text-sky-900 border-sky-300'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                      title={
                        isChaveFinished
                          ? `${standing.rank}º lugar - ${standing.rank <= 2 ? 'Classificado para semifinal' : 'Fase de chaves finalizada'}`
                          : `${standing.rank}º lugar parcial`
                      }
                    >
                      {standing.rank === 1 ? '🥇 1º lugar' : standing.rank === 2 ? '🥈 2º lugar' : `${standing.rank}º lugar`}
                      {isChaveFinished && (standing.rank === 1 || standing.rank === 2) && ' (Classificado)'}
                    </span>
                  )}
                </div>

                <div className="space-y-1 text-xs font-bold text-slate-700">
                  <p>
                    Qtde Vitórias: <strong className="font-black text-slate-900">{standing?.wins ?? 0}</strong>
                  </p>
                  <p>
                    Saldo games:{' '}
                    <strong
                      className={`font-black ${
                        (standing?.gamesDiff ?? 0) > 0
                          ? 'text-emerald-600'
                          : (standing?.gamesDiff ?? 0) < 0
                          ? 'text-rose-600'
                          : 'text-slate-800'
                      }`}
                    >
                      {(standing?.gamesDiff ?? 0) > 0 ? `+${standing?.gamesDiff}` : (standing?.gamesDiff ?? 0)}
                      {standing ? ` (${standing.gamesWon} - ${standing.gamesLost})` : ' (0 - 0)'}
                    </strong>
                  </p>
                  {standing && standing.setsWon + standing.setsLost > 0 && (
                    <p>
                      Saldo sets:{' '}
                      <strong className="font-black text-slate-800">
                        {standing.setsDiff > 0 ? `+${standing.setsDiff}` : standing.setsDiff} ({standing.setsWon} - {standing.setsLost})
                      </strong>
                    </p>
                  )}
                </div>

                {standing?.tieBreakNote && (
                  <div className="pt-0.5 w-full">
                    <p className="w-full text-xs font-bold text-amber-800 bg-amber-50/90 border border-amber-200/80 rounded-xl px-3 py-2 leading-snug">
                      ⚖️ {standing.tieBreakNote}
                    </p>
                  </div>
                )}

                {/* Placar da semifinal */}
                {semiMatch && (
                  <div className="pt-1 space-y-0.5">
                    <p className="text-xs font-bold text-slate-400">Semifinal:</p>
                    <p className={`text-xs font-bold leading-snug ${wonSemi ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {getOppName(semiMatch)}{'  '}
                      <strong>{formatMatchScore(semiMatch)}</strong>
                      <span className="ml-1 font-black">{wonSemi ? '✓' : '✗'}</span>
                    </p>
                  </div>
                )}

                {/* Placar da final ou 3º lugar */}
                {nextMatch && (
                  <div className="pt-1 space-y-0.5">
                    <p className="text-xs font-bold text-slate-400">
                      {nextMatch.phase === 'final' ? 'Final:' : '3º lugar:'}
                    </p>
                    <p className={`text-xs font-bold leading-snug ${nextMatch.winnerPairId === pair.id ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {getOppName(nextMatch)}{'  '}
                      <strong>{formatMatchScore(nextMatch)}</strong>
                      <span className="ml-1 font-black">{nextMatch.winnerPairId === pair.id ? '✓' : '✗'}</span>
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0 pt-0.5">
            {!hasMatches && positionIndex !== undefined && totalInBracket !== undefined && totalInBracket > 1 && (
              <div className="flex items-center gap-0.5 bg-slate-50 border border-slate-200 rounded-xl p-0.5">
                <button
                  type="button"
                  disabled={positionIndex === 0}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleMoveTeamPosition(pair, 'up');
                  }}
                  className="p-1 rounded-lg hover:bg-white text-slate-600 disabled:opacity-20 disabled:hover:bg-transparent transition-all active:scale-90"
                  title="Mover time para cima nesta chave"
                >
                  <ChevronUp size={16} />
                </button>
                <button
                  type="button"
                  disabled={positionIndex === totalInBracket - 1}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleMoveTeamPosition(pair, 'down');
                  }}
                  className="p-1 rounded-lg hover:bg-white text-slate-600 disabled:opacity-20 disabled:hover:bg-transparent transition-all active:scale-90"
                  title="Mover time para baixo nesta chave"
                >
                  <ChevronDown size={16} />
                </button>
              </div>
            )}
            {showBracketToggle && (
              hasMatches ? (
                <span
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold border shadow-xs cursor-default ${
                    (pair.bracket ?? 1) === 1
                      ? 'bg-emerald-50/70 text-emerald-700 border-emerald-200'
                      : 'bg-blue-50/70 text-blue-700 border-blue-200'
                  }`}
                  title="Chave bloqueada (partidas já geradas)"
                >
                  Chave {pair.bracket ?? 1}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleTeamBracket(pair);
                  }}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all active:scale-95 shadow-xs ${
                    (pair.bracket ?? 1) === 1
                      ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-200'
                      : 'bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200'
                  }`}
                  title="Clique para alternar a chave deste time"
                >
                  Chave {pair.bracket ?? 1}
                </button>
              )
            )}
            {isManualMatchDraw && (
              <span
                className={`inline-flex w-5 h-5 rounded-full border-2 transition-colors ${
                  isSelected ? 'bg-sky-500 border-sky-500' : 'border-slate-300'
                }`}
              >
                {isSelected && <Check size={14} className="text-white m-auto" />}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderCategoryPanel = () => {
    if (!selectedCategory) return null;

    const categoryMatches = matches.filter(
      (m) =>
        m.categoryId === selectedCategory.id ||
        (!m.categoryId && pairs.some((p) => (p.id === m.pair1Id || p.id === m.pair2Id) && p.categoryId === selectedCategory.id))
    );

    const hasCategoryMatches = categoryMatches.length > 0;
    const isSystemDraw = event.matchDrawType === 'Sistema' || !event.matchDrawType;

    const handleGenerateBlankPdf = () => {
      if (!selectedCategory) return;
      exportCategoryMatchesBlankPdf(event, selectedCategory, categoryMatches, pairsById);
    };

    if (categoryPanelView === 'teams') {
      const b1Matches = categoryMatches.filter((m) => m.phase === 'chave1');
      const b2Matches = categoryMatches.filter((m) => m.phase === 'chave2');
      const totalSets = (event.setsCount || event.config?.sets || 1) as number;

      const bracketOnePairs = categoryPairs
        .filter((pair) => (pair.bracket ?? 1) === 1)
        .sort((a, b) => {
          if (a.bracketOrder !== undefined && b.bracketOrder !== undefined) {
            return a.bracketOrder - b.bracketOrder;
          }
          if (a.bracketOrder !== undefined) return -1;
          if (b.bracketOrder !== undefined) return 1;
          return (a.teamNumber || 0) - (b.teamNumber || 0);
        });

      const bracketTwoPairs = categoryPairs
        .filter((pair) => pair.bracket === 2)
        .sort((a, b) => {
          if (a.bracketOrder !== undefined && b.bracketOrder !== undefined) {
            return a.bracketOrder - b.bracketOrder;
          }
          if (a.bracketOrder !== undefined) return -1;
          if (b.bracketOrder !== undefined) return 1;
          return (a.teamNumber || 0) - (b.teamNumber || 0);
        });

      const b1Standings = calculateBracketStandings(bracketOnePairs, b1Matches, totalSets);
      const b2Standings = calculateBracketStandings(bracketTwoPairs, b2Matches, totalSets);

      const b1StandingsMap = new Map<string, TeamStanding>(b1Standings.map((s) => [s.pair.id, s]));
      const b2StandingsMap = new Map<string, TeamStanding>(b2Standings.map((s) => [s.pair.id, s]));

      const b1Finished = b1Matches.length > 0 && b1Matches.every((m) => m.status === 'finished');
      const b2Finished = b2Matches.length > 0 && b2Matches.every((m) => m.status === 'finished');

      const b1FinishedCount = b1Matches.filter((m) => m.status === 'finished').length;
      const b2FinishedCount = b2Matches.filter((m) => m.status === 'finished').length;

      const finalMatch = categoryMatches.find((m) => m.phase === 'final' && m.status === 'finished');
      const thirdMatch = categoryMatches.find((m) => m.phase === '3lugar' && m.status === 'finished');
      const allCatFinished = categoryMatches.length > 0 && categoryMatches.every((m) => m.status === 'finished');

      const getOverallRank = (pairId: string, standing?: TeamStanding): number => {
        if (allCatFinished) {
          if (finalMatch?.winnerPairId === pairId) return 1;
          if (finalMatch && (finalMatch.pair1Id === pairId || finalMatch.pair2Id === pairId)) return 2;
          if (thirdMatch?.winnerPairId === pairId) return 3;
          if (thirdMatch && (thirdMatch.pair1Id === pairId || thirdMatch.pair2Id === pairId)) return 4;
          return 4 + (standing?.rank ?? 99);
        }
        return (standing?.rank ?? 99);
      };

      const bracketOneList = hasCategoryMatches && b1Matches.length > 0
        ? [...b1Standings]
            .sort((a, b) => getOverallRank(a.pair.id, a) - getOverallRank(b.pair.id, b))
            .map((s) => s.pair)
        : bracketOnePairs;

      const bracketTwoList = hasCategoryMatches && b2Matches.length > 0
        ? [...b2Standings]
            .sort((a, b) => getOverallRank(a.pair.id, a) - getOverallRank(b.pair.id, b))
            .map((s) => s.pair)
        : bracketTwoPairs;

      return (
        <section className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden animate-in fade-in">
          <div className="p-5 border-b border-slate-100 flex flex-col gap-3.5">
            <div>
              <h3 className="text-base font-black text-slate-800">
                Times ({selectedCategory.name})
              </h3>
              <p className="text-xs text-slate-400 font-bold mt-0.5">
                {hasCategoryMatches
                  ? 'Times formados (chaves e posições bloqueadas pois as partidas já foram geradas).'
                  : 'Defina as chaves e use as setas ▲/▼ para ordenar a sequência dos confrontos.'}
              </p>
            </div>
            {!hasCategoryMatches && isSystemDraw && categoryPairs.length >= 2 && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleRandomizeCategoryDraw}
                  className="flex items-center justify-center gap-2 border-2 border-emerald-500 text-emerald-600 bg-white hover:bg-emerald-50 px-4 py-2.5 rounded-2xl text-xs font-black shadow-xs transition-all active:scale-95 shrink-0"
                  title="Sortear aleatoriamente os times entre a Chave 1 e a Chave 2 e suas posições"
                >
                  <Shuffle size={16} className="text-emerald-500" />
                  <span>Sortear chaves</span>
                </button>
              </div>
            )}
          </div>
          {sortedCategoryPairs.length === 0 ? (
            <div className="p-10 text-center text-sm font-bold text-slate-400">Nenhum time formado nesta categoria.</div>
          ) : (
            <div className="flex flex-col gap-4 p-4">
              {[
                {
                  label: 'Chave 1',
                  list: bracketOneList,
                  standingsMap: b1StandingsMap,
                  isFinished: b1Finished,
                  matchesCount: b1Matches.length,
                  finishedCount: b1FinishedCount,
                },
                {
                  label: 'Chave 2',
                  list: bracketTwoList,
                  standingsMap: b2StandingsMap,
                  isFinished: b2Finished,
                  matchesCount: b2Matches.length,
                  finishedCount: b2FinishedCount,
                },
              ].map((bracket) => (
                <div key={bracket.label} className="rounded-2xl border border-slate-100 bg-slate-50 p-3.5 space-y-3">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h4 className="text-xs font-black text-slate-800">{bracket.label}</h4>
                      {hasCategoryMatches && bracket.matchesCount > 0 && (
                        <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                          {bracket.isFinished
                            ? '✅ 1ª Fase finalizada'
                            : `⏱️ ${bracket.finishedCount} de ${bracket.matchesCount} partidas finalizadas`}
                        </p>
                      )}
                    </div>
                    <span className="text-[10px] font-black text-slate-400 self-start sm:self-auto">
                      {bracket.list.length} times
                    </span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {bracket.list.length === 0 ? (
                      <p className="py-6 text-center text-xs font-bold text-slate-300">Sem times nesta chave.</p>
                    ) : (
                      bracket.list.map((pair, index) =>
                        renderTeamCard(
                          pair,
                          true,
                          hasCategoryMatches,
                          bracket.standingsMap.get(pair.id),
                          bracket.isFinished,
                          categoryMatches,
                          index,
                          bracket.list.length
                        )
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      );
    }

  const parseMatchSets = (match: TournamentMatch, totalSets: number) => {
    const gamesPerSet = Number(event.gamesPerSet || event.config?.gamesPerSet || (event.eventType === 'Super 8' ? 4 : 6));
    const scores: MatchSetScore[] = Array.from({ length: totalSets }, (_, i) => {
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

  const handleScoreBlur = async () => {
    if (saveMatchesTimeoutRef.current) {
      clearTimeout(saveMatchesTimeoutRef.current);
      saveMatchesTimeoutRef.current = null;
    }
    const db = getDb();
    if (db) {
      try {
        await updateEvent(db as Firestore, event.pin, { matches });
      } catch (err) {
        console.error('Erro ao salvar placar no Firestore onBlur:', err);
      }
    }
  };

  const handleScoreInputChange = (
    matchId: string,
    setIndex: number,
    player: 'p1' | 'p2',
    rawVal: string
  ) => {
    const totalSets = (event.setsCount || event.config?.sets || 1) as number;
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

      let status: 'waiting' | 'live' | 'finished' = 'waiting';
      let winnerPairId: string | undefined = undefined;
      let loserPairId: string | undefined = undefined;

      if (setsWon1 >= setsToWin) {
        status = 'finished';
        winnerPairId = m.pair1Id;
        loserPairId = m.pair2Id;
      } else if (setsWon2 >= setsToWin) {
        status = 'finished';
        winnerPairId = m.pair2Id;
        loserPairId = m.pair1Id;
      } else if (hasAnyScore) {
        status = 'live';
        winnerPairId = undefined;
        loserPairId = undefined;
      } else {
        status = 'waiting';
        winnerPairId = undefined;
        loserPairId = undefined;
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

    const progressedMatches = updatePlayoffProgression(pairs, nextMatches);

    onUpdateEvent({ ...event, matches: progressedMatches });

    if (saveMatchesTimeoutRef.current) {
      clearTimeout(saveMatchesTimeoutRef.current);
    }

    saveMatchesTimeoutRef.current = setTimeout(async () => {
      const db = getDb();
      if (db) {
        try {
          await updateEvent(db as Firestore, event.pin, { matches: progressedMatches });
        } catch (err) {
          console.error('Erro ao atualizar placar da partida no Firestore:', err);
        }
      }
    }, 600);
  };

    if (categoryPanelView === 'matches') {
      const b1Matches = categoryMatches.filter((m) => m.phase === 'chave1');
      const b2Matches = categoryMatches.filter((m) => m.phase === 'chave2');
      const semiMatches = categoryMatches.filter((m) => m.phase === 'semifinal');
      const finalMatches = categoryMatches.filter((m) => m.phase === 'final' || m.phase === '3lugar');
      const otherMatches = categoryMatches.filter(
        (m) => !['chave1', 'chave2', 'semifinal', 'final', '3lugar'].includes(m.phase || '')
      );

      const renderMatchItem = (match: TournamentMatch) => {
        const code = match.matchCode || formatMatchNumber(match.matchNumber || 1);
        const phase = getPhaseLabel(match.phase);
        const phaseStr = phase ? `[${phase}]` : '';

        const p1 = match.pair1 || (match.pair1Id && pairsById ? pairsById[match.pair1Id] : undefined);
        const p2 = match.pair2 || (match.pair2Id && pairsById ? pairsById[match.pair2Id] : undefined);

        const team1Name = p1 ? `${p1.p1.nickname || p1.p1.name} & ${p1.p2.nickname || p1.p2.name}` : match.pair1Label || 'A definir';
        const team1Code = p1 ? (p1.teamCode || `Time ${p1.teamNumber || ''}`) : '';

        const team2Name = p2 ? `${p2.p1.nickname || p2.p1.name} & ${p2.p2.nickname || p2.p2.name}` : match.pair2Label || 'A definir';
        const team2Code = p2 ? (p2.teamCode || `Time ${p2.teamNumber || ''}`) : '';

        const totalSets = (event.setsCount || event.config?.sets || 1) as number;
        const setsToWin = Math.ceil(totalSets / 2);
        const gamesPerSet = Number(event.gamesPerSet || event.config?.gamesPerSet || (event.eventType === 'Super 8' ? 4 : 6));
        const { scores, setsWon1, setsWon2 } = parseMatchSets(match, totalSets);

        const hasAnyScore = scores.some((s) => (s.p1 !== null && s.p1 !== undefined) || (s.p2 !== null && s.p2 !== undefined));
        const isMatchFinished = setsWon1 >= setsToWin || setsWon2 >= setsToWin || (match.status === 'finished' && !hasAnyScore);
        const isMatchLive = !isMatchFinished && (hasAnyScore || match.status === 'live');

        const statusLabel =
          isMatchFinished ? 'Finalizado' :
          isMatchLive ? 'Ao vivo' : 'Aguardando';
        const statusColor =
          isMatchFinished ? 'bg-blue-50 text-blue-700 border-blue-200' :
          isMatchLive ? 'bg-emerald-50 text-emerald-700 border-emerald-200 animate-pulse' :
          'bg-slate-100 text-slate-500 border-slate-200';

        const allCatFinished = categoryMatches.length > 0 && categoryMatches.every((m) => {
          const { setsWon1: s1, setsWon2: s2 } = parseMatchSets(m, totalSets);
          return s1 >= setsToWin || s2 >= setsToWin || m.status === 'finished';
        });

        // Badges de posição final para partidas de final e 3º lugar já encerradas
        let p1FinalBadge: string | null = null;
        let p2FinalBadge: string | null = null;
        if (allCatFinished && match.status === 'finished' && match.winnerPairId) {
          if (match.phase === 'final') {
            p1FinalBadge = match.winnerPairId === match.pair1Id ? '🏆 Campeão' : '🥈 Vice-campeão';
            p2FinalBadge = match.winnerPairId === match.pair2Id ? '🏆 Campeão' : '🥈 Vice-campeão';
          } else if (match.phase === '3lugar') {
            p1FinalBadge = match.winnerPairId === match.pair1Id ? '🥉 3º lugar' : '4º lugar';
            p2FinalBadge = match.winnerPairId === match.pair2Id ? '🥉 3º lugar' : '4º lugar';
          }
        }

        return (
          <div key={match.id} className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm transition-all hover:border-slate-200">
            {/* Top row: Match Code & Phase on Left, Status Badge & Delete on Right */}
            <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-100">
              <p className="text-sm font-black text-slate-800 tracking-tight">
                [{code}]{phaseStr}
              </p>
              <div className="flex items-center gap-2">
                <span className={`px-2.5 py-1 rounded-xl text-[10px] font-black border ${statusColor}`}>
                  {statusLabel}
                </span>
                <button
                  type="button"
                  onClick={() => handleDeleteMatch(match.id)}
                  className="p-1.5 text-slate-300 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                  title="Excluir partida"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>


            {totalSets === 1 ? (
              /* Layout for 1 set (Image 2) */
              <div className="flex items-center justify-between gap-4">
                {/* Left side: Teams */}
                <div className="min-w-0 flex-1 space-y-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-black text-slate-800 leading-tight">
                        {team1Name}
                      </p>
                      {p1FinalBadge && (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-black border shrink-0 ${
                          p1FinalBadge.includes('🏆') ? 'bg-amber-100 text-amber-900 border-amber-300'
                          : p1FinalBadge.includes('🥈') ? 'bg-slate-100 text-slate-600 border-slate-300'
                          : p1FinalBadge.includes('🥉') ? 'bg-orange-100 text-orange-800 border-orange-300'
                          : 'bg-slate-50 text-slate-400 border-slate-200'
                        }`}>{p1FinalBadge}</span>
                      )}
                    </div>
                    {team1Code && (
                      <p className="text-xs font-bold text-slate-500">
                        [{team1Code}]
                      </p>
                    )}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-black text-slate-800 leading-tight">
                        {team2Name}
                      </p>
                      {p2FinalBadge && (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-black border shrink-0 ${
                          p2FinalBadge.includes('🏆') ? 'bg-amber-100 text-amber-900 border-amber-300'
                          : p2FinalBadge.includes('🥈') ? 'bg-slate-100 text-slate-600 border-slate-300'
                          : p2FinalBadge.includes('🥉') ? 'bg-orange-100 text-orange-800 border-orange-300'
                          : 'bg-slate-50 text-slate-400 border-slate-200'
                        }`}>{p2FinalBadge}</span>
                      )}
                    </div>
                    {team2Code && (
                      <p className="text-xs font-bold text-slate-500">
                        [{team2Code}]
                      </p>
                    )}
                  </div>
                </div>

                {/* Right side: 1 Set Score */}
                <div className="flex flex-col items-center shrink-0">
                  {/* Row 1: Team 1 score */}
                  <div className="flex items-center gap-2">
                    <span className="w-5 text-center text-sm font-black text-slate-800">
                      {setsWon1}
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={2}
                      value={scores[0]?.p1 !== null && scores[0]?.p1 !== undefined ? scores[0].p1 : ''}
                      onChange={(e) => handleScoreInputChange(match.id, 0, 'p1', e.target.value)}
                      onBlur={handleScoreBlur}
                      className={`w-9 h-9 sm:w-10 sm:h-10 border-2 border-black flex items-center justify-center text-center font-black text-sm outline-none transition-colors ${
                        scores[0]?.p1 !== null &&
                        scores[0]?.p1 !== undefined &&
                        scores[0]?.p2 !== null &&
                        scores[0]?.p2 !== undefined &&
                        Number(scores[0].p1) >= gamesPerSet &&
                        Number(scores[0].p1) > Number(scores[0].p2)
                          ? 'bg-[#22c55e] text-white'
                          : 'bg-white text-slate-900 focus:bg-slate-50'
                      }`}
                    />
                  </div>

                  {/* Row 2: set1 label */}
                  <div className="flex items-center gap-2 py-1">
                    <span className="w-5" />
                    <span className="w-9 sm:w-10 text-center text-[10px] sm:text-xs font-bold text-slate-600">
                      set1
                    </span>
                  </div>

                  {/* Row 3: Team 2 score */}
                  <div className="flex items-center gap-2">
                    <span className="w-5 text-center text-sm font-black text-slate-800">
                      {setsWon2}
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={2}
                      value={scores[0]?.p2 !== null && scores[0]?.p2 !== undefined ? scores[0].p2 : ''}
                      onChange={(e) => handleScoreInputChange(match.id, 0, 'p2', e.target.value)}
                      onBlur={handleScoreBlur}
                      className={`w-9 h-9 sm:w-10 sm:h-10 border-2 border-black flex items-center justify-center text-center font-black text-sm outline-none transition-colors ${
                        scores[0]?.p1 !== null &&
                        scores[0]?.p1 !== undefined &&
                        scores[0]?.p2 !== null &&
                        scores[0]?.p2 !== undefined &&
                        Number(scores[0].p2) >= gamesPerSet &&
                        Number(scores[0].p2) > Number(scores[0].p1)
                          ? 'bg-[#22c55e] text-white'
                          : 'bg-white text-slate-900 focus:bg-slate-50'
                      }`}
                    />
                  </div>
                </div>
              </div>
            ) : (
              /* Layout for 3 or 5 sets (Image 3) */
              <div className="space-y-3">
                {/* Team 1 */}
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-black text-slate-800 leading-tight">
                      {team1Name}
                    </p>
                    {p1FinalBadge && (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-black border shrink-0 ${
                        p1FinalBadge.includes('🏆') ? 'bg-amber-100 text-amber-900 border-amber-300'
                        : p1FinalBadge.includes('🥈') ? 'bg-slate-100 text-slate-600 border-slate-300'
                        : p1FinalBadge.includes('🥉') ? 'bg-orange-100 text-orange-800 border-orange-300'
                        : 'bg-slate-50 text-slate-400 border-slate-200'
                      }`}>{p1FinalBadge}</span>
                    )}
                  </div>
                  {team1Code && (
                    <p className="text-xs font-bold text-slate-500">
                      [{team1Code}]
                    </p>
                  )}
                </div>

                {/* Sets Grid (Middle) */}
                <div className="flex flex-col items-start pl-0.5">
                  {/* Row 1: Team 1 score input */}
                  <div className="flex items-center gap-1.5">
                    <span className="w-5 text-center text-sm font-black text-slate-800">
                      {setsWon1}
                    </span>
                    {scores.map((setScore, setIdx) => {
                      const isSetWon =
                        setScore.p1 !== null &&
                        setScore.p1 !== undefined &&
                        setScore.p2 !== null &&
                        setScore.p2 !== undefined &&
                        Number(setScore.p1) >= gamesPerSet &&
                        Number(setScore.p1) > Number(setScore.p2);

                      return (
                        <input
                          key={`p1_set_${setIdx}`}
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={2}
                          value={setScore.p1 !== null && setScore.p1 !== undefined ? setScore.p1 : ''}
                          onChange={(e) =>
                            handleScoreInputChange(match.id, setIdx, 'p1', e.target.value)
                          }
                          onBlur={handleScoreBlur}
                          className={`w-9 h-9 sm:w-10 sm:h-10 border-2 border-black flex items-center justify-center text-center font-black text-sm outline-none transition-colors ${
                            isSetWon
                              ? 'bg-[#22c55e] text-white'
                              : 'bg-white text-slate-900 focus:bg-slate-50'
                          }`}
                        />
                      );
                    })}
                  </div>

                  {/* Row 2: Set labels (set1, set2, ...) */}
                  <div className="flex items-center gap-1.5 py-1">
                    <span className="w-5" />
                    {scores.map((_, setIdx) => (
                      <span
                        key={`label_set_${setIdx}`}
                        className="w-9 sm:w-10 text-center text-[10px] sm:text-xs font-bold text-slate-600"
                      >
                        set{setIdx + 1}
                      </span>
                    ))}
                  </div>

                  {/* Row 3: Team 2 score input */}
                  <div className="flex items-center gap-1.5">
                    <span className="w-5 text-center text-sm font-black text-slate-800">
                      {setsWon2}
                    </span>
                    {scores.map((setScore, setIdx) => {
                      const isSetWon =
                        setScore.p1 !== null &&
                        setScore.p1 !== undefined &&
                        setScore.p2 !== null &&
                        setScore.p2 !== undefined &&
                        Number(setScore.p2) >= gamesPerSet &&
                        Number(setScore.p2) > Number(setScore.p1);

                      return (
                        <input
                          key={`p2_set_${setIdx}`}
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={2}
                          value={setScore.p2 !== null && setScore.p2 !== undefined ? setScore.p2 : ''}
                          onChange={(e) =>
                            handleScoreInputChange(match.id, setIdx, 'p2', e.target.value)
                          }
                          onBlur={handleScoreBlur}
                          className={`w-9 h-9 sm:w-10 sm:h-10 border-2 border-black flex items-center justify-center text-center font-black text-sm outline-none transition-colors ${
                            isSetWon
                              ? 'bg-[#22c55e] text-white'
                              : 'bg-white text-slate-900 focus:bg-slate-50'
                          }`}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Team 2 */}
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-black text-slate-800 leading-tight">
                      {team2Name}
                    </p>
                    {p2FinalBadge && (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-black border shrink-0 ${
                        p2FinalBadge.includes('🏆') ? 'bg-amber-100 text-amber-900 border-amber-300'
                        : p2FinalBadge.includes('🥈') ? 'bg-slate-100 text-slate-600 border-slate-300'
                        : p2FinalBadge.includes('🥉') ? 'bg-orange-100 text-orange-800 border-orange-300'
                        : 'bg-slate-50 text-slate-400 border-slate-200'
                      }`}>{p2FinalBadge}</span>
                    )}
                  </div>
                  {team2Code && (
                    <p className="text-xs font-bold text-slate-500">
                      [{team2Code}]
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      };

      return (
        <section className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden animate-in fade-in space-y-4">
          <div className="p-5 border-b border-slate-100 flex flex-col gap-3.5">
            <div>
              <h3 className="text-base font-black text-slate-800">
                Partidas ({selectedCategory.name})
              </h3>
              <p className="text-xs text-slate-400 font-bold mt-0.5">
                {categoryMatches.length} {categoryMatches.length === 1 ? 'partida configurada' : 'partidas configuradas'} nesta categoria.
              </p>
            </div>
            {categoryMatches.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleGenerateSystemMatches}
                  className="flex items-center justify-center gap-2 border-2 border-emerald-500 text-emerald-600 bg-white hover:bg-emerald-50 px-4 py-2.5 rounded-2xl text-xs font-black shadow-xs transition-all active:scale-95 shrink-0"
                >
                  <Sparkles size={16} className="text-emerald-500" />
                  <span>Regerar partidas</span>
                </button>
                <button
                  type="button"
                  onClick={handleGenerateBlankPdf}
                  className="flex items-center justify-center gap-2 border-2 border-orange-400 text-orange-600 bg-white hover:bg-orange-50 px-4 py-2.5 rounded-2xl text-xs font-black shadow-xs transition-all active:scale-95 shrink-0"
                  title="Gerar PDF com todas as partidas em branco para anotações manuais"
                >
                  <FileText size={16} className="text-orange-500" />
                  <span>Gerar PDF</span>
                </button>
                <button
                  type="button"
                  onClick={handleDeleteAllCategoryMatches}
                  className="flex items-center justify-center gap-2 border-2 border-red-500 text-red-600 bg-white hover:bg-red-50 px-4 py-2.5 rounded-2xl text-xs font-black shadow-xs transition-all active:scale-95 shrink-0"
                  title="Deletar todas as partidas geradas desta categoria"
                >
                  <Trash2 size={16} className="text-red-500" />
                  <span>Deletar</span>
                </button>
              </div>
            )}
          </div>

          {categoryMatches.length === 0 ? (
            <div className="p-10 text-center space-y-3">
              <p className="text-sm font-bold text-slate-400">Nenhuma partida gerada para esta categoria.</p>
              <button
                type="button"
                onClick={handleGenerateSystemMatches}
                className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2.5 rounded-xl text-xs font-black shadow-md active:scale-95 transition-all"
              >
                <Sparkles size={16} />
                <span>Gerar partidas</span>
              </button>
            </div>
          ) : isSuper8 ? (
            <div className="p-4 space-y-6">
              {(() => {
                const roundMap = new Map<string, { label: string; matches: TournamentMatch[] }>();
                categoryMatches.forEach((m) => {
                  const phase = m.phase || 'rodada1';
                  const num = phase.replace(/\D/g, '') || '1';
                  const roundKey = `rodada${num}`;
                  if (!roundMap.has(roundKey)) {
                    roundMap.set(roundKey, { label: `Rodada ${num}`, matches: [] });
                  }
                  roundMap.get(roundKey)!.matches.push(m);
                });
                const rounds = Array.from(roundMap.entries())
                  .sort(([k1], [k2]) => {
                    const n1 = Number(k1.replace(/\D/g, '')) || 0;
                    const n2 = Number(k2.replace(/\D/g, '')) || 0;
                    return n1 - n2;
                  })
                  .map(([, v]) => v);

                return rounds.map((round) => (
                  <div key={round.label} className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-black text-slate-800">{round.label}</h4>
                      <span className="text-[10px] font-black text-slate-400">{round.matches.length} {round.matches.length === 1 ? 'jogo' : 'jogos'}</span>
                    </div>
                    <div className="grid grid-cols-1 gap-2.5">
                      {round.matches.map(renderMatchItem)}
                    </div>
                  </div>
                ));
              })()}
            </div>
          ) : (
            <div className="p-4 space-y-6">
              {b1Matches.length > 0 && (
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black text-slate-800">Primeira fase — Chave 1</h4>
                    <span className="text-[10px] font-black text-slate-400">{b1Matches.length} jogos</span>
                  </div>
                  <div className="grid grid-cols-1 gap-2.5">
                    {b1Matches.map(renderMatchItem)}
                  </div>
                </div>
              )}
              {b2Matches.length > 0 && (
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black text-slate-800">Primeira fase — Chave 2</h4>
                    <span className="text-[10px] font-black text-slate-400">{b2Matches.length} jogos</span>
                  </div>
                  <div className="grid grid-cols-1 gap-2.5">
                    {b2Matches.map(renderMatchItem)}
                  </div>
                </div>
              )}
              {semiMatches.length > 0 && (
                <div className="rounded-2xl border border-amber-100 bg-amber-50/50 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black text-amber-900">Semifinais</h4>
                    <span className="text-[10px] font-black text-amber-600">{semiMatches.length} jogos</span>
                  </div>
                  <div className="grid grid-cols-1 gap-2.5">
                    {semiMatches.map(renderMatchItem)}
                  </div>
                </div>
              )}
              {finalMatches.length > 0 && (
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black text-emerald-900">Finais & 3º lugar</h4>
                    <span className="text-[10px] font-black text-emerald-600">{finalMatches.length} jogos</span>
                  </div>
                  <div className="grid grid-cols-1 gap-2.5">
                    {finalMatches.map(renderMatchItem)}
                  </div>
                </div>
              )}
              {otherMatches.length > 0 && (
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black text-slate-800">Outras Partidas</h4>
                    <span className="text-[10px] font-black text-slate-400">{otherMatches.length} jogos</span>
                  </div>
                  <div className="grid grid-cols-1 gap-2.5">
                    {otherMatches.map(renderMatchItem)}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      );
    }

    return (
      <section className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-black text-slate-800">Inscritos ({selectedCategory.name})</h3>
            <p className="text-xs text-slate-400 font-bold mt-0.5">
              {isSuper8
                ? 'Classificação individual e estatísticas dos atletas.'
                : 'Clique nos participantes para formar ou desfazer times.'}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 px-4 py-3 bg-slate-50 border-b border-slate-100">
          {isSuper8 ? (
            <>
              <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 border border-emerald-200/60 px-2.5 py-1 rounded-lg">
                Classificação Super 8
              </span>
              {(() => {
                // Calcula a rodada atual: a maior rodada com ao menos uma partida em andamento ou finalizada
                const roundNumbers = categoryMatches
                  .map((m) => {
                    const phase = m.phase || 'rodada1';
                    return Number(phase.replace(/\D/g, '')) || 1;
                  });
                if (roundNumbers.length === 0) return null;
                const maxRound = Math.max(...roundNumbers);
                // Verifica se alguma partida da rodada atual ainda está em andamento
                const currentRoundMatches = categoryMatches.filter((m) => {
                  const num = Number((m.phase || 'rodada1').replace(/\D/g, '')) || 1;
                  return num === maxRound;
                });
                const allFinished = currentRoundMatches.every((m) => m.status === 'finished');
                const hasAny = currentRoundMatches.length > 0;
                if (!hasAny) return null;
                return (
                  <span className={`text-[10px] font-black px-2.5 py-1 rounded-lg border ${
                    allFinished
                      ? 'text-slate-600 bg-slate-100 border-slate-200'
                      : 'text-sky-700 bg-sky-50 border-sky-200'
                  }`}>
                    Rodada: {maxRound} — {allFinished ? 'finalizada' : 'em andamento'}
                  </span>
                );
              })()}
            </>
          ) : (
            <>
              <span className="text-[10px] font-black text-slate-400">Classificar por</span>
              <button
                type="button"
                onClick={() => setSortBy(sortBy === 'team' ? 'name' : 'team')}
                className="flex items-center gap-1.5 text-[10px] font-black text-blue-600 bg-white border border-slate-200 px-2.5 py-1.5 rounded-lg transition-all hover:bg-slate-50"
              >
                {sortBy === 'team' ? 'Time' : 'Participante'} <ArrowUpDown size={12} />
              </button>
            </>
          )}
        </div>
        {sortedCategoryEntries.length === 0 ? (
          <div className="p-10 text-center text-sm font-bold text-slate-400">
            Nenhum inscrito nesta categoria.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {sortedCategoryEntries.map((entry, entryIndex) => {
              const entryCategories = categories.filter((c) =>
                entry.categoryIds?.includes(c.id)
              );
              const entryPaid = entry.payments?.reduce((acc, p) => acc + p.amount, 0) ?? (entry.paidAmount ?? 0);
              const isExpanded = expandedRegistrationEmail === entry.email;
              const isSelected = !isSuper8 && selectedEntries.has(entry.email);
              const pair = !isSuper8 ? pairForEntry(entry) : null;
              const standingKey = (entry.email || entry.pin || '').toLowerCase().trim();
              const standing = isSuper8 ? super8StandingsMap.get(standingKey) : null;

              return (
                <div
                  key={entry.email || entry.pin}
                  className={`transition-colors ${
                    isSelected
                      ? 'bg-sky-50/70 ring-2 ring-inset ring-sky-400'
                      : isExpanded
                      ? 'bg-emerald-50/30'
                      : entryIndex % 2 === 0
                      ? 'bg-white hover:bg-slate-50/70'
                      : 'bg-emerald-50/30 hover:bg-emerald-50/50'
                  }`}
                >
                  <div
                    onClick={() => !isSuper8 && toggleEntrySelection(entry)}
                    className={`p-3.5 sm:p-4 flex flex-col gap-2.5 ${isSuper8 ? 'cursor-default' : 'cursor-pointer'}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      {/* Lado Esquerdo: Ícone de Gênero + Informações do Participante */}
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        {/* Ícone de Gênero */}
                        <button
                          type="button"
                          onClick={async (e) => {
                            e.stopPropagation();
                            const nextGender = entry.gender === 'F' ? 'M' : 'F';
                            const db = getDb();
                            if (db && event.pin) {
                              try {
                                const { updateEventEntry } = await import('@infra/firebase/events');
                                await updateEventEntry(db, event.pin, entry.email, { gender: nextGender });
                                const { updateUserProfileFields } = await import('@infra/firebase/users');
                                await updateUserProfileFields(db, entry.email, { gender: nextGender });
                              } catch (err) {
                                console.error('Erro ao alternar gênero:', err);
                              }
                            }
                            const updatedEntries = entries.map((item) =>
                              (item.email === entry.email || item.pin === entry.pin)
                                ? { ...item, gender: nextGender as 'M' | 'F' }
                                : item
                            );
                            onUpdateEvent({ ...event, entries: updatedEntries });
                          }}
                          className={`mt-0.5 p-2 rounded-2xl border flex items-center justify-center shrink-0 transition-all active:scale-90 ${
                            entry.gender === 'F'
                              ? 'bg-pink-50 text-pink-500 border-pink-100 hover:bg-pink-100'
                              : 'bg-sky-50 text-sky-500 border-sky-100 hover:bg-sky-100'
                          }`}
                          title="Clique para alternar gênero"
                        >
                          {entry.gender === 'F' ? <VenusIcon size={20} /> : <MarsIcon size={20} />}
                        </button>

                        {/* Bloco das Linhas de Informação */}
                        <div className="space-y-1 min-w-0 flex-1 text-left">
                          {/* Linha 1: Nome */}
                          <div className="flex items-center gap-2 flex-wrap">
                            {isSuper8 && standing?.rank !== undefined && (
                              <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${
                                standing.rank === 1
                                  ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                  : standing.rank === 2
                                  ? 'bg-slate-200 text-slate-700 border border-slate-300'
                                  : standing.rank === 3
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200/80'
                                  : 'bg-slate-100 text-slate-600'
                              }`}>
                                {standing.rank}º
                              </span>
                            )}
                            <p className="font-black text-sm text-slate-800 tracking-tight truncate">
                              {entry.name || entry.nickname}
                            </p>
                            {pair && (
                              <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-0.5 rounded-lg text-[10px] font-black border border-blue-100">
                                <Trophy size={11} /> {pair.teamCode || `Time ${pair.teamNumber || ''}`}
                              </span>
                            )}
                          </div>

                          {/* Linha 2: Nickname - PIN mascarado (padrão Inscrições) */}
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            {(entry.nickname || entry.name).toUpperCase()} - {maskPin(entry.pin)}
                          </p>

                          {/* Linha 3: Categorias */}
                          {entryCategories.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5 pt-0.5">
                              {entryCategories.map((c) => (
                                <span
                                  key={c.id}
                                  className="bg-slate-100 text-slate-700 font-black px-2.5 py-0.5 rounded-lg text-[10px] border border-slate-200/60"
                                >
                                  {c.abbreviation || c.name}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[10px] text-slate-300 font-bold">Sem categoria</p>
                          )}

                          {/* Linha 4: Status do Pagamento + Valores — oculto quando inscrição gratuita */}
                          {((entry.dueAmount ?? 0) > 0 || entryPaid > 0) && (
                            <div className="flex items-center gap-2 pt-0.5 flex-wrap">
                              <span
                                className={`inline-flex px-2 py-0.5 rounded-md text-[9px] font-black uppercase ${
                                  entry.paymentStatus === 'Confirmado' || entry.paymentStatus === 'Pago'
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : entry.paymentStatus === 'Isento'
                                    ? 'bg-blue-100 text-blue-700'
                                    : 'bg-amber-100 text-amber-700'
                                }`}
                              >
                                {entry.paymentStatus === 'Pago' ? 'Confirmado' : entry.paymentStatus || 'Pendente'}
                              </span>
                              <span className="text-xs font-bold text-slate-600">
                                R$ {entryPaid.toFixed(2)}/{(entry.dueAmount ?? 0).toFixed(2)}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Lado Direito: Inscrição_ID + Botão de Ação / Chevron */}
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="font-mono font-black text-emerald-600 text-sm tracking-wider">
                          {formatRegistrationId(entry.registrationId)}
                        </span>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedRegistrationEmail(isExpanded ? null : entry.email);
                          }}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition-all hover:bg-slate-200 active:scale-90 shadow-sm"
                          title={isExpanded ? 'Fechar cadastro de inscrição' : 'Abrir cadastro de inscrição'}
                        >
                          {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                        </button>
                      </div>
                    </div>

                    {/* Controles de estatísticas do Super 8 (Requisitos h, i, j) */}
                    {isSuper8 && standing && categoryMatches.length > 0 && (
                      <div className="mt-1 pt-2.5 border-t border-slate-100 space-y-1.5">
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          {/* Linha 1 */}
                          <div className="flex items-center justify-between bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-xl">
                            <span className="text-[11px] font-black text-slate-500">Vitórias (Pts):</span>
                            <span className="font-black text-slate-900 text-xs">{standing.wins}</span>
                          </div>
                          <div className="flex items-center justify-between bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-xl">
                            <span className="text-[11px] font-black text-slate-500">Saldo de Games:</span>
                            <span className={`font-black text-xs ${standing.gamesDiff > 0 ? 'text-emerald-600' : standing.gamesDiff < 0 ? 'text-red-600' : 'text-slate-800'}`}>
                              {standing.gamesDiff > 0 ? `+${standing.gamesDiff}` : standing.gamesDiff}
                            </span>
                          </div>
                          {/* Linha 2 */}
                          <div className="flex items-center justify-between bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-xl">
                            <span className="text-[11px] font-black text-slate-500">Games a Favor:</span>
                            <span className="font-black text-slate-900 text-xs">{standing.gamesWon}</span>
                          </div>
                          <div className="flex items-center justify-between bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-xl">
                            <span className="text-[11px] font-black text-slate-500">Games Sofridos:</span>
                            <span className="font-black text-slate-900 text-xs">{standing.gamesLost}</span>
                          </div>
                        </div>
                        {standing.tieBreakNote && (
                          <div className="pt-0.5">
                            <span className="inline-flex items-center gap-1 text-[10px] font-black text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg">
                              ⚖️ {standing.tieBreakNote}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Formulário Expandido */}
                  {isExpanded && (
                    <div className="bg-white px-3.5 sm:px-4 pb-4 pt-1">
                      <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
                        <EventRegistrationForm
                          key={`expanded-${entry.email || entry.pin}`}
                          event={event}
                          mode="admin"
                          entry={entry}
                          onUpdateEvent={onUpdateEvent}
                          onSave={(updated) => handleSaveExpandedEntry(updated, entry.pin)}
                          onDelete={() => {
                            handleDeleteEntry(entry.pin);
                          }}
                          onCancel={() => setExpandedRegistrationEmail(null)}
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

  return (
    <div className="space-y-6">
      {/* Top Selection Action Bar (Item a / Image 1 style) */}
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
            {selectedPair ? (
              <button
                type="button"
                onClick={handleFormTeam}
                className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2.5 rounded-xl text-xs font-black shadow-md active:scale-95 transition-all"
                title="Desfazer time"
              >
                <UserRound size={16} />
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
            )}
          </div>
        </header>
      )}

      {/* Top Selection Action Bar for TEAMS (Manual Match Generation - Item a1 / Image 3 style) */}
      {isManualMatchDraw && selectedTeamIds.size > 0 && (
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
            {selectedTeamIds.size === 2 ? (
              <button
                type="button"
                onClick={handleCreateManualMatch}
                className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-xs font-black shadow-md active:scale-95 transition-all"
                title="Gerar partida com os 2 times selecionados"
              >
                <UsersRound size={16} />
                <span>Gerar partida</span>
              </button>
            ) : (
              <span className="text-xs font-bold text-sky-100 bg-sky-700/60 px-3 py-2 rounded-xl">
                Selecione +1 time
              </span>
            )}
          </div>
        </header>
      )}

      {/* Top Banner & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
        <div>
          <h2 className="text-xl font-black text-slate-800 tracking-tight">Categorias</h2>
          <p className="text-xs text-slate-400 font-bold mt-0.5">
            Defina formato, descrição e prioridade de cada disputa do evento.
          </p>
        </div>
        {!isAdding && (
          <button
            onClick={handleStartAdd}
            className="flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-black text-xs px-5 py-3 rounded-2xl shadow-sm transition-all self-start sm:self-auto"
          >
            <Plus size={18} /> Categoria
          </button>
        )}
      </div>

      {/* Category Registration / Edit Form */}
      {isAdding && (
        <form onSubmit={handleSave} className="bg-white p-6 rounded-3xl border-2 border-emerald-500 shadow-md space-y-4 animate-in slide-in-from-top-4">
          <div className="flex items-center justify-between border-b pb-3">
            <h3 className="font-black text-slate-700 text-sm flex items-center gap-2">
              <Layers size={18} className="text-emerald-500" />
              {editingId ? 'Editar categoria' : 'Nova categoria'}
            </h3>
            <div className="flex items-center gap-1">
              {/* Delete button — only shown when editing */}
              {editingId && (
                <button
                  type="button"
                  onClick={() => handleDelete(editingId)}
                  className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                  title="Excluir categoria"
                >
                  <Trash2 size={18} />
                </button>
              )}
              <button
                type="button"
                onClick={resetForm}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <ChevronUp size={20} />
              </button>
            </div>
          </div>

          {/* 1 Campo por linha */}
          <div className="space-y-3">
            {/* Linha 1: Nome */}
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 ml-1">Nome</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Duplas Masculino A"
                className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 font-bold text-xs outline-none focus:border-emerald-500"
              />
            </div>

            {/* Linha 2: Descrição */}
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 ml-1">Descrição</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex: Categoria avançada masculina"
                className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 font-bold text-xs outline-none focus:border-emerald-500"
              />
            </div>

            {/* Linha 3: Formato */}
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 ml-1">Formato</label>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as 'Simples' | 'Duplas')}
                className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 font-bold text-xs outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value="Duplas">Duplas</option>
                <option value="Simples">Simples</option>
              </select>
            </div>

            {/* Linha 4: Esporte */}
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 ml-1">Esporte</label>
              <select
                value={sportId}
                onChange={(e) => setSportId(e.target.value)}
                className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 font-bold text-xs outline-none focus:border-emerald-500 cursor-pointer"
              >
                {activeSports.length === 0 ? (
                  <option value="beach-tennis">Beach Tennis</option>
                ) : (
                  activeSports.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Linha 5: Abreviação */}
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 ml-1">Abreviação</label>
              <input
                type="text"
                value={abbreviation}
                onChange={(e) => setAbbreviation(e.target.value)}
                placeholder="Ex: DMa_A"
                className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 font-bold text-xs outline-none focus:border-emerald-500"
              />
            </div>

            {/* Linha 6 (Última linha): Prioridade, Gênero 1, Gênero 2 */}
            <div className="grid grid-cols-3 gap-3 pt-1">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 ml-1">Prioridade</label>
                <input
                  type="number"
                  min={1}
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value))}
                  className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 font-bold text-xs outline-none focus:border-emerald-500 text-center"
                />
              </div>

              {/* Gênero 1 */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 ml-1">Gênero 1</label>
                <button
                  type="button"
                  onClick={() => setGender1(gender1 === 'M' ? 'F' : 'M')}
                  className={`w-full h-11 rounded-xl flex items-center justify-center gap-2 border font-black text-xs transition-all active:scale-95 ${
                    gender1 === 'M'
                      ? 'bg-blue-500 text-white border-blue-500'
                      : 'bg-pink-500 text-white border-pink-500'
                  }`}
                  title="Clique para alternar entre M e F"
                >
                  {gender1 === 'M' ? <MarsIcon size={18} /> : <VenusIcon size={18} />}
                  {gender1 === 'M' ? 'M' : 'F'}
                </button>
              </div>

              {/* Gênero 2 — só para Duplas */}
              {format === 'Duplas' ? (
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 ml-1">Gênero 2</label>
                  <button
                    type="button"
                    onClick={() => setGender2(gender2 === 'M' ? 'F' : 'M')}
                    className={`w-full h-11 rounded-xl flex items-center justify-center gap-2 border font-black text-xs transition-all active:scale-95 ${
                      gender2 === 'M'
                        ? 'bg-blue-500 text-white border-blue-500'
                        : 'bg-pink-500 text-white border-pink-500'
                    }`}
                    title="Clique para alternar entre M e F"
                  >
                    {gender2 === 'M' ? <MarsIcon size={18} /> : <VenusIcon size={18} />}
                    {gender2 === 'M' ? 'M' : 'F'}
                  </button>
                </div>
              ) : (
                <div className="space-y-1 invisible">
                  <label className="text-[10px]">–</label>
                  <div className="h-11" />
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-3 pt-3">
            <button
              type="submit"
              className="bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs px-6 py-3.5 rounded-xl transition-all shadow-sm flex items-center gap-2"
            >
              <Check size={16} /> Salvar categoria
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs px-5 py-3.5 rounded-xl transition-all"
            >
              Cancelar
            </button>
          </div>
        </form>
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
              <div
                onClick={() => openCategoryPanel(cat.id, 'entries')}
                className={`p-4 rounded-2xl border text-left transition-all space-y-3 w-full cursor-pointer ${
                  isEditing
                    ? 'border-emerald-500 bg-emerald-50 shadow-md scale-[1.01]'
                    : isSelectedCategory
                    ? 'border-blue-400 bg-blue-50/30 shadow-sm'
                    : 'bg-white border-slate-100 hover:border-emerald-300 hover:shadow-sm shadow-sm'
                }`}
              >
                {/* Header: priority badge + format badge + Chevron edit button */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-6 h-6 inline-flex items-center justify-center bg-slate-100 rounded-lg text-slate-600 font-black text-[10px]">
                      {cat.priority}
                    </span>
                    <div className="min-w-0">
                      <p className="font-black text-slate-800 text-sm leading-tight truncate">{cat.name}</p>
                      <p className="text-[10px] text-slate-400 font-bold mt-0.5 truncate">{cat.sportName || cat.sportId}{cat.abbreviation && ` · ${cat.abbreviation}`}</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleStartEdit(cat); }}
                    className="p-2 bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 rounded-xl active:scale-90 transition-all"
                    title="Abrir cadastro da categoria"
                  >
                    <ChevronDown size={18} />
                  </button>
                </div>

                {/* Gender badges */}
                <div className="flex items-center gap-1.5">
                  <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${cat.format === 'Duplas' ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-blue-600'}`}>
                    {cat.format}
                  </span>
                  {cat.gender1 && (
                    <span className={`flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-full ${
                      cat.gender1 === 'M' ? 'bg-blue-50 text-blue-600' : 'bg-pink-50 text-pink-600'
                    }`}>
                      {cat.gender1 === 'M' ? <MarsIcon size={10} /> : <VenusIcon size={10} />}
                      {cat.gender1}
                    </span>
                  )}
                  {cat.gender2 && cat.format === 'Duplas' && (
                    <span className={`flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-full ${
                      cat.gender2 === 'M' ? 'bg-blue-50 text-blue-600' : 'bg-pink-50 text-pink-600'
                    }`}>
                      {cat.gender2 === 'M' ? <MarsIcon size={10} /> : <VenusIcon size={10} />}
                      {cat.gender2}
                    </span>
                  )}
                </div>

                {/* Stats row */}
                <div className="flex items-center gap-1.5 pt-1 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={(event) => { event.stopPropagation(); openCategoryPanel(cat.id, 'entries'); }}
                    className={`flex items-center gap-1 rounded-lg px-1.5 py-1 text-[10px] font-black transition-colors ${isSelectedCategory && categoryPanelView === 'entries' ? 'bg-emerald-50 text-emerald-600' : 'text-slate-500 hover:bg-slate-50'}`}
                  >
                    <Users size={11} className="text-emerald-500" />
                    <span>{inscritosCount} inscritos</span>
                  </button>
                  {!isSuper8 && (
                    <button
                      type="button"
                      onClick={(event) => { event.stopPropagation(); openCategoryPanel(cat.id, 'teams'); }}
                      className={`flex items-center gap-1 rounded-lg px-1.5 py-1 text-[10px] font-black transition-colors ${isSelectedCategory && categoryPanelView === 'teams' ? 'bg-blue-50 text-blue-600' : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                      <Trophy size={11} className="text-blue-500" />
                      <span>{timesCount} times</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(event) => { event.stopPropagation(); openCategoryPanel(cat.id, 'matches'); }}
                    className={`flex items-center gap-1 rounded-lg px-1.5 py-1 text-[10px] font-black transition-colors ${isSelectedCategory && categoryPanelView === 'matches' ? 'bg-amber-50 text-amber-600' : 'text-slate-500 hover:bg-slate-50'}`}
                  >
                    <Swords size={11} className="text-amber-500" />
                    <span>{partidasCount} partidas</span>
                  </button>
                </div>
              </div>
              {selectedCategoryId === cat.id && renderCategoryPanel()}
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
};
