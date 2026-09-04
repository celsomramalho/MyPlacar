import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { Partner } from '@modules/partners/types';
import { MarsIcon, VenusIcon } from '@shared/components/GenderIcons';
import { ArrowLeft, Trophy, Users, Share2, Copy, QrCode, X, User, UserRound, UsersRound, Loader2, RotateCw, Settings, Save, Play, Clock, Target, CheckCircle2, Wifi, Zap, UserPlus, Mail, ChevronUp, ChevronDown, Check, Trash2, Link2, Unlink, ShieldCheck, UserCheck, Edit3, Search, AlertCircle, AlertTriangle, DollarSign, Eye, Bell, Sparkles, Calendar } from 'lucide-react';
import { formatRegistrationId, orderPairEntriesForMixed, minifyEntryForPair, minifyPairForStorage, type TournamentEvent, type TournamentEntry, type TournamentPair, type TournamentMatch, type MatchSetScore, type TournamentConfig, type PaymentItem, type EventCategory } from '../types';
import type { UserProfile } from '@modules/auth/types';
import { deleteEventEntry, deleteUserEventRegistration, ensureEventEntriesRegistrationIds, fetchEventEntries, getDb, saveEventEntry, saveUserEventRegistration, subscribeEventByPin, subscribeEventEntries, subscribeTournamentLiveScores, updateEvent, updateEventEntry, updateEventMatches, updateUserProfileFields } from '@infra/firebase';
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
import { getPhaseLabel, createManualMatch, validateCategoryGenders } from '../services/matchGenerator';
import { calculateSuper8PlayerStandings, calculateBracketStandings, type TeamStanding } from '../services/matchProgression';

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
  setModalConfig: React.Dispatch<React.SetStateAction<ModalConfig | null>>;
}

