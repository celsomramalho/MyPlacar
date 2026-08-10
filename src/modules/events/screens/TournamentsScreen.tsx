
import React, { useState, useEffect, useMemo } from 'react';
import { Search, Trophy, Calendar, Ticket, Loader2, ChevronRight, Menu, MapPin, Zap, X, CheckCircle2, Tag, DollarSign } from 'lucide-react';
import { getDb } from '@infra/firebase';
import type { Firestore } from 'firebase/firestore';
import { fetchActiveEvents } from '../services/fetchActiveEvents';
import { fetchEventByPin, fetchEventEntries } from '@infra/firebase/events';
import type { EventCategory, EventRegistration, PaymentItem, TournamentEvent } from '../types';
import type { UserProfile } from '@modules/auth/types';

// Inline gender icons
const MarsIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="10" cy="14" r="5" /><line x1="19" y1="5" x2="14.14" y2="9.86" /><polyline points="19 5 19 5 14 5 14 5" /><polyline points="19 5 19 10" />
  </svg>
);
const VenusIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="9" r="5" /><line x1="12" y1="14" x2="12" y2="21" /><line x1="9" y1="18" x2="15" y2="18" />
  </svg>
);

const formatPhone = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (!digits) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

interface PreJoinForm {
  nickname: string;
  gender: 'M' | 'F';
  selectedCategoryIds: string[];
  phone: string;
  shirtSize: 'P' | 'M' | 'G' | '';
  partnerName: string;
  partnerEmail: string;
}

interface Props {
  registrations: EventRegistration[];
  onBack: () => void;
  onJoin: (pin: string, profileOverride?: { nickname: string; gender: 'M' | 'F'; categoryIds?: string[]; phone: string; shirtSize: 'P' | 'M' | 'G'; partnerName?: string; partnerEmail?: string; payments?: PaymentItem[]; dueAmount?: number; paidAmount?: number; paymentStatus?: 'Pendente' | 'Pago' | 'Isento' }) => void;
  onSelectEvent: (event: EventRegistration) => void;
  onOpenMenu: () => void;
  userProfile?: UserProfile;
}

