import React, { useMemo, useState } from 'react';
import { CheckCircle2, DollarSign, Eye, Trash2, Upload } from 'lucide-react';
import { MarsIcon, VenusIcon } from '@shared/components/GenderIcons';
import type { EventCategory, PaymentItem, TournamentEntry, TournamentEvent } from '../types';

interface Props {
  event: TournamentEvent;
  entry: TournamentEntry;
  mode: 'admin' | 'user';
  onSave: (entry: TournamentEntry) => Promise<void>;
  onDelete?: () => void;
  onCancel?: () => void;
}

const formatPhone = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (!digits) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

export const EventRegistrationForm: React.FC<Props> = ({ event, entry, mode, onSave, onDelete, onCancel }) => {
  const canEdit = true;
  const isAdmin = mode === 'admin';
  const [nickname, setNickname] = useState(entry.nickname || '');
  const [name, setName] = useState(entry.name || '');
  const [pin, setPin] = useState(entry.pin || '');
  const [email, setEmail] = useState(entry.email || '');
  const [phone, setPhone] = useState(entry.phone || '');
  const [shirtSize, setShirtSize] = useState<'P' | 'M' | 'G'>(entry.shirtSize || 'M');
  const [gender, setGender] = useState<'M' | 'F'>(entry.gender || 'M');
  const [categoryIds, setCategoryIds] = useState<string[]>(entry.categoryIds || []);
  const [partnerName, setPartnerName] = useState(entry.partnerName || '');
  const [partnerEmail, setPartnerEmail] = useState(entry.partnerEmail || '');
  const [payments, setPayments] = useState<PaymentItem[]>(entry.payments || []);
  const [paymentStatus, setPaymentStatus] = useState(entry.paymentStatus || 'Pendente');
  const [dueAmount, setDueAmount] = useState(entry.dueAmount ?? event.registrationFee ?? 0);
  const [newAmount, setNewAmount] = useState('');
  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0]);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [newReceipt, setNewReceipt] = useState<{ url: string; name: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const categories = event.categories || [];
  const availableCategories = useMemo(() => categories.filter((cat) => !cat.gender1 || cat.gender1 === gender || cat.gender2 === gender), [categories, gender]);
  const isDoubles = categoryIds.some((id) => categories.find((cat) => cat.id === id)?.format === 'Duplas');
  const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const calculateDue = (ids: string[]) => {
    const base = event.registrationFee ?? 0;
    const extra = event.extraCategoryFee ?? 0;
    return ids.length === 0 ? base : base + (ids.length - 1) * extra;
  };
  const effectiveDueAmount = isAdmin ? dueAmount : calculateDue(categoryIds);
  const pendingAmount = Math.max(0, effectiveDueAmount - totalPaid);

  const buildEntry = (nextPayments = payments): TournamentEntry => {
    const normalizedName = name.trim();
    const normalizedPin = pin.trim().toUpperCase() || `TEMP${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const updated: TournamentEntry = {
    ...entry,
    name: normalizedName,
    pin: normalizedPin,
    email: email.trim().toLowerCase(),
    nickname: nickname.trim() || entry.nickname,
    phone: phone.replace(/\D/g, ''),
    shirtSize,
    gender,
    categoryIds,
    dueAmount: effectiveDueAmount,
    paymentStatus,
    payments: nextPayments,
    paidAmount: nextPayments.reduce((sum, payment) => sum + payment.amount, 0),
    };
    if (partnerName.trim()) updated.partnerName = partnerName.trim();
    if (partnerEmail.trim()) updated.partnerEmail = partnerEmail.trim();
    return updated;
  };

  const save = async (nextPayments = payments) => {
    if (!name.trim()) {
      setFeedback('Informe o nome do jogador antes de salvar.');
      return;
    }
    if (!nickname.trim()) {
      setFeedback('Informe como o jogador quer ser chamado antes de salvar.');
      return;
    }
    if (!email.trim()) {
      setFeedback('Informe o e-mail antes de salvar.');
      return;
    }
    if (categoryIds.length === 0) {
      setFeedback('Selecione pelo menos uma categoria antes de salvar.');
      return;
    }
    if (isDoubles && !partnerName.trim()) {
      setFeedback('Informe o nome do parceiro para salvar a inscrição.');
      return;
    }
    setIsSaving(true);
    setFeedback(null);
    try {
      const cleanEntry = buildEntry(nextPayments);
      Object.keys(cleanEntry).forEach((key) => {
        if (cleanEntry[key as keyof TournamentEntry] === undefined) {
          delete cleanEntry[key as keyof TournamentEntry];
        }
      });
      await onSave(cleanEntry);
      setFeedback('Inscrição salva com sucesso.');
    } catch (error) {
      console.error('Erro ao salvar inscrição:', error);
      const failure = error as { code?: string; message?: string };
      const message = failure.code === 'permission-denied'
        ? 'Sem permissão para salvar esta inscrição. Verifique seu acesso administrativo.'
        : failure.code === 'already-exists'
          ? 'Já existe uma inscrição com este PIN ou e-mail.'
          : failure.message || 'Não foi possível salvar a inscrição. Confira os campos obrigatórios.';
      setFeedback(message);
    } finally { setIsSaving(false); }
  };

  const addPayment = async () => {
    const amount = Number(newAmount.replace(',', '.'));
    if (!amount || amount <= 0) return;
    const date = new Date(`${newDate}T12:00:00`).getTime();
    const next = editingPaymentId
      ? payments.map((payment) => payment.id === editingPaymentId ? { ...payment, amount, date, receiptUrl: newReceipt?.url || payment.receiptUrl, receiptFileName: newReceipt?.name || payment.receiptFileName } : payment)
      : [...payments, { id: `pay-${Date.now()}`, amount, date, receiptUrl: newReceipt?.url, receiptFileName: newReceipt?.name }];
    setPayments(next);
    setEditingPaymentId(null);
    setNewAmount('');
    setNewReceipt(null);
    await save(next);
  };

  const removePayment = async (id: string) => {
    const next = payments.filter((payment) => payment.id !== id);
    setPayments(next);
    if (editingPaymentId === id) setEditingPaymentId(null);
    await save(next);
  };

  return <div className="space-y-4 text-left">
    {mode === 'user' && (event.information || event.regulationUrl) && <div className="space-y-2">
      {event.information && <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4"><p className="text-[10px] font-black tracking-wider text-sky-600">Informações do evento</p><p className="text-xs font-bold leading-relaxed whitespace-pre-wrap text-slate-700 mt-1">{event.information}</p></div>}
      {event.regulationUrl && <a href={event.regulationUrl} target="_blank" rel="noopener noreferrer" className="w-full h-11 rounded-xl bg-amber-50 border border-amber-100 text-amber-700 font-black text-xs flex items-center justify-center gap-2"><Eye size={15} /> Regulamento</a>}
    </div>}

    <div className="flex items-center justify-between pb-2 border-b border-slate-100"><h4 className="text-sm font-black text-slate-800">{isAdmin ? 'Editar inscrição' : 'Informações de inscrição'}</h4>{onDelete && <button type="button" onClick={onDelete} className="p-1.5 text-slate-400 hover:text-red-500"><Trash2 size={18} /></button>}</div>
    <div className="grid grid-cols-2 gap-3">
      <Field label={isAdmin ? 'Nome jogador *' : 'Nome do usuário'}>{isAdmin ? <input required value={name} onChange={(e) => setName(e.target.value)} className="event-registration-field" /> : <div className="event-registration-readonly">{entry.name}</div>}</Field>
      <Field label="PIN do usuário">{isAdmin ? <input value={pin} onChange={(e) => setPin(e.target.value)} placeholder="Opcional" className="event-registration-field uppercase" /> : <div className="event-registration-readonly">{entry.pin}</div>}</Field>
      <Field label="E-mail *" className="col-span-2"><input type="email" required value={email} readOnly={!isAdmin} onChange={(e) => setEmail(e.target.value)} className="event-registration-field" /></Field>
    </div>
    <Field label="Telefone *"><input type="tel" required inputMode="numeric" value={formatPhone(phone)} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))} placeholder="(11) 91234-9988" pattern="[(][0-9]{2}[)] [0-9]{4,5}-[0-9]{4}" className="event-registration-field" /></Field>
    <Field label="Tamanho camiseta *"><select required value={shirtSize} onChange={(e) => setShirtSize(e.target.value as 'P' | 'M' | 'G')} className="event-registration-field"><option value="P">P</option><option value="M">M</option><option value="G">G</option></select></Field>
    <Field label="Como quer ser chamado *"><div className="flex gap-2"><input required value={nickname} onChange={(e) => setNickname(e.target.value)} className="event-registration-field flex-1" /><button type="button" onClick={() => setGender(gender === 'M' ? 'F' : 'M')} className={`w-11 rounded-xl border flex items-center justify-center ${gender === 'F' ? 'bg-pink-50 text-pink-600 border-pink-100' : 'bg-sky-50 text-sky-600 border-sky-100'}`}>{gender === 'F' ? <VenusIcon size={18} /> : <MarsIcon size={18} />}</button></div></Field>

    <div className="grid grid-cols-2 gap-2"><Field label="Valor devido"><input type="number" value={effectiveDueAmount} disabled={!isAdmin} onChange={(e) => setDueAmount(Number(e.target.value))} className="event-registration-field" /></Field><Field label="Valor pendente"><div className="event-registration-readonly text-amber-600">R$ {pendingAmount.toFixed(2)}</div></Field><Field label="Status do pagamento" className="col-span-2">{isAdmin ? <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value as typeof paymentStatus)} className="event-registration-field"><option>Pendente</option><option>Pago</option><option>Isento</option></select> : <div className="event-registration-readonly">{paymentStatus}</div>}</Field></div>

    <Field label="Categorias vinculadas"><div className="flex flex-wrap gap-2">{availableCategories.map((cat: EventCategory) => <button type="button" key={cat.id} onClick={() => setCategoryIds((ids) => { const next = ids.includes(cat.id) ? ids.filter((id) => id !== cat.id) : [...ids, cat.id]; setDueAmount(calculateDue(next)); return next; })} className={`px-3 py-1.5 rounded-xl text-xs font-black border ${categoryIds.includes(cat.id) ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>{cat.name} ({cat.abbreviation})</button>)}</div></Field>
    {isDoubles && <Field label="Informe seu parceiro *"><div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-3 space-y-2"><input required value={partnerName} onChange={(e) => setPartnerName(e.target.value)} placeholder="Nome do parceiro" className="event-registration-field bg-white" /><input type="email" value={partnerEmail} onChange={(e) => setPartnerEmail(e.target.value)} placeholder="E-mail do parceiro (opcional)" className="event-registration-field bg-white" /></div></Field>}

    <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/50 space-y-4">
      <div className="flex items-center justify-between"><span className="text-xs font-black text-slate-700">Pagamentos</span><span className="text-xs font-black text-emerald-600">Total pago: R$ {totalPaid.toFixed(2)}</span></div>
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between"><span className="text-[10px] font-black text-slate-500">{editingPaymentId ? 'Editar pagamento' : 'Novo pagamento'}</span><button type="button" onClick={addPayment} disabled={!newAmount || isSaving} className="px-4 py-2 bg-emerald-500 text-white font-black text-xs rounded-xl flex items-center gap-1.5 disabled:opacity-50"><DollarSign size={14} /> {editingPaymentId ? 'Salvar pagamento' : 'Adicionar pagamento'}</button></div>
        <Field label="Valor do pagamento (R$)"><input type="number" step="0.01" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} className="event-registration-field" /></Field>
        <Field label="Data do pagamento"><input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="event-registration-field" /></Field>
        <Field label="Comprovante"><label className="event-registration-field flex items-center justify-between cursor-pointer"><span className="flex items-center gap-2 truncate"><Upload size={16} className="text-slate-400" />{newReceipt?.name || 'Anexar comprovante...'}</span><span className="bg-slate-200 text-slate-600 text-[10px] font-black px-2.5 py-1 rounded-lg">Buscar</span><input type="file" accept="image/*,application/pdf" onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => setNewReceipt({ url: String(reader.result), name: file.name }); reader.readAsDataURL(file); }} className="hidden" /></label></Field>
      </div>
      {payments.length > 0 && <div className="space-y-2"><p className="text-[10px] font-black text-slate-400">Histórico de pagamentos</p>{payments.map((payment) => <div key={payment.id} className="w-full bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-between text-xs font-bold"><button type="button" onClick={() => { setEditingPaymentId(payment.id); setNewAmount(String(payment.amount)); const date = new Date(payment.date); setNewDate(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`); setNewReceipt(payment.receiptUrl ? { url: payment.receiptUrl, name: payment.receiptFileName || 'Comprovante' } : null); }} className="flex items-center gap-3 text-left"><span>{new Date(payment.date).toLocaleDateString('pt-BR')}</span><span>R$ {payment.amount.toFixed(2)}</span></button><div className="flex items-center gap-2"><button type="button" disabled={!payment.receiptUrl} onClick={() => payment.receiptUrl && window.open(payment.receiptUrl, '_blank', 'noopener,noreferrer')} className="text-sky-600 disabled:text-slate-300" title="Abrir comprovante"><Eye size={16} /></button><button type="button" onClick={() => void removePayment(payment.id)} className="text-red-500" title="Excluir pagamento"><Trash2 size={16} /></button></div></div>)}</div>}
    </div>
    {feedback && <p className={`text-xs font-bold ${feedback.includes('sucesso') ? 'text-emerald-600' : 'text-red-600'}`}>{feedback}</p>}
    <div className="flex gap-3"><button type="button" onClick={() => save()} disabled={isSaving} className="flex-1 py-3 bg-emerald-500 text-white font-black text-xs rounded-xl"><CheckCircle2 size={16} className="inline mr-1" /> Salvar inscrição</button>{onCancel && <button type="button" onClick={onCancel} className="px-5 py-3 bg-slate-100 text-slate-600 font-bold text-xs rounded-xl">Cancelar</button>}</div>
  </div>;
};

const Field: React.FC<{ label: string; children: React.ReactNode; className?: string }> = ({ label, children, className = '' }) => <div className={`space-y-1 ${className}`}><label className="text-[10px] font-black text-slate-400 ml-1">{label}</label>{children}</div>;