const EntryExpandedForm: React.FC<EntryExpandedFormProps> = ({ entry, event, canEdit, onSave, setModalConfig }) => {
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
              onSave({ ...entry, _deleteRequested: true } as any);
            }}
            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
            title="Excluir inscrição"
          >
            <Trash2 size={18} />
          </button>
        )}
      </div>

      {/* ID, Nome, PIN e Email */}
      <div className="grid grid-cols-4 gap-3">
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 ml-1">Inscrição_ID</label>
          <div className="h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 flex items-center text-xs font-mono font-black text-emerald-600">
            {formatRegistrationId(entry.registrationId)}
          </div>
        </div>
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
                      <input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={handleFileChange} />
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
                          onClick={(e) => {
                            e.stopPropagation();
                            setModalConfig({
                              title: 'Excluir pagamento?',
                              message: 'Deseja realmente excluir este pagamento?',
                              confirmLabel: 'Excluir',
                              variant: 'danger',
                              onConfirm: () => {
                                setModalConfig(null);
                                handleRemovePayment(pay.id);
                              },
                              onCancel: () => setModalConfig(null),
                            });
                          }}
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

  const isChaveEvent = !event.eventType || event.eventType === 'Chave classificatória' || event.eventType === 'Chave mata-mata';
  const isRanking = event.eventType === 'Ranking';
  const isSuper8 = event.eventType === 'Super 8';
  const saveMatchesTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set());
  const [selectedPairs, setSelectedPairs] = useState<Set<string>>(new Set());
  const [userSelectedCategoryId, setUserSelectedCategoryId] = useState<string | null>(null);
  const [userCategoryView, setUserCategoryView] = useState<'entries' | 'teams' | 'matches'>(isChaveEvent ? 'teams' : 'entries');

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
      const withIds = await ensureEventEntriesRegistrationIds(db as Firestore, event.pin, list);
      setEntries(withIds as TournamentEntry[]);
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
      // Auto-atribui Inscrição_ID para participantes antigos/sem ID se necessário.
      void ensureEventEntriesRegistrationIds(db as Firestore, event.pin, liveEntries).then((withIds) => {
        setEntries(withIds as TournamentEntry[]);
      });
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

  const currentUserEntry = useMemo(() => {
    const userEmail = userProfile.email.toLowerCase().trim();
    const userPin = userProfile.pin.toLowerCase().trim();
    return entries.find((entry) =>
      entry.email?.toLowerCase().trim() === userEmail ||
      entry.pin?.toLowerCase().trim() === userPin
    ) || null;
  }, [entries, userProfile.email, userProfile.pin]);

  const userCategoryIds = useMemo(() => {
    const ids = new Set<string>(currentUserEntry?.categoryIds || []);
    const userEmail = userProfile.email.toLowerCase().trim();
    const userPin = userProfile.pin.toLowerCase().trim();

    (event.pairs || []).forEach((pair) => {
      const isUserPair =
        pair.p1?.email?.toLowerCase().trim() === userEmail ||
        pair.p2?.email?.toLowerCase().trim() === userEmail ||
        pair.p1?.pin?.toLowerCase().trim() === userPin ||
        pair.p2?.pin?.toLowerCase().trim() === userPin;

      if (isUserPair && pair.categoryId) {
        ids.add(pair.categoryId);
      }
    });

    return ids;
  }, [currentUserEntry, event.pairs, userProfile.email, userProfile.pin]);

  const userCategories = useMemo(() => {
    if (userCategoryIds.size === 0 || isRanking || isAdmin) {
      return (event.categories || []).sort((a, b) => a.priority - b.priority);
    }
    return (event.categories || [])
      .filter((cat) => userCategoryIds.has(cat.id))
      .sort((a, b) => a.priority - b.priority);
  }, [event.categories, userCategoryIds, isRanking, isAdmin]);

  useEffect(() => {
    if (userSelectedCategoryId && (event.categories || []).some(c => c.id === userSelectedCategoryId)) return;
    const initialCat = userCategories.find(c => userCategoryIds.has(c.id)) || userCategories[0];
    setUserSelectedCategoryId(initialCat?.id || null);
    setUserCategoryView(isChaveEvent ? 'teams' : 'entries');
  }, [userCategories, userCategoryIds, userSelectedCategoryId, isChaveEvent]);

  const userVisibleEntries = useMemo(() => {
    if (isAdmin) return sortedEntries;
    if (!currentUserEntry) return [];
    return sortedEntries.filter((entry) =>
      entry.email?.toLowerCase().trim() === currentUserEntry.email?.toLowerCase().trim() ||
      entry.pin?.toLowerCase().trim() === currentUserEntry.pin?.toLowerCase().trim()
    );
  }, [currentUserEntry, isAdmin, sortedEntries]);

  const getCategoryPairs = useCallback((categoryId: string) => {
    return (event.pairs || []).filter((pair) =>
      pair.categoryId === categoryId ||
      (!pair.categoryId && (
        pair.p1.categoryIds?.includes(categoryId) ||
        pair.p2.categoryIds?.includes(categoryId)
      ))
    );
  }, [event.pairs]);

  const getCategoryMatches = useCallback((categoryId: string) => {
    const categoryPairs = getCategoryPairs(categoryId);
    return (event.matches || []).filter((match) =>
      match.categoryId === categoryId ||
      (!match.categoryId && categoryPairs.some((pair) => pair.id === match.pair1Id || pair.id === match.pair2Id))
    );
  }, [event.matches, getCategoryPairs]);

  const renderUserCategoryPanel = (category: EventCategory) => {
    const categoryEntries = entries.filter((entry) => entry.categoryIds?.includes(category.id));
    const categoryPairs = getCategoryPairs(category.id);
    const categoryMatches = getCategoryMatches(category.id);
    const pairsById = new Map(categoryPairs.map((pair) => [pair.id, pair]));
    const isSuper8 = event.eventType === 'Super 8';
    const isRanking = event.eventType === 'Ranking';
    const isIndividualRanking = isSuper8 || isRanking;
    const playerStandings = isIndividualRanking ? calculateSuper8PlayerStandings(categoryEntries, categoryMatches) : [];
    const playerStandingsMap = new Map<string, (typeof playerStandings)[number]>();

    playerStandings.forEach((standing) => {
      const emailKey = (standing.entry.email || '').toLowerCase().trim();
      const pinKey = (standing.entry.pin || '').toLowerCase().trim();
      if (emailKey) playerStandingsMap.set(emailKey, standing);
      if (pinKey) playerStandingsMap.set(pinKey, standing);
    });

    const pairForEntry = (entry: TournamentEntry) =>
      categoryPairs.find(
        (p) =>
          (p.p1.email && entry.email && p.p1.email.toLowerCase().trim() === entry.email.toLowerCase().trim()) ||
          (p.p2.email && entry.email && p.p2.email.toLowerCase().trim() === entry.email.toLowerCase().trim()) ||
          (p.p1.pin && entry.pin && p.p1.pin.toUpperCase().trim() === entry.pin.toUpperCase().trim()) ||
          (p.p2.pin && entry.pin && p.p2.pin.toUpperCase().trim() === entry.pin.toUpperCase().trim())
      );

    const sortedCategoryEntries = isIndividualRanking
      ? [...categoryEntries].sort((a, b) => {
          if (isRanking) {
            const pA = pairForEntry(a);
            const pB = pairForEntry(b);
            if (pA && !pB) return -1;
            if (!pA && pB) return 1;
            if (pA && pB && pA.id !== pB.id) {
              return (pA.teamNumber || 0) - (pB.teamNumber || 0);
            }
          }
          const aKey = (a.email || a.pin || '').toLowerCase().trim();
          const bKey = (b.email || b.pin || '').toLowerCase().trim();
          const aStanding = playerStandingsMap.get(aKey);
          const bStanding = playerStandingsMap.get(bKey);
          if (aStanding?.rank !== undefined && bStanding?.rank !== undefined && aStanding.rank !== bStanding.rank) {
            return aStanding.rank - bStanding.rank;
          }
          return (a.name || '').localeCompare(b.name || '');
        })
      : categoryEntries;

    const entriesWithTeam = isRanking
      ? sortedCategoryEntries.filter((e) => Boolean(pairForEntry(e)))
      : [];
    const entriesWithoutTeam = isRanking
      ? sortedCategoryEntries.filter((e) => !pairForEntry(e))
      : [];

    const currentSuper8RoundLabel = (() => {
      if (!isSuper8 || categoryMatches.length === 0) return null;

      const isMatchDone = (match: TournamentMatch) => {
        if (match.status === 'finished') return true;
        return !!match.result || !!match.winnerPairId || (match.scores || []).some((score) => score.p1 !== null || score.p2 !== null);
      };

      const roundNumbers = Array.from(new Set(categoryMatches.map((match) => Number((match.phase || 'rodada1').replace(/\D/g, '')) || 1))).sort((a, b) => a - b);
      const currentRound = roundNumbers.find((round) => {
        const roundMatches = categoryMatches.filter((match) => (Number((match.phase || 'rodada1').replace(/\D/g, '')) || 1) === round);
        return !roundMatches.every(isMatchDone);
      });

      if (currentRound === undefined) {
        const finalRound = roundNumbers[roundNumbers.length - 1];
        return { label: `Rodada: ${finalRound} - finalizada`, active: true };
      }

      const currentRoundMatches = categoryMatches.filter((match) => (Number((match.phase || 'rodada1').replace(/\D/g, '')) || 1) === currentRound);
      const hasStarted = currentRoundMatches.some((match) => match.status === 'live' || isMatchDone(match));
      return { label: `Rodada: ${currentRound} - ${hasStarted ? 'em andamento' : 'aguardando'}`, active: hasStarted };
    })();

    const selectedCategoryPair = (() => {
      if (selectedEntries.size === 0) return null;
      const selectedKey = Array.from(selectedEntries)[0].toLowerCase().trim();
      const found = categoryPairs.find((p) => {
        const p1e = (p.p1.email || '').toLowerCase().trim();
        const p2e = (p.p2.email || '').toLowerCase().trim();
        const p1p = (p.p1.pin || '').toLowerCase().trim();
        const p2p = (p.p2.pin || '').toLowerCase().trim();
        return p1e === selectedKey || p2e === selectedKey || p1p === selectedKey || p2p === selectedKey;
      });
      if (!found) return null;
      const k1 = (found.p1.email || found.p1.pin || '').toLowerCase().trim();
      const k2 = (found.p2.email || found.p2.pin || '').toLowerCase().trim();
      const isPairSelected =
        Array.from(selectedEntries).some(e => e.toLowerCase().trim() === k1) &&
        Array.from(selectedEntries).some(e => e.toLowerCase().trim() === k2);
      return isPairSelected ? found : null;
    })();

    const toggleCategoryEntrySelection = (entry: TournamentEntry) => {
      const existingPair = pairForEntry(entry);
      if (existingPair) {
        const k1 = existingPair.p1.email || existingPair.p1.pin || '';
        const k2 = existingPair.p2.email || existingPair.p2.pin || '';
        const isAlreadySelected = selectedEntries.has(k1) && selectedEntries.has(k2);
        if (isAlreadySelected) {
          setSelectedEntries(new Set());
        } else {
          setSelectedEntries(new Set([k1, k2]));
        }
        return;
      }

      const key = entry.email || entry.pin || '';
      const next = new Set(selectedEntries);
      if (next.has(key)) {
        next.delete(key);
      } else {
        if (next.size >= 2) {
          const first = Array.from(next)[0];
          next.clear();
          next.add(first);
        }
        next.add(key);
      }
      setSelectedEntries(next);
    };

    const selectedEntriesList = Array.from(selectedEntries)
      .map((key) => {
        const lowerKey = key.toLowerCase().trim();
        return categoryEntries.find(
          (e) => (e.email || '').toLowerCase().trim() === lowerKey || (e.pin || '').toLowerCase().trim() === lowerKey
        );
      })
      .filter(Boolean) as TournamentEntry[];

    const genderValidation = selectedCategoryPair || selectedEntriesList.length !== 2
      ? { valid: true }
      : validateCategoryGenders(category, selectedEntriesList);

    const handleFormTeamForCategory = async () => {
      if (selectedCategoryPair) {
        setModalConfig({
          title: 'Desfazer time?',
          message: selectedCategoryPair.teamCode
            ? `Deseja desfazer o time ${selectedCategoryPair.teamCode}?`
            : 'Deseja desfazer o time selecionado?',
          confirmLabel: 'Desfazer',
          variant: 'danger',
          onConfirm: async () => {
            setModalConfig(null);
            const nextPairs = (event.pairs || []).filter((p) => p.id !== selectedCategoryPair.id);
            const nextMatches = (event.matches || []).filter(
              (m) => m.pair1Id !== selectedCategoryPair.id && m.pair2Id !== selectedCategoryPair.id
            );
            setEvent((prev) => ({ ...prev, pairs: nextPairs, matches: nextMatches }));
            setSelectedEntries(new Set());
            const db = getDb();
            if (db) {
              try {
                await updateEvent(db as Firestore, event.pin, { pairs: nextPairs, matches: nextMatches });
              } catch (err) {
                console.error('Erro ao desfazer time no Firestore:', err);
              }
            }
          },
          onCancel: () => setModalConfig(null),
        });
        return;
      }

      if (selectedEntries.size !== 2) return;
      if (!genderValidation.valid) {
        setModalConfig({
          title: 'Atenção',
          message: genderValidation.message || 'Formação de time incompatível com a categoria.',
          onConfirm: () => setModalConfig(null),
        });
        return;
      }

      const allPairs = event.pairs || [];
      const teamNumber = Math.max(
        0,
        ...allPairs.map((p, index) => p.teamNumber || Number(p.teamCode?.match(/^\d{3}/)?.[0]) || index + 1)
      ) + 1;
      const teamCode = `${String(teamNumber).padStart(3, '0')} - ${category.abbreviation || category.name}`;
      const [orderedP1, orderedP2] = orderPairEntriesForMixed(selectedEntriesList[0], selectedEntriesList[1]);
      const newPair: TournamentPair = {
        id: `pair_${Date.now()}`,
        p1: minifyEntryForPair(orderedP1),
        p2: minifyEntryForPair(orderedP2),
        categoryId: category.id,
        teamNumber,
        teamCode,
      };
      const nextPairs = [...allPairs.map(minifyPairForStorage), newPair];
      setEvent((prev) => ({ ...prev, pairs: nextPairs }));
      setSelectedEntries(new Set());
      const db = getDb();
      if (db) {
        try {
          await updateEvent(db as Firestore, event.pin, { pairs: nextPairs });
        } catch (err) {
          console.error('Erro ao salvar time no Firestore:', err);
        }
      }
    };

    const toggleCategoryTeamSelection = (pairId: string) => {
      const next = new Set(selectedPairs);
      if (next.has(pairId)) {
        next.delete(pairId);
      } else {
        if (next.size >= 2) {
          next.clear();
        }
        next.add(pairId);
      }
      setSelectedPairs(next);
    };

    const selectedPairIds = Array.from(selectedPairs);
    const existingMatchBetweenTeams = selectedPairIds.length === 2
      ? categoryMatches.find(
          (m) =>
            (m.pair1Id === selectedPairIds[0] && m.pair2Id === selectedPairIds[1]) ||
            (m.pair1Id === selectedPairIds[1] && m.pair2Id === selectedPairIds[0])
        )
      : null;

    const handleFormOrUndoMatchForCategory = async () => {
      if (selectedPairIds.length !== 2) return;

      if (existingMatchBetweenTeams) {
        setModalConfig({
          title: 'Desfazer partida?',
          message: 'Deseja realmente desfazer a partida entre os times selecionados?',
          confirmLabel: 'Desfazer',
          variant: 'danger',
          onConfirm: async () => {
            setModalConfig(null);
            const nextMatches = (event.matches || []).filter((m) => m.id !== existingMatchBetweenTeams.id);
            setEvent((prev) => ({ ...prev, matches: nextMatches }));
            setSelectedPairs(new Set());
            const db = getDb();
            if (db) {
              try {
                await updateEventMatches(db as Firestore, event.pin, nextMatches);
              } catch (err) {
                console.error('Erro ao desfazer partida:', err);
              }
            }
          },
          onCancel: () => setModalConfig(null),
        });
        return;
      }

      const p1 = categoryPairs.find((p) => p.id === selectedPairIds[0]);
      const p2 = categoryPairs.find((p) => p.id === selectedPairIds[1]);
      if (!p1 || !p2) return;

      const newMatch = createManualMatch(p1, p2, category, event.matches || []);
      if (isRanking) {
        newMatch.phase = 'ranking';
      }
      const nextMatches = [...(event.matches || []), newMatch];
      setEvent((prev) => ({ ...prev, matches: nextMatches }));
      setSelectedPairs(new Set());
      const db = getDb();
      if (db) {
        try {
          await updateEventMatches(db as Firestore, event.pin, nextMatches);
        } catch (err) {
          console.error('Erro ao criar partida:', err);
        }
      }
    };

    const rankingStandings = isRanking ? calculateBracketStandings(categoryPairs, categoryMatches) : [];
    const rankingStandingsMap = new Map<string, TeamStanding>(rankingStandings.map((s) => [s.pair.id, s]));
    const sortedRankingPairs = isRanking
      ? (categoryMatches.length > 0
          ? [...rankingStandings].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99)).map((s) => s.pair)
          : [...categoryPairs].sort((a, b) => (a.teamNumber || 0) - (b.teamNumber || 0)))
      : [];

    const handleScoreChange = (matchId: string, player: 'p1' | 'p2', rawVal: string) => {
      const parsedNum = rawVal.trim() === '' ? null : parseInt(rawVal, 10);
      const val = isNaN(parsedNum as number) ? null : parsedNum;

      const nextMatches = (event.matches || []).map((m) => {
        if (m.id !== matchId) return m;

        const currentScores: MatchSetScore[] = [{
          p1: m.scores?.[0]?.p1 !== undefined ? m.scores[0].p1 : null,
          p2: m.scores?.[0]?.p2 !== undefined ? m.scores[0].p2 : null,
        }];

        currentScores[0] = {
          ...currentScores[0],
          [player]: val,
        };

        const s1 = currentScores[0].p1;
        const s2 = currentScores[0].p2;
        const hasAnyScore = s1 !== null || s2 !== null;
        const result = (s1 !== null && s2 !== null) ? `${s1}/${s2}` : (m.result || '');

        return {
          ...m,
          scores: currentScores,
          result,
          status: m.status === 'finished' ? ('finished' as const) : (hasAnyScore ? ('live' as const) : ('waiting' as const)),
        };
      });

      setEvent((prev) => ({ ...prev, matches: nextMatches }));

      if (saveMatchesTimeoutRef.current) {
        clearTimeout(saveMatchesTimeoutRef.current);
      }
      saveMatchesTimeoutRef.current = setTimeout(async () => {
        const db = getDb();
        if (db) {
          try {
            await updateEventMatches(db as Firestore, event.pin, nextMatches);
          } catch (err) {
            console.error('Erro ao atualizar placar no Firestore:', err);
          }
        }
      }, 600);
    };

    const handleMatchDateChange = (matchId: string, dateVal: string) => {
      const nextMatches = (event.matches || []).map((m) =>
        m.id !== matchId ? m : { ...m, matchDate: dateVal || undefined }
      );
      setEvent((prev) => ({ ...prev, matches: nextMatches }));

      if (saveMatchesTimeoutRef.current) clearTimeout(saveMatchesTimeoutRef.current);
      saveMatchesTimeoutRef.current = setTimeout(async () => {
        const db = getDb();
        if (db) {
          try {
            await updateEventMatches(db as Firestore, event.pin, nextMatches);
          } catch (err) {
            console.error('Erro ao salvar data da partida no Firestore:', err);
          }
        }
      }, 600);
    };

    const handleFinishRankingMatch = async (matchId: string) => {
      const match = (event.matches || []).find((m) => m.id === matchId);
      if (!match) return;

      const s1 = match.scores?.[0]?.p1;
      const s2 = match.scores?.[0]?.p2;

      if (s1 === null || s1 === undefined || s2 === null || s2 === undefined) {
        setModalConfig({
          title: 'Placar não informado',
          message: 'Digite o placar antes de finalizar a partida.',
          onConfirm: () => setModalConfig(null),
        });
        return;
      }

      const n1 = Number(s1);
      const n2 = Number(s2);
      if (n1 === n2) {
        setModalConfig({
          title: 'Empate',
          message: 'O placar não pode terminar empatado. Uma das equipes precisa vencer.',
          onConfirm: () => setModalConfig(null),
        });
        return;
      }

      const winnerPairId = n1 > n2 ? match.pair1Id : match.pair2Id;
      const loserPairId = n1 > n2 ? match.pair2Id : match.pair1Id;

      const pair1Obj = match.pair1 || (match.pair1Id ? (event.pairs || []).find((p) => p.id === match.pair1Id) : undefined);
      const pair2Obj = match.pair2 || (match.pair2Id ? (event.pairs || []).find((p) => p.id === match.pair2Id) : undefined);

      const nextMatches = (event.matches || []).map((m) => {
        if (m.id !== matchId) return m;
        return {
          ...m,
          status: 'finished' as const,
          result: `${n1}/${n2}`,
          winnerPairId,
          loserPairId,
          pair1: pair1Obj ? minifyPairForStorage(pair1Obj) : m.pair1,
          pair2: pair2Obj ? minifyPairForStorage(pair2Obj) : m.pair2,
          finishedAt: new Date().toISOString(),
        };
      });

      // Times permanecem ativos — NÃO dissolve event.pairs
      // O histórico de partidas ficará visível na aba Times
      setEvent((prev) => ({ ...prev, matches: nextMatches }));
      setSelectedEntries(new Set());
      setSelectedPairs(new Set());

      const db = getDb();
      if (db) {
        try {
          await updateEvent(db as Firestore, event.pin, { matches: nextMatches });
        } catch (err) {
          console.error('Erro ao finalizar partida no Firestore:', err);
        }
      }
    };


    const handleReopenMatch = async (matchId: string) => {
      const targetMatch = (event.matches || []).find((m) => m.id === matchId);
      if (!targetMatch) return;

      const nextMatches = (event.matches || []).map((m) => {
        if (m.id !== matchId) return m;
        return {
          ...m,
          status: 'live' as const,
          winnerPairId: undefined,
          loserPairId: undefined,
        };
      });

      let nextPairs = event.pairs || [];
      if (isRanking) {
        const toAdd = [targetMatch.pair1, targetMatch.pair2].filter(
          (p): p is TournamentPair => Boolean(p && !nextPairs.some((ep) => ep.id === p.id))
        );
        if (toAdd.length > 0) {
          nextPairs = [...nextPairs, ...toAdd.map(minifyPairForStorage)];
        }
      }

      setEvent((prev) => ({ ...prev, matches: nextMatches, pairs: nextPairs }));
      const db = getDb();
      if (db) {
        try {
          await updateEvent(db as Firestore, event.pin, {
            matches: nextMatches,
            pairs: nextPairs,
          });
        } catch (err) {
          console.error('Erro ao reabrir partida no Firestore:', err);
        }
      }
    };

    const renderEntryRow = (entry: TournamentEntry) => {
      const isCurrentUserEntry =
        entry.email?.toLowerCase().trim() === userProfile.email.toLowerCase().trim() ||
        entry.pin?.toLowerCase().trim() === userProfile.pin.toLowerCase().trim();
      const standingKey = (entry.email || entry.pin || '').toLowerCase().trim();
      const standing = isIndividualRanking ? playerStandingsMap.get(standingKey) : null;
      const pair = pairForEntry(entry);
      const isSelected = selectedEntries.has(entry.email || entry.pin || '');
      const partner = pair
        ? ((pair.p1.email && entry.email && pair.p1.email.toLowerCase().trim() === entry.email.toLowerCase().trim()) ||
           (pair.p1.pin && entry.pin && pair.p1.pin.toUpperCase().trim() === entry.pin.toUpperCase().trim())
            ? pair.p2
            : pair.p1)
        : null;

      return (
        <div
          key={entry.email || entry.pin}
          onClick={() => !isSuper8 && toggleCategoryEntrySelection(entry)}
          className={`p-3.5 transition-all ${
            isSelected
              ? isRanking && !pair
                ? 'bg-emerald-100/90 ring-2 ring-inset ring-emerald-500 border-l-4 border-l-emerald-600'
                : 'bg-sky-100/90 ring-2 ring-inset ring-sky-500 border-l-4 border-l-sky-600'
              : isRanking && pair
              ? 'bg-sky-50/40 hover:bg-sky-50/70 border-l-4 border-l-sky-400'
              : isRanking && !pair
              ? 'bg-emerald-50/25 hover:bg-emerald-50/60 border-l-4 border-l-emerald-400'
              : 'odd:bg-white even:bg-emerald-50/30 hover:bg-slate-50'
          } ${!isSuper8 ? 'cursor-pointer' : ''}`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${isCurrentUserEntry ? 'bg-[#4B0082] text-white' : entry.gender === 'F' ? 'bg-pink-50 text-pink-500' : 'bg-sky-50 text-sky-500'}`}>
                <User size={20} fill={isCurrentUserEntry ? 'currentColor' : 'none'} />
              </div>
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  {isIndividualRanking && standing?.rank !== undefined && (
                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${
                      standing.rank === 1
                        ? 'bg-amber-100 text-amber-800 border border-amber-200'
                        : standing.rank === 2
                        ? 'bg-slate-200 text-slate-700 border border-slate-300'
                        : standing.rank === 3
                        ? 'bg-amber-50 text-amber-700 border border-amber-200/80'
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                      {standing.rank === 1 ? '🥇 1º' : standing.rank === 2 ? '🥈 2º' : standing.rank === 3 ? '🥉 3º' : `${standing.rank}º`}
                    </span>
                  )}
                  {pair ? (
                    <span className="font-mono text-sky-800 bg-sky-100 border border-sky-300 px-2 py-0.5 rounded-lg text-[10px] font-black inline-flex items-center gap-1">
                      <Users size={11} /> {pair.teamCode || 'Time formado'}
                    </span>
                  ) : isRanking ? (
                    <span className="text-[10px] font-black text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-lg inline-flex items-center gap-1">
                      <Sparkles size={11} className="text-emerald-600" /> Disponível
                    </span>
                  ) : entry.registrationId && !isSuper8 ? (
                    <span className="font-mono text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded-lg text-[10px] font-black">
                      {formatRegistrationId(entry.registrationId)}
                    </span>
                  ) : null}
                  <p className="text-sm font-black text-slate-900 truncate">
                    {entry.name || entry.nickname}
                    {isCurrentUserEntry && <span className="text-[10px] opacity-40 ml-1">(você)</span>}
                  </p>
                </div>
                <p className="text-[10px] font-bold text-slate-400 uppercase truncate">
                  {(entry.nickname || entry.name).toUpperCase()} - {maskPin(entry.pin)}
                </p>
                {isRanking && partner && (
                  <p className="text-[11px] font-bold text-sky-700 flex items-center gap-1">
                    <UsersRound size={12} /> Parceiro(a): <span className="font-black text-slate-800">{partner.nickname || partner.name}</span>
                  </p>
                )}
                <span className="inline-flex bg-slate-100 text-slate-700 font-black px-2.5 py-0.5 rounded-lg text-[10px] border border-slate-200/60">
                  {category.abbreviation || category.name}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {isSuper8 && (
                <span className="font-mono font-black text-emerald-600 text-sm tracking-wider">
                  {formatRegistrationId(entry.registrationId)}
                </span>
              )}
              <div className={`p-2 rounded-xl border ${entry.gender === 'F' ? 'bg-pink-50 text-pink-500 border-pink-100' : 'bg-sky-50 text-sky-500 border-sky-100'}`}>
                {entry.gender === 'F' ? <VenusIcon /> : <MarsIcon />}
              </div>
            </div>
          </div>

          {isIndividualRanking && standing && categoryMatches.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5">
              <div className="grid grid-cols-2 gap-2 text-xs">
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
                    {standing.tieBreakNote}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      );
    };

    const b1Matches = categoryMatches.filter((m) => m.phase === 'chave1' || m.phase === 'chave 1');
    const b2Matches = categoryMatches.filter((m) => m.phase === 'chave2' || m.phase === 'chave 2');
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

    const hasCategoryMatches = categoryMatches.length > 0;

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

    const brackets = [
      {
        label: bracketTwoPairs.length > 0 ? 'Chave 1' : 'Chave Única',
        list: bracketOneList,
        standingsMap: b1StandingsMap,
        isFinished: b1Finished,
        matchesCount: b1Matches.length,
        finishedCount: b1FinishedCount,
      },
      ...(bracketTwoPairs.length > 0 ? [{
        label: 'Chave 2',
        list: bracketTwoList,
        standingsMap: b2StandingsMap,
        isFinished: b2Finished,
        matchesCount: b2Matches.length,
        finishedCount: b2FinishedCount,
      }] : []),
    ];

    const renderTeamCard = (
      pair: TournamentPair,
      standing?: TeamStanding,
      isChaveFinished = false,
      index = 0
    ) => {
      let finalPositionBadge: string | null = null;
      if (allCatFinished) {
        if (finalMatch?.winnerPairId === pair.id) finalPositionBadge = '🏆 Campeão';
        else if (finalMatch && (finalMatch.pair1Id === pair.id || finalMatch.pair2Id === pair.id)) finalPositionBadge = '🥈 Vice-campeão';
        else if (thirdMatch?.winnerPairId === pair.id) finalPositionBadge = '🥉 3º lugar';
        else if (thirdMatch && (thirdMatch.pair1Id === pair.id || thirdMatch.pair2Id === pair.id)) finalPositionBadge = '4º lugar';
      }

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
          ? (match.pair2 || (match.pair2Id ? pairsById.get(match.pair2Id) : null))
          : (match.pair1 || (match.pair1Id ? pairsById.get(match.pair1Id) : null));
        if (!opp) return 'A definir';
        return `${opp.p1.nickname || opp.p1.name} & ${opp.p2.nickname || opp.p2.name}`;
      };

      const semiMatch = categoryMatches.find(
        (m) => m.phase === 'semifinal' && m.status === 'finished' &&
        (m.pair1Id === pair.id || m.pair2Id === pair.id)
      );
      const wonSemi = semiMatch?.winnerPairId === pair.id;
      const nextMatch = categoryMatches.find(
        (m) => (m.phase === 'final' || m.phase === '3lugar') && m.status === 'finished' &&
        (m.pair1Id === pair.id || m.pair2Id === pair.id)
      );

      const code = pair.teamCode || `${String(pair.teamNumber || index + 1).padStart(3, '0')} - ${category.abbreviation}`;

      return (
        <div key={pair.id} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[15px] font-black text-slate-800 leading-tight">
                  {pair.p1.nickname || pair.p1.name} & {pair.p2.nickname || pair.p2.name}
                </p>
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
                {code}
              </p>

              {/* Informações da fase de chaves */}
              {hasCategoryMatches && (
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

            <span
              className={`rounded-xl px-3 py-1.5 text-xs font-bold border shadow-xs shrink-0 ${
                (pair.bracket ?? 1) === 1
                  ? 'bg-emerald-50/70 text-emerald-700 border-emerald-200'
                  : 'bg-blue-50/70 text-blue-700 border-blue-200'
              }`}
            >
              Chave {pair.bracket ?? 1}
            </span>
          </div>
        </div>
      );
    };

    const renderMatchRow = (match: TournamentMatch) => {
      const pair1 = match.pair1 || (match.pair1Id ? pairsById.get(match.pair1Id) : undefined);
      const pair2 = match.pair2 || (match.pair2Id ? pairsById.get(match.pair2Id) : undefined);
      const live = liveScores[match.id];
      const code = match.matchCode || String(match.matchNumber || 1).padStart(2, '0');
      const isFinished = match.status === 'finished';
      const statusLabel = match.status === 'live' ? 'Ao vivo' : isFinished ? 'Finalizada' : 'Aguardando';
      const statusColor = match.status === 'live'
        ? 'bg-red-50 text-red-600 border-red-100'
        : isFinished
        ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
        : 'bg-slate-100 text-slate-500 border-slate-200';

      const s1Val = match.scores?.[0]?.p1 !== null && match.scores?.[0]?.p1 !== undefined ? match.scores[0].p1 : '';
      const s2Val = match.scores?.[0]?.p2 !== null && match.scores?.[0]?.p2 !== undefined ? match.scores[0].p2 : '';

      return (
        <div key={match.id} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3 pb-3 mb-3 border-b border-slate-100">
            <p className="text-sm font-black text-slate-800">
              [{code}] {isRanking ? 'Ranking' : match.phase ? getPhaseLabel(match.phase) : ''}
            </p>
            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-1 rounded-xl text-[10px] font-black border ${statusColor}`}>{statusLabel}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleUndoMatch(match.id);
                }}
                className="p-1 text-slate-400 hover:text-red-500 rounded-lg active:scale-90 transition-all"
                title="Desfazer/excluir confronto"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="text-xs font-black text-slate-800 leading-tight">
                  {pair1 ? `${pair1.p1.nickname || pair1.p1.name} & ${pair1.p2.nickname || pair1.p2.name}` : match.pair1Label || 'A definir'}
                </p>
                {isFinished && match.winnerPairId === match.pair1Id && (
                  <Trophy size={14} className="text-amber-500 shrink-0" fill="currentColor" />
                )}
              </div>
              <p className="text-[10px] font-bold text-slate-400">{pair1?.teamCode || ''}</p>
            </div>

            <div className="shrink-0 text-center px-1">
              {isRanking ? (
                isFinished ? (
                  <span className="bg-slate-900 text-white px-3.5 py-1.5 rounded-xl text-sm font-black shadow-xs">
                    {match.result || '-'}
                  </span>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="0"
                      value={s1Val}
                      onChange={(e) => handleScoreChange(match.id, 'p1', e.target.value)}
                      placeholder="0"
                      className="w-11 h-10 text-center font-black text-base bg-slate-50 border-2 border-slate-200 focus:border-sky-500 focus:bg-white rounded-xl outline-none"
                    />
                    <span className="text-xs font-black text-slate-400">x</span>
                    <input
                      type="number"
                      min="0"
                      value={s2Val}
                      onChange={(e) => handleScoreChange(match.id, 'p2', e.target.value)}
                      placeholder="0"
                      className="w-11 h-10 text-center font-black text-base bg-slate-50 border-2 border-slate-200 focus:border-sky-500 focus:bg-white rounded-xl outline-none"
                    />
                  </div>
                )
              ) : (
                match.status === 'live' && live ? (
                  <p className="text-lg font-black text-sky-600">{live.p1Score}-{live.p2Score}</p>
                ) : match.status === 'finished' ? (
                  <span className="bg-slate-900 text-white px-3 py-1 rounded-xl text-xs font-black">{match.result || '-'}</span>
                ) : (
                  <span className="text-xs font-black text-slate-300">VS</span>
                )
              )}
            </div>

            <div className="flex-1 min-w-0 text-right">
              <div className="flex items-center justify-end gap-1.5 flex-wrap">
                {isFinished && match.winnerPairId === match.pair2Id && (
                  <Trophy size={14} className="text-amber-500 shrink-0" fill="currentColor" />
                )}
                <p className="text-xs font-black text-slate-800 leading-tight">
                  {pair2 ? `${pair2.p1.nickname || pair2.p1.name} & ${pair2.p2.nickname || pair2.p2.name}` : match.pair2Label || 'A definir'}
                </p>
              </div>
              <p className="text-[10px] font-bold text-slate-400">{pair2?.teamCode || ''}</p>
            </div>
          </div>

          {isRanking && !isFinished && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-[11px] font-black text-slate-500 shrink-0 flex items-center gap-1">
                  <Calendar size={13} className="text-sky-600" /> Data da partida:
                </label>
                <input
                  type="date"
                  value={match.matchDate || ''}
                  onClick={(e) => {
                    try {
                      (e.target as any).showPicker?.();
                    } catch {}
                  }}
                  onChange={(e) => handleMatchDateChange(match.id, e.target.value)}
                  className="flex-1 h-9 text-xs font-bold bg-slate-50 border-2 border-slate-200 focus:border-sky-500 focus:bg-white rounded-xl outline-none px-3 text-slate-700 cursor-pointer"
                />
              </div>
              <button
                type="button"
                onClick={() => handleFinishRankingMatch(match.id)}
                className="w-full py-2 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white rounded-xl font-black text-xs flex items-center justify-center gap-1.5 shadow-xs transition-all"
              >
                <CheckCircle2 size={15} />
                Finalizar partida
              </button>
            </div>
          )}

          {isRanking && isFinished && (
            <div className="mt-2.5 pt-2 border-t border-slate-100 space-y-1.5">
              {match.matchDate && (
                <p className="text-[11px] font-bold text-slate-500 text-center flex items-center justify-center gap-1">
                  <Calendar size={12} className="text-sky-600" />
                  <span>Data: <strong className="text-slate-700">{new Date(match.matchDate + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}</strong></span>
                </p>
              )}
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => handleReopenMatch(match.id)}
                  className="text-[10px] font-bold text-slate-400 hover:text-sky-600 flex items-center gap-1 transition-colors"
                >
                  <RotateCw size={11} /> Reabrir para corrigir placar
                </button>
              </div>
            </div>
          )}
        </div>
      );
    };

    const activeCategoryView = (isChaveEvent && userCategoryView === 'entries') ? 'teams' : userCategoryView;

    return (
      <>
        {/* Barra superior flutuante para Inscritos */}
        {selectedEntries.size > 0 && activeCategoryView === 'entries' && (
          <header className="px-6 py-4 flex items-center justify-between bg-sky-600 text-white fixed top-0 left-0 right-0 z-[70] shadow-lg animate-in slide-in-from-top duration-200">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSelectedEntries(new Set())}
                className="p-1.5 -ml-2 active:scale-90 transition-transform text-white hover:text-sky-100"
                title="Limpar seleção"
              >
                <X size={22} />
              </button>
              <h1 className="text-base font-black text-white">
                {selectedEntries.size} {selectedEntries.size === 1 ? 'Selecionado' : 'Selecionados'}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              {selectedCategoryPair ? (
                <button
                  type="button"
                  onClick={handleFormTeamForCategory}
                  className="flex items-center gap-1.5 bg-red-500 hover:bg-red-600 text-white px-3.5 py-2 rounded-xl text-xs font-black shadow-md active:scale-95 transition-all"
                  title="Desfazer time"
                >
                  <UserRound size={15} />
                  <span>Desfazer time</span>
                </button>
              ) : selectedEntries.size === 2 ? (
                <button
                  type="button"
                  onClick={handleFormTeamForCategory}
                  className={`flex items-center gap-1.5 text-white px-3.5 py-2 rounded-xl text-xs font-black shadow-md active:scale-95 transition-all ${
                    genderValidation.valid
                      ? 'bg-emerald-500 hover:bg-emerald-600'
                      : 'bg-amber-500 hover:bg-amber-600'
                  }`}
                  title={genderValidation.valid ? 'Formar time' : genderValidation.message}
                >
                  {genderValidation.valid ? <UsersRound size={15} /> : <AlertTriangle size={15} />}
                  <span>Formar time</span>
                </button>
              ) : (
                <span className="text-xs font-bold text-sky-100 bg-sky-700/60 px-3 py-1.5 rounded-xl">
                  Selecione +1
                </span>
              )}
            </div>
          </header>
        )}

        {/* Barra superior flutuante para Times */}
        {selectedPairs.size > 0 && activeCategoryView === 'teams' && (
          <header className="px-6 py-4 flex items-center justify-between bg-sky-600 text-white fixed top-0 left-0 right-0 z-[70] shadow-lg animate-in slide-in-from-top duration-200">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSelectedPairs(new Set())}
                className="p-1.5 -ml-2 active:scale-90 transition-transform text-white hover:text-sky-100"
                title="Limpar seleção"
              >
                <X size={22} />
              </button>
              <h1 className="text-base font-black text-white">
                {selectedPairs.size} {selectedPairs.size === 1 ? 'Time Selecionado' : 'Times Selecionados'}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              {selectedPairIds.length === 2 ? (
                existingMatchBetweenTeams ? (
                  <button
                    type="button"
                    onClick={handleFormOrUndoMatchForCategory}
                    className="flex items-center gap-1.5 bg-red-500 hover:bg-red-600 text-white px-3.5 py-2 rounded-xl text-xs font-black shadow-md active:scale-95 transition-all"
                    title="Desfazer partida entre os times selecionados"
                  >
                    <Trash2 size={15} />
                    <span>Desfazer partida</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleFormOrUndoMatchForCategory}
                    className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white px-3.5 py-2 rounded-xl text-xs font-black shadow-md active:scale-95 transition-all"
                    title="Formar partida com os 2 times selecionados"
                  >
                    <UsersRound size={15} />
                    <span>Formar partida</span>
                  </button>
                )
              ) : (
                <span className="text-xs font-bold text-sky-100 bg-sky-700/60 px-3 py-1.5 rounded-xl">
                  Selecione +1 time
                </span>
              )}
            </div>
          </header>
        )}

        <section className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden animate-in fade-in">
          <div className="p-4 border-b border-slate-100">
            <h3 className="text-base font-black text-slate-800">
              {activeCategoryView === 'entries' ? 'Inscritos' : activeCategoryView === 'teams' ? 'Times' : 'Partidas'} ({category.name})
            </h3>
            <p className="text-xs text-slate-400 font-bold mt-0.5">
              {activeCategoryView === 'entries' && isIndividualRanking
                ? 'Classificação individual e estatísticas dos atletas.'
                : activeCategoryView === 'entries'
                ? `${sortedCategoryEntries.length} ${sortedCategoryEntries.length === 1 ? 'inscrito' : 'inscritos'} nesta categoria.`
                : activeCategoryView === 'teams'
                ? `${categoryPairs.length} ${categoryPairs.length === 1 ? 'time formado' : 'times formados'} nesta categoria.`
                : `${categoryMatches.length} ${categoryMatches.length === 1 ? 'partida configurada' : 'partidas configuradas'} nesta categoria.`}
            </p>
          </div>

          {activeCategoryView === 'entries' && isIndividualRanking && (
            <div className="flex items-center justify-between gap-2 px-4 py-3 bg-slate-50 border-b border-slate-100">
              <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 border border-emerald-200/60 px-2.5 py-1 rounded-lg">
                Classificação {isRanking ? 'Ranking' : 'Super 8'}
              </span>
              {currentSuper8RoundLabel && !isRanking && (
                <span className={`text-[10px] font-black px-2.5 py-1 rounded-lg border ${
                  currentSuper8RoundLabel.active
                    ? 'text-sky-700 bg-sky-50 border-sky-200'
                    : 'text-slate-600 bg-slate-100 border-slate-200'
                }`}>
                  {currentSuper8RoundLabel.label}
                </span>
              )}
            </div>
          )}

          {activeCategoryView === 'entries' && (
            sortedCategoryEntries.length === 0
              ? <div className="p-10 text-center text-sm font-bold text-slate-400">Nenhum inscrito nesta categoria.</div>
              : isRanking ? (
                <div>
                  {entriesWithTeam.length > 0 && (
                    <div>
                      <div className="px-4 py-2 bg-sky-50 border-b border-sky-100 flex items-center gap-2">
                        <Users size={13} className="text-sky-600" />
                        <span className="text-[11px] font-black text-sky-700">Em time — aguardando partida ({entriesWithTeam.length})</span>
                      </div>
                      <div className="divide-y divide-sky-100/60">{entriesWithTeam.map(renderEntryRow)}</div>
                    </div>
                  )}
                  {entriesWithoutTeam.length > 0 && (
                    <div>
                      <div className="px-4 py-2 bg-emerald-50 border-b border-emerald-100 border-t border-t-slate-100 flex items-center gap-2">
                        <Sparkles size={13} className="text-emerald-600" />
                        <span className="text-[11px] font-black text-emerald-700">Disponíveis para formar time ({entriesWithoutTeam.length})</span>
                      </div>
                      <div className="divide-y divide-emerald-100/40">{entriesWithoutTeam.map(renderEntryRow)}</div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-slate-100">{sortedCategoryEntries.map(renderEntryRow)}</div>
              )
          )}

          {activeCategoryView === 'teams' && isRanking ? (
            categoryPairs.length === 0 ? (
              <div className="p-10 text-center text-sm font-bold text-slate-400">
                Nenhum time formado no momento. Na aba "Inscritos", selecione 2 atletas disponíveis para formar um time para a partida.
              </div>
            ) : (
              <div className="flex flex-col gap-3 p-4">
                <p className="text-[11px] font-bold text-slate-400">
                  Toque em 2 times para formar partida ou clique na lixeira para desfazer o time.
                </p>
                {categoryPairs.map((pair, index) => {
                  const isSelected = selectedPairs.has(pair.id);
                  // Histórico de partidas finalizadas deste time
                  const teamMatches = categoryMatches.filter(
                    (m) => m.status === 'finished' && (m.pair1Id === pair.id || m.pair2Id === pair.id)
                  );
                  const wins = teamMatches.filter((m) => m.winnerPairId === pair.id).length;
                  const losses = teamMatches.length - wins;

                  return (
                    <div
                      key={pair.id}
                      onClick={() => toggleCategoryTeamSelection(pair.id)}
                      className={`rounded-2xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-sky-50/80 ring-2 ring-inset ring-sky-400 border-sky-300'
                          : 'bg-white border-slate-100 hover:border-slate-300 shadow-sm'
                      }`}
                    >
                      {/* Cabeçalho do time */}
                      <div className="flex items-center justify-between gap-2 p-3.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono text-xs font-black text-sky-800 bg-sky-100 border border-sky-300 px-2 py-0.5 rounded-lg shrink-0">
                            {pair.teamCode || `Time ${index + 1}`}
                          </span>
                          <p className="text-xs font-black text-slate-800 truncate">
                            {pair.p1.nickname || pair.p1.name} & {pair.p2.nickname || pair.p2.name}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {teamMatches.length > 0 && (
                            <span className="text-[10px] font-black text-slate-500 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-lg">
                              {wins}V {losses}D
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUndoPair(pair.id);
                            }}
                            className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg active:scale-90 transition-all"
                            title="Desfazer time"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>

                      {/* Histórico de partidas do time */}
                      {teamMatches.length > 0 && (
                        <div className="border-t border-slate-100 px-3.5 pb-3 pt-2 space-y-1.5">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-wide mb-1">Histórico de partidas</p>
                          {teamMatches.map((m) => {
                            const isWinner = m.winnerPairId === pair.id;
                            const opponent = m.pair1Id === pair.id
                              ? (m.pair2 || categoryPairs.find((p) => p.id === m.pair2Id))
                              : (m.pair1 || categoryPairs.find((p) => p.id === m.pair1Id));
                            // Formatar resultado do ponto de vista do time
                            const resultParts = (m.result || '').split('/');
                            const myScore = m.pair1Id === pair.id ? resultParts[0] : resultParts[1];
                            const oppScore = m.pair1Id === pair.id ? resultParts[1] : resultParts[0];
                            return (
                              <div
                                key={m.id}
                                onClick={(e) => e.stopPropagation()}
                                className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl text-[11px] ${
                                  isWinner ? 'bg-emerald-50 border border-emerald-100' : 'bg-red-50 border border-red-100'
                                }`}
                              >
                                <div className="flex items-center gap-1.5 min-w-0">
                                  {isWinner
                                    ? <Trophy size={11} className="text-emerald-600 shrink-0" />
                                    : <X size={11} className="text-red-400 shrink-0" />
                                  }
                                  <span className={`font-black shrink-0 ${isWinner ? 'text-emerald-700' : 'text-red-500'}`}>
                                    {isWinner ? 'Vitória' : 'Derrota'}
                                  </span>
                                  {opponent && (
                                    <span className="text-slate-500 font-bold truncate">
                                      vs {opponent.p1.nickname || opponent.p1.name} & {opponent.p2.nickname || opponent.p2.name}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="font-black text-slate-700">{myScore || '?'} x {oppScore || '?'}</span>
                                  {m.matchDate && (
                                    <span className="text-slate-400 font-bold">
                                      {new Date(m.matchDate + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          ) : activeCategoryView === 'teams' ? (
            categoryPairs.length === 0 ? (
              <div className="p-10 text-center text-sm font-bold text-slate-400">Nenhum time formado nesta categoria.</div>
            ) : (
              <div className="flex flex-col gap-4 p-4">
                {brackets.map((bracket) => (
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
                        {bracket.list.length} {bracket.list.length === 1 ? 'time' : 'times'}
                      </span>
                    </div>
                    <div className="flex flex-col gap-2">
                      {bracket.list.length === 0 ? (
                        <p className="py-6 text-center text-xs font-bold text-slate-300">Sem times nesta chave.</p>
                      ) : (
                        bracket.list.map((pair, index) =>
                          renderTeamCard(
                            pair,
                            bracket.standingsMap.get(pair.id),
                            bracket.isFinished,
                            index
                          )
                        )
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : null}

          {activeCategoryView === 'matches' && isRanking ? (
            categoryMatches.length === 0 ? (
              <div className="p-10 text-center text-sm font-bold text-slate-400">
                Nenhuma partida gerada para esta categoria. Selecione 2 times na aba "Times" para formar uma partida.
              </div>
            ) : (
              <div className="p-4 space-y-3">
                {categoryMatches.map(renderMatchRow)}
              </div>
            )
          ) : activeCategoryView === 'matches' ? (
            (() => {
              if (categoryMatches.length === 0) {
                return <div className="p-10 text-center text-sm font-bold text-slate-400">Nenhuma partida gerada para esta categoria.</div>;
              }
              // Agrupar por fase/rodada mantendo a ordem original
              const roundGroups: { phase: string; label: string; matches: TournamentMatch[] }[] = [];
              const seenPhases = new Map<string, number>();
              for (const match of categoryMatches) {
                const phase = match.phase || 'rodada1';
                if (seenPhases.has(phase)) {
                  roundGroups[seenPhases.get(phase)!].matches.push(match);
                } else {
                  seenPhases.set(phase, roundGroups.length);
                  roundGroups.push({ phase, label: getPhaseLabel(phase) || phase, matches: [match] });
                }
              }
              return (
                <div className="p-4 space-y-4">
                  {roundGroups.map((group) => (
                    <div key={group.phase} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">{group.label}</span>
                        <div className="flex-1 h-px bg-slate-100" />
                        <span className="text-[10px] font-bold text-slate-400">{group.matches.length} {group.matches.length === 1 ? 'partida' : 'partidas'}</span>
                      </div>
                      <div className="grid grid-cols-1 gap-2">
                        {group.matches.map(renderMatchRow)}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()
          ) : null}
        </section>
      </>
    );
  };

  const handleToggleGender = async (entryEmail: string, currentGender?: 'M' | 'F') => {
    if (!isAdmin && entryEmail !== userProfile.email) return;
    const db = getDb();
    if (!db) return;
    const nextGender = currentGender === 'M' ? 'F' : 'M';
    try {
       await updateEventEntry(db as Firestore, event.pin, entryEmail, { gender: nextGender });
       await updateUserProfileFields(db as Firestore, entryEmail, { gender: nextGender });
       setEntries(prev => prev.map(e => e.email === entryEmail ? { ...e, gender: nextGender } : e));
       if (entryEmail.toLowerCase().trim() === (userProfile.email || '').toLowerCase().trim()) {
         const savedLocal = localStorage.getItem('myPlacarUserProfile');
         if (savedLocal) {
           try {
             const parsed = JSON.parse(savedLocal);
             parsed.gender = nextGender;
             localStorage.setItem('myPlacarUserProfile', JSON.stringify(parsed));
             window.dispatchEvent(new Event('storage'));
           } catch {}
         }
       }
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
          
          // Disparar aviso de exclusão de inscrição confirmada
          try {
            const { eventNotificationService } = await import('../services/eventNotificationService');
            void eventNotificationService.notifyRegistrationDeleted(db as Firestore, event, entryEmail, nickname);
          } catch (notifErr) {
            console.warn('Erro ao disparar aviso de exclusão de inscrição:', notifErr);
          }

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
    const [orderedP1, orderedP2] = orderPairEntriesForMixed(selected[0], selected[1]);
    const newPair: TournamentPair = {
      id: `pair_${Date.now()}`,
      p1: orderedP1,
      p2: orderedP2
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

        <div className="p-5 flex flex-col gap-8">
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

          {isAdmin && (event.matches?.length || 0) > 0 && (
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

          {(!isAdmin || isRanking) && (
            <div className="space-y-4 order-2">
              <div className="flex items-center gap-2 px-1 text-emerald-500 font-black">
                <Trophy size={18} />
                <h3 className="text-sm font-black text-black tracking-tight">
                  {isRanking ? 'Categorias do Ranking' : 'Minhas categorias'}
                </h3>
              </div>
              {userCategories.length === 0 ? (
                <div className="py-10 text-center text-gray-400 font-bold text-sm bg-white rounded-3xl border border-dashed">
                  Nenhuma categoria vinculada à sua inscrição.
                </div>
              ) : (
                <div className="space-y-3">
                  {userCategories.map((cat) => {
                    const inscritosCount = entries.filter((entry) => entry.categoryIds?.includes(cat.id)).length;
                    const timesCount = getCategoryPairs(cat.id).length;
                    const partidasCount = getCategoryMatches(cat.id).length;
                    const isSelectedCategory = userSelectedCategoryId === cat.id;

                    const activeViewForCat = (isChaveEvent && userCategoryView === 'entries') ? 'teams' : userCategoryView;
                    const openUserCategoryPanel = (view: 'entries' | 'teams' | 'matches') => {
                      setSelectedEntries(new Set());
                      setSelectedPairs(new Set());
                      if (isSelectedCategory && activeViewForCat === view) {
                        setUserSelectedCategoryId(null);
                        return;
                      }
                      setUserSelectedCategoryId(cat.id);
                      setUserCategoryView(view);
                    };

                    return (
                      <React.Fragment key={cat.id}>
                        <div
                          onClick={() => {
                            if (isSelectedCategory) {
                              setUserSelectedCategoryId(null);
                            } else {
                              openUserCategoryPanel(isChaveEvent ? 'teams' : 'entries');
                            }
                          }}
                          className={`p-4 rounded-2xl border text-left transition-all space-y-3 w-full cursor-pointer ${
                            isSelectedCategory
                              ? 'border-emerald-400 bg-emerald-50/30 shadow-sm'
                              : 'bg-white border-slate-100 hover:border-emerald-300 hover:shadow-sm shadow-sm'
                          }`}
                        >
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

                            <div className="p-2 bg-slate-100 text-slate-500 rounded-xl">
                              {isSelectedCategory ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                            </div>
                          </div>

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

                          <div className="flex items-center gap-1.5 pt-1 border-t border-slate-100">
                            {!isChaveEvent && (
                              <button
                                type="button"
                                onClick={(event) => { event.stopPropagation(); openUserCategoryPanel('entries'); }}
                                className={`flex items-center gap-1 rounded-lg px-1.5 py-1 text-[10px] font-black transition-colors ${isSelectedCategory && activeViewForCat === 'entries' ? 'bg-emerald-50 text-emerald-600' : 'text-slate-500 hover:bg-slate-50'}`}
                              >
                                <Users size={11} className="text-emerald-500" />
                                <span>{inscritosCount} inscritos</span>
                              </button>
                            )}
                            {event.eventType !== 'Super 8' && (
                              <button
                                type="button"
                                onClick={(event) => { event.stopPropagation(); openUserCategoryPanel('teams'); }}
                                className={`flex items-center gap-1 rounded-lg px-1.5 py-1 text-[10px] font-black transition-colors ${isSelectedCategory && activeViewForCat === 'teams' ? 'bg-blue-50 text-blue-600' : 'text-slate-500 hover:bg-slate-50'}`}
                              >
                                <Trophy size={11} className="text-blue-500" />
                                <span>{timesCount} times</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={(event) => { event.stopPropagation(); openUserCategoryPanel('matches'); }}
                              className={`flex items-center gap-1 rounded-lg px-1.5 py-1 text-[10px] font-black transition-colors ${isSelectedCategory && activeViewForCat === 'matches' ? 'bg-amber-50 text-amber-600' : 'text-slate-500 hover:bg-slate-50'}`}
                            >
                              <Target size={11} className="text-amber-500" />
                              <span>{partidasCount} partidas</span>
                            </button>
                          </div>
                        </div>
                        {isSelectedCategory && renderUserCategoryPanel(cat)}
                      </React.Fragment>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className={`space-y-4 ${isAdmin ? '' : 'order-1'}`}>
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2 text-amber-500 font-black">
                <Users size={20} />
                <h3 className="text-sm font-black text-black tracking-tight">{isAdmin ? 'Participantes oficiais' : 'Minha inscrição'}</h3>
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
            ) : userVisibleEntries.length === 0 ? (
              <div className="py-12 text-center text-gray-400 font-bold text-sm bg-white rounded-3xl border border-dashed">Ninguém inscrito ainda</div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {userVisibleEntries.map((entry: TournamentEntry) => {
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
                                    {entry.registrationId ? (
                                      <span className="font-mono text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded-lg text-[10px] font-black">
                                        {formatRegistrationId(entry.registrationId)}
                                      </span>
                                    ) : null}
                                    <p className="text-sm font-black text-gray-900 truncate">
                                      {entry.name || entry.nickname}
                                      {isCurrentUserEntry && <span className="text-[10px] opacity-40 ml-1">(você)</span>}
                                    </p>
                                  </div>
                                )}
                              </div>
                              <p className="text-[10px] font-bold text-gray-400 uppercase">{(entry.nickname || entry.name).toUpperCase()} - {maskPin(entry.pin)}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {!isAdmin ? (
                              <>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (canManageEntry) {
                                      handleToggleCheckIn(entry.email, entry.checkedIn);
                                    }
                                  }}
                                  disabled={!canManageEntry}
                                  className={`px-3.5 py-2.5 rounded-2xl text-xs font-black transition-all flex items-center gap-1.5 border active:scale-95 ${
                                    entry.checkedIn
                                      ? 'bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-600 shadow-sm'
                                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                                  }`}
                                  title={canManageEntry ? (entry.checkedIn ? 'Confirmar ausência' : 'Fazer check in') : ''}
                                >
                                  <span>check in</span>
                                  {entry.checkedIn && <Check size={14} strokeWidth={3} className="shrink-0" />}
                                </button>

                                {canManageEntry && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setExpandedEntryEmail(prev => prev === entry.email ? null : entry.email);
                                    }}
                                    className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-2xl flex items-center justify-center transition-colors active:scale-95 border border-slate-200"
                                    title="Expandir cadastro de inscrição"
                                  >
                                    {expandedEntryEmail === entry.email ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                  </button>
                                )}
                              </>
                            ) : (
                              <>
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
                              </>
                            )}
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
