import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { Partner } from '@modules/partners/types';
import { MarsIcon, VenusIcon } from '@shared/components/GenderIcons';
import { ArrowLeft, Trophy, Users, Share2, Copy, QrCode, X, User, UserRound, Loader2, RotateCw, Settings, Save, Play, Clock, Target, CheckCircle2, Wifi, Zap, UserPlus, Mail, ChevronUp, ChevronDown, Check, Trash2, Link2, Unlink, ShieldCheck, UserCheck, Edit3, Search, AlertCircle, DollarSign, Eye, Bell } from 'lucide-react';
import type { TournamentEvent, TournamentEntry, TournamentPair, TournamentMatch, TournamentConfig, PaymentItem, EventCategory } from '../types';
import type { UserProfile } from '@modules/auth/types';
import { deleteEventEntry, deleteUserEventRegistration, fetchEventEntries, getDb, saveEventEntry, saveUserEventRegistration, subscribeEventByPin, subscribeEventEntries, subscribeTournamentLiveScores, updateEvent, updateEventEntry, updateEventMatches, updateUserProfileFields } from '@infra/firebase';
import type { FirebaseTournamentLiveScore } from '@infra/firebase';
import { Firestore } from 'firebase/firestore';
import { SPORT_LIST } from '../../../constants.ts';
import { formatPortugueseName, maskPin } from '@shared/utils/formatters';
import { copyToClipboard } from '@shared/utils/clipboard';
import { Toggle } from '@shared/components/Toggle';
import { Input } from '@shared/components/Input';
import type { ModalConfig } from '@modules/ui/types';
import { EventRegistrationForm } from '../components/EventRegistrationForm';
import { canUseEventAdminAccess, isPrimaryAdminEmail } from '../services/eventAdminAccess';

interface Props {
  event: TournamentEvent;
  onBack: () => void;
  userProfile: UserProfile;
  onExitTournament: () => void;
  onAddPartner: (pin: string, nickname: string, gender: 'M' | 'F', name?: string) => void;
  partners: Partner[];
  onStartTournamentMatch: (match: TournamentMatch, pair1: TournamentPair, pair2: TournamentPair, event: TournamentEvent) => void;
  setModalConfig: React.Dispatch<React.SetStateAction<ModalConfig | null>>;
  appUrl: string;
  onOpenCommunications?: () => void;
  unreadCount?: number;
}

interface DesfazerTimeIconProps {
  size?: number;
}

const DesfazerTimeIcon: React.FC<DesfazerTimeIconProps> = ({ size = 16 }) => (
  <UserRound size={size} className="text-emerald-500" />
);

const idxToLetter = (idx: number) => String.fromCharCode(65 + idx);

const formatPhone = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (!digits) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

/* ─── Sub-componente: formulário editável completo de inscrição ─── */
interface EntryExpandedFormProps {
  entry: TournamentEntry;
  event: TournamentEvent;
  canEdit: boolean;
  onSave: (updated: TournamentEntry) => Promise<void>;
}

