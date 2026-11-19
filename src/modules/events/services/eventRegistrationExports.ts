import { collection, getDocs } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import type { EventCategory, TournamentEntry, TournamentEvent } from '@modules/events/types';
import { getDb } from '@infra/firebase';

const dateValue = (value: any): Date | null => {
  if (typeof value === 'number') return new Date(value);
  if (value instanceof Date) return value;
  if (value && typeof value.toDate === 'function') return value.toDate();
  return null;
};

const eventFileName = (event: TournamentEvent) =>
  (event.name || event.pin).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || event.pin;

const actionNames: Record<string, string> = {
  registration_created: 'Inscrição criada', registration_updated: 'Inscrição alterada',
  registration_deleted: 'Inscrição excluída', team_formed: 'Time formado',
  team_dissolved: 'Time desfeito', team_updated: 'Time alterado', checkin_changed: 'Check-in alterado',
};

const fieldNames: Record<string, string> = {
  '$registration': 'Inscrição', categoryIds: 'Categorias', categoryPartners: 'Parceiros por categoria',
  partnerName: 'Parceiro', partnerEmail: 'E-mail do parceiro', partnerPhone: 'Telefone do parceiro',
  paymentStatus: 'Status do pagamento', payments: 'Pagamentos/anexos', dueAmount: 'Valor devido',
  paidAmount: 'Valor pago', checkedIn: 'Check-in', checkInDate: 'Data do check-in',
  checkInDates: 'Datas de check-in', disabled: 'Inscrição ativa', disabledReason: 'Motivo da desativação', pair: 'Time/parceiro',
};

const paymentStatusLabel = (value: unknown): string => {
  const status = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  if (['approved', 'confirmado', 'pago'].includes(status)) return 'Confirmado';
  if (['pending', 'pendente', 'aguardando confirmacao'].includes(status)) return 'Pendente';
  if (['rejected', 'recusado'].includes(status)) return 'Recusado';
  if (['cancelled', 'canceled', 'cancelado'].includes(status)) return 'Cancelado';
  if (['refunded', 'devolvido'].includes(status)) return 'Devolvido';
  if (status === 'isento') return 'Isento';
  return value ? String(value) : 'Não informado';
};

const personName = (person: any) => person?.name || person?.nickname || person?.email || person?.pin || 'Atleta';

const auditValue = (field: string, value: any, categories: EventCategory[]): string => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (field === 'categoryIds' && Array.isArray(value)) return value.map((id) => categories.find((category) => category.id === id)?.name || String(id)).join(', ') || '—';
  if (field === 'categoryPartners' && typeof value === 'object') {
    return Object.entries(value).map(([categoryId, partner]: [string, any]) => `${categories.find((item) => item.id === categoryId)?.name || categoryId}: ${[partner?.name, partner?.email, partner?.phone].filter(Boolean).join(' / ') || 'parceiro não identificado'}`).join('; ') || '—';
  }
  if (field === 'payments' && Array.isArray(value)) return value.map((payment: any) => `R$ ${Number(payment?.amount || 0).toFixed(2)} (${payment?.date ? new Date(payment.date).toLocaleDateString('pt-BR') : 'data não informada'}; ${payment?.status || 'status não informado'}; ${payment?.receipt ? `comprovante: ${payment.receiptName || 'anexado'}` : 'sem comprovante'})`).join('; ') || '—';
  if (field === 'pair' && typeof value === 'object') return [[value.p1, value.p2].filter(Boolean).map(personName).join(' + ') || JSON.stringify(value), categories.find((item) => item.id === value.categoryId)?.name].filter(Boolean).join(' · ');
  if (Array.isArray(value)) return value.map((item) => typeof item === 'object' ? JSON.stringify(item) : String(item)).join(', ') || '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

