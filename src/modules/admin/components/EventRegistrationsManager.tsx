import React, { useState, useEffect } from 'react';
import { Edit2, Trash2, Users, Check, X, CreditCard, DollarSign, Plus, Upload, Paperclip, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { formatRegistrationId, getNextRegistrationId, type TournamentEvent, type TournamentEntry, type EventCategory, type PaymentItem } from '@modules/events/types';
import { getAuthInstance, getDb } from '@infra/firebase';
import { updateUserProfileFields } from '@infra/firebase/users';
import { MarsIcon, VenusIcon } from '@shared/components/GenderIcons';
import { EventRegistrationForm } from '@modules/events/components/EventRegistrationForm';

const formatPhone = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (!digits) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

interface Props {
  event: TournamentEvent;
  onUpdateEntries: (entries: TournamentEntry[]) => void;
  onUpdateEvent: (event: TournamentEvent) => void;
  adminEmail?: string;
  initialExpandedPin?: string | null;
}

export const EventRegistrationsManager: React.FC<Props> = ({
  event,
  onUpdateEntries,
  onUpdateEvent,
  adminEmail,
  initialExpandedPin,
}) => {
  const entries = event.entries || [];
  const categories = event.categories || [];

  const [isAdding, setIsAdding] = useState(false);
  const [editingPin, setEditingPin] = useState<string | null>(null);
  const [expandedRegistrationEmail, setExpandedRegistrationEmail] = useState<string | null>(
    initialExpandedPin || null
  );

  useEffect(() => {
    if (initialExpandedPin) {
      setExpandedRegistrationEmail(initialExpandedPin);
      setIsAdding(false);
      setEditingPin(null);
    }
  }, [initialExpandedPin]);

  // Form State
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [shirtSize, setShirtSize] = useState<'P' | 'M' | 'G'>('M');
  const [partnerName, setPartnerName] = useState('');
  const [partnerEmail, setPartnerEmail] = useState('');
  const [nickname, setNickname] = useState('');
  const [gender, setGender] = useState<'M' | 'F'>('M');
  const [dueAmount, setDueAmount] = useState<number>(event.registrationFee || 0);
  const [paymentStatus, setPaymentStatus] = useState<'Pendente' | 'Confirmado' | 'Pago' | 'Isento'>('Pendente');
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [payments, setPayments] = useState<PaymentItem[]>([]);

  // Novo pagamento sendo adicionado
  const [newPaymentAmount, setNewPaymentAmount] = useState<string>('');
  const [newPaymentDate, setNewPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [newPaymentReceipt, setNewPaymentReceipt] = useState<{ url: string; name: string } | null>(null);

  const totalPaid = payments.reduce((acc, curr) => acc + curr.amount, 0);
  const pendingAmount = Math.max(0, dueAmount - totalPaid);

  // Estado para edição de um pagamento existente no histórico
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);

  const resetForm = () => {
    setName('');
    setPin('');
    setEmail('');
    setPhone('');
    setShirtSize('M');
    setPartnerName('');
    setPartnerEmail('');
    setNickname('');
    setGender('M');
    setDueAmount(event.registrationFee || 0);
    setPaymentStatus('Pendente');
    setSelectedCategoryIds([]);
    setPayments([]);
    setNewPaymentAmount('');
    setNewPaymentDate(new Date().toISOString().split('T')[0]);
    setNewPaymentReceipt(null);
    setEditingPaymentId(null);
    setIsAdding(false);
    setEditingPin(null);
    setExpandedRegistrationEmail(null);
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
    setPhone(entry.phone || '');
    setShirtSize(entry.shirtSize || 'M');
    setPartnerName(entry.partnerName || '');
    setPartnerEmail(entry.partnerEmail || '');
    setNickname(entry.nickname || '');
    setGender(entry.gender || 'M');
    setDueAmount(entry.dueAmount ?? (event.registrationFee || 0));
    setPaymentStatus(entry.paymentStatus || 'Pendente');
    setSelectedCategoryIds(entry.categoryIds || []);
    
    // Migração/inicialização de pagamentos
    if (entry.payments && entry.payments.length > 0) {
      setPayments(entry.payments);
    } else if (entry.paidAmount && entry.paidAmount > 0) {
      setPayments([{ id: 'legacy-1', date: entry.joinedAt || Date.now(), amount: entry.paidAmount }]);
    } else {
      setPayments([]);
    }

    setNewPaymentAmount('');
    setNewPaymentDate(new Date().toISOString().split('T')[0]);
    setNewPaymentReceipt(null);
    setEditingPaymentId(null);
    setIsAdding(true);
  };

  const toggleCategory = (catId: string) => {
    setSelectedCategoryIds((prev) => {
      const next = prev.includes(catId) ? prev.filter((id) => id !== catId) : [...prev, catId];
      const baseFee = event.registrationFee ?? 0;
      const extraFee = event.extraCategoryFee ?? 0;
      if (baseFee > 0 || extraFee > 0) {
        const count = next.length;
        const newDue = count === 0 ? baseFee : baseFee + (count - 1) * extraFee;
        setDueAmount(newDue);
      }
      return next;
    });
  };

  // Clicar em um pagamento no histórico para editar
  const handleEditPaymentItem = (pay: PaymentItem) => {
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

  const handleAddPayment = () => {
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
      // Atualizar pagamento existente
      setPayments((prev) =>
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
      // Adicionar novo pagamento
      const newPay: PaymentItem = {
        id: `pay-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        date: payDate,
        amount: val,
        receiptUrl: newPaymentReceipt?.url,
        receiptFileName: newPaymentReceipt?.name,
      };
      setPayments((prev) => [...prev, newPay]);
    }

    setNewPaymentAmount('');
    setNewPaymentDate(new Date().toISOString().split('T')[0]);
    setNewPaymentReceipt(null);
  };

  const handleCancelEditPayment = () => {
    setEditingPaymentId(null);
    setNewPaymentAmount('');
    setNewPaymentDate(new Date().toISOString().split('T')[0]);
    setNewPaymentReceipt(null);
  };

  const handleRemovePayment = (id: string) => {
    setPayments((prev) => prev.filter((p) => p.id !== id));
    if (editingPaymentId === id) {
      handleCancelEditPayment();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !pin.trim()) return;

    const cleanPin = pin.trim().toUpperCase();
    const cleanEmail = email.trim() || `${cleanPin.toLowerCase()}@myplacar.app`;

    const db = getDb();
    if (db && cleanPin) {
      try {
        await updateUserProfileFields(db, cleanPin, { gender });
      } catch (err) {
        console.warn("Could not update user profile gender directly:", err);
      }
    }

    const calculatedPaidAmount = payments.reduce((acc, curr) => acc + curr.amount, 0);

    const existingRegistrationId = editingPin ? entries.find(e => e.pin === editingPin)?.registrationId : undefined;
    const registrationId = existingRegistrationId || getNextRegistrationId(entries);

    const entryData: TournamentEntry = {
      registrationId,
      name: name.trim(),
      pin: cleanPin,
      email: cleanEmail,
      nickname: nickname.trim() || name.trim(),
      joinedAt: editingPin ? (entries.find(e => e.pin === editingPin)?.joinedAt || Date.now()) : Date.now(),
      gender,
      dueAmount,
      paymentStatus,
      paidAmount: calculatedPaidAmount,
      payments,
      categoryIds: selectedCategoryIds,
      phone: phone.replace(/\D/g, ''),
      shirtSize,
      ...(partnerName.trim() ? { partnerName: partnerName.trim() } : {}),
      ...(partnerEmail.trim() ? { partnerEmail: partnerEmail.trim() } : {}),
    };

    // PERSISTÊNCIA NO FIRESTORE: Salvar na subcoleção de eventos e no registro do participante
    if (db && event.pin) {
      try {
        const { saveAdminEventEntry, saveUserEventRegistration } = await import('@infra/firebase/events');
        await saveAdminEventEntry(db, event.pin, entryData, adminEmail || getAuthInstance()?.currentUser?.email || undefined);
        await saveUserEventRegistration(db, cleanEmail, event.pin, {
          pin: event.pin,
          name: event.name,
          joinedAt: entryData.joinedAt,
          bannerUrl: event.bannerUrl || null,
        });
      } catch (err) {
        console.error("Erro ao salvar inscrição no Firestore:", err);
      }
    }

    let updatedList: TournamentEntry[];
    if (editingPin) {
      updatedList = entries.map((entry) => (entry.pin === editingPin ? entryData : entry));
    } else {
      updatedList = [...entries, entryData];
    }

    onUpdateEntries(updatedList);
    resetForm();
  };

  const handleSaveSharedEntry = async (entryData: TournamentEntry) => {
    const db = getDb();
    const finalEntry: TournamentEntry = {
      ...entryData,
      registrationId: entryData.registrationId || getNextRegistrationId(entries),
    };
    if (db && event.pin) {
      const { saveAdminEventEntry, saveUserEventRegistration } = await import('@infra/firebase/events');
      await saveAdminEventEntry(db, event.pin, finalEntry, adminEmail || getAuthInstance()?.currentUser?.email || undefined);
      // O registro auxiliar não pode impedir a persistência principal da inscrição.
      try {
        await saveUserEventRegistration(db, finalEntry.email, event.pin, { pin: event.pin, name: event.name, joinedAt: finalEntry.joinedAt, bannerUrl: event.bannerUrl || null });
      } catch (error) {
        console.warn('Inscrição salva, mas não foi possível criar o índice auxiliar do usuário:', error);
      }
    }
    const updated = editingPin ? entries.map((item) => item.pin === editingPin ? finalEntry : item) : [...entries, finalEntry];
    onUpdateEntries(updated);
    resetForm();
  };

  const handleSaveExpandedEntry = async (entryData: TournamentEntry, originalPin: string) => {
    const db = getDb();
    const finalEntry: TournamentEntry = {
      ...entryData,
      registrationId: entryData.registrationId || entries.find(e => e.pin === originalPin)?.registrationId || getNextRegistrationId(entries),
    };
    if (db && event.pin) {
      const { saveAdminEventEntry, saveUserEventRegistration } = await import('@infra/firebase/events');
      await saveAdminEventEntry(db, event.pin, finalEntry, adminEmail || getAuthInstance()?.currentUser?.email || undefined);
      try {
        await saveUserEventRegistration(db, finalEntry.email, event.pin, { pin: event.pin, name: event.name, joinedAt: finalEntry.joinedAt, bannerUrl: event.bannerUrl || null });
      } catch (error) {
        console.warn('Inscrição salva, mas não foi possível criar o índice auxiliar do usuário:', error);
      }
    }
    onUpdateEntries(entries.map((item) => item.pin === originalPin ? finalEntry : item));
  };

  const handleDelete = async (targetPin: string) => {
    const targetEntry = entries.find(e => e.pin === targetPin);
    const db = getDb();
    const targetEmailLower = targetEntry?.email?.toLowerCase().trim();

    // Filtrar e desfazer duplas que continham esse participante
    const currentPairs = event.pairs || [];
    const updatedPairs = currentPairs.filter(
      p =>
        p.p1?.pin !== targetPin &&
        p.p2?.pin !== targetPin &&
        (!targetEmailLower || (p.p1?.email?.toLowerCase().trim() !== targetEmailLower && p.p2?.email?.toLowerCase().trim() !== targetEmailLower))
    );

    if (db && event.pin && targetEntry?.email) {
      try {
        const { deleteEventEntry, deleteUserEventRegistration, updateEvent } = await import('@infra/firebase/events');
        await deleteEventEntry(db, event.pin, targetEntry.email);
        await deleteUserEventRegistration(db, targetEntry.email, event.pin);
        
        // Disparar aviso de exclusão de inscrição confirmada para o participante
        try {
          const { eventNotificationService } = await import('../../events/services/eventNotificationService');
          void eventNotificationService.notifyRegistrationDeleted(db, event, targetEntry.email || targetPin, targetEntry.nickname);
        } catch (notifErr) {
          console.warn('Erro ao disparar aviso de exclusão de inscrição no admin:', notifErr);
        }

        // Se havia times formados desfeitos, salvar os novos pairs no Firestore
        if (updatedPairs.length !== currentPairs.length) {
          await updateEvent(db, event.pin, { pairs: updatedPairs });
        }
      } catch (err) {
        console.error("Erro ao excluir inscrição no Firestore:", err);
      }
    }

    const updatedList = entries.filter((entry) => entry.pin !== targetPin);
    onUpdateEntries(updatedList);
    if (updatedPairs.length !== currentPairs.length) {
      onUpdateEvent({ ...event, pairs: updatedPairs, entries: updatedList });
    }
  };

  // Filtro de categorias por gênero no admin
  const availableCategoriesForGender = categories.filter((cat) => {
    if (cat.gender1 && cat.gender1 !== gender) {
      if (!cat.gender2 || cat.gender2 !== gender) {
        return false;
      }
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
        <div>
          <h2 className="text-xl font-black text-slate-800 tracking-tight">Inscrições (participantes oficiais)</h2>
          <p className="text-xs text-slate-400 font-bold mt-0.5">
            Gerencie participantes inscritos, dados financeiros e vínculo de categorias.
          </p>
        </div>
        {!isAdding && (
          <button
            onClick={handleStartAdd}
            className="flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-black text-xs px-5 py-3 rounded-2xl shadow-sm transition-all self-start sm:self-auto"
          >
            Nova inscrição
          </button>
        )}
      </div>

      {/* Registration Form */}
      {isAdding && !editingPin && <EventRegistrationForm
        key={editingPin || 'new-registration'}
        event={event}
        mode="admin"
        entry={editingPin ? entries.find((item) => item.pin === editingPin)! : { name: name.trim(), nickname: nickname.trim(), email: email.trim(), pin: pin.trim(), joinedAt: Date.now(), gender, phone, shirtSize, categoryIds: selectedCategoryIds, dueAmount, paymentStatus, payments }}
        onSave={handleSaveSharedEntry}
        onDelete={editingPin ? () => { if (editingPin) void handleDelete(editingPin); } : undefined}
        onCancel={resetForm}
      />}

      {false && isAdding && (
        <form onSubmit={handleSave} className="bg-white p-6 rounded-3xl border-2 border-emerald-500 shadow-md space-y-5 animate-in slide-in-from-top-4">
          <div className="flex items-center justify-between border-b pb-3">
            <h3 className="font-black text-slate-700 text-sm flex items-center gap-2">
              <Users size={18} className="text-emerald-500" />
              {editingPin ? 'Editar Inscrição' : 'Cadastrar Participante'}
            </h3>
            <div className="flex items-center gap-1">
              {editingPin && (
                <button
                  type="button"
                  onClick={() => { if (editingPin) void handleDelete(editingPin); }}
                  className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                  title="Excluir inscrição"
                >
                  <Trash2 size={18} />
                </button>
              )}
              <button type="button" onClick={resetForm} className="p-1 text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
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
              <label className="text-[10px] font-black text-slate-400 ml-1">E-mail <span className="text-red-500">*</span></label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 font-bold text-xs outline-none focus:border-emerald-500" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 ml-1">Telefone <span className="text-red-500">*</span></label>
              <input type="tel" required inputMode="numeric" value={formatPhone(phone)} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))} placeholder="(11) 91234-9988" className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 font-bold text-xs outline-none focus:border-emerald-500" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 ml-1">Tamanho camiseta <span className="text-red-500">*</span></label>
              <select required value={shirtSize} onChange={(e) => setShirtSize(e.target.value as 'P' | 'M' | 'G')} className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 font-bold text-xs outline-none focus:border-emerald-500"><option value="P">P</option><option value="M">M</option><option value="G">G</option></select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 ml-1">Como quer ser chamado</label>
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="Ex: Celso"
                  className="flex-1 h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 font-bold text-xs outline-none focus:border-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => setGender((prev) => (prev === 'M' ? 'F' : 'M'))}
                  className={`w-11 h-11 rounded-2xl border-2 flex items-center justify-center shrink-0 transition-all active:scale-90 ${
                    gender === 'F'
                      ? 'bg-pink-50 text-pink-600 border-pink-100'
                      : 'bg-sky-50 text-sky-600 border-sky-100'
                  }`}
                  title="Alternar gênero (M / F)"
                >
                  {gender === 'F' ? <VenusIcon size={18} /> : <MarsIcon size={18} />}
                </button>
              </div>
            </div>

            {/* Financeiro */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 ml-1">Valor devido (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={dueAmount}
                  onChange={(e) => setDueAmount(Number(e.target.value))}
                  placeholder="0,00"
                  className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 font-bold text-xs outline-none focus:border-emerald-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>

              <div className="space-y-1 col-span-2">
                <label className="text-[10px] font-black text-slate-400 ml-1">Status do pagamento</label>
                <select
                  value={paymentStatus === 'Pago' ? 'Confirmado' : paymentStatus}
                  onChange={(e) => setPaymentStatus(e.target.value as 'Pendente' | 'Confirmado' | 'Pago' | 'Isento')}
                  className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 font-bold text-xs outline-none focus:border-emerald-500 cursor-pointer"
                >
                  <option value="Pendente">Pendente</option>
                  <option value="Confirmado">Confirmado</option>
                  <option value="Isento">Isento</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 ml-1">Valor pendente (R$)</label>
                <div className="w-full h-11 bg-slate-100/70 border border-slate-200 rounded-xl px-3 flex items-center font-black text-xs text-amber-600">
                  R$ {pendingAmount.toFixed(2)}
                </div>
              </div>
            </div>
          </div>

          {/* Categories Multi-Select (Filtradas por Gênero) */}
          <div className="space-y-2 pt-2">
            <label className="text-[10px] font-black text-slate-400 ml-1">Categorias vinculadas</label>
            {availableCategoriesForGender.length === 0 ? (
              <p className="text-xs text-amber-600 bg-amber-50 p-3 rounded-xl font-bold">
                Nenhuma categoria disponível para o gênero selecionado ({gender === 'F' ? 'Feminino' : 'Masculino'}).
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {availableCategoriesForGender.map((cat) => {
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

          {selectedCategoryIds.some((id) => categories.find((cat) => cat.id === id)?.format === 'Duplas') && <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 ml-1">Informe seu parceiro</label>
            <input type="text" value={partnerName} onChange={(e) => setPartnerName(e.target.value)} className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 font-bold text-xs outline-none focus:border-emerald-500" />
            <input type="email" value={partnerEmail} onChange={(e) => setPartnerEmail(e.target.value)} placeholder="E-mail do parceiro (opcional)" className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 font-bold text-xs outline-none focus:border-emerald-500" />
          </div>}

          {/* Seção de Pagamentos (Abaixo das Categorias, texto Sentence case) */}
          <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/50 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-700">Pagamentos</span>
              <span className="text-xs font-black text-emerald-600">Total pago: R$ {totalPaid.toFixed(2)}</span>
            </div>

            {/* Form de Adicionar/Editar Pagamento */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-slate-500 tracking-wider">
                  {editingPaymentId ? 'Editar pagamento' : 'Novo pagamento'}
                </span>
                <div className="flex items-center gap-2">
                  {editingPaymentId && (
                    <button
                      type="button"
                      onClick={handleCancelEditPayment}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-xl transition-all"
                    >
                      Cancelar edição
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleAddPayment}
                    disabled={!newPaymentAmount || parseFloat(newPaymentAmount.replace(',', '.')) <= 0}
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-black text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-sm disabled:opacity-50"
                  >
                    {editingPaymentId ? <CheckCircle2 size={14} /> : <DollarSign size={14} />}
                    {editingPaymentId ? 'Salvar pagamento' : 'Adicionar pagamento'}
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {/* 1. Valor pago */}
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

                {/* 2. Data do pagamento */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 ml-1">Data do pagamento</label>
                  <input
                    type="date"
                    value={newPaymentDate}
                    onChange={(e) => setNewPaymentDate(e.target.value)}
                    className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 font-bold text-xs outline-none focus:border-emerald-500 cursor-pointer"
                  />
                </div>

                {/* 3. Comprovante */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 ml-1">Comprovante</label>
                  <label className="w-full h-11 bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl px-3 flex items-center justify-between cursor-pointer text-xs text-slate-600 font-bold transition-colors">
                    <div className="flex items-center gap-2 truncate">
                      <DollarSign size={16} className="text-slate-400 shrink-0" />
                          <span className="truncate">{newPaymentReceipt?.name || 'Anexar comprovante...'}</span>
                    </div>
                    <span className="bg-slate-200 text-slate-600 text-[10px] font-black px-2.5 py-1 rounded-lg shrink-0">Buscar</span>
                    <input type="file" accept="image/*,application/pdf" onChange={handleFileUpload} className="hidden" />
                  </label>
                </div>
              </div>
            </div>

            {/* Lista de Pagamentos já registrados (Histórico clicável para edição) */}
            {payments.length > 0 && (
              <div className="space-y-2">
                <span className="text-[10px] font-black text-slate-400 ml-1">Histórico de pagamentos (clique para editar)</span>
                <div className="space-y-2">
                  {payments.map((pay) => {
                    const isSelected = editingPaymentId === pay.id;
                    return (
                      <div
                        key={pay.id}
                        onClick={() => handleEditPaymentItem(pay)}
                        className={`bg-white border rounded-xl p-3 flex items-center justify-between text-xs font-bold transition-all cursor-pointer hover:border-emerald-400 ${
                          isSelected ? 'border-emerald-500 ring-2 ring-emerald-100 bg-emerald-50/30' : 'border-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-slate-400 text-[10px]">{new Date(pay.date).toLocaleDateString('pt-BR')}</span>
                          <span className="font-black text-slate-800">R$ {pay.amount.toFixed(2)}</span>
                          {pay.receiptUrl && (
                            <a
                              href={pay.receiptUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="flex items-center gap-1 text-[10px] text-sky-600 hover:underline bg-sky-50 px-2 py-0.5 rounded-md"
                            >
                              <Paperclip size={12} /> Comprovante
                            </a>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm("Deseja realmente excluir este pagamento do histórico?")) {
                              handleRemovePayment(pay.id);
                            }
                          }}
                          className="p-2 bg-red-50 hover:bg-red-100 text-red-500 rounded-xl transition-all active:scale-90"
                          title="Excluir pagamento"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    );
                  })}
                </div>
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

      {/* Participants List */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        {entries.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <Users className="mx-auto text-slate-300" size={32} />
            <p className="text-sm font-bold text-slate-400">Nenhum participante inscrito ainda.</p>
            <p className="text-xs text-slate-300">Clique em "Nova inscrição" para inscrever um jogador.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {entries.map((entry) => {
              const entryCategories = categories.filter((c) =>
                entry.categoryIds?.includes(c.id)
              );
              const entryPaid = entry.payments?.reduce((acc, p) => acc + p.amount, 0) ?? (entry.paidAmount ?? 0);
              const isExpanded = expandedRegistrationEmail === entry.email;

              return (
                <div
                  key={entry.email || entry.pin}
                  className={`transition-colors ${isExpanded ? 'bg-emerald-50/30' : 'hover:bg-slate-50/70'}`}
                >
                  <div className="p-3.5 sm:p-4 flex items-center justify-between gap-3">
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
                              await updateUserProfileFields(db, entry.email, { gender: nextGender });
                            } catch (err) {
                              console.error('Erro ao alternar gênero:', err);
                            }
                          }
                          onUpdateEntries(
                            entries.map((item) =>
                              (item.email === entry.email || item.pin === entry.pin)
                                ? { ...item, gender: nextGender }
                                : item
                            )
                          );
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
                        <p className="font-black text-sm text-slate-800 tracking-tight truncate">
                          {entry.name || entry.nickname}
                        </p>

                        {/* Linha 2: PIN */}
                        <p className="text-[11px] font-black text-amber-500">
                          PIN: {entry.pin}
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

                        {/* Linha 4: Status do Pagamento + Valores */}
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
                      </div>
                    </div>

                    {/* Lado Direito: Inscrição_ID + Botão de Ação / Chevron */}
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-mono font-black text-emerald-600 text-sm tracking-wider">
                        {formatRegistrationId(entry.registrationId)}
                      </span>

                      <button
                        type="button"
                        onClick={() => {
                          setIsAdding(false);
                          setEditingPin(null);
                          setExpandedRegistrationEmail(isExpanded ? null : entry.email);
                        }}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition-all hover:bg-slate-200 active:scale-90 shadow-sm"
                        title={isExpanded ? 'Fechar cadastro de inscrição' : 'Abrir cadastro de inscrição'}
                      >
                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </button>
                    </div>
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
                            void handleDelete(entry.pin);
                            setExpandedRegistrationEmail(null);
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
      </div>
    </div>
  );
};
