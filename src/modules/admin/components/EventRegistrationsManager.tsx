import React, { useState } from 'react';
import { Plus, Edit2, Trash2, Users, Check, X, CreditCard, DollarSign } from 'lucide-react';
import type { TournamentEvent, TournamentEntry, EventCategory } from '@modules/events/types';
import { getDb } from '@infra/firebase';
import { updateUserProfileFields } from '@infra/firebase/users';
import { MarsIcon, VenusIcon } from '@shared/components/GenderIcons';

interface Props {
  event: TournamentEvent;
  onUpdateEntries: (entries: TournamentEntry[]) => void;
}

export const EventRegistrationsManager: React.FC<Props> = ({
  event,
  onUpdateEntries,
}) => {
  const entries = event.entries || [];
  const categories = event.categories || [];

  const [isAdding, setIsAdding] = useState(false);
  const [editingPin, setEditingPin] = useState<string | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [email, setEmail] = useState('');
  const [nickname, setNickname] = useState('');
  const [gender, setGender] = useState<'M' | 'F'>('M');
  const [dueAmount, setDueAmount] = useState<number>(event.registrationFee || 0);
  const [paymentStatus, setPaymentStatus] = useState<'Pendente' | 'Pago' | 'Isento'>('Pendente');
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);

  const resetForm = () => {
    setName('');
    setPin('');
    setEmail('');
    setNickname('');
    setGender('M');
    setDueAmount(event.registrationFee || 0);
    setPaymentStatus('Pendente');
    setPaidAmount(0);
    setSelectedCategoryIds([]);
    setIsAdding(false);
    setEditingPin(null);
  };

  const handleStartAdd = () => {
    resetForm();
    setIsAdding(true);
  };

  const handleStartEdit = (entry: TournamentEntry) => {
    setEditingPin(entry.pin);
    setName(entry.name);
    setPin(entry.pin);
    setEmail(entry.email || '');
    setNickname(entry.nickname || '');
    setGender(entry.gender || 'M');
    setDueAmount(entry.dueAmount ?? (event.registrationFee || 0));
    setPaymentStatus(entry.paymentStatus || 'Pendente');
    setPaidAmount(entry.paidAmount ?? 0);
    setSelectedCategoryIds(entry.categoryIds || []);
    setIsAdding(true);
  };

  const toggleCategory = (catId: string) => {
    setSelectedCategoryIds((prev) =>
      prev.includes(catId) ? prev.filter((id) => id !== catId) : [...prev, catId]
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !pin.trim()) return;

    const cleanPin = pin.trim().toUpperCase();
    const cleanEmail = email.trim() || `${cleanPin.toLowerCase()}@myplacar.app`;

    // Also update user profile in Firestore if database is available
    const db = getDb();
    if (db && cleanPin) {
      try {
        await updateUserProfileFields(db, cleanPin, { gender });
      } catch (err) {
        console.warn("Could not update user profile gender directly:", err);
      }
    }

    let updatedList: TournamentEntry[];
    if (editingPin) {
      updatedList = entries.map((entry) =>
        entry.pin === editingPin
          ? {
              ...entry,
              name: name.trim(),
              pin: cleanPin,
              email: cleanEmail,
              nickname: nickname.trim() || name.trim(),
              gender,
              dueAmount,
              paymentStatus,
              paidAmount,
              categoryIds: selectedCategoryIds,
            }
          : entry
      );
    } else {
      const newEntry: TournamentEntry = {
        name: name.trim(),
        pin: cleanPin,
        email: cleanEmail,
        nickname: nickname.trim() || name.trim(),
        joinedAt: Date.now(),
        gender,
        dueAmount,
        paymentStatus,
        paidAmount,
        categoryIds: selectedCategoryIds,
      };
      updatedList = [...entries, newEntry];
    }

    onUpdateEntries(updatedList);
    resetForm();
  };

  const handleDelete = (targetPin: string) => {
    const updatedList = entries.filter((entry) => entry.pin !== targetPin);
    onUpdateEntries(updatedList);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
        <div>
          <h2 className="text-xl font-black text-slate-800 tracking-tight">Inscrições (Participantes Oficiais)</h2>
          <p className="text-xs text-slate-400 font-bold mt-0.5">
            Gerencie participantes inscritos, dados financeiros e vínculo de categorias.
          </p>
        </div>
        {!isAdding && (
          <button
            onClick={handleStartAdd}
            className="flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-black text-xs px-5 py-3 rounded-2xl shadow-sm transition-all self-start sm:self-auto"
          >
            <Plus size={18} /> + Nova Inscrição
          </button>
        )}
      </div>

      {/* Registration Form */}
      {isAdding && (
        <form onSubmit={handleSave} className="bg-white p-6 rounded-3xl border-2 border-emerald-500 shadow-md space-y-4 animate-in slide-in-from-top-4">
          <div className="flex items-center justify-between border-b pb-3">
            <h3 className="font-black text-slate-700 text-sm flex items-center gap-2">
              <Users size={18} className="text-emerald-500" />
              {editingPin ? 'Editar Inscrição' : 'Cadastrar Participante'}
            </h3>
            <button type="button" onClick={resetForm} className="p-1 text-slate-400 hover:text-slate-600">
              <X size={20} />
            </button>
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 ml-1">Nome do Usuário</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: João da Silva"
                className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 font-bold text-xs outline-none focus:border-emerald-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 ml-1">PIN do Usuário</label>
              <input
                type="text"
                required
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="Ex: JOAO123"
                className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 font-bold text-xs outline-none focus:border-emerald-500 uppercase"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 ml-1">Apelido / Alcunha</label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Ex: Jão"
                className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 font-bold text-xs outline-none focus:border-emerald-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 ml-1">Gênero (atualiza perfil)</label>
              <div className="flex gap-2 h-11">
                <button
                  type="button"
                  onClick={() => setGender('M')}
                  className={`flex-1 rounded-xl flex items-center justify-center gap-2 border text-xs font-black transition-all ${
                    gender === 'M'
                      ? 'bg-blue-500 text-white border-blue-500 shadow-xs'
                      : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <MarsIcon size={18} /> Masculino (M)
                </button>
                <button
                  type="button"
                  onClick={() => setGender('F')}
                  className={`flex-1 rounded-xl flex items-center justify-center gap-2 border text-xs font-black transition-all ${
                    gender === 'F'
                      ? 'bg-pink-500 text-white border-pink-500 shadow-xs'
                      : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <VenusIcon size={18} /> Feminino (F)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 ml-1">Valor Devido (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={dueAmount}
                  onChange={(e) => setDueAmount(Number(e.target.value))}
                  placeholder="0,00"
                  className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 font-bold text-xs outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 ml-1">Status Pagamento</label>
                <select
                  value={paymentStatus}
                  onChange={(e) => setPaymentStatus(e.target.value as 'Pendente' | 'Pago' | 'Isento')}
                  className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 font-bold text-xs outline-none focus:border-emerald-500 cursor-pointer"
                >
                  <option value="Pendente">Pendente</option>
                  <option value="Pago">Pago</option>
                  <option value="Isento">Isento</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 ml-1">Total Pago (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(Number(e.target.value))}
                  placeholder="0,00"
                  className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 font-bold text-xs outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Categories Multi-Select */}
          <div className="space-y-2 pt-2">
            <label className="text-[10px] font-black text-slate-400 ml-1">Categorias Vinculadas</label>
            {categories.length === 0 ? (
              <p className="text-xs text-amber-600 bg-amber-50 p-3 rounded-xl font-bold">
                Nenhuma categoria cadastrada no evento ainda.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {categories.map((cat) => {
                  const isSelected = selectedCategoryIds.includes(cat.id);
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => toggleCategory(cat.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all border ${
                        isSelected
                          ? 'bg-emerald-500 text-white border-emerald-500 shadow-xs'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {cat.name} ({cat.abbreviation})
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              className="bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs px-6 py-3 rounded-xl transition-all shadow-sm flex items-center gap-2"
            >
              <Check size={16} /> Salvar inscrição
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs px-5 py-3 rounded-xl transition-all"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* Participants Table */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        {entries.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <Users className="mx-auto text-slate-300" size={32} />
            <p className="text-sm font-bold text-slate-400">Nenhum participante inscrito ainda.</p>
            <p className="text-xs text-slate-300">Clique em "+ Nova Inscrição" para inscrever um jogador.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-[10px] uppercase tracking-wider font-black text-slate-400">
                  <th className="py-3 px-4">Participante</th>
                  <th className="py-3 px-4">Gênero</th>
                  <th className="py-3 px-4">Categorias</th>
                  <th className="py-3 px-4">Financeiro</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-bold">
                {entries.map((entry) => {
                  const entryCategories = categories.filter((c) =>
                    entry.categoryIds?.includes(c.id)
                  );

                  return (
                    <tr key={entry.pin} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-4 px-4 space-y-0.5">
                        <p className="font-black text-slate-800">{entry.name}</p>
                        <p className="text-[10px] text-amber-500 font-black">
                          PIN: {entry.pin}
                        </p>
                      </td>
                      <td className="py-4 px-4">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-black inline-flex items-center gap-1 ${
                            entry.gender === 'F'
                              ? 'bg-pink-50 text-pink-600'
                              : 'bg-blue-50 text-blue-600'
                          }`}
                        >
                          {entry.gender === 'F' ? <VenusIcon size={12} /> : <MarsIcon size={12} />}
                          {entry.gender === 'F' ? 'Feminino (F)' : 'Masculino (M)'}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        {entryCategories.length === 0 ? (
                          <span className="text-slate-300 text-[10px]">Nenhuma</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {entryCategories.map((c) => (
                              <span
                                key={c.id}
                                className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md text-[10px] font-bold"
                              >
                                {c.abbreviation || c.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-4 space-y-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase ${
                              entry.paymentStatus === 'Pago'
                                ? 'bg-emerald-100 text-emerald-700'
                                : entry.paymentStatus === 'Isento'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            {entry.paymentStatus || 'Pendente'}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            R$ {(entry.paidAmount ?? 0).toFixed(2)} / R${' '}
                            {(entry.dueAmount ?? 0).toFixed(2)}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-4 text-right space-x-1">
                        <button
                          onClick={() => handleStartEdit(entry)}
                          className="p-2 text-slate-400 hover:text-amber-500 transition-colors"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(entry.pin)}
                          className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