export const exportEventActivities = async (event: TournamentEvent) => {
  if (!event.pin) throw new Error('Evento sem PIN.');
  const db = getDb();
  if (!db) throw new Error('O banco de dados não está disponível.');
  const [logSnapshot, entrySnapshot] = await Promise.all([
    getDocs(collection(db, 'events', event.pin, 'audit_logs')),
    getDocs(collection(db, 'events', event.pin, 'entries')),
  ]);
  if (logSnapshot.empty) throw new Error('Ainda não há atividades registradas para exportar neste evento.');
  const entries = new Map(entrySnapshot.docs.map((doc) => [String(doc.data().email || doc.id).toLowerCase().trim(), doc.data() as TournamentEntry]));
  const logs = logSnapshot.docs.map((doc): Record<string, any> & { id: string } => ({ id: doc.id, ...doc.data() }));
  logs.sort((a, b) => (dateValue(a.createdAt)?.getTime() || 0) - (dateValue(b.createdAt)?.getTime() || 0));
  const rows = logs.map((activity) => {
    const entry = entries.get(String(activity.registrationEmail || '').toLowerCase().trim());
    const fields: string[] = Array.isArray(activity.changedFields) ? activity.changedFields : [];
    const details = fields.map((field) => field === '$registration'
      ? `${fieldNames[field]}: ${actionNames[activity.action] || activity.action || 'alterada'}`
      : `${fieldNames[field] || field}: ${auditValue(field, activity.before?.[field], event.categories || [])} → ${auditValue(field, activity.after?.[field], event.categories || [])}`);
    const date = dateValue(activity.createdAt);
    return {
      'Data e hora': date ? date.toLocaleString('pt-BR') : 'Data indisponível',
      'Inscrição ID': activity.registrationId ?? entry?.registrationId ?? '',
      Atleta: activity.participantName || entry?.name || entry?.nickname || '',
      'E-mail do atleta': activity.registrationEmail || entry?.email || '',
      Atividade: activity.summary || actionNames[activity.action] || activity.action || 'Alteração na inscrição',
      Responsável: activity.actorEmail || (activity.source === 'legacy_notice' ? 'Não identificado (aviso antigo)' : 'Sistema'),
      'Perfil do responsável': activity.actorRole === 'admin_or_coadmin' ? 'Admin/co-admin' : activity.actorRole === 'event_helper' ? 'Auxiliar do evento' : activity.actorRole === 'athlete' ? 'Atleta' : 'Sistema/não identificado',
      'Campos e alterações': details.join(' | ') || activity.summary || 'Detalhes não registrados',
      Origem: activity.source === 'legacy_notice' ? 'Aviso antigo (histórico parcial)' : activity.source || 'Não identificada',
      'ID do registro': activity.id,
    };
  });
  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet['!cols'] = [{ wch: 20 }, { wch: 14 }, { wch: 28 }, { wch: 32 }, { wch: 28 }, { wch: 32 }, { wch: 25 }, { wch: 80 }, { wch: 30 }, { wch: 34 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Atividades');
  XLSX.writeFile(workbook, `${eventFileName(event)}_atividades_${new Date().toISOString().slice(0, 10)}.xlsx`);
};

export const exportEventRegistrationsAndReceipts = async (event: TournamentEvent) => {
  if (!event.pin) throw new Error('Evento sem PIN.');
  const db = getDb();
  if (!db) throw new Error('O banco de dados não está disponível.');
  const snapshot = await getDocs(collection(db, 'events', event.pin, 'entries'));
  const entries = snapshot.docs.map((doc) => ({ ...doc.data() as TournamentEntry, email: doc.data().email || doc.id }));
  if (!entries.length) throw new Error('Não há inscrições registradas neste evento para exportar.');
  const categories = event.categories || [];
  const sorted = [...entries].sort((a, b) => String(a.name || a.nickname || '').localeCompare(String(b.name || b.nickname || ''), 'pt-BR'));
  const getCategories = (entry: TournamentEntry) => (entry.categoryIds || []).map((id) => categories.find((category) => category.id === id)?.name || id);
  const registrations = sorted.map((entry) => ({
    'Inscrição ID': entry.registrationId ?? '', Atleta: entry.name || entry.nickname || '', 'E-mail do atleta': entry.email || '',
    Telefone: entry.phone || '', Gênero: entry.gender === 'F' ? 'Feminino' : entry.gender === 'M' ? 'Masculino' : 'Não informado',
    Categorias: getCategories(entry).join(', ') || 'Sem categoria registrada',
  }));
  const receipts = sorted.flatMap((entry) => {
    const stored = Array.isArray(entry.payments) ? entry.payments : [];
    const payments = stored.length ? stored : (entry as any).receiptUrl ? [{
      id: `legacy-${entry.registrationId || entry.email}`, date: entry.joinedAt, amount: entry.paidAmount ?? entry.dueAmount ?? 0,
      receiptUrl: (entry as any).receiptUrl, status: entry.paymentStatus,
    }] : [];
    return payments.filter((payment) => Boolean(payment.receiptUrl)).map((payment) => {
      const date = dateValue(payment.date);
      return {
        'Inscrição ID': entry.registrationId ?? '', Atleta: entry.name || entry.nickname || '', 'E-mail do atleta': entry.email || '',
        Categorias: getCategories(entry).join(', ') || 'Sem categoria registrada',
        Data: date ? date.toLocaleDateString('pt-BR') : 'Data indisponível', Hora: date ? date.toLocaleTimeString('pt-BR') : 'Hora indisponível',
        Valor: Number(payment.amount || 0), 'Status do pagamento': paymentStatusLabel(payment.status || entry.paymentStatus),
      };
    });
  });
  const workbook = XLSX.utils.book_new();
  const registrationsSheet = XLSX.utils.json_to_sheet(registrations);
  registrationsSheet['!cols'] = [{ wch: 14 }, { wch: 30 }, { wch: 34 }, { wch: 20 }, { wch: 18 }, { wch: 50 }];
  XLSX.utils.book_append_sheet(workbook, registrationsSheet, 'Inscritos e categorias');
  const headers = ['Inscrição ID', 'Atleta', 'E-mail do atleta', 'Categorias', 'Data', 'Hora', 'Valor', 'Status do pagamento'];
  const receiptsSheet = XLSX.utils.aoa_to_sheet([headers, ...receipts.map((row) => headers.map((header) => row[header as keyof typeof row] ?? ''))]);
  receiptsSheet['!cols'] = [{ wch: 14 }, { wch: 30 }, { wch: 34 }, { wch: 50 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 24 }];
  for (let row = 1; row <= receipts.length; row += 1) {
    const cell = XLSX.utils.encode_cell({ r: row, c: 6 });
    if (receiptsSheet[cell]) receiptsSheet[cell].z = 'R$ #,##0.00';
  }
  XLSX.utils.book_append_sheet(workbook, receiptsSheet, 'Comprovantes (dados)');
  XLSX.writeFile(workbook, `${eventFileName(event)}_inscritos_comprovantes_${new Date().toISOString().slice(0, 10)}.xlsx`);
};
