import React, { useState } from 'react';
import { Plus, Layers, Check, X, Trash2, Tag, Users, Trophy, ChevronDown, ArrowUpDown, UserCheck, UserPlus } from 'lucide-react';
import type { EventCategory, TournamentEntry, TournamentEvent, TournamentPair } from '@modules/events/types';
import type { FirebaseAdminSportIcon } from '@infra/firebase/adminIcons';
import { MarsIcon, VenusIcon } from '@shared/components/GenderIcons';

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
  const categories = event.categories || [];
  const entries = event.entries || [];
  const pairs = event.pairs || [];

  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set());
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
    setEditingId(cat.id);
    setName(cat.name);
    setDescription(cat.description || '');
    setFormat(cat.format);
    setPriority(cat.priority);
    setSportId(cat.sportId);
    setAbbreviation(cat.abbreviation);
    setGender1(cat.gender1 || 'M');
    setGender2(cat.gender2 || 'M');
    setIsAdding(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const selectedSport = activeSports.find((s) => s.id === sportId);
    const sportName = selectedSport ? selectedSport.name : sportId;

    let updatedList: EventCategory[];
    if (editingId) {
      updatedList = categories.map((cat) =>
        cat.id === editingId
          ? {
              ...cat,
              name: name.trim(),
              description: description.trim(),
              format,
              priority,
              sportId,
              sportName,
              abbreviation: abbreviation.trim() || name.substring(0, 5).toUpperCase(),
              gender1,
              gender2: format === 'Duplas' ? gender2 : undefined,
            }
          : cat
      );
    } else {
      const newCat: EventCategory = {
        id: `cat_${Date.now()}`,
        name: name.trim(),
        description: description.trim(),
        format,
        priority: priority || categories.length + 1,
        sportId,
        sportName,
        abbreviation: abbreviation.trim() || name.substring(0, 5).toUpperCase(),
        gender1,
        gender2: format === 'Duplas' ? gender2 : undefined,
      };
      updatedList = [...categories, newCat];
    }

    updatedList.sort((a, b) => a.priority - b.priority);
    onUpdateCategories(updatedList);
    resetForm();
  };

  const handleDelete = (id: string) => {
    const updatedList = categories.filter((cat) => cat.id !== id);
    onUpdateCategories(updatedList);
    resetForm();
  };

  const selectedCategory = categories.find((cat) => cat.id === selectedCategoryId) || null;
  const categoryEntries = selectedCategory
    ? entries.filter((entry) => entry.categoryIds?.includes(selectedCategory.id))
    : [];
  const categoryPairs = selectedCategory
    ? pairs.filter((pair) => pair.categoryId === selectedCategory.id || (!pair.categoryId && (pair.p1.categoryIds?.includes(selectedCategory.id) || pair.p2.categoryIds?.includes(selectedCategory.id))))
    : [];
  const pairForEntry = (entry: TournamentEntry) => categoryPairs.find((pair) => pair.p1.email === entry.email || pair.p2.email === entry.email);
  const sortedCategoryEntries = [...categoryEntries].sort((a, b) => {
    if (sortBy === 'team') return (pairForEntry(a)?.teamNumber ?? 999999) - (pairForEntry(b)?.teamNumber ?? 999999) || a.name.localeCompare(b.name);
    return a.name.localeCompare(b.name);
  });

  const toggleEntrySelection = (entry: TournamentEntry) => {
    if (pairForEntry(entry)) return;
    const next = new Set(selectedEntries);
    if (next.has(entry.email)) next.delete(entry.email);
    else if (next.size < 2) next.add(entry.email);
    setSelectedEntries(next);
  };

  const handleFormTeam = () => {
    if (!selectedCategory || selectedEntries.size !== 2) return;
    const selected = Array.from(selectedEntries).map((email) => categoryEntries.find((entry) => entry.email === email)).filter(Boolean) as TournamentEntry[];
    if (selected.length !== 2) return;
    const teamNumber = Math.max(
      0,
      ...pairs.map((pair, index) => pair.teamNumber || Number(pair.teamCode?.match(/^\d{3}/)?.[0]) || index + 1)
    ) + 1;
    const teamCode = `${String(teamNumber).padStart(3, '0')} - ${selectedCategory.abbreviation}`;
    const newPair: TournamentPair = {
      id: `pair_${Date.now()}`,
      p1: selected[0],
      p2: selected[1],
      categoryId: selectedCategory.id,
      teamNumber,
      teamCode,
    };
    onUpdateEvent({ ...event, pairs: [...pairs, newPair] });
    setSelectedEntries(new Set());
  };

  const renderCategoryRoster = () => {
    if (!selectedCategory) return null;
    return (
      <section className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-black text-slate-800">Inscritos ({selectedCategory.name})</h3>
            <p className="text-xs text-slate-400 font-bold mt-0.5">Selecione dois jogadores e clique no botão Formar time.</p>
          </div>
          <button type="button" onClick={handleFormTeam} disabled={selectedEntries.size !== 2} className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-black transition-all disabled:bg-slate-100 disabled:text-slate-300 bg-emerald-500 text-white hover:bg-emerald-600 active:scale-95">
            <UserPlus size={16} /> Formar time
          </button>
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
                  return <tr key={entry.email} onClick={() => toggleEntrySelection(entry)} className={`transition-colors ${pair ? 'bg-slate-50 text-slate-400' : isSelected ? 'bg-cyan-50' : 'hover:bg-slate-50 cursor-pointer'}`}>
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
                <X size={20} />
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
              p.p1.categoryIds?.includes(cat.id) || p.p2.categoryIds?.includes(cat.id)
            ).length;
            const isEditing = editingId === cat.id && isAdding;

            return (
              <React.Fragment key={cat.id}>
              <div
                onClick={() => { setSelectedCategoryId(cat.id); setSelectedEntries(new Set()); }}
                className={`p-4 rounded-2xl border text-left transition-all space-y-3 w-full cursor-pointer ${
                  isEditing
                    ? 'border-emerald-500 bg-emerald-50 shadow-md scale-[1.01]'
                    : selectedCategoryId === cat.id
                    ? 'border-blue-400 bg-blue-50/30 shadow-sm'
                    : 'bg-white border-slate-100 hover:border-emerald-300 hover:shadow-sm shadow-sm'
                }`}
              >
                {/* Header: priority badge + format badge + Chevron edit button */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 inline-flex items-center justify-center bg-slate-100 rounded-lg text-slate-600 font-black text-[10px]">
                      {cat.priority}
                    </span>
                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                      cat.format === 'Duplas'
                        ? 'bg-emerald-100 text-emerald-600'
                        : 'bg-blue-100 text-blue-600'
                    }`}>
                      {cat.format}
                    </span>
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

                {/* Category name */}
                <div>
                  <p className="font-black text-slate-800 text-sm leading-tight">{cat.name}</p>
                  <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                    {cat.sportName || cat.sportId}
                    {cat.abbreviation && ` · ${cat.abbreviation}`}
                  </p>
                </div>

                {/* Gender badges */}
                <div className="flex items-center gap-1.5">
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
                <div className="flex items-center gap-3 pt-1 border-t border-slate-100">
                  <div className="flex items-center gap-1 text-[10px] font-black text-slate-500">
                    <Users size={11} className="text-emerald-500" />
                    <span>{inscritosCount} inscritos</span>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] font-black text-slate-500">
                    <Trophy size={11} className="text-blue-500" />
                    <span>{timesCount} times</span>
                  </div>
                </div>
              </div>
              {selectedCategoryId === cat.id && renderCategoryRoster()}
              </React.Fragment>
            );
          })}
        </div>
      )}

      {false && selectedCategory && (
        <section className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-black text-slate-800">Inscritos ({selectedCategory?.name})</h3>
              <p className="text-xs text-slate-400 font-bold mt-0.5">Selecione dois jogadores e clique no botão Formar time.</p>
            </div>
            <button
              type="button"
              onClick={handleFormTeam}
              disabled={selectedEntries.size !== 2}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-black transition-all disabled:bg-slate-100 disabled:text-slate-300 bg-emerald-500 text-white hover:bg-emerald-600 active:scale-95"
            >
              <UserPlus size={16} /> Formar time
            </button>
          </div>

          <div className="flex items-center justify-end gap-2 px-4 py-3 bg-slate-50 border-b border-slate-100">
            <span className="text-[10px] font-black text-slate-400">Classificar por</span>
            <button type="button" onClick={() => setSortBy(sortBy === 'team' ? 'name' : 'team')} className="flex items-center gap-1.5 text-[10px] font-black text-blue-600 bg-white border border-slate-200 px-2.5 py-1.5 rounded-lg">
              {sortBy === 'team' ? 'Time' : 'Participante'} <ArrowUpDown size={12} />
            </button>
          </div>

          {sortedCategoryEntries.length === 0 ? (
            <div className="p-10 text-center text-sm font-bold text-slate-400">Nenhum inscrito nesta categoria.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead><tr className="bg-slate-50 border-b border-slate-100 text-[10px] uppercase tracking-wider font-black text-slate-400"><th className="py-3 px-4">Participante</th><th className="py-3 px-4">Gênero</th><th className="py-3 px-4">Time</th><th className="py-3 px-4 text-right">Selecionar</th></tr></thead>
                <tbody className="divide-y divide-slate-100 text-xs font-bold">
                  {sortedCategoryEntries.map((entry) => {
                    const pair = pairForEntry(entry);
                    const isSelected = selectedEntries.has(entry.email);
                    return <tr key={entry.email} onClick={() => toggleEntrySelection(entry)} className={`transition-colors ${pair ? 'bg-slate-50 text-slate-400' : isSelected ? 'bg-cyan-50' : 'hover:bg-slate-50 cursor-pointer'}`}>
                      <td className="py-4 px-4"><p className="font-black text-slate-800">{entry.name}</p><p className="text-[10px] text-amber-500 font-black">PIN: {entry.pin}</p></td>
                      <td className="py-4 px-4">{entry.gender === 'F' ? <VenusIcon size={18} /> : <MarsIcon size={18} />}</td>
                      <td className="py-4 px-4">{pair ? <span className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 px-2 py-1 rounded-lg text-[10px] font-black"><Trophy size={11} /> {pair.teamCode || `Time ${pair.teamNumber || ''}`}</span> : <span className="text-slate-300 text-[10px]">A formar</span>}</td>
                      <td className="py-4 px-4 text-right">{pair ? <UserCheck size={18} className="ml-auto text-emerald-500" /> : <span className={`inline-flex w-5 h-5 rounded-full border-2 ${isSelected ? 'bg-cyan-500 border-cyan-500' : 'border-slate-300'}`}>{isSelected && <Check size={14} className="text-white m-auto" />}</span>}</td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
};