const EntryExpandedForm: React.FC<EntryExpandedFormProps> = ({ entry, event, canEdit, onSave }) => {
  const isManual = entry.pin?.startsWith('TEMP') || !entry.email || entry.email.endsWith('@myplacar.app');
  const [email, setEmail] = useState(entry.email || '');
  const [phone, setPhone] = useState(entry.phone || '');
  const [shirtSize, setShirtSize] = useState<'P' | 'M' | 'G'>(entry.shirtSize || 'M');
  const [partnerName, setPartnerName] = useState(entry.partnerName || '');
  const [partnerEmail, setPartnerEmail] = useState(entry.partnerEmail || '');
  const [nickname, setNickname] = useState(entry.nickname);
  const [gender, setGender] = useState<'M' | 'F'>(entry.gender || 'M');
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>(entry.categoryIds || []);
  const [payments, setPayments] = useState<PaymentItem[]>(entry.payments || []);
  const [newAmount, setNewAmount] = useState('');
  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0]);
  const [newReceipt, setNewReceipt] = useState<{ url?: string; name: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const baseFee = event.registrationFee ?? 0;
  const extraFee = event.extraCategoryFee ?? 0;
  const computedDue = selectedCategoryIds.length === 0 ? baseFee : baseFee + (selectedCategoryIds.length - 1) * extraFee;
  const dueAmount = entry.dueAmount ?? computedDue;
  const totalPaid = payments.reduce((acc, p) => acc + p.amount, 0);
  const pendingAmount = Math.max(0, dueAmount - totalPaid);
  const paymentStatus = entry.paymentStatus || 'Pendente';

  const availableCategories: EventCategory[] = (event.categories || []).filter((cat) => {
    if (cat.gender1 && cat.gender1 !== gender) {
      if (!cat.gender2 || cat.gender2 !== gender) return false;
    }
    return true;
  });

  const toggleCategory = (id: string) => {
    if (!canEdit) return;
    setSelectedCategoryIds(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  };

  const buildUpdatedEntry = (nextPayments: PaymentItem[] = payments): TournamentEntry => {
    const newPaid = nextPayments.reduce((acc, p) => acc + p.amount, 0);
    const newStatus: 'Pendente' | 'Pago' | 'Isento' = paymentStatus === 'Isento' ? 'Isento' : 'Pendente';

    return {
      ...entry,
      email: email.trim().toLowerCase() || entry.email,
      nickname: nickname.trim() || entry.nickname,
      gender,
      phone: phone.replace(/\D/g, ''),
      shirtSize,
      partnerName: partnerName.trim() || undefined,
      partnerEmail: partnerEmail.trim() || undefined,
      categoryIds: selectedCategoryIds,
      payments: nextPayments,
      paidAmount: newPaid,
      paymentStatus: newStatus,
      dueAmount,
    };
  };

  const persistEntry = async (nextPayments: PaymentItem[] = payments) => {
    await onSave(buildUpdatedEntry(nextPayments));
  };

  const handleAddPayment = async () => {
    const val = parseFloat(newAmount.replace(',', '.'));
    if (isNaN(val) || val <= 0) return;
    let dateTs = Date.now();
    if (newDate) { const d = new Date(newDate + 'T12:00:00'); if (!isNaN(d.getTime())) dateTs = d.getTime(); }

    const receiptName = newReceipt ? newReceipt.name : undefined;
    const receiptUrl = newReceipt?.url;
    const paymentData: PaymentItem = { id: editingId || `pay_${Date.now()}`, amount: val, date: dateTs };
    if (receiptName) paymentData.receiptFileName = receiptName;
    if (receiptUrl) paymentData.receiptUrl = receiptUrl;

    const nextPayments = editingId
      ? payments.map(p => p.id === editingId ? { ...p, ...paymentData, receiptFileName: receiptName || p.receiptFileName, receiptUrl: receiptUrl || p.receiptUrl } : p)
      : [...payments, paymentData];

    setIsSaving(true);
    if (editingId) {
      setEditingId(null);
    }
    try {
      setPayments(nextPayments);
      await persistEntry(nextPayments);
      setNewAmount('');
      setNewDate(new Date().toISOString().split('T')[0]);
      setNewReceipt(null);
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditPayment = (p: PaymentItem) => {
    setEditingId(p.id);
    setNewAmount(p.amount.toFixed(2));
    const d = new Date(p.date);
    setNewDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    if (p.receiptFileName || p.receiptUrl) {
      setNewReceipt({ name: p.receiptFileName || 'Comprovante' } as any);
    } else {
      setNewReceipt(null);
    }
  };

  const handleRemovePayment = async (id: string) => {
    const nextPayments = payments.filter(p => p.id !== id);
    setIsSaving(true);
    try {
      setPayments(nextPayments);
      await persistEntry(nextPayments);
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setNewReceipt({
          url: event.target.result as string,
          name: file.name,
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (isManual && !email.trim()) {
      alert('E-mail é obrigatório para inscrições manuais.');
      return;
    }
    setIsSaving(true);
    try {
      await persistEntry();
    } finally {
      setIsSaving(false);
    }
  };

  return (
      <div className="mt-4 pt-4 border-t border-slate-100 space-y-4 animate-in slide-in-from-top-2 text-left" onClick={(e) => e.stopPropagation()}>
      {(event.information || event.regulationUrl) && <div className="space-y-2">
        {event.information && <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4 space-y-1"><p className="text-[10px] font-black tracking-wider text-sky-600">Informações do evento</p><p className="text-xs font-bold leading-relaxed whitespace-pre-wrap text-slate-700">{event.information}</p></div>}
        {event.regulationUrl && <a href={event.regulationUrl} target="_blank" rel="noopener noreferrer" className="w-full h-11 rounded-xl bg-amber-50 border border-amber-100 text-amber-700 font-black text-xs flex items-center justify-center">Regulamento</a>}
      </div>}
      {/* Cabeçalho com título e botão de deletar inscrição (Imagem 3) */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Users className="text-emerald-500" size={18} />
          <h4 className="text-sm font-black text-slate-800 tracking-tight">
            {canEdit ? 'Editar Inscrição' : 'Informações de Inscrição'}
          </h4>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Deseja realmente excluir a inscrição de ${entry.nickname}?`)) {
                // acionar salvamento ou deleção
                onSave({ ...entry, _deleteRequested: true } as any);
              }
            }}
            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
            title="Excluir inscrição"
          >
            <Trash2 size={18} />
          </button>
        )}
      </div>

      {/* Nome, PIN e Email */}
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 ml-1">Nome do usuário</label>
          <div className="h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 flex items-center text-xs font-bold text-slate-700">{entry.name}</div>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 ml-1">Pin do usuário</label>
          <div className="h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 flex items-center text-xs font-bold text-slate-700">{entry.pin}</div>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 ml-1">E-mail {isManual && <span className="text-red-500">*</span>}</label>
          <input
            type="email"
            value={email}
            onChange={(e) => canEdit && isManual && setEmail(e.target.value)}
            readOnly={!canEdit || !isManual}
            placeholder="usuario@email.com"
            className={`w-full h-11 border rounded-xl px-3 text-xs font-bold outline-none transition-colors ${
              canEdit && isManual ? 'bg-white border-slate-200 focus:border-emerald-500' : 'bg-slate-50 border-slate-200 text-slate-500'
            }`}
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-[10px] font-black text-slate-400 ml-1">Telefone <span className="text-red-500">*</span></label>
        <input type="tel" required inputMode="numeric" value={formatPhone(phone)} onChange={(e) => canEdit && setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))} readOnly={!canEdit} placeholder="(11) 91234-9988" className={`w-full h-11 border rounded-xl px-3 text-xs font-bold outline-none ${canEdit ? 'bg-white border-slate-200 focus:border-emerald-500' : 'bg-slate-50 border-slate-200 text-slate-500'}`} />
      </div>
      <div className="space-y-1">
        <label className="text-[10px] font-black text-slate-400 ml-1">Tamanho camiseta <span className="text-red-500">*</span></label>
        <select required disabled={!canEdit} value={shirtSize} onChange={(e) => setShirtSize(e.target.value as 'P' | 'M' | 'G')} className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 text-xs font-bold outline-none"><option value="P">P</option><option value="M">M</option><option value="G">G</option></select>
      </div>

      {/* Apelido + gênero */}
      <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 ml-1">Como quer ser chamado</label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={nickname}
            onChange={(e) => canEdit && setNickname(formatPortugueseName(e.target.value))}
            readOnly={!canEdit}
            className={`flex-1 h-11 border rounded-xl px-3 text-xs font-bold outline-none transition-colors ${
              canEdit ? 'bg-white border-slate-200 focus:border-emerald-500' : 'bg-slate-50 border-slate-200 text-slate-500'
            }`}
          />
          <button
            type="button"
            onClick={() => canEdit && setGender(g => g === 'M' ? 'F' : 'M')}
            disabled={!canEdit}
            className={`p-2.5 rounded-xl border transition-all ${
              gender === 'F' ? 'bg-pink-50 text-pink-500 border-pink-200' : 'bg-sky-50 text-sky-500 border-sky-200'
            } ${!canEdit ? 'opacity-60 cursor-default' : 'hover:brightness-95 active:scale-90'}`}
          >
            {gender === 'F' ? <VenusIcon /> : <MarsIcon />}
          </button>
        </div>
        <p className="text-[10px] font-black ml-1" style={{ color: gender === 'F' ? '#ec4899' : '#0ea5e9' }}>
          Gênero: {gender === 'F' ? 'Feminino (F)' : 'Masculino (M)'}
        </p>
      </div>

      {/* Financeiro */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 ml-1">Valor devido</label>
          <div className="h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 flex items-center text-xs font-bold text-slate-700">R$ {dueAmount.toFixed(2)}</div>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 ml-1">Valor pendente</label>
          <div className="h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 flex items-center">
            <span className="text-xs font-black text-amber-600">R$ {pendingAmount.toFixed(2)}</span>
          </div>
        </div>
        <div className="space-y-1 col-span-2">
          <label className="text-[10px] font-black text-slate-400 ml-1">Status do pagamento</label>
          <div className="h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 flex items-center">
            <span className={`text-xs font-black ${
              paymentStatus === 'Pago' ? 'text-emerald-600' : paymentStatus === 'Isento' ? 'text-blue-600' : 'text-amber-600'
            }`}>{paymentStatus}</span>
          </div>
        </div>
      </div>

      {/* Categorias */}
      {availableCategories.length > 0 && (
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-400 ml-1 flex items-center gap-1">
            <span>🏷</span> Categorias vinculadas
          </label>
          <div className="flex flex-wrap gap-2">
            {availableCategories.map((cat) => {
              const isSelected = selectedCategoryIds.includes(cat.id);
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => toggleCategory(cat.id)}
                  disabled={!canEdit}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black border transition-all ${
                    isSelected
                      ? 'bg-emerald-500 text-white border-emerald-600 shadow-sm'
                      : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300'
                  } ${!canEdit ? 'opacity-70 cursor-default' : 'active:scale-95'}`}
                >
                  {cat.name} ({cat.abbreviation})
                </button>
              );
            })}
          </div>
        </div>
      )}

      {selectedCategoryIds.some((id) => event.categories?.find((cat) => cat.id === id)?.format === 'Duplas') && <div className="space-y-2">
        <label className="text-[10px] font-black text-slate-400 ml-1">Informe seu parceiro</label>
        <input type="text" value={partnerName} onChange={(e) => canEdit && setPartnerName(e.target.value)} readOnly={!canEdit} placeholder="Nome do parceiro" className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 text-xs font-bold outline-none" />
        <input type="email" value={partnerEmail} onChange={(e) => canEdit && setPartnerEmail(e.target.value)} readOnly={!canEdit} placeholder="E-mail do parceiro (opcional)" className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 text-xs font-bold outline-none" />
      </div>}

      {/* Pagamentos */}
      <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/50 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-black text-slate-700">Pagamentos</span>
          <span className="text-xs font-black text-emerald-600">Total pago: R$ {totalPaid.toFixed(2)}</span>
        </div>

        {canEdit && (
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black text-slate-500 tracking-wider">
                {editingId ? 'Editar pagamento' : 'Novo pagamento'}
              </span>
              <div className="flex items-center gap-2">
                {editingId && (
                  <button
                    type="button"
                    onClick={() => { setEditingId(null); setNewAmount(''); setNewDate(new Date().toISOString().split('T')[0]); setNewReceipt(null); }}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-xl transition-all"
                  >Cancelar edição</button>
                )}
                <button
                  type="button"
                  onClick={handleAddPayment}
                  disabled={isSaving || !newAmount || parseFloat(newAmount.replace(',', '.')) <= 0}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-black text-xs rounded-xl flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-50"
                >
                  {editingId ? <CheckCircle2 size={14} /> : <DollarSign size={14} />}
                  {editingId ? 'Salvar pagamento' : 'Adicionar pagamento'}
                </button>
              </div>
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 ml-1">Valor do pagamento (R$)</label>
                <input
                  type="number" step="0.01" placeholder="0,00"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 font-bold text-xs outline-none focus:border-emerald-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 ml-1">Data do pagamento</label>
                <input
                  type="date" value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 font-bold text-xs outline-none focus:border-emerald-500 cursor-pointer"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 ml-1">Comprovante</label>
                <div className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 flex items-center justify-between text-xs text-slate-600 font-bold">
                  <div className="flex items-center gap-2 truncate">
                    <DollarSign size={16} className="text-slate-400 shrink-0" />
                    <span className="truncate">{newReceipt ? newReceipt.name : 'Anexar comprovante...'}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {newReceipt?.url && (
                      <button
                        type="button"
                        onClick={() => {
                          const w = window.open();
                          if (w) { w.document.write(`<iframe src="${newReceipt.url}" style="width:100%;height:100%;border:none;"></iframe>`); }
                        }}
                        className="p-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition-colors flex items-center gap-1 text-[10px] font-black"
                        title="Ver comprovante"
                      >
                        <Eye size={14} />
                      </button>
                    )}
                    <label className="bg-slate-200 text-slate-600 text-[10px] font-black px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-slate-300 transition-colors">
                      Buscar
                      <input type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFileChange} />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {payments.length > 0 && (
          <div className="space-y-2">
            <span className="text-[10px] font-black text-slate-400 ml-1">Histórico de pagamentos {canEdit && '(clique para editar)'}</span>
            <div className="space-y-2">
              {payments.map((pay) => {
                const fileName = pay.receiptFileName || (pay as any).receiptName || (pay.receiptUrl ? 'Comprovante' : null);
                return (
                  <div
                    key={pay.id}
                    onClick={() => canEdit && handleEditPayment(pay)}
                    className={`bg-white border rounded-xl p-3 flex items-center justify-between text-xs font-bold transition-all ${
                      editingId === pay.id ? 'border-emerald-500 ring-2 ring-emerald-100 bg-emerald-50/30' : 'border-slate-200'
                    } ${canEdit ? 'cursor-pointer hover:border-emerald-400' : ''}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-slate-400 text-[10px]">{new Date(pay.date).toLocaleDateString('pt-BR')}</span>
                      <span className="font-black text-slate-800">R$ {pay.amount.toFixed(2)}</span>
                      {fileName && (
                        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded truncate max-w-[120px]" title={fileName}>
                          {fileName}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {pay.receiptUrl && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const w = window.open();
                            if (w) { w.document.write(`<iframe src="${pay.receiptUrl}" style="width:100%;height:100%;border:none;"></iframe>`); }
                          }}
                          className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors flex items-center gap-1 text-[10px] font-black"
                          title="Ver comprovante anexado"
                        >
                          <Eye size={14} />
                        </button>
                      )}
                      {canEdit && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); if (window.confirm('Deseja realmente excluir este pagamento?')) handleRemovePayment(pay.id); }}
                          className="p-1.5 bg-red-50 hover:bg-red-100 text-red-500 rounded-lg transition-all active:scale-90"
                          title="Excluir pagamento"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Botão Salvar */}
      {canEdit && (
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-black text-sm rounded-2xl flex items-center justify-center gap-2 shadow-md active:scale-95 transition-all disabled:opacity-50"
        >
          {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Salvar alterações
        </button>
      )}
    </div>
  );
};

export const EventDetailScreen: React.FC<Props> = ({ event: initialEvent, onBack, userProfile, onExitTournament, onAddPartner, partners, onStartTournamentMatch, setModalConfig, appUrl, onOpenCommunications, unreadCount = 0 }) => {
  const [event, setEvent] = useState<TournamentEvent>(initialEvent);
  const [entries, setEntries] = useState<TournamentEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [liveScores, setLiveScores] = useState<Record<string, FirebaseTournamentLiveScore>>({});
  
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualEntry, setManualEntry] = useState({ name: '', nickname: '', email: '', gender: 'M' as 'M' | 'F' });
  const [isSavingManual, setIsSavingManual] = useState(false);

  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set());
  const [selectedPairs, setSelectedPairs] = useState<Set<string>>(new Set());

  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [expandedEntryEmail, setExpandedEntryEmail] = useState<string | null>(null);
  const [tempNickname, setTempNickname] = useState('');
  const [isSavingNickname, setIsSavingNickname] = useState(false);

  const isAdmin = useMemo(() => {
    return isPrimaryAdminEmail(userProfile.email) || canUseEventAdminAccess(event, userProfile.pin);
  }, [event, userProfile.email, userProfile.pin]);

  const baseUrl = appUrl.endsWith('/') ? appUrl.slice(0, -1) : appUrl;

  useEffect(() => {
    const db = getDb();
    if (!db) return;
    const unsubscribe = subscribeEventByPin(db as Firestore, initialEvent.pin, (nextEvent) => {
      setEvent(nextEvent as TournamentEvent);
    });
    return () => unsubscribe();
  }, [initialEvent.pin]);

  useEffect(() => {
    const db = getDb();
    if (!db) return;
    const unsubscribe = subscribeTournamentLiveScores(db as Firestore, event.pin, setLiveScores);
    return () => unsubscribe();
  }, [event.pin]);

  const inviteLink = useMemo(() => {
    return `${baseUrl}/?joinEvent=${event.pin}&refPin=${userProfile.pin.toUpperCase()}`;
  }, [event.pin, userProfile.pin]);

  const qrCodeUrl = useMemo(() => {
    return `https://quickchart.io/qr?text=${encodeURIComponent(inviteLink)}&size=400&margin=1&ecLevel=H&dark=0f172a`;
  }, [inviteLink]);

  const fetchEntries = async () => {
    const db = getDb();
    if (!db) return;
    setIsLoading(true);
    try {
      const list = await fetchEventEntries(db as Firestore, event.pin);
      setEntries(list as TournamentEntry[]);
    } catch (e) {
      console.error("Erro ao sincronizar participantes:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const db = getDb();
    if (!db) return;
    const unsubscribe = subscribeEventEntries(db as Firestore, event.pin, (liveEntries) => {
      // O snapshot em tempo real é a fonte de verdade dos participantes.
      // Aplicar também listas vazias evita manter check-ins removidos na tela.
      setEntries(liveEntries as TournamentEntry[]);
    });
    return () => unsubscribe();
  }, [event.pin]);

  const getAthleteStatus = (email: string) => {
    const pair = event.pairs?.find(p => p.p1.email === email || p.p2.email === email);
    if (!pair) return null;
    const pairIdx = event.pairs?.findIndex(p => p.id === pair.id) ?? -1;
    const match = event.matches?.find(m => m.pair1Id === pair.id || m.pair2Id === pair.id);
    const matchIdx = event.matches?.findIndex(m => m.id === match?.id) ?? -1;
    return {
      pair,
      pairLetter: idxToLetter(pairIdx),
      match,
      matchNumber: matchIdx !== -1 ? matchIdx + 1 : null
    };
  };

  const getPairWins = useCallback((pairId: string) => {
    return (event.matches || []).filter(
      (m) => m.status === 'finished' && m.winnerPairId === pairId
    ).length;
  }, [event.matches]);

  const sortedEntries = useMemo(() => {
    const currentUserEmail = userProfile.email.toLowerCase().trim();
    return [...entries].sort((a, b) => {
      const aIsCurrentUser = a.email.toLowerCase().trim() === currentUserEmail;
      const bIsCurrentUser = b.email.toLowerCase().trim() === currentUserEmail;
      if (aIsCurrentUser !== bIsCurrentUser) return aIsCurrentUser ? -1 : 1;

      const stA = getAthleteStatus(a.email);
      const stB = getAthleteStatus(b.email);
      const gameA = stA?.matchNumber ?? 9999;
      const gameB = stB?.matchNumber ?? 9999;
      if (gameA !== gameB) return gameA - gameB;
      const letterA = stA?.pairLetter ?? 'Z';
      const letterB = stB?.pairLetter ?? 'Z';
      if (letterA !== letterB) return letterA.localeCompare(letterB);
      if (a.gender !== b.gender) return a.gender === 'F' ? -1 : 1;
      return 0;
    });
  }, [entries, event.pairs, event.matches, userProfile.email]);

  const handleToggleGender = async (entryEmail: string, currentGender?: 'M' | 'F') => {
    if (!isAdmin && entryEmail !== userProfile.email) return;
    const db = getDb();
    if (!db) return;
    const nextGender = currentGender === 'M' ? 'F' : 'M';
    try {
       await updateEventEntry(db as Firestore, event.pin, entryEmail, { gender: nextGender });
       await updateUserProfileFields(db as Firestore, entryEmail, { gender: nextGender });
       setEntries(prev => prev.map(e => e.email === entryEmail ? { ...e, gender: nextGender } : e));
    } catch (e) {
       console.error("Falha ao alterar gênero:", e);
    }
  };

  const handleToggleCheckIn = async (entryEmail: string, currentStatus?: boolean) => {
    if (!isAdmin && entryEmail !== userProfile.email) return;
    const db = getDb();
    if (!db) return;
    const nextStatus = !currentStatus;
    try {
       await updateEventEntry(db as Firestore, event.pin, entryEmail, { checkedIn: nextStatus });
       setEntries(prev => prev.map(e => e.email === entryEmail ? { ...e, checkedIn: nextStatus } : e));
    } catch (e) {
       console.error("Falha ao realizar check-in:", e);
    }
  };

  const handleUpdateNickname = async (email: string) => {
    if (!tempNickname.trim()) return;
    setIsSavingNickname(true);
    const db = getDb();
    if (!db) { setIsSavingNickname(false); return; }
    try {
      const formatted = formatPortugueseName(tempNickname);
      await updateEventEntry(db as Firestore, event.pin, email, { nickname: formatted });
      try {
        await updateUserProfileFields(db as Firestore, email, { nickname: formatted });
      } catch (e) {}
      setEntries(prev => prev.map(e => e.email === email ? { ...e, nickname: formatted } : e));
      setEditingEmail(null);
      setModalConfig({ title: "Sucesso", message: "O apelido foi atualizado.", onConfirm: () => setModalConfig(null) });
    } catch (e) {
      setModalConfig({ title: "Erro", message: "Erro ao atualizar o apelido.", onConfirm: () => setModalConfig(null) });
    } finally {
      setIsSavingNickname(false);
    }
  };

  const handleDeleteEntry = async (entryEmail: string, nickname: string) => {
    const isSelf = entryEmail === userProfile.email;
    const targetEmailLower = entryEmail.toLowerCase().trim();
    
    // Verificar se o participante possui times formados
    const userPairs = (event.pairs || []).filter(
      p => p.p1?.email?.toLowerCase().trim() === targetEmailLower || p.p2?.email?.toLowerCase().trim() === targetEmailLower
    );
    const hasFormedTeams = userPairs.length > 0;
    const teamsListStr = userPairs.map(p => p.teamCode || `Time ${p.teamNumber || ''}`).join(', ');

    let confirmMsg = isSelf
      ? "Deseja realmente sair deste evento?"
      : `Deseja realmente remover ${nickname} do evento? Esta ação não pode ser desfeita.`;

    if (hasFormedTeams) {
      confirmMsg += `\n\nATENÇÃO: Este participante possui time(s) formado(s): [${teamsListStr}]. Ao excluir, este(s) time(s) será(ão) desfeito(s) automaticamente.`;
    }

    setModalConfig({
      title: isSelf ? "Sair do evento?" : "Excluir participante",
      message: confirmMsg,
      confirmLabel: isSelf ? "Sair" : "Excluir",
      variant: 'danger',
      icon: <Trash2 size={24} className="text-red-500" />,
      onConfirm: async () => {
        const db = getDb();
        if (!db) return;
        try {
          await deleteEventEntry(db as Firestore, event.pin, entryEmail);
          await deleteUserEventRegistration(db as Firestore, entryEmail, event.pin);
          
          // Desfazer times formados do participante no documento do evento
          if (hasFormedTeams) {
            const updatedPairs = (event.pairs || []).filter(
              p => p.p1?.email?.toLowerCase().trim() !== targetEmailLower && p.p2?.email?.toLowerCase().trim() !== targetEmailLower
            );
            await updateEvent(db as Firestore, event.pin, { pairs: updatedPairs });
          }

          setEntries(prev => prev.filter(e => e.email.toLowerCase().trim() !== targetEmailLower));
          if (isSelf) {
            setModalConfig(null);
            onExitTournament();
          } else {
            setModalConfig({ title: "Sucesso", message: "Participante removido e times desfeitos com sucesso.", onConfirm: () => setModalConfig(null) });
          }
        } catch (e) {
          console.error("Erro ao excluir participante:", e);
          setModalConfig({ title: "Erro", message: "Erro ao remover o participante.", onConfirm: () => setModalConfig(null) });
        }
      },
      onCancel: () => setModalConfig(null)
    });
  };

  const handleUndoPair = async (pairId: string) => {
    setModalConfig({
      title: "Desfazer time?",
      message: "Deseja realmente desfazer este time? Os atletas ficarão disponíveis novamente.",
      confirmLabel: "Desfazer",
      variant: 'danger',
      icon: <DesfazerTimeIcon size={24} />,
      onConfirm: async () => {
        const db = getDb();
        if (!db) return;
        try {
          const nextPairs = (event.pairs || []).filter(p => p.id !== pairId);
          const nextMatches = (event.matches || []).filter(m => m.pair1Id !== pairId && m.pair2Id !== pairId);
          await updateEvent(db as Firestore, event.pin, { pairs: nextPairs, matches: nextMatches });
          setModalConfig({ title: "Sucesso", message: "O time foi desfeito e os atletas estão disponíveis.", onConfirm: () => setModalConfig(null) });
        } catch (e) {
          console.error("Erro ao desfazer time:", e);
          setModalConfig({ title: "Erro", message: "Erro ao desfazer o time.", onConfirm: () => setModalConfig(null) });
        }
      },
      onCancel: () => setModalConfig(null)
    });
  };

  const handleUndoMatch = async (matchId: string) => {
    setModalConfig({
      title: "Excluir confronto?",
      message: "Deseja realmente excluir este confronto?",
      confirmLabel: "Excluir",
      variant: 'danger',
      icon: <Trash2 size={24} className="text-red-500" />,
      onConfirm: async () => {
        const db = getDb();
        if (!db) return;
        try {
          const nextMatches = (event.matches || []).filter(m => m.id !== matchId);
          await updateEventMatches(db as Firestore, event.pin, nextMatches);
          setModalConfig({ title: "Sucesso", message: "O confronto foi removido.", onConfirm: () => setModalConfig(null) });
        } catch (e) {
          console.error("Erro ao remover confronto:", e);
          setModalConfig({ title: "Erro", message: "Erro ao remover o confronto.", onConfirm: () => setModalConfig(null) });
        }
      },
      onCancel: () => setModalConfig(null)
    });
  };

  const handleTryStartMatch = (match: TournamentMatch, pair1: TournamentPair, pair2: TournamentPair) => {
    const hasLiveMatch = event.matches?.some(m => m.status === 'live');
    if (hasLiveMatch) {
       setModalConfig({
         title: "Já existe jogo ao vivo",
         message: "Deseja encerrar a transmissão anterior para iniciar esta nova?",
         confirmLabel: "Encerrar e iniciar",
         variant: 'danger',
         onConfirm: async () => {
            const db = getDb();
            if (db) {
               const updatedMatches = (event.matches || []).map(m => {
                  if (m.status === 'live') return { ...m, status: 'finished' as const };
                  return m;
               });
               await updateEventMatches(db as Firestore, event.pin, updatedMatches);
            }
            onStartTournamentMatch(match, pair1, pair2, event);
         },
         onCancel: () => setModalConfig(null)
       });
       return;
    }
    onStartTournamentMatch(match, pair1, pair2, event);
  };

  const handleSaveManualEntry = async () => {
    const { name, nickname, email, gender } = manualEntry;
    if (!name || !nickname || !email) {
       setModalConfig({ title: "Atenção", message: "Preencha todos os campos obrigatórios.", onConfirm: () => setModalConfig(null) });
       return;
    }
    setIsSavingManual(true);
    const db = getDb();
    if (!db) { setIsSavingManual(false); return; }
    try {
       const cleanEmail = email.toLowerCase().trim();
       const tempPin = `TEMP${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
       const entryData: TournamentEntry = { name, nickname, email: cleanEmail, pin: tempPin, gender, joinedAt: Date.now(), checkedIn: true, phone: '', shirtSize: 'M' };
       await saveEventEntry(db as Firestore, event.pin, entryData);
       await saveUserEventRegistration(db as Firestore, cleanEmail, event.pin, { pin: event.pin, name: event.name, joinedAt: entryData.joinedAt, bannerUrl: event.bannerUrl || null });
       setManualEntry({ name: '', nickname: '', email: '', gender: 'M' });
       setShowManualEntry(false);
       fetchEntries();
       setModalConfig({ title: "Sucesso", message: `Participante ${nickname} inscrito com sucesso!`, onConfirm: () => setModalConfig(null) });
    } catch (e) { setModalConfig({ title: "Erro", message: "Erro ao realizar inscrição manual.", onConfirm: () => setModalConfig(null) }); } finally { setIsSavingManual(false); }
  };

  const handleSaveConfig = async (config: Partial<TournamentConfig>) => {
    const db = getDb();
    if (!db) return;
    const currentConfig = event.config || { sportType: 'beach-tennis', sets: 1, gamesPerSet: 6, noAd: true, isLocked: false };
    const nextConfig = { ...currentConfig, ...config };
    await updateEvent(db as Firestore, event.pin, { config: nextConfig });
    if (config.isLocked !== undefined) { 
      setModalConfig({ 
        title: "Sucesso", 
        message: config.isLocked ? "Regras do torneio travadas para todas as partidas." : "Regras do torneio liberadas para edição.", 
        onConfirm: () => setModalConfig(null) 
      }); 
    }
  };

  const handleFormPairManual = async () => {
    if (selectedEntries.size !== 2) return;
    const db = getDb();
    if (!db) return;
    const selected = Array.from(selectedEntries).map(email => entries.find(e => e.email === email)!);
    const newPair: TournamentPair = {
      id: `pair_${Date.now()}`,
      p1: selected[0],
      p2: selected[1]
    };
    const nextPairs = [...(event.pairs || []), newPair];
    await updateEvent(db as Firestore, event.pin, { pairs: nextPairs });
    setSelectedEntries(new Set());
    setModalConfig({ title: "Sucesso", message: "Time formado com sucesso!", onConfirm: () => setModalConfig(null) });
  };

  const handleCreateMatchManual = async () => {
    if (selectedPairs.size !== 2) return;
    const db = getDb();
    if (!db) return;
    const pairIds = Array.from(selectedPairs);
    const newMatch: TournamentMatch = {
      id: `match_${Date.now()}`,
      pair1Id: pairIds[0],
      pair2Id: pairIds[1],
      status: 'waiting'
    };
    const nextMatches = [...(event.matches || []), newMatch];
    await updateEventMatches(db as Firestore, event.pin, nextMatches);
    setSelectedPairs(new Set());
    setModalConfig({ title: "Sucesso", message: "Confronto escalado com sucesso!", onConfirm: () => setModalConfig(null) });
  };

  const toggleEntrySelection = (email: string) => {
    const entry = entries.find(e => e.email === email);
    const isPairedOrMatched = event.pairs?.some(p => (p.p1.email === email || p.p2.email === email));
    // Bloqueio de seleção para participantes sem check-in
    if (!isAdmin || isPairedOrMatched || !entry?.checkedIn) return;
    const next = new Set(selectedEntries);
    if (next.has(email)) next.delete(email);
    else if (next.size < 2) next.add(email);
    setSelectedEntries(next);
  };

  const togglePairSelection = (pairId: string) => {
    const matches = event.matches || [];
    const isLive = matches.some(m => (m.pair1Id === pairId || m.pair2Id === pairId) && m.status === 'live');
    const isWaiting = matches.some(m => (m.pair1Id === pairId || m.pair2Id === pairId) && m.status === 'waiting');
    if (!isAdmin || isLive || isWaiting) return;
    const next = new Set(selectedPairs);
    if (next.has(pairId)) next.delete(pairId);
    else if (next.size < 2) next.add(pairId);
    setSelectedPairs(next);
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden animate-in fade-in duration-300 font-sans">
      <header className="px-6 py-4 flex items-center bg-white border-b border-gray-100 sticky top-0 z-40 min-h-[72px]">
        <button onClick={onBack} className="p-2 -ml-2 text-black active:scale-90">
          <ArrowLeft size={24} />
        </button>
        <div className="flex-1 flex items-center justify-center gap-2">
          <Trophy size={22} className="text-amber-500 stroke-[2.5]" />
          <h1 className="text-lg font-black text-black tracking-tight truncate max-w-[200px]">{event.name}</h1>
        </div>
        {onOpenCommunications ? (
          <button
            type="button"
            onClick={onOpenCommunications}
            className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-700 active:scale-95 transition-all relative"
            title="Comunicados e avisos"
          >
            <Bell size={20} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-[10px] font-black border-2 border-white animate-pulse">
                {unreadCount}
              </span>
            )}
          </button>
        ) : (
          <div className="w-10" />
        )}
      </header>

      <div className="flex-1 overflow-y-auto no-scrollbar pb-32">
        {event.bannerUrl && (
          <div className="w-full h-48 relative overflow-hidden">
            <img src={event.bannerUrl} className="w-full h-full object-cover" alt="Capa do evento" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            <div className="absolute bottom-6 left-6 right-6">
              <h2 className="text-white font-black text-2xl tracking-tight leading-tight">{event.name}</h2>
              <p className="text-amber-400 font-bold text-xs uppercase mt-1">Evento oficial • PIN: {event.pin}</p>
            </div>
          </div>
        )}

        <div className="p-5 space-y-8">
          <div className="space-y-4">
            <div className="flex items-center gap-2 px-1 text-blue-500 font-black">
              <Share2 size={18} />
              <h3 className="text-sm font-black text-black tracking-tight">Ações do evento</h3>
            </div>
            <div className="bg-[#0f172a] rounded-[3rem] p-8 shadow-2xl border border-white/10 flex flex-col items-center gap-6 overflow-hidden">
               <div className="flex flex-col items-center gap-8 w-full">
                  <div className="bg-white p-3 rounded-3xl shadow-2xl w-48 h-48 flex items-center justify-center shrink-0 border-4 border-sky-500/20">
                    <img src={qrCodeUrl} alt="Convite evento" className="w-full h-full object-contain" />
                  </div>
                  <div className="flex-1 space-y-5 w-full text-center">
                    <p className="text-[11px] font-bold text-slate-400 leading-tight">Compartilhe este convite com seus parceiros para que eles entrem no evento sob sua indicação.</p>
                    <div className="space-y-3 w-full">
                      <button onClick={() => {
                        const text = `Participe do evento ${event.name} comigo no MyPlacar! Acompanhe os resultados e inscreva-se pelo link: ${inviteLink}`;
                        globalThis.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
                      }} className="w-full bg-[#25D366] text-white py-4 px-8 rounded-2xl font-black text-xs flex items-center justify-center gap-3 shadow-lg active:scale-95 transition-all">
                        <Share2 size={18} /> WhatsApp
                      </button>
                      <button onClick={async () => {
                        const ok = await copyToClipboard(inviteLink);
                        if (ok) {
                          setModalConfig({ title: "Sucesso", message: "Link do convite copiado com sucesso.", onConfirm: () => setModalConfig(null) });
                        } else {
                          setModalConfig({ title: "Aviso", message: "Não foi possível copiar automaticamente. Copie manualmente: " + inviteLink, onConfirm: () => setModalConfig(null) });
                        }
                      }} className="w-full bg-white/10 text-white py-4 px-8 rounded-2xl font-black text-xs flex items-center justify-center gap-3 border border-white/20 active:scale-95 transition-all">
                        <Copy size={18} /> Copiar link de convite
                      </button>
                      {event.regulationUrl ? <a href={event.regulationUrl} target="_blank" rel="noopener noreferrer" className="w-full bg-amber-500 text-white py-4 px-8 rounded-2xl font-black text-xs flex items-center justify-center gap-3 shadow-lg active:scale-95 transition-all"><Eye size={18} /> Regulamento</a> : <button onClick={() => setModalConfig({ title: 'Regulamento', message: 'O regulamento ainda não foi disponibilizado pelo administrador.', onConfirm: () => setModalConfig(null) })} className="w-full bg-white/10 text-white py-4 px-8 rounded-2xl font-black text-xs flex items-center justify-center gap-3 border border-white/20 active:scale-95 transition-all"><Eye size={18} /> Regulamento</button>}
                    </div>
                  </div>
               </div>
            </div>
          </div>

          {isAdmin && (event.pairs?.length || 0) > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between px-1">
                 <div className="flex items-center gap-2 text-cyan-500 font-black">
                   <Link2 size={18} />
                   <h3 className="text-sm font-black text-black tracking-tight">Times formados</h3>
                 </div>
                 {selectedEntries.size === 2 && (
                   <button onClick={handleCreateMatchManual} className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-[10px] font-black shadow-lg animate-in zoom-in">Escalar confronto</button>
                 )}
              </div>
              <div className="grid grid-cols-1 gap-3">
                {event.pairs?.map((pair, idx) => {
                  const isSelected = selectedPairs.has(pair.id);
                  const matches = event.matches || [];
                  const isLive = matches.some(m => (m.pair1Id === pair.id || m.pair2Id === pair.id) && m.status === 'live');
                  const isWaiting = matches.some(m => (m.pair1Id === pair.id || m.pair2Id === pair.id) && m.status === 'waiting');
                  const wins = getPairWins(pair.id);
                  
                  return (
                    <div 
                      key={pair.id} 
                      onClick={() => togglePairSelection(pair.id)}
                      className={`relative bg-white p-4 rounded-3xl border-2 transition-all cursor-pointer ${isSelected ? 'border-cyan-500 bg-cyan-50/50 ring-4 ring-cyan-50' : isLive ? 'border-gray-100 opacity-60 grayscale' : isWaiting ? 'border-sky-100 bg-sky-50/20' : 'border-gray-100'}`}
                    >
                      <div className="absolute -top-2 -right-2 bg-slate-900 text-white w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black shadow-md border-2 border-white">
                        {idxToLetter(idx)}
                      </div>
                      <div className="space-y-1 mb-3">
                         <p className="text-xs font-black text-gray-900 leading-tight truncate">{pair.p1.nickname} & {pair.p2.nickname}</p>
                      </div>
                      <div className="flex items-center justify-between">
                         <div className={`flex items-center gap-1.5 text-[9px] font-bold tracking-tight ${isWaiting ? 'text-sky-600' : 'text-slate-400'}`}>
                           <span>{isLive ? 'Em jogo' : isWaiting ? 'Aguardando quadra' : 'Disponível'}</span>
                           {wins > 0 && (
                             <>
                               <span className="opacity-40">•</span>
                               <Trophy size={10} className="text-amber-500 mb-0.5" fill="currentColor" />
                               <span>{wins} {wins === 1 ? 'vitória' : 'vitórias'}</span>
                             </>
                           )}
                         </div>
                         <button 
                           onClick={(e) => { e.stopPropagation(); handleUndoPair(pair.id); }}
                           className="p-1.5 transition-transform active:scale-75"
                           title="Desfazer time"
                         >
                           <DesfazerTimeIcon size={14} />
                         </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {(event.matches?.length || 0) > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 px-1 text-red-500 font-black">
                <Target size={18} />
                <h3 className="text-sm font-black text-black tracking-tight">Confrontos programados</h3>
              </div>
              <div className="space-y-4">
                {event.matches?.map((match, idx) => {
                  const pair1 = event.pairs?.find(p => p.id === match.pair1Id);
                  const pair2 = event.pairs?.find(p => p.id === match.pair2Id);
                  const live = liveScores[match.id];
                  if (!pair1 || !pair2) return null;
                  const p1Idx = event.pairs?.findIndex(p => p.id === pair1.id) ?? 0;
                  const p2Idx = event.pairs?.findIndex(p => p.id === pair2.id) ?? 0;
                  return (
                    <div key={match.id} className={`bg-white rounded-[2.5rem] p-6 shadow-sm border-2 transition-all ${match.status === 'live' ? 'border-sky-500 ring-4 ring-sky-50' : 'border-gray-100'} relative`}>
                       <div className="flex items-center justify-between mb-6">
                         <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Jogo #{idx + 1}</span>
                         <div className="flex items-center gap-4">
                           {match.status === 'live' ? (
                              <div className="flex items-center gap-1.5 bg-red-50 px-3 py-1 rounded-full border border-red-100 animate-pulse">
                                <Wifi size={12} className="text-red-500" />
                                <span className="text-[9px] font-black text-red-600">Ao vivo</span>
                              </div>
                           ) : match.status === 'finished' ? (
                              <div className="flex items-center gap-1.5 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
                                <CheckCircle2 size={12} className="text-emerald-500" />
                                <span className="text-[9px] font-black text-emerald-600">Finalizada</span>
                              </div>
                           ) : (
                              <span className="text-[9px] font-black text-slate-400 bg-gray-100 px-3 py-1 rounded-full">Aguardando</span>
                           )}
                           {isAdmin && (
                             <button 
                               onClick={(e) => { e.stopPropagation(); handleUndoMatch(match.id); }} 
                               className="text-red-400 p-1.5 hover:bg-red-50 rounded-lg active:scale-75 transition-all" 
                               title="Excluir confronto"
                             >
                               <Trash2 size={18}/>
                             </button>
                           )}
                         </div>
                       </div>
                       <div className="flex items-center justify-between gap-4 mb-6">
                          <div className="flex-1 text-center space-y-1">
                             <div className="mb-2"><span className="bg-blue-600 text-white text-[8px] font-black px-2 py-0.5 rounded-full shadow-sm">Time {idxToLetter(p1Idx)}</span></div>
                             <p className="text-xs font-black text-gray-900 leading-tight">{pair1.p1.nickname} & {pair1.p2.nickname}</p>
                             {match.status === 'finished' && match.winnerPairId === match.pair1Id && <Trophy size={14} className="text-amber-500 mx-auto" fill="currentColor" />}
                          </div>
                          <div className="flex flex-col items-center justify-center shrink-0 min-w-[60px]">
                             {match.status === 'live' && live ? (
                                <div className="text-center">
                                   <p className="text-2xl font-black text-sky-600 leading-none">{live.p1Score}-{live.p2Score}</p>
                                   <p className="text-[10px] font-bold text-slate-400 mt-1">{live.p1Games}-{live.p2Games} games</p>
                                </div>
                             ) : match.status === 'finished' ? (
                                <div className="bg-slate-900 text-white px-3 py-1 rounded-xl text-sm font-black shadow-lg">
                                   {match.result}
                                </div>
                             ) : (
                                <span className="text-xs font-black text-slate-300">VS</span>
                             )}
                          </div>
                          <div className="flex-1 text-center space-y-1">
                             <div className="mb-2"><span className="bg-red-600 text-white text-[8px] font-black px-2 py-0.5 rounded-full shadow-sm">Time {idxToLetter(p2Idx)}</span></div>
                             <p className="text-xs font-black text-gray-900 leading-tight">{pair2.p1.nickname} & {pair2.p2.nickname}</p>
                             {match.status === 'finished' && match.winnerPairId === match.pair2Id && <Trophy size={14} className="text-amber-500 mx-auto" fill="currentColor" />}
                          </div>
                       </div>
                       {isAdmin && match.status === 'waiting' && (
                         <button 
                            onClick={() => handleTryStartMatch(match, pair1, pair2)}
                            className="w-full py-4 bg-sky-500 text-white rounded-2xl font-black text-xs uppercase flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all"
                         >
                            <Play size={16} fill="white" /> Escalar para quadra
                         </button>
                       )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2 text-amber-500 font-black">
                <Users size={20} />
                <h3 className="text-sm font-black text-black tracking-tight">Participantes oficiais</h3>
              </div>
              <div className="flex gap-2">
                {isAdmin && selectedEntries.size === 2 && (
                   <button onClick={handleFormPairManual} className="bg-cyan-600 text-white px-4 py-2 rounded-xl text-[10px] font-black shadow-lg animate-in zoom-in">Formar time</button>
                )}
                <button onClick={fetchEntries} className="p-2 text-blue-600 active:scale-90 transition-transform">
                  <RotateCw size={18} className={isLoading ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>
            {isLoading ? (
              <div className="py-12 flex flex-col items-center gap-3 text-slate-300">
                <Loader2 className="animate-spin" size={32} />
                <span className="text-xs font-bold tracking-tight">Sincronizando nomes dos atletas...</span>
              </div>
            ) : entries.length === 0 ? (
              <div className="py-12 text-center text-gray-400 font-bold text-sm bg-white rounded-3xl border border-dashed">Ninguém inscrito ainda</div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {sortedEntries.map((entry: TournamentEntry) => {
                  const st = getAthleteStatus(entry.email);
                  const isSelected = selectedEntries.has(entry.email);
                  const formedPair = event.pairs?.find(p => p.p1?.email?.toLowerCase().trim() === entry.email?.toLowerCase().trim() || p.p2?.email?.toLowerCase().trim() === entry.email?.toLowerCase().trim());
                  const pairCategory = formedPair?.categoryId ? event.categories?.find(c => c.id === formedPair.categoryId) : null;
                  const formedTeamLabel = formedPair ? (formedPair.teamCode || (pairCategory ? `${String(formedPair.teamNumber || 1).padStart(3, '0')} - ${pairCategory.abbreviation}` : `Time ${formedPair.teamNumber || ''}`)) : null;
                  const isPairedOrMatched = Boolean(formedPair);
                  const isCurrentUserEntry = entry.email.toLowerCase().trim() === userProfile.email.toLowerCase().trim();
                  const canManageEntry = isAdmin || isCurrentUserEntry;
                  // Participante indisponível para seleção visualmente e logicamente se não fez check-in
                  const isUnavailable = !entry.checkedIn;
                  
                  return (
                    <div 
                      key={entry.email} 
                      onClick={() => isAdmin && toggleEntrySelection(entry.email)}
                      className={`bg-white p-5 rounded-3xl shadow-sm border transition-all duration-300 relative overflow-hidden ${isSelected ? 'border-cyan-500 ring-4 ring-cyan-50 bg-cyan-50/20' : entry.checkedIn ? 'border-emerald-100 ring-2 ring-emerald-50' : 'border-gray-100'} ${st || isPairedOrMatched ? 'border-slate-200 cursor-default' : (isAdmin && !isUnavailable ? 'cursor-pointer' : '')}`}
                    >
                      {formedTeamLabel && (
                         <div className="absolute top-0 right-0 px-4 py-1.5 rounded-bl-2xl font-black text-[10px] text-white shadow-sm flex items-center gap-1.5 bg-gradient-to-r from-blue-600 to-indigo-600">
                            <Trophy size={11} className="text-amber-300 shrink-0" />
                            <span>{formedTeamLabel}</span>
                            {st?.matchNumber && <span className="text-[7px] opacity-80 uppercase ml-1">• Jogo {st.matchNumber}</span>}
                         </div>
                      )}
                      <div className="flex items-center justify-between">
                         <div className="flex items-center gap-4 flex-1 min-w-0">
                           <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-inner ${isCurrentUserEntry ? 'bg-[#4B0082] text-white shadow-lg' : (entry.checkedIn ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600')}`}>
                             <User size={24} fill={isCurrentUserEntry ? 'currentColor' : 'none'} />
                           </div>
                           <div className="text-left flex-1 min-w-0 pr-2">
                             <div className="flex items-center gap-2">
                               {editingEmail === entry.email ? (
                                  <div className="flex items-center gap-1 animate-in slide-in-from-left-1">
                                    <input 
                                      autoFocus
                                      type="text"
                                      value={tempNickname}
                                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTempNickname(formatPortugueseName(e.target.value))}
                                      className="h-8 w-32 bg-gray-50 border border-blue-200 rounded-lg px-2 text-xs font-black outline-none focus:ring-2 focus:ring-blue-100"
                                      onClick={e => e.stopPropagation()}
                                    />
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); handleUpdateNickname(entry.email); }}
                                      disabled={isSavingNickname}
                                      className="p-1 bg-emerald-500 text-white rounded-lg active:scale-75"
                                    >
                                      {isSavingNickname ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} strokeWidth={4} />}
                                    </button>
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); setEditingEmail(null); }}
                                      className="p-1 bg-gray-100 text-gray-500 rounded-lg active:scale-75"
                                    >
                                      <X size={14} strokeWidth={4} />
                                    </button>
                                  </div>
                               ) : (
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-black text-gray-900 truncate">
                                      {entry.name || entry.nickname}
                                      {isCurrentUserEntry && <span className="text-[10px] opacity-40 ml-1">(você)</span>}
                                    </p>
                                  </div>
                                )}
                              </div>
                              <p className="text-[10px] font-bold text-gray-400 uppercase">{entry.nickname} - {maskPin(entry.pin)}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {canManageEntry && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedEntryEmail(prev => prev === entry.email ? null : entry.email);
                                }}
                                className="p-2 bg-gray-100 hover:bg-gray-200 text-slate-500 rounded-xl transition-colors pointer-events-auto"
                                title="Expandir cadastro de inscrição"
                              >
                                {expandedEntryEmail === entry.email ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                              </button>
                            )}

                            <button 
                              onClick={(e) => { e.stopPropagation(); handleToggleGender(entry.email, entry.gender); }}
                              disabled={!canManageEntry}
                              className={`p-2 rounded-xl transition-all border ${
                                !canManageEntry
                                  ? (entry.gender === 'F' ? 'bg-pink-50 text-pink-400 border-pink-100 cursor-default opacity-80' : 'bg-sky-50 text-sky-400 border-sky-100 cursor-default opacity-80')
                                  : (entry.gender === 'F' ? 'bg-pink-50 text-pink-500 border-pink-100 hover:brightness-95 active:scale-90 pointer-events-auto' : 'bg-sky-50 text-sky-500 border-sky-100 hover:brightness-95 active:scale-90 pointer-events-auto')
                              }`}
                              title={canManageEntry ? "Alterar gênero do participante" : ""}
                            >
                              {entry.gender === 'F' ? <VenusIcon /> : <MarsIcon />}
                            </button>

                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                if (canManageEntry) {
                                  handleToggleCheckIn(entry.email, entry.checkedIn);
                                }
                              }}
                              disabled={!canManageEntry}
                              className={`p-2 rounded-xl transition-all border ${
                                entry.checkedIn
                                  ? `bg-emerald-500 text-white border-emerald-600 shadow-md ${canManageEntry ? 'active:scale-90 pointer-events-auto' : 'cursor-default opacity-90'}`
                                  : `bg-gray-50 text-gray-400 border-gray-200 ${canManageEntry ? 'active:scale-90 pointer-events-auto' : 'cursor-default opacity-70'}`
                              }`}
                              title={canManageEntry ? (entry.checkedIn ? "Confirmar ausência" : "Confirmar presença") : ""}
                            >
                              <Check size={18} strokeWidth={3} />
                            </button>
                          </div>
                       </div>

                       {expandedEntryEmail === entry.email && (
                         <EventRegistrationForm
                           key={entry.email}
                           entry={entry}
                           event={event}
                           mode="user"
                           onDelete={() => handleDeleteEntry(entry.email, entry.nickname)}
                           onSave={async (updated) => {
                             const db = getDb();
                             if (!db) return;
                             if ((updated as any)._deleteRequested) {
                               handleDeleteEntry(entry.email, entry.nickname);
                               setExpandedEntryEmail(null);
                               return;
                             }
                             const { saveAdminEventEntry, updateEvent } = await import('@infra/firebase/events');
                             await saveAdminEventEntry(db as Firestore, event.pin, updated, userProfile.email);
                             // Atualiza também o índice auxiliar do usuário
                             try {
                               await saveUserEventRegistration(db as Firestore, updated.email, event.pin, {
                                 pin: event.pin,
                                 name: event.name,
                                 joinedAt: updated.joinedAt,
                                 bannerUrl: event.bannerUrl || null,
                               });
                             } catch (e) {
                               console.warn('Índice auxiliar não atualizado:', e);
                             }

                             // Sincroniza dados em event.pairs se o participante estiver em duplas formadas
                             if (event.pairs && event.pairs.length > 0) {
                               let pairsChanged = false;
                               const nextPairs = event.pairs.map((pair) => {
                                 const isP1 = pair.p1?.email === updated.email || pair.p1?.pin === updated.pin;
                                 const isP2 = pair.p2?.email === updated.email || pair.p2?.pin === updated.pin;
                                 if (!isP1 && !isP2) return pair;

                                 pairsChanged = true;
                                 const partnerInfo = updated.categoryPartners?.[pair.categoryId || ''];
                                 if (isP1) {
                                   return {
                                     ...pair,
                                     p1: { ...pair.p1, ...updated },
                                     p2: partnerInfo?.name ? {
                                       ...pair.p2,
                                       name: partnerInfo.name,
                                       nickname: partnerInfo.name,
                                       email: partnerInfo.email || pair.p2.email,
                                       phone: partnerInfo.phone || pair.p2.phone,
                                     } : pair.p2,
                                   };
                                 } else {
                                   return {
                                     ...pair,
                                     p2: { ...pair.p2, ...updated },
                                     p1: partnerInfo?.name ? {
                                       ...pair.p1,
                                       name: partnerInfo.name,
                                       nickname: partnerInfo.name,
                                       email: partnerInfo.email || pair.p1.email,
                                       phone: partnerInfo.phone || pair.p1.phone,
                                     } : pair.p1,
                                   };
                                 }
                               });

                               if (pairsChanged) {
                                 try {
                                   await updateEvent(db as Firestore, event.pin, { pairs: nextPairs });
                                   setEvent((prev) => ({ ...prev, pairs: nextPairs }));
                                 } catch (err) {
                                   console.warn('Erro ao sincronizar duplas com parceiro:', err);
                                 }
                               }
                             }

                             // Atualiza estado local imediatamente sem esperar snapshot
                             setEntries(prev => prev.map(e => e.email === updated.email ? { ...e, ...updated } : e));
                           }}
                         />
                       )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
