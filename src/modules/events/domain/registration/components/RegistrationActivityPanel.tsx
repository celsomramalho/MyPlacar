import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where, type Firestore } from 'firebase/firestore';
import { History, ChevronDown, ChevronUp } from 'lucide-react';
import { getDb } from '@infra/firebase';
import type { EventCategory, TournamentEntry } from '@modules/events/types';

interface AuditEvent {
  id: string;
  action?: string;
  actorEmail?: string | null;
  actorRole?: string;
  changedFields?: string[];
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  summary?: string;
  source?: string;
  createdAt?: { toDate?: () => Date } | number;
}

const fieldNames: Record<string, string> = {
  '$registration': 'Inscrição criada/removida',
  categoryIds: 'Categorias',
  categoryPartners: 'Parceiros por categoria',
  partnerName: 'Parceiro',
  partnerEmail: 'E-mail do parceiro',
  partnerPhone: 'Telefone do parceiro',
  paymentStatus: 'Status do pagamento',
  payments: 'Pagamentos/anexos',
  dueAmount: 'Valor devido',
  paidAmount: 'Valor pago',
  checkedIn: 'Check-in',
  checkInDate: 'Data do check-in',
  checkInDates: 'Datas de check-in',
  disabled: 'Inscrição ativa',
  pair: 'Time/parceiro',
};

const actionNames: Record<string, string> = {
  registration_created: 'Inscrição criada',
  registration_updated: 'Inscrição alterada',
  registration_deleted: 'Inscrição excluída',
  team_formed: 'Time formado',
  team_dissolved: 'Time desfeito',
  team_updated: 'Time alterado',
  checkin_changed: 'Check-in alterado',
};

const displayValue = (value: unknown) => {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (Array.isArray(value)) return value.length ? value.map((item) => typeof item === 'object' ? JSON.stringify(item) : String(item)).join(', ') : '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const displayFieldValue = (field: string, value: unknown, categories: EventCategory[]) => {
  if (field === 'categoryIds' && Array.isArray(value)) {
    return value.map((id) => categories.find((category) => category.id === id)?.name || String(id)).join(', ') || '—';
  }
  if (field === 'categoryPartners' && value && typeof value === 'object') {
    return Object.entries(value as Record<string, any>).map(([categoryId, partner]) =>
      `${categories.find((category) => category.id === categoryId)?.name || categoryId}: ${partner?.name || 'parceiro'}${partner?.email ? ` (${partner.email})` : ''}`,
    ).join('; ') || '—';
  }
  if (field === 'payments' && Array.isArray(value)) {
    return value.map((payment: any) => {
      const date = payment.date ? new Date(payment.date).toLocaleDateString('pt-BR') : 'data não informada';
      const receipt = payment.receipt ? `comprovante: ${payment.receiptName || 'anexado'}` : 'sem comprovante';
      return `R$ ${Number(payment.amount || 0).toFixed(2)} (${date}, ${payment.status || 'status não informado'}, ${receipt})`;
    }).join('; ') || '—';
  }
  return displayValue(value);
};

const dateValue = (value: AuditEvent['createdAt']) => {
  if (typeof value === 'number') return new Date(value);
  return value?.toDate?.() || null;
};

export const RegistrationActivityPanel: React.FC<{ eventPin: string; entry: TournamentEntry; categories: EventCategory[] }> = ({ eventPin, entry, categories }) => {
  const [expanded, setExpanded] = useState(false);
  const [activities, setActivities] = useState<AuditEvent[]>([]);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const db = getDb() as Firestore | null;
    const email = entry.email?.toLowerCase().trim();
    if (!db || !eventPin || !email) return;
    const activityQuery = query(collection(db, 'events', eventPin, 'audit_logs'), where('registrationEmail', '==', email));
    return onSnapshot(activityQuery, (snapshot) => {
      setActivities(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as AuditEvent)).sort((a, b) => {
        const at = dateValue(a.createdAt)?.getTime() || 0;
        const bt = dateValue(b.createdAt)?.getTime() || 0;
        return bt - at;
      }));
      setLoadError(false);
    }, () => setLoadError(true));
  }, [eventPin, entry.email]);

  return (
    <section className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <button type="button" onClick={() => setExpanded((value) => !value)} className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-50">
        <span className="flex items-center gap-2 text-xs font-black text-slate-700"><History size={15} /> Atividades <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">{activities.length}</span></span>
        {expanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
      </button>
      {expanded && (
        <div className="border-t border-slate-100 px-4 py-3">
          {loadError ? <p className="text-xs font-semibold text-rose-600">Não foi possível carregar o histórico.</p> : activities.length === 0 ? <p className="text-xs text-slate-400">Nenhuma atividade registrada para esta inscrição.</p> : (
            <ol className="space-y-3">
              {activities.map((activity) => {
                const date = dateValue(activity.createdAt);
                return <li key={activity.id} className="border-l-2 border-sky-200 pl-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className="text-xs font-black text-slate-800">{activity.summary || actionNames[activity.action || ''] || activity.action || 'Alteração na inscrição'}</p>
                    <time className="text-[10px] font-semibold text-slate-400">{date ? date.toLocaleString('pt-BR') : 'Data indisponível'}</time>
                  </div>
                  <p className="mt-0.5 text-[10px] text-slate-500">{activity.actorEmail || (activity.source === 'legacy_notice' ? 'Aviso histórico (autor não identificado)' : 'Sistema')} · {activity.source === 'legacy_notice' ? 'reconstruído de aviso' : activity.actorRole === 'athlete' ? 'atleta' : activity.actorRole === 'admin_or_coadmin' ? 'admin/co-admin' : activity.actorRole === 'event_helper' ? 'auxiliar do evento' : 'sistema'}</p>
                  {activity.source === 'legacy_notice' ? <p className="mt-1 whitespace-pre-wrap text-[11px] text-slate-600">{activity.summary}</p> : (activity.changedFields || []).filter((field) => field !== '$registration').map((field) => <p key={field} className="mt-1 break-words text-[11px] text-slate-600"><strong>{fieldNames[field] || field}:</strong> {field === 'pair' ? `${displayValue((activity.before as any)?.p1?.name || (activity.before as any)?.p1?.nickname)} + ${displayValue((activity.before as any)?.p2?.name || (activity.before as any)?.p2?.nickname)} → ${displayValue((activity.after as any)?.p1?.name || (activity.after as any)?.p1?.nickname)} + ${displayValue((activity.after as any)?.p2?.name || (activity.after as any)?.p2?.nickname)}` : `${displayFieldValue(field, activity.before?.[field], categories)} → ${displayFieldValue(field, activity.after?.[field], categories)}`}</p>)}
                </li>;
              })}
            </ol>
          )}
        </div>
      )}
    </section>
  );
};