export const TournamentsScreen: React.FC<Props> = ({ registrations, onBack, onJoin, onSelectEvent, onOpenMenu, userProfile }) => {
  const [pinInput, setPinInput] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [joiningPin, setJoiningPin] = useState<string | null>(null);
  const [activeEvents, setActiveEvents] = useState<TournamentEvent[]>([]);
  const [isLoadingActive, setIsLoadingActive] = useState(true);

  // Pre-join form state
  const [pendingEvent, setPendingEvent] = useState<TournamentEvent | null>(null);
  const [pendingPin, setPendingPin] = useState<string | null>(null);
  const [preJoinForm, setPreJoinForm] = useState<PreJoinForm>({ nickname: '', gender: 'M', selectedCategoryIds: [], phone: '', shirtSize: '', partnerName: '', partnerEmail: '' });
  const [partnerOptions, setPartnerOptions] = useState<Array<{ email: string; name: string; pin: string }>>([]);
  const [showPartnerOptions, setShowPartnerOptions] = useState(false);

  // Payment state for player pre-join modal
  const [playerPayments, setPlayerPayments] = useState<PaymentItem[]>([]);
  const [newPaymentAmount, setNewPaymentAmount] = useState<string>('');
  const [newPaymentDate, setNewPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [newPaymentReceipt, setNewPaymentReceipt] = useState<{ url: string; name: string } | null>(null);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);



  const resetPlayerPayments = () => {
    setPlayerPayments([]);
    setNewPaymentAmount('');
    setNewPaymentDate(new Date().toISOString().split('T')[0]);
    setNewPaymentReceipt(null);
    setEditingPaymentId(null);
  };

  const handleAddPlayerPayment = () => {
    const val = parseFloat(newPaymentAmount.replace(',', '.'));
    if (isNaN(val) || val <= 0) return;

    let payDate = Date.now();
    if (newPaymentDate) {
      const [year, month, day] = newPaymentDate.split('-').map(Number);
      if (year && month && day) {
        payDate = new Date(year, month - 1, day, 12, 0, 0).getTime();
      }
    }

    if (editingPaymentId) {
      setPlayerPayments((prev) =>
        prev.map((p) =>
          p.id === editingPaymentId
            ? {
                ...p,
                date: payDate,
                amount: val,
                receiptUrl: newPaymentReceipt?.url,
                receiptFileName: newPaymentReceipt?.name,
              }
            : p
        )
      );
      setEditingPaymentId(null);
    } else {
      const newPay: PaymentItem = {
        id: `pay-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        date: payDate,
        amount: val,
        receiptUrl: newPaymentReceipt?.url,
        receiptFileName: newPaymentReceipt?.name,
      };
      setPlayerPayments((prev) => [...prev, newPay]);
    }

    setNewPaymentAmount('');
    setNewPaymentDate(new Date().toISOString().split('T')[0]);
    setNewPaymentReceipt(null);
  };

  const handleEditPlayerPayment = (pay: PaymentItem) => {
    setEditingPaymentId(pay.id);
    setNewPaymentAmount(pay.amount.toString());
    const dateObj = new Date(pay.date);
    const yyyy = dateObj.getFullYear();
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const dd = String(dateObj.getDate()).padStart(2, '0');
    setNewPaymentDate(`${yyyy}-${mm}-${dd}`);
    if (pay.receiptUrl) {
      setNewPaymentReceipt({ url: pay.receiptUrl, name: pay.receiptFileName || 'Comprovante' });
    } else {
      setNewPaymentReceipt(null);
    }
  };

  const handleRemovePlayerPayment = (id: string) => {
    setPlayerPayments((prev) => prev.filter((p) => p.id !== id));
    if (editingPaymentId === id) {
      setEditingPaymentId(null);
      setNewPaymentAmount('');
      setNewPaymentDate(new Date().toISOString().split('T')[0]);
      setNewPaymentReceipt(null);
    }
  };

  const handlePlayerFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setNewPaymentReceipt({
          url: event.target.result as string,
          name: file.name,
        });
      }
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    let isMounted = true;
    const loadActiveEvents = async () => {
      const db = getDb();
      if (!db) { setIsLoadingActive(false); return; }
      try {
        const events = await fetchActiveEvents(db as Firestore);
        if (isMounted) setActiveEvents(events);
      } catch (err) {
        console.error('Erro ao carregar eventos ativos:', err);
      } finally {
        if (isMounted) setIsLoadingActive(false);
      }
    };
    loadActiveEvents();
    return () => { isMounted = false; };
  }, []);

  // Open pre-join form for a known event card
  const handleRequestJoinEvent = async (ev: TournamentEvent) => {
    const db = getDb();
    const freshEvent = db ? await fetchEventByPin(db as Firestore, ev.pin) : null;
    setPendingEvent((freshEvent as TournamentEvent | null) || ev);
    setPendingPin(null);
    setPreJoinForm({ nickname: userProfile?.nickname || '', gender: userProfile?.gender || 'M', selectedCategoryIds: [], phone: formatPhone(userProfile?.phone || ''), shirtSize: '', partnerName: '', partnerEmail: '' });
    resetPlayerPayments();
  };

  // Open pre-join form for a PIN-typed join
  const handleRequestJoinPin = async () => {
    const targetPin = pinInput.trim();
    if (!targetPin) return;
    setPendingPin(targetPin);
    const db = getDb();
    const event = db ? await fetchEventByPin(db as Firestore, targetPin) : null;
    setPendingEvent(event as TournamentEvent | null);
    setPreJoinForm({ nickname: userProfile?.nickname || '', gender: userProfile?.gender || 'M', selectedCategoryIds: [], phone: formatPhone(userProfile?.phone || ''), shirtSize: '', partnerName: '', partnerEmail: '' });
    resetPlayerPayments();
  };

  const handleCancelPreJoin = () => { setPendingEvent(null); setPendingPin(null); resetPlayerPayments(); };

  const toggleCategory = (id: string) => {
    setPreJoinForm((f) => ({
      ...f,
      selectedCategoryIds: f.selectedCategoryIds.includes(id)
        ? f.selectedCategoryIds.filter((c) => c !== id)
        : [...f.selectedCategoryIds, id],
    }));
  };

  const handleLocatePartner = async () => {
    if (!pendingEvent) return;
    const db = getDb();
    if (!db) return;
    const selectedIds = preJoinForm.selectedCategoryIds;
    const list = await fetchEventEntries(db as Firestore, pendingEvent.pin);
    setPartnerOptions(list.filter((entry) => entry.email !== userProfile?.email && entry.categoryIds?.some((id) => selectedIds.includes(id))).map((entry) => ({ email: entry.email, name: entry.nickname || entry.name, pin: entry.pin })));
    setShowPartnerOptions(true);
  };

  // Calculate registration fee based on categories selected and event fee config
  const calculatedFee = useMemo(() => {
    if (!pendingEvent) return null;
    const base = pendingEvent.registrationFee ?? 0;
    const extra = pendingEvent.extraCategoryFee ?? 0;
    const count = preJoinForm.selectedCategoryIds.length;
    if (count === 0) return base;
    return base + (count - 1) * extra;
  }, [pendingEvent, preJoinForm.selectedCategoryIds]);

  const totalPaidPlayer = useMemo(() => playerPayments.reduce((acc, curr) => acc + curr.amount, 0), [playerPayments]);
  const pendingAmountPlayer = useMemo(() => {
    const fee = calculatedFee ?? pendingEvent?.registrationFee ?? 0;
    return Math.max(0, fee - totalPaidPlayer);
  }, [calculatedFee, pendingEvent, totalPaidPlayer]);

  // Confirm join
  const handleConfirmJoin = async () => {
    const targetPin = pendingEvent ? pendingEvent.pin : pendingPin;
    if (!targetPin) return;
    setJoiningPin(targetPin);
    setIsSearching(true);
    // Capture computed values before clearing state
    const feeSnapshot = calculatedFee ?? pendingEvent?.registrationFee ?? 0;
    const paidSnapshot = totalPaidPlayer;
    setPendingEvent(null);
    setPendingPin(null);
    await onJoin(targetPin, {
      nickname: preJoinForm.nickname,
      gender: preJoinForm.gender,
      categoryIds: preJoinForm.selectedCategoryIds,
      phone: preJoinForm.phone.replace(/\D/g, ''),
      shirtSize: preJoinForm.shirtSize as 'P' | 'M' | 'G',
      partnerName: preJoinForm.partnerName || undefined,
      partnerEmail: preJoinForm.partnerEmail || undefined,
      payments: [...playerPayments],
      dueAmount: feeSnapshot,
      paidAmount: paidSnapshot,
      paymentStatus: 'Pendente',
    });
    setIsSearching(false);
    setJoiningPin(null);
    setPinInput('');
    resetPlayerPayments();
  };

  const registeredPins = new Set(registrations.map((r) => r.pin.toUpperCase()));
  const availableEvents = activeEvents.filter((ev) => !registeredPins.has(ev.pin.toUpperCase()));

  const showPreJoin = pendingEvent !== null || pendingPin !== null;
  const preJoinEventName = pendingEvent?.name ?? `Evento PIN: ${pendingPin}`;
  const eventCategories: EventCategory[] = useMemo(() => {
    const allCats = pendingEvent?.categories ?? [];
    return allCats.filter((cat) => {
      const g = preJoinForm.gender;
      if (cat.gender1 && cat.gender1 !== g) {
        if (!cat.gender2 || cat.gender2 !== g) {
          return false;
        }
      }
      return true;
    });
  }, [pendingEvent?.categories, preJoinForm.gender]);
  const selectedDoubles = eventCategories.some((cat) => preJoinForm.selectedCategoryIds.includes(cat.id) && cat.format === 'Duplas');

  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden animate-in fade-in duration-300 font-sans">
      <header className="px-6 py-4 flex items-center bg-white border-b border-gray-100 sticky top-0 z-40 min-h-[72px]">
        <button onClick={onOpenMenu} className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-700 active:scale-95 transition-all">
          <Menu size={20} />
        </button>
        <div className="flex-1 flex items-center justify-center gap-2">
          <Trophy size={22} className="text-amber-500 stroke-[2.5]" />
          <h1 className="text-lg font-black text-black tracking-tight">Meus torneios</h1>
        </div>
        <div className="w-10"></div>
      </header>

      <div className="flex-1 overflow-y-auto p-5 space-y-8 no-scrollbar pb-6">

        {/* BUSCAR EVENTO POR PIN */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <Search size={18} className="text-amber-500" />
            <h3 className="text-sm font-black text-black tracking-tight">Localizar torneios</h3>
          </div>
          <div className="bg-white rounded-[2rem] p-4 shadow-sm border border-gray-100 flex gap-2">
            <input
              type="text"
              placeholder="Digite o PIN do evento"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRequestJoinPin()}
              className="flex-1 h-14 bg-gray-50 border border-gray-100 rounded-2xl px-4 font-black text-sm outline-none focus:ring-2 focus:ring-amber-500/20"
            />
            <button
              onClick={handleRequestJoinPin}
              disabled={isSearching || !pinInput}
              className="bg-amber-500 text-white px-6 rounded-2xl font-black text-xs uppercase active:scale-95 shadow-md flex items-center justify-center disabled:opacity-50"
            >
              {isSearching && joiningPin && joiningPin === pinInput.trim() ? <Loader2 size={20} className="animate-spin" /> : 'Entrar'}
            </button>
          </div>
        </div>

        {/* TORNEIOS DISPONÍVEIS */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <Zap size={18} className="text-emerald-600" />
            <h3 className="text-sm font-black text-black tracking-tight">Torneios disponíveis</h3>
          </div>

          {isLoadingActive ? (
            <div className="py-8 bg-white rounded-[2rem] border border-gray-100 flex flex-col items-center justify-center gap-2 text-slate-400">
              <Loader2 size={24} className="animate-spin text-emerald-500" />
              <span className="text-xs font-bold">Buscando torneios disponíveis...</span>
            </div>
          ) : availableEvents.length === 0 ? (
            <div className="py-8 bg-white rounded-[2rem] border border-dashed border-slate-200 text-center">
              <p className="text-slate-400 font-bold text-xs">Nenhum novo torneio disponível no momento.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {availableEvents.map((ev) => {
                const isJoiningThis = isSearching && joiningPin === ev.pin;
                return (
                  <button
                    key={ev.pin}
                    onClick={() => handleRequestJoinEvent(ev)}
                    disabled={isSearching}
                    className="w-full bg-white rounded-[2rem] p-5 shadow-sm border border-emerald-100/60 hover:border-emerald-300 flex items-center justify-between active:scale-[0.98] transition-all group text-left"
                  >
                    <div className="flex items-center gap-4 flex-1 min-w-0 pr-2">
                      <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 shadow-inner shrink-0">
                        <Trophy size={24} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-gray-900 mb-1 truncate">{ev.name}</p>
                        <div className="flex flex-wrap items-center gap-3 text-slate-400 text-[10px] font-bold">
                          {ev.location && (
                            <div className="flex items-center gap-1">
                              <MapPin size={12} /><span className="truncate">{ev.location}</span>
                            </div>
                          )}
                          {ev.eventDateText && (
                            <div className="flex items-center gap-1">
                              <Calendar size={12} /><span>{ev.eventDateText}</span>
                            </div>
                          )}
                          <span className="bg-amber-50 text-amber-600 font-black px-2 py-0.5 rounded-md uppercase">PIN: {ev.pin}</span>
                          {(ev.registrationFee ?? 0) > 0 && (
                            <span className="bg-emerald-50 text-emerald-600 font-black px-2 py-0.5 rounded-md">
                              R$ {ev.registrationFee?.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0 pl-2">
                      {isJoiningThis ? (
                        <Loader2 size={20} className="animate-spin text-emerald-500" />
                      ) : (
                        <span className="bg-emerald-500 text-white text-[11px] font-black uppercase px-3 py-1.5 rounded-xl group-hover:bg-emerald-600 transition-colors">
                          Inscrever-se
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* MINHAS INSCRIÇÕES */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <Ticket size={18} className="text-blue-500" />
            <h3 className="text-sm font-black text-black tracking-tight">Minhas inscrições</h3>
          </div>

          {registrations.length === 0 ? (
            <div className="py-12 bg-white rounded-[2.5rem] border border-dashed border-slate-200 text-center space-y-2">
              <p className="text-slate-400 font-bold text-sm">Nenhum torneio localizado ainda.</p>
              <p className="text-[10px] text-slate-300 font-medium italic">Inscreva-se acima ou use o PIN fornecido pela organização.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {registrations.map((reg) => {
                const { pin, name, joinedAt } = reg;
                return (
                  <button
                    key={pin}
                    onClick={() => onSelectEvent(reg)}
                    className="w-full bg-white rounded-[2rem] p-5 shadow-sm border border-gray-100 flex items-center justify-between active:scale-[0.98] transition-all group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-500 shadow-inner">
                        <Trophy size={24} />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-black text-gray-900 mb-1">{name}</p>
                        <div className="flex items-center gap-1.5 text-slate-400">
                          <Calendar size={12} />
                          <p className="text-[10px] font-bold">Inscrito em {new Date(joinedAt).toLocaleDateString('pt-BR')}</p>
                        </div>
                      </div>
                    </div>
                    <ChevronRight size={20} className="text-gray-300 group-hover:text-amber-500 transition-colors" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ──────────────────────────────────────────────────
          PRE-JOIN BOTTOM SHEET
      ────────────────────────────────────────────────── */}
      {showPreJoin && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={handleCancelPreJoin}
          />

          {/* Sheet */}
          <div className="relative bg-white rounded-t-[2.5rem] shadow-2xl animate-in slide-in-from-bottom duration-300 flex flex-col max-h-[90vh]">
            
            {/* Header fixo */}
            <div className="px-6 pt-6 pb-4 flex items-center justify-between border-b border-slate-100 shrink-0">
              <div>
                <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Confirmar inscrição</p>
                <h2 className="text-base font-black text-slate-900 leading-tight mt-0.5">{preJoinEventName}</h2>
              </div>
              <button
                onClick={handleCancelPreJoin}
                className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 active:scale-90 transition-all"
              >
                <X size={18} />
              </button>
            </div>

            {/* Corpo scrollável */}
            <div className="overflow-y-auto px-6 py-5 space-y-5 no-scrollbar">

              {pendingEvent?.information && <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4 space-y-1"><p className="text-[10px] font-black tracking-wider text-sky-600">Informações do evento</p><p className="text-xs font-bold leading-relaxed whitespace-pre-wrap text-slate-700">{pendingEvent.information}</p></div>}
              {pendingEvent?.regulationUrl && <a href={pendingEvent.regulationUrl} target="_blank" rel="noopener noreferrer" className="w-full h-11 rounded-xl bg-amber-50 border border-amber-100 text-amber-700 font-black text-xs flex items-center justify-center">Regulamento</a>}

              {/* Nome completo (somente leitura) */}
              {userProfile?.name && (
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 ml-1">Nome do Usuário</label>
                  <div className="h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 flex items-center">
                    <span className="text-xs font-bold text-slate-500">{userProfile.name}</span>
                  </div>
                </div>
              )}

              {/* PIN do usuário (somente leitura) */}
              {userProfile?.pin && (
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 ml-1">PIN do Usuário</label>
                  <div className="h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 flex items-center">
                    <span className="text-xs font-black text-slate-500 uppercase tracking-widest">{userProfile.pin}</span>
                  </div>
                </div>
              )}

              {/* Como quer ser chamado + gênero (mesma linha) */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 ml-1">Como quer ser chamado</label>
                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={preJoinForm.nickname}
                    onChange={(e) => setPreJoinForm((f) => ({ ...f, nickname: e.target.value }))}
                    placeholder="Ex: Celso"
                    className="flex-1 h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 font-bold text-xs outline-none focus:border-emerald-500"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setPreJoinForm((f) => ({ ...f, gender: f.gender === 'M' ? 'F' : 'M' }))}
                    className={`w-11 h-11 rounded-2xl border-2 flex items-center justify-center shrink-0 transition-all active:scale-90 ${
                      preJoinForm.gender === 'F'
                        ? 'bg-pink-50 text-pink-600 border-pink-100'
                        : 'bg-sky-50 text-sky-600 border-sky-100'
                    }`}
                    title="Alternar gênero (M / F)"
                  >
                    {preJoinForm.gender === 'F' ? <VenusIcon /> : <MarsIcon />}
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 ml-1">
                  Gênero:{' '}
                  <span className={`font-black ${preJoinForm.gender === 'F' ? 'text-pink-500' : 'text-sky-500'}`}>
                    {preJoinForm.gender === 'F' ? 'Feminino (F)' : 'Masculino (M)'}
                  </span>
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 ml-1">E-mail <span className="text-red-500">*</span></label>
                <input type="email" required value={userProfile?.email || ''} readOnly className="w-full h-11 bg-slate-100 border border-slate-200 rounded-xl px-3 font-bold text-xs text-slate-500" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 ml-1">Telefone <span className="text-red-500">*</span></label>
                <input type="tel" required inputMode="numeric" value={preJoinForm.phone} onChange={(e) => setPreJoinForm((f) => ({ ...f, phone: formatPhone(e.target.value) }))} placeholder="(11) 91234-9988" pattern="[(][0-9]{2}[)] [0-9]{4,5}-[0-9]{4}" className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 font-bold text-xs outline-none focus:border-emerald-500" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 ml-1">Tamanho camiseta <span className="text-red-500">*</span></label>
                <select required value={preJoinForm.shirtSize} onChange={(e) => setPreJoinForm((f) => ({ ...f, shirtSize: e.target.value as PreJoinForm['shirtSize'] }))} className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 font-bold text-xs outline-none focus:border-emerald-500"><option value="">Selecione</option><option value="P">P</option><option value="M">M</option><option value="G">G</option></select>
              </div>

              {selectedDoubles && <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 ml-1">Informe seu parceiro</label>
                <input type="text" value={preJoinForm.partnerName} onChange={(e) => setPreJoinForm((f) => ({ ...f, partnerName: e.target.value, partnerEmail: '' }))} placeholder="Nome do parceiro" className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 font-bold text-xs outline-none focus:border-emerald-500" />
                <button type="button" onClick={handleLocatePartner} className="w-full h-10 rounded-xl bg-sky-50 text-sky-700 font-black text-xs flex items-center justify-center gap-2"><Search size={15} /> Localize seu parceiro</button>
                {showPartnerOptions && <div className="space-y-2 rounded-xl border border-slate-200 p-2 bg-slate-50"><p className="text-[10px] font-black text-slate-400">Inscritos na categoria</p>{partnerOptions.length === 0 ? <p className="text-xs text-slate-400 p-2">Nenhum parceiro encontrado.</p> : partnerOptions.map((partner) => <button type="button" key={partner.email} onClick={() => { setPreJoinForm((f) => ({ ...f, partnerName: partner.name, partnerEmail: partner.email })); setShowPartnerOptions(false); }} className="w-full text-left p-2 rounded-lg bg-white border border-slate-200 text-xs font-bold">{partner.name} <span className="text-slate-400">({partner.pin})</span></button>)}</div>}
              </div>}

              {/* Valor devido, valor pendente e status do pagamento */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 ml-1 truncate block">Valor devido</label>
                  <div className="h-11 bg-slate-50 border border-slate-200 rounded-xl px-2 flex items-center font-black text-xs text-slate-800">
                    R$ {(calculatedFee ?? pendingEvent?.registrationFee ?? 0).toFixed(2)}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 ml-1 truncate block">Valor pendente</label>
                  <div className="h-11 bg-slate-100/70 border border-slate-200 rounded-xl px-2 flex items-center font-black text-xs text-amber-600">
                    R$ {pendingAmountPlayer.toFixed(2)}
                  </div>
                </div>
                <div className="space-y-1 col-span-2">
                  <label className="text-[10px] font-black text-slate-400 ml-1 truncate block">Status do pagamento</label>
                  <div className="h-11 bg-slate-100 border border-slate-200 rounded-xl px-2 flex items-center font-bold text-xs text-slate-400 cursor-not-allowed">
                    Pendente
                  </div>
                </div>
              </div>

              {/* Categorias */}
              {eventCategories.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Tag size={13} className="text-slate-400" />
                    <label className="text-[10px] font-black text-slate-400">Categorias vinculadas</label>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {eventCategories.map((cat) => {
                      const isSelected = preJoinForm.selectedCategoryIds.includes(cat.id);
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => toggleCategory(cat.id)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all border ${
                            isSelected
                              ? 'bg-emerald-500 text-white border-emerald-500 shadow-sm'
                              : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          {cat.name} ({cat.abbreviation})
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Seção de Pagamentos — funcional e idêntico ao Admin */}
              <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/50 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-700">Pagamentos</span>
                  <span className="text-xs font-black text-emerald-600">Total pago: R$ {totalPaidPlayer.toFixed(2)}</span>
                </div>

                {/* Form de adicionar/editar pagamento */}
                <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-slate-500 tracking-wider">
                      {editingPaymentId ? 'Editar pagamento' : 'Novo pagamento'}
                    </span>
                    <div className="flex items-center gap-2">
                      {editingPaymentId && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingPaymentId(null);
                            setNewPaymentAmount('');
                            setNewPaymentDate(new Date().toISOString().split('T')[0]);
                            setNewPaymentReceipt(null);
                          }}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-xl transition-all"
                        >
                          Cancelar edição
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleAddPlayerPayment}
                        disabled={!newPaymentAmount || parseFloat(newPaymentAmount.replace(',', '.')) <= 0}
                        className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-black text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-sm disabled:opacity-50"
                      >
                        {editingPaymentId ? <CheckCircle2 size={14} /> : <DollarSign size={14} />}
                        {editingPaymentId ? 'Salvar pagamento' : 'Adicionar pagamento'}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 ml-1">Valor do pagamento (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0,00"
                        value={newPaymentAmount}
                        onChange={(e) => setNewPaymentAmount(e.target.value)}
                        className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 font-bold text-xs outline-none focus:border-emerald-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 ml-1">Data do pagamento</label>
                      <input
                        type="date"
                        value={newPaymentDate}
                        onChange={(e) => setNewPaymentDate(e.target.value)}
                        className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 font-bold text-xs outline-none focus:border-emerald-500 cursor-pointer"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 ml-1">Comprovante</label>
                      <label className="w-full h-11 bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl px-3 flex items-center justify-between cursor-pointer text-xs text-slate-600 font-bold transition-colors">
                        <div className="flex items-center gap-2 truncate">
                          <DollarSign size={16} className="text-slate-400 shrink-0" />
                          <span className="truncate">{newPaymentReceipt ? newPaymentReceipt.name : 'Anexar comprovante...'}</span>
                        </div>
                        <span className="bg-slate-200 text-slate-600 text-[10px] font-black px-2.5 py-1 rounded-lg shrink-0">Buscar</span>
                        <input type="file" accept="image/*,application/pdf" onChange={handlePlayerFileUpload} className="hidden" />
                      </label>
                    </div>
                  </div>
                </div>

                {/* Histórico de pagamentos clicável */}
                {playerPayments.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-[10px] font-black text-slate-400 ml-1">Histórico de pagamentos (clique para editar)</span>
                    <div className="space-y-2">
                      {playerPayments.map((pay) => {
                        const isSelected = editingPaymentId === pay.id;
                        return (
                          <div
                            key={pay.id}
                            onClick={() => handleEditPlayerPayment(pay)}
                            className={`bg-white border rounded-xl p-3 flex items-center justify-between text-xs font-bold transition-all cursor-pointer hover:border-emerald-400 ${
                              isSelected ? 'border-emerald-500 ring-2 ring-emerald-100 bg-emerald-50/30' : 'border-slate-200'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-slate-400 text-[10px]">{new Date(pay.date).toLocaleDateString('pt-BR')}</span>
                              <span className="font-black text-slate-800">R$ {pay.amount.toFixed(2)}</span>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (window.confirm('Deseja realmente excluir este pagamento?')) {
                                  handleRemovePlayerPayment(pay.id);
                                }
                              }}
                              className="p-2 bg-red-50 hover:bg-red-100 text-red-500 rounded-xl transition-all active:scale-90"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Botão fixo no rodapé */}
            <div className="px-6 pb-8 pt-4 border-t border-slate-100 shrink-0">
              <button
                onClick={handleConfirmJoin}
                disabled={!preJoinForm.nickname.trim() || isSearching}
                className="w-full py-4 bg-emerald-500 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all disabled:opacity-50"
              >
                {isSearching ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
                Confirmar inscrição
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
