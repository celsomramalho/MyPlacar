import React, { useState } from 'react';
import { Plus, Layers, Check, X, Trash2, Tag, Users, Trophy, ChevronDown, ChevronUp, ArrowUpDown, UserCheck, UserRound, UsersRound, Columns2, AlertTriangle, Swords, Sparkles } from 'lucide-react';
import { minifyEntryForPair, minifyPairForStorage, type EventCategory, type TournamentEntry, type TournamentEvent, type TournamentPair, type TournamentMatch, type MatchSetScore } from '@modules/events/types';
import { generateSystemMatchesForCategory, createManualMatch, formatMatchDisplayString, formatMatchNumber, getPhaseLabel } from '@modules/events/services/matchGenerator';
import { updatePlayoffProgression } from '@modules/events/services/matchProgression';
import type { FirebaseAdminSportIcon } from '@infra/firebase/adminIcons';
import { MarsIcon, VenusIcon } from '@shared/components/GenderIcons';
import { getDb } from '@infra/firebase';
import { updateEvent } from '@infra/firebase/events';
import type { Firestore } from 'firebase/firestore';

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

  // Form State
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [format, setFormat] = useState<'Simples' | 'Duplas'>('Duplas');
  const [priority, setPriority] = useState<number>(categories.length + 1);
  const [sportId, setSportId] = useState<string>(activeSports[0]?.id || 'beach-tennis');
  const [abbreviation, setAbbreviation] = useState('');
  const [gender1, setGender1] = useState<'M' | 'F'>('M');
  const [gender2, setGender2] = useState<'M' | 'F'>('M');

  const saveMatchesTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const pairsById = React.useMemo(() => {
    const map: Record<string, TournamentPair> = {};
    pairs.forEach((p) => {
      map[p.id] = p;
    });
    return map;
  }, [pairs]);

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
    if (window.confirm('Tem certeza que deseja excluir esta categoria?')) {
      const updated = categories.filter((c) => c.id !== id);
      onUpdateCategories(updated);
      if (selectedCategoryId === id) {
        setSelectedCategoryId(null);
      }
    }
  };

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
  const categoryEntries = entries.filter((e) =>
    selectedCategory ? e.categoryIds?.includes(selectedCategory.id) : false
  );
  const sortedCategoryEntries = [...categoryEntries].sort((a, b) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name);
    const pA = pairs.find((p) => (p.p1.email === a.email || p.p2.email === a.email) && p.categoryId === selectedCategory?.id);
    const pB = pairs.find((p) => (p.p1.email === b.email || p.p2.email === b.email) && p.categoryId === selectedCategory?.id);
    if (pA && !pB) return -1;
    if (!pA && pB) return 1;
    if (pA && pB) return (pA.teamNumber || 0) - (pB.teamNumber || 0);
    return a.name.localeCompare(b.name);
  });

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
      if (window.confirm(`Desfazer o time ${selectedPair.teamCode || ''}?`)) {
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
      }
      return;
    }
    if (!selectedCategory || selectedEntries.size !== 2) return;
    const selected = Array.from(selectedEntries).map((email) => categoryEntries.find((entry) => entry.email === email)).filter(Boolean) as TournamentEntry[];
    if (selected.length !== 2) return;

    const validation = validateCategoryGenders(selectedCategory, selected);
    if (!validation.valid) {
      window.alert(validation.message || 'Formação de time incompatível com os requisitos da categoria.');
      return;
    }

    const teamNumber = Math.max(
      0,
      ...pairs.map((pair, index) => pair.teamNumber || Number(pair.teamCode?.match(/^\d{3}/)?.[0]) || index + 1)
    ) + 1;
    const teamCode = `${String(teamNumber).padStart(3, '0')} - ${selectedCategory.abbreviation}`;
    const newPair: TournamentPair = {
      id: `pair_${Date.now()}`,
      p1: minifyEntryForPair(selected[0]),
      p2: minifyEntryForPair(selected[1]),
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

  const handleUpdateTeamBracket = async (pairId: string, bracket: 1 | 2) => {
    const nextPairs = pairs.map((pair) => (pair.id === pairId ? { ...pair, bracket } : pair));
    onUpdateEvent({
      ...event,
      pairs: nextPairs,
    });
    const db = getDb();
    if (db) {
      try {
        await updateEvent(db as Firestore, event.pin, { pairs: nextPairs });
      } catch (err) {
        console.error('Erro ao atualizar bracket no Firestore:', err);
      }
    }
  };

  const handleToggleTeamBracket = (pair: TournamentPair) => {
    const hasCatMatches = matches.some(
      (m) =>
        m.categoryId === selectedCategory?.id ||
        (!m.categoryId && (m.pair1Id === pair.id || m.pair2Id === pair.id))
    );
    if (hasCatMatches) {
      window.alert('As chaves estão bloqueadas pois as partidas desta categoria já foram geradas.');
      return;
    }
    handleUpdateTeamBracket(pair.id, (pair.bracket ?? 1) === 1 ? 2 : 1);
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
    const catPairs = pairs.filter(
      (p) =>
        p.categoryId === selectedCategory.id ||
        (!p.categoryId && (p.p1?.categoryIds?.includes(selectedCategory.id) || p.p2?.categoryIds?.includes(selectedCategory.id)))
    );

    if (catPairs.length < 2) {
      window.alert('É necessário ter pelo menos 2 times formados nesta categoria para gerar partidas.');
      return;
    }

    const existingCatMatches = matches.filter((m) => m.categoryId === selectedCategory.id);
    if (existingCatMatches.length > 0) {
      const confirmRegen = window.confirm(
        `A categoria "${selectedCategory.name}" já possui ${existingCatMatches.length} partidas geradas. Deseja regerar todas as partidas desta categoria?`
      );
      if (!confirmRegen) return;
    }

    const generated = generateSystemMatchesForCategory(selectedCategory, pairs, matches);
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

  const handleDeleteMatch = async (matchId: string) => {
    if (!window.confirm('Excluir esta partida?')) return;
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
  };

  const renderTeamCard = (pair: TournamentPair, showBracketToggle = true, hasMatches = false) => {
    const isSelected = isManualMatchDraw && selectedTeamIds.has(pair.id);

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
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[15px] font-black text-slate-800 leading-tight truncate">
              {pair.p1.nickname || pair.p1.name} & {pair.p2.nickname || pair.p2.name}
            </p>
            <p className="mt-1 text-xs font-bold text-slate-400 truncate">
              {pair.teamCode || `Time ${pair.teamNumber || ''}`}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {showBracketToggle && (
              hasMatches ? (
                <span
                  className={`rounded-xl px-3 py-1.5 text-[10px] font-black border shadow-xs cursor-default ${
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
                  className={`rounded-xl px-3 py-1.5 text-[10px] font-black transition-all active:scale-95 shadow-xs ${
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

    if (categoryPanelView === 'teams') {
      const bracketOne = sortedCategoryPairs.filter((pair) => (pair.bracket ?? 1) === 1);
      const bracketTwo = sortedCategoryPairs.filter((pair) => pair.bracket === 2);

      return (
        <section className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden animate-in fade-in">
          <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-black text-slate-800">
                Times ({selectedCategory.name})
              </h3>
              <p className="text-xs text-slate-400 font-bold mt-0.5">
                {hasCategoryMatches
                  ? 'Times formados (chaves bloqueadas pois as partidas já foram geradas).'
                  : 'Times formados separados por chaves. Clique no botão da chave para alternar.'}
              </p>
            </div>
            {isSystemDraw && (
              <button
                type="button"
                onClick={handleGenerateSystemMatches}
                className="flex items-center justify-center gap-2 border-2 border-red-500 text-red-600 bg-white hover:bg-red-50 px-5 py-2.5 rounded-2xl text-xs font-black shadow-xs transition-all active:scale-95 shrink-0"
              >
                <Sparkles size={16} className="text-red-500" />
                <span>{hasCategoryMatches ? 'Regerar partidas' : 'Gerar partidas'}</span>
              </button>
            )}
          </div>
          {sortedCategoryPairs.length === 0 ? (
            <div className="p-10 text-center text-sm font-bold text-slate-400">Nenhum time formado nesta categoria.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
              {[{ label: 'Chave 1', list: bracketOne }, { label: 'Chave 2', list: bracketTwo }].map((bracket) => (
                <div key={bracket.label} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="text-xs font-black text-slate-800">{bracket.label}</h4>
                    <span className="text-[10px] font-black text-slate-400">{bracket.list.length} times</span>
                  </div>
                  <div className="space-y-2">
                    {bracket.list.length === 0 ? (
                      <p className="py-6 text-center text-xs font-bold text-slate-300">Sem times nesta chave.</p>
                    ) : (
                      bracket.list.map((pair) => renderTeamCard(pair, true, hasCategoryMatches))
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
      if (s.p1 !== null && s.p1 !== undefined && s.p2 !== null && s.p2 !== undefined) {
        if (Number(s.p1) > Number(s.p2)) {
          setsWon1 += 1;
        } else if (Number(s.p2) > Number(s.p1)) {
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

      currentScores.forEach((s) => {
        if (s.p1 !== null && s.p1 !== undefined && s.p2 !== null && s.p2 !== undefined) {
          resultParts.push(`${s.p1}/${s.p2}`);
          if (Number(s.p1) > Number(s.p2)) {
            setsWon1 += 1;
          } else if (Number(s.p2) > Number(s.p1)) {
            setsWon2 += 1;
          }
        }
      });

      let status: 'waiting' | 'live' | 'finished' = 'waiting';
      let winnerPairId = m.winnerPairId;
      let loserPairId = m.loserPairId;

      if (setsWon1 >= setsToWin) {
        status = 'finished';
        winnerPairId = m.pair1Id;
        loserPairId = m.pair2Id;
      } else if (setsWon2 >= setsToWin) {
        status = 'finished';
        winnerPairId = m.pair2Id;
        loserPairId = m.pair1Id;
      } else if (resultParts.length > 0) {
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
        const { scores, setsWon1, setsWon2 } = parseMatchSets(match, totalSets);

        const statusLabel =
          match.status === 'finished' ? 'Finalizado' :
          match.status === 'live' ? 'Ao vivo' : 'Aguardando';
        const statusColor =
          match.status === 'finished' ? 'bg-blue-50 text-blue-700 border-blue-200' :
          match.status === 'live' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 animate-pulse' :
          'bg-slate-100 text-slate-500 border-slate-200';

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
                    <p className="text-sm font-black text-slate-800 leading-tight">
                      {team1Name}
                    </p>
                    {team1Code && (
                      <p className="text-xs font-bold text-slate-500">
                        [{team1Code}]
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-800 leading-tight">
                      {team2Name}
                    </p>
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
                        scores[0]?.p1 !== null && scores[0]?.p1 !== undefined && scores[0]?.p2 !== null && scores[0]?.p2 !== undefined && Number(scores[0].p1) > Number(scores[0].p2)
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
                        scores[0]?.p1 !== null && scores[0]?.p1 !== undefined && scores[0]?.p2 !== null && scores[0]?.p2 !== undefined && Number(scores[0].p2) > Number(scores[0].p1)
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
                  <p className="text-sm font-black text-slate-800 leading-tight">
                    {team1Name}
                  </p>
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
                  <p className="text-sm font-black text-slate-800 leading-tight">
                    {team2Name}
                  </p>
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
          <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-black text-slate-800">
                Partidas ({selectedCategory.name})
              </h3>
              <p className="text-xs text-slate-400 font-bold mt-0.5">
                {categoryMatches.length} {categoryMatches.length === 1 ? 'partida configurada' : 'partidas configuradas'} nesta categoria.
              </p>
            </div>
            {isSystemDraw && (
              <button
                type="button"
                onClick={handleGenerateSystemMatches}
                className="flex items-center justify-center gap-2 border-2 border-red-500 text-red-600 bg-white hover:bg-red-50 px-5 py-2.5 rounded-2xl text-xs font-black shadow-xs transition-all active:scale-95 shrink-0"
              >
                <Sparkles size={16} className="text-red-500" />
                <span>{categoryMatches.length > 0 ? 'Regerar partidas' : 'Gerar partidas'}</span>
              </button>
            )}
          </div>

          {categoryMatches.length === 0 ? (
            <div className="p-10 text-center space-y-3">
              <p className="text-sm font-bold text-slate-400">Nenhuma partida gerada para esta categoria.</p>
              {isSystemDraw && (
                <button
                  type="button"
                  onClick={handleGenerateSystemMatches}
                  className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2.5 rounded-xl text-xs font-black shadow-md active:scale-95 transition-all"
                >
                  <Sparkles size={16} />
                  <span>Gerar partidas por sistema</span>
                </button>
              )}
            </div>
          ) : (
            <div className="p-4 space-y-6">
              {b1Matches.length > 0 && (
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black text-slate-800">Primeira Fase — Chave 1</h4>
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
                    <h4 className="text-xs font-black text-slate-800">Primeira Fase — Chave 2</h4>
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
                    <h4 className="text-xs font-black text-emerald-900">Finais & 3º Lugar</h4>
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
            <p className="text-xs text-slate-400 font-bold mt-0.5">Selecione jogadores para formar ou desfazer time.</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-3 bg-slate-50 border-b border-slate-100">
          <span className="text-[10px] font-black text-slate-400">Classificar por</span>
          <button type="button" onClick={() => setSortBy(sortBy === 'team' ? 'name' : 'team')} className="flex items-center gap-1.5 text-[10px] font-black text-blue-600 bg-white border border-slate-200 px-2.5 py-1.5 rounded-lg">
            {sortBy === 'team' ? 'Time' : 'Participante'} <ArrowUpDown size={12} />
          </button>
        </div>
        {sortedCategoryEntries.length === 0 ? <div className="p-10 text-center text-sm font-bold text-slate-400">Nenhum inscrito nesta categoria.</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead><tr className="bg-slate-50 border-b border-slate-100 text-[10px] uppercase tracking-wider font-black text-slate-400"><th className="py-3 px-4">Participante</th><th className="py-3 px-4">Gênero</th><th className="py-3 px-4">Time</th><th className="py-3 px-4 text-right">Selecionar</th></tr></thead>
              <tbody className="divide-y divide-slate-100 text-xs font-bold">
                {sortedCategoryEntries.map((entry) => {
                  const pair = pairForEntry(entry);
                  const isSelected = selectedEntries.has(entry.email);
                  return <tr key={entry.email} onClick={() => toggleEntrySelection(entry)} className={`transition-colors ${isSelected ? 'bg-cyan-50 ring-2 ring-inset ring-cyan-300' : pair ? 'bg-slate-50 text-slate-400' : 'hover:bg-slate-50 cursor-pointer'}`}>
                    <td className="py-4 px-4"><p className="font-black text-slate-800">{entry.name}</p><p className="text-[10px] text-amber-500 font-black">PIN: {entry.pin}</p></td>
                    <td className={`py-4 px-4 ${entry.gender === 'F' ? 'text-pink-600' : 'text-sky-600'}`}>{entry.gender === 'F' ? <VenusIcon size={18} /> : <MarsIcon size={18} />}</td>
                    <td className="py-4 px-4">{pair ? <span className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 px-2 py-1 rounded-lg text-[10px] font-black"><Trophy size={11} /> {pair.teamCode || `Time ${pair.teamNumber || ''}`}</span> : <span className="text-slate-300 text-[10px]">A formar</span>}</td>
                    <td className="py-4 px-4 text-right">{pair ? <UserCheck size={18} className="ml-auto text-emerald-500" /> : <span className={`inline-flex w-5 h-5 rounded-full border-2 ${isSelected ? 'bg-cyan-500 border-cyan-500' : 'border-slate-300'}`}>{isSelected && <Check size={14} className="text-white m-auto" />}</span>}</td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Selection Action Bar (Item a / Image 1 style) */}
      {selectedEntries.size > 0 && (
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
                  <button
                    type="button"
                    onClick={(event) => { event.stopPropagation(); openCategoryPanel(cat.id, 'teams'); }}
                    className={`flex items-center gap-1 rounded-lg px-1.5 py-1 text-[10px] font-black transition-colors ${isSelectedCategory && categoryPanelView === 'teams' ? 'bg-blue-50 text-blue-600' : 'text-slate-500 hover:bg-slate-50'}`}
                  >
                    <Trophy size={11} className="text-blue-500" />
                    <span>{timesCount} times</span>
                  </button>
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
