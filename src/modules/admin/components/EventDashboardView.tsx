import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Tag,
  Users,
  Trophy,
  DollarSign,
  CheckCircle2,
  Award,
  ShieldAlert,
  Menu,
  Search,
  X,
} from 'lucide-react';
import type { TournamentEvent, EventCategory, TournamentEntry, EventSponsor } from '@modules/events/types';
import type { FirebaseAdminSportIcon } from '@infra/firebase/adminIcons';
import { EVENT_CONFIG_BLOCKS } from './events/EventConfigForm';
import { EventCategoriesManager } from './EventCategoriesManager';
import { EventRegistrationsManager } from './EventRegistrationsManager';
import { EventFormedTeamsView } from './EventFormedTeamsView';
import { EventSponsorsManager } from './EventSponsorsManager';
import { EventPaymentsView } from './EventPaymentsView';
import { calculateQueueState } from '@modules/events/domain/queue';
import { isCoAdminOfEvent, isEventHelper, isJudgeOfEvent, isPrimaryAdminEmail } from '@modules/events/services/eventAdminAccess';
import { entryHasFinishedMatchOnDate, getTodayDateStr, isEntryCheckedInToday, isTournamentPeriodActive } from '@modules/events/services/eventRegistrationPeriod';
import { getEventPaymentStats } from '@modules/events/services/eventPaymentStats';
import { saveAdminEventCheckIn } from '@infra/firebase/events';
import { getSearchInputStyles } from '@shared/utils/searchInputStyle';
import { CheckInStatusButton } from '@shared/components/CheckInStatusButton';

export type EventDashboardTab =
  | 'categories'
  | 'registrations'
  | 'formed-teams'
  | 'pending-payments'
  | 'checkins'
  | 'sponsors';

interface Props {
  event: TournamentEvent;
  activeSports: FirebaseAdminSportIcon[];
  adminEmail?: string;
  adminPin?: string;
  onBackToEvents: () => void;
  onEditEventConfig: (initialBlock?: string) => void;
  onUpdateEvent: (updatedEvent: TournamentEvent) => void;
}

export const EventDashboardView: React.FC<Props> = ({
  event,
  activeSports,
  adminEmail,
  adminPin,
  onBackToEvents,
  onEditEventConfig,
  onUpdateEvent,
}) => {
  const blockMenuRef = React.useRef<HTMLDivElement>(null);
  const [isBlockMenuOpen, setIsBlockMenuOpen] = useState(false);
  const [savingCheckInEmail, setSavingCheckInEmail] = useState<string | null>(null);
  const [checkInSearchQuery, setCheckInSearchQuery] = useState('');
  const [isArrivedCheckInsExpanded, setIsArrivedCheckInsExpanded] = useState(false);
  const [isPendingCheckInsExpanded, setIsPendingCheckInsExpanded] = useState(false);


  // Fecha menu de blocos ao clicar fora
  React.useEffect(() => {
    if (!isBlockMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (blockMenuRef.current && !blockMenuRef.current.contains(e.target as Node)) {
        setIsBlockMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isBlockMenuOpen]);

  const [activeTab, setActiveTab] = useState<EventDashboardTab>(() => {
    if (!isPrimaryAdminEmail(adminEmail) && !isCoAdminOfEvent(event, adminPin) && !isEventHelper(event, adminPin) && isJudgeOfEvent(event, adminPin)) return 'formed-teams';
    try {
      const targetTab = sessionStorage.getItem('admin_target_dashboard_tab');
      if (targetTab) {
        sessionStorage.removeItem('admin_target_dashboard_tab');
        return targetTab as EventDashboardTab;
      }
    } catch {}
    return 'categories';
  });
  const [targetRegistrationEmail, setTargetRegistrationEmail] = useState<string | null>(null);

  const categories = event.categories || [];
  const entries = event.entries || [];
  const pairs = event.pairs || [];
  const sponsors = event.sponsors || [];

  const queueState = calculateQueueState(event);
  const { freeCourtsCount, busyCourtsCount, interdictedCourtsCount } = queueState;

  const paymentStats = getEventPaymentStats(event);
  const {
    totalDue,
    totalPaid,
    totalAwaiting,
    totalPre,
    totalRefused,
    totalToRefund,
    totalRefunded,
    paidCount,
    awaitingReceiptsCount,
    preCount: preRegistrationCount,
    refusedReceiptsCount,
    toRefundReceiptsCount,
    refundedReceiptsCount,
    exemptCount,
    totalReceiptsCount,
  } = paymentStats;

  // Opção 1: Quantidade total de comprovantes anexados no evento
  const pendingPaymentsCount = totalReceiptsCount;

  const todayStr = getTodayDateStr();
  const pairsById = React.useMemo(() => {
    const map = new Map<string, import('@modules/events/types').TournamentPair>();
    (event.pairs || []).forEach((p) => map.set(p.id, p));
    return map;
  }, [event.pairs]);

  const checkedInCount = entries.filter((e) => isEntryCheckedInToday(e, event.matches, pairsById, todayStr)).length;
  const prioritizedCheckInEntries = React.useMemo(() => entries.map((entry) => {
    const entryCategories = (entry.categoryIds || [])
      .map((id) => categories.find((category) => category.id === id))
      .filter((category): category is EventCategory => Boolean(category))
      .sort((a, b) => (a.priority ?? 9999) - (b.priority ?? 9999) || a.name.localeCompare(b.name, 'pt-BR'));
    return {
      entry,
      entryCategories,
      primaryCategory: entryCategories[0],
      priority: entryCategories[0]?.priority ?? 9999,
      checkedIn: isEntryCheckedInToday(entry, event.matches, pairsById, todayStr),
    };
  }).sort((a, b) =>
    a.priority - b.priority
    || Number(b.checkedIn) - Number(a.checkedIn)
    || (a.entry.nickname || a.entry.name).localeCompare(b.entry.nickname || b.entry.name, 'pt-BR')
  ), [entries, categories, event.matches, pairsById, todayStr]);
  const filteredCheckInEntries = React.useMemo(() => {
    const term = checkInSearchQuery.trim().toLocaleLowerCase('pt-BR');
    if (!term) return prioritizedCheckInEntries;
    const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const normalizedTerm = normalize(term);
    return prioritizedCheckInEntries.filter(({ entry, entryCategories }) => {
      const searchable = [
        entry.nickname,
        entry.name,
        entry.registrationId == null ? '' : String(entry.registrationId),
        entry.pin,
        ...entryCategories.map((category) => category.name),
      ].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR');
      return normalize(searchable).includes(normalizedTerm);
    });
  }, [checkInSearchQuery, prioritizedCheckInEntries]);
  const arrivedCheckInEntries = filteredCheckInEntries.filter(({ checkedIn }) => checkedIn);
  const pendingCheckInEntries = filteredCheckInEntries.filter(({ checkedIn }) => !checkedIn);

  useEffect(() => {
    if (!checkInSearchQuery.trim()) return;
    setIsArrivedCheckInsExpanded(arrivedCheckInEntries.length > 0);
    setIsPendingCheckInsExpanded(pendingCheckInEntries.length > 0);
  }, [checkInSearchQuery, arrivedCheckInEntries.length, pendingCheckInEntries.length]);

  const isPrimary = isPrimaryAdminEmail(adminEmail);
  const isCoAdmin = !isPrimary && (event.coAdminPins || []).some((pin) => pin.toUpperCase().trim() === (adminPin || '').toUpperCase().trim());
  const isHelper = !isPrimary && !isCoAdmin && (event.helperPins || []).some((pin) => pin.toUpperCase().trim() === (adminPin || '').toUpperCase().trim());
  const isJudge = !isPrimary && !isCoAdmin && !isHelper && isJudgeOfEvent(event, adminPin);
  useEffect(() => {
    if (isHelper && (activeTab === 'registrations' || activeTab === 'pending-payments')) setActiveTab('categories');
  }, [isHelper, activeTab]);
  const isReadOnly = event.active !== true && !isPrimary;
  const canManageParticipantCheckIns = !isReadOnly && (isPrimary || isCoAdmin || isHelper || isJudge);
  const canChangeCheckInNow = canManageParticipantCheckIns && event.active === true && isTournamentPeriodActive(event);

  useEffect(() => {
    if (isJudge && activeTab !== 'formed-teams' && activeTab !== 'checkins') setActiveTab('formed-teams');
  }, [isJudge, activeTab]);

  const handleCheckInChange = async (entry: TournamentEntry, checkedIn: boolean) => {
    if (!canChangeCheckInNow || !adminEmail || !entry.email || savingCheckInEmail) return;
    if (!checkedIn && entryHasFinishedMatchOnDate(entry, event.matches, pairsById, todayStr)) return;
    setSavingCheckInEmail(entry.email);
    try {
      await saveAdminEventCheckIn(event.pin, adminEmail, adminPin || '', { ...entry, checkedIn });
    } catch (error) {
      console.error('Erro ao atualizar check-in pelo juiz:', error);
    } finally {
      setSavingCheckInEmail(null);
    }
  };

  const renderCheckInEntry = ({ entry, entryCategories, primaryCategory, priority, checkedIn }: (typeof filteredCheckInEntries)[number]) => (
    <div key={entry.email || entry.pin || entry.name} className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-black text-slate-800">{entry.nickname || entry.name}</p>
        <div className="flex min-w-0 items-center gap-1.5 text-[10px] font-bold text-slate-400">
          {primaryCategory && <span className="shrink-0 rounded bg-indigo-50 px-1.5 py-0.5 text-indigo-600">Prio {priority}</span>}
          <span className="truncate">{entryCategories.map((category) => category.name).join(', ') || 'Sem categoria'}</span>
        </div>
      </div>
      {canManageParticipantCheckIns ? (
        <CheckInStatusButton
          athleteName={entry.nickname || entry.name}
          checked={checkedIn}
          loading={savingCheckInEmail === entry.email}
          disabled={!canChangeCheckInNow || !entry.email || (checkedIn && entryHasFinishedMatchOnDate(entry, event.matches, pairsById, todayStr))}
          onClick={() => void handleCheckInChange(entry, !checkedIn)}
        />
      ) : (
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${checkedIn ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
          {checkedIn ? 'Check-in feito' : 'Pendente'}
        </span>
      )}
    </div>
  );

  const safeUpdateEvent = (updated: TournamentEvent) => {
    if (isReadOnly) return;
    if (isHelper) {
      const allowedKeys = new Set(['matches', 'pairs', 'entries']);
      const changedKeys = Object.keys(updated).filter((key) => (updated as any)[key] !== (event as any)[key]);
      if (changedKeys.some((key) => !allowedKeys.has(key))) return;
    }
    onUpdateEvent(updated);
  };

  const handleUpdateCategories = (newCategories: EventCategory[]) => {
    if (isReadOnly || isHelper) return;
    onUpdateEvent({ ...event, categories: newCategories });
  };

  const handleUpdateEntries = (newEntries: TournamentEntry[]) => {
    if (isReadOnly || isHelper) return;
    onUpdateEvent({ ...event, entries: newEntries });
  };

  const handleUpdateSponsors = (newSponsors: EventSponsor[]) => {
    if (isReadOnly || isHelper) return;
    onUpdateEvent({ ...event, sponsors: newSponsors });
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Event Header Banner */}
      <div className="bg-white p-5 rounded-[2.5rem] shadow-sm border border-slate-100 space-y-4">
        {isReadOnly && (
          <div className="flex items-center gap-2.5 p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-amber-900 text-xs font-bold animate-in fade-in">
            <ShieldAlert size={20} className="text-amber-600 shrink-0" />
            <span>Evento não ativo (somente visualização). Alterações são permitidas apenas pelo organizador principal.</span>
          </div>
        )}

        {/* Header layout according to Image 4:
            Line 1: Tournament Title (left) + Chevron edit button (top right)
            Line 2: PIN & Status Badges (left) + Voltar button (bottom right) */}
        <div className="space-y-3">
          {/* First line: Nome do torneio + Botão Chevron (canto superior direito) */}
          <div className="flex items-start justify-between gap-2">
            <h1 className="text-base font-black text-slate-800 tracking-tight leading-tight flex-1">
              {event.name}
            </h1>

            {/* Botões Menu de Blocos e Chevron no canto superior direito */}
            <div className="flex items-center gap-2 shrink-0">
              {!isJudge && <div className="relative" ref={blockMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsBlockMenuOpen((prev) => !prev)}
                  disabled={isHelper}
                  className="w-10 h-10 bg-slate-100 text-slate-700 rounded-full flex items-center justify-center hover:bg-slate-200 active:scale-95 transition-all cursor-pointer"
                  title="Acessar blocos do evento"
                >
                  <Menu size={18} />
                </button>
                {isBlockMenuOpen && (
                  <div className="absolute right-0 top-12 w-56 bg-white rounded-2xl shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in zoom-in-95">
                    <div className="px-3 py-1.5 border-b border-slate-100 mb-1">
                      <p className="text-[10px] font-black text-slate-400 tracking-wider">Acessar bloco</p>
                    </div>
                    {EVENT_CONFIG_BLOCKS.map((block) => {
                      const BlockIcon = block.icon;
                      return (
                        <button
                          key={block.key}
                          type="button"
                          onClick={() => {
                            setIsBlockMenuOpen(false);
                            onEditEventConfig(block.key);
                          }}
                          className="w-full flex items-center justify-between px-3.5 py-2.5 text-left hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer"
                        >
                          <div className="flex items-center gap-2.5">
                            <BlockIcon size={16} className="text-slate-500 shrink-0" />
                            <span className="text-xs font-black text-slate-700">{block.label}</span>
                          </div>
                          {block.isAdminOnly && (
                            <span className="text-[9px] bg-amber-100 text-amber-700 font-black px-1.5 py-0.5 rounded-full">
                              Admin
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>}

              {/* Botão Chevron no canto superior direito - abre direto o cadastro */}
              {!isJudge && <button
                type="button"
                onClick={() => onEditEventConfig()}
                disabled={isHelper}
                className="w-10 h-10 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full flex items-center justify-center active:scale-95 transition-all shrink-0 cursor-pointer"
                title={isPrimaryAdminEmail(adminEmail) ? 'Editar cadastro do evento' : 'Visualizar cadastro do evento'}
              >
                <ChevronDown size={20} />
              </button>}
            </div>
          </div>

          {/* Second line: Badges (PIN & Status) + Botão Voltar (canto inferior direito) */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-black text-amber-600 bg-amber-50 px-2.5 py-1 rounded-md">
                Pin: {event.pin}
              </span>
              <span className="text-[11px] font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-md capitalize">
                {event.eventStatus || 'Em configuração'}
              </span>
              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md">
                {event.sportName || activeSports.find((s) => s.id === (event.sportId || event.config?.sportType))?.name || 'Beach Tennis'}
              </span>
            </div>

            <button
              onClick={onBackToEvents}
              className="flex items-center gap-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-black text-xs px-3 py-2 rounded-2xl active:scale-95 transition-all shrink-0"
            >
              <ArrowLeft size={14} /> Voltar
            </button>
          </div>
        </div>

        {/* 5 Summary Cards Grid (2 por linha) */}
        <div className="grid grid-cols-2 gap-3">
          {!isJudge && <>
          {/* Card 1: Categorias */}
          <button
            onClick={() => setActiveTab('categories')}
            className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between space-y-2 ${
              activeTab === 'categories'
                ? 'bg-emerald-500 text-white border-emerald-500 shadow-md scale-[1.02]'
                : 'bg-slate-50/80 hover:bg-white text-slate-700 border-slate-200 hover:border-emerald-300'
            }`}
          >
            {/* Linha superior: Ícone à esquerda, Número no topo à direita */}
            <div className="flex items-center justify-between w-full">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                  activeTab === 'categories'
                    ? 'bg-white/20 text-white'
                    : 'bg-emerald-100 text-emerald-600'
                }`}
              >
                <Tag size={18} />
              </div>
              <span className="text-2xl font-black leading-none">{categories.length}</span>
            </div>
            <div>
              <p
                className={`text-[10px] font-black ${
                  activeTab === 'categories' ? 'text-emerald-100' : 'text-slate-400'
                }`}
              >
                Categorias
              </p>
            </div>
          </button>
          </>}

          {!isHelper && !isJudge && <>
          {/* Card 2: Inscrições */}
          <button
            onClick={() => setActiveTab('registrations')}
            className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between space-y-2 ${
              activeTab === 'registrations'
                ? 'bg-emerald-500 text-white border-emerald-500 shadow-md scale-[1.02]'
                : 'bg-slate-50/80 hover:bg-white text-slate-700 border-slate-200 hover:border-emerald-300'
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                  activeTab === 'registrations'
                    ? 'bg-white/20 text-white'
                    : 'bg-emerald-100 text-emerald-600'
                }`}
              >
                <Users size={18} />
              </div>
              <span className="text-2xl font-black leading-none">{entries.length}</span>
            </div>
            <div>
              <p
                className={`text-[10px] font-black ${
                  activeTab === 'registrations' ? 'text-emerald-100' : 'text-slate-400'
                }`}
              >
                Inscrições
              </p>
            </div>
          </button>
          </>}

          {/* Card 3: Gerenciar fila */}
          <button
            onClick={() => setActiveTab('formed-teams')}
            className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between space-y-2 ${
              activeTab === 'formed-teams'
                ? 'bg-blue-600 text-white border-blue-600 shadow-md scale-[1.02]'
                : 'bg-slate-50/80 hover:bg-white text-slate-700 border-slate-200 hover:border-blue-300'
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                  activeTab === 'formed-teams'
                    ? 'bg-white/20 text-white'
                    : 'bg-blue-100 text-blue-600'
                }`}
              >
                <Trophy size={18} />
              </div>
              <span className="text-2xl font-black leading-none">
                {event.courtsCount || (event.courtNames && event.courtNames.length) || pairs.length}
              </span>
            </div>
            <div>
              <p
                className={`text-[10px] font-black ${
                  activeTab === 'formed-teams' ? 'text-blue-100' : 'text-slate-400'
                }`}
              >
                Gerenciar fila
              </p>
              {/* d) Indicativos de status das quadras, 1 por linha com cores correspondentes */}
              <div className="flex flex-col gap-1 mt-1.5">
                <span
                  className={`inline-flex items-center gap-1.5 text-[10px] font-black whitespace-nowrap ${
                    activeTab === 'formed-teams' ? 'text-emerald-300' : 'text-emerald-600'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${activeTab === 'formed-teams' ? 'bg-emerald-400' : 'bg-emerald-500'}`} />
                  {freeCourtsCount} {freeCourtsCount === 1 ? 'Livre' : 'Livres'}
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 text-[10px] font-black whitespace-nowrap ${
                    activeTab === 'formed-teams' ? 'text-amber-300' : 'text-amber-600'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 animate-pulse ${activeTab === 'formed-teams' ? 'bg-amber-400' : 'bg-amber-500'}`} />
                  {busyCourtsCount} {busyCourtsCount === 1 ? 'Ocupada' : 'Ocupadas'}
                </span>
                {interdictedCourtsCount > 0 && (
                  <span
                    className={`inline-flex items-center gap-1.5 text-[10px] font-black whitespace-nowrap ${
                      activeTab === 'formed-teams' ? 'text-red-300' : 'text-red-600'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full shrink-0 ${activeTab === 'formed-teams' ? 'bg-red-400' : 'bg-red-500'}`} />
                    {interdictedCourtsCount} {interdictedCourtsCount === 1 ? 'Interditada' : 'Interditadas'}
                  </span>
                )}
              </div>
            </div>
          </button>

          {!isHelper && !isJudge && <>
          {/* Card 4: Pagamentos */}
          <button
            onClick={() => setActiveTab('pending-payments')}
            className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between space-y-2 ${
              activeTab === 'pending-payments'
                ? 'bg-amber-500 text-white border-amber-500 shadow-md scale-[1.02]'
                : 'bg-slate-50/80 hover:bg-white text-slate-700 border-slate-200 hover:border-amber-300'
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                  activeTab === 'pending-payments'
                    ? 'bg-white/20 text-white'
                    : 'bg-amber-100 text-amber-600'
                }`}
              >
                <DollarSign size={18} />
              </div>
              <span className="text-2xl font-black leading-none">{pendingPaymentsCount}</span>
            </div>
            <div className="space-y-1">
              <p
                className={`text-[10px] font-black ${
                  activeTab === 'pending-payments' ? 'text-amber-100' : 'text-slate-400'
                }`}
              >
                Pagamentos
              </p>
              <div
                className={`text-[9px] font-bold leading-tight space-y-0.5 ${
                  activeTab === 'pending-payments' ? 'text-white' : 'text-slate-500'
                }`}
              >
                <div className="flex justify-between gap-1">
                  <span className={activeTab === 'pending-payments' ? 'text-amber-100' : 'text-slate-400'}>Devido:</span>
                  <span className="font-black">R$ {totalDue.toFixed(2)}</span>
                </div>
                <div className="flex justify-between gap-1">
                  <span>
                    <span className="font-mono opacity-90">[{paidCount}]</span>{' '}
                    <span className={activeTab === 'pending-payments' ? 'text-amber-100' : 'text-slate-400'}>Pago:</span>
                  </span>
                  <span className="font-black">R$ {totalPaid.toFixed(2)}</span>
                </div>
                <div className="flex justify-between gap-1">
                  <span>
                    <span className="font-mono opacity-90">[{awaitingReceiptsCount}]</span>{' '}
                    <span className={activeTab === 'pending-payments' ? 'text-amber-100' : 'text-slate-400'}>A confirmar:</span>
                  </span>
                  <span className="font-black">R$ {totalAwaiting.toFixed(2)}</span>
                </div>
                <div className="flex justify-between gap-1">
                  <span>
                    <span className="font-mono opacity-90">[{preRegistrationCount}]</span>{' '}
                    <span className={activeTab === 'pending-payments' ? 'text-amber-100' : 'text-slate-400'}>Aguardando pgto:</span>
                  </span>
                  <span className="font-black">R$ {totalPre.toFixed(2)}</span>
                </div>
                {totalToRefund > 0 && (
                  <div className="flex justify-between gap-1">
                    <span>
                      <span className="font-mono opacity-90">[{toRefundReceiptsCount}]</span>{' '}
                      <span className={activeTab === 'pending-payments' ? 'text-purple-200' : 'text-purple-600'}>A devolver:</span>
                    </span>
                    <span className="font-black">R$ {totalToRefund.toFixed(2)}</span>
                  </div>
                )}
                {totalRefused > 0 && (
                  <div className="flex justify-between gap-1">
                    <span>
                      <span className="font-mono opacity-90">[{refusedReceiptsCount}]</span>{' '}
                      <span className={activeTab === 'pending-payments' ? 'text-rose-200' : 'text-rose-500'}>Recusados:</span>
                    </span>
                    <span className="font-black">R$ {totalRefused.toFixed(2)}</span>
                  </div>
                )}
                {exemptCount > 0 && (
                  <div className="flex justify-between gap-1">
                    <span>
                      <span className="font-mono opacity-90">[{exemptCount}]</span>{' '}
                      <span className={activeTab === 'pending-payments' ? 'text-amber-100' : 'text-slate-400'}>Isentos:</span>
                    </span>
                    <span className="font-black">R$ 0.00</span>
                  </div>
                )}
                {totalRefunded > 0 && (
                  <div className="flex justify-between gap-1">
                    <span>
                      <span className="font-mono opacity-90">[{refundedReceiptsCount}]</span>{' '}
                      <span className={activeTab === 'pending-payments' ? 'text-slate-200' : 'text-slate-500'}>Devolvidos:</span>
                    </span>
                    <span className="font-black">R$ {totalRefunded.toFixed(2)}</span>
                  </div>
                )}
              </div>
            </div>
          </button>
          </>}

          {/* Card 5: Check-ins Realizados */}
          <button
            onClick={() => setActiveTab('checkins')}
            className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between space-y-2 ${
              activeTab === 'checkins'
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-md scale-[1.02]'
                : 'bg-slate-50/80 hover:bg-white text-slate-700 border-slate-200 hover:border-indigo-300'
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                  activeTab === 'checkins'
                    ? 'bg-white/20 text-white'
                    : 'bg-indigo-100 text-indigo-600'
                }`}
              >
                <CheckCircle2 size={18} />
              </div>
              <span className="text-2xl font-black leading-none">{checkedInCount}</span>
            </div>
            <div>
              <p
                className={`text-[10px] font-black ${
                  activeTab === 'checkins' ? 'text-indigo-100' : 'text-slate-400'
                }`}
              >
                Check-ins realizados
              </p>
            </div>
          </button>

          {!isJudge && <>
          {/* Card: Patrocinadores */}
          <button
            onClick={() => setActiveTab('sponsors')}
            className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between space-y-2 ${
              activeTab === 'sponsors'
                ? 'bg-emerald-500 text-white border-emerald-500 shadow-md scale-[1.02]'
                : 'bg-slate-50/80 hover:bg-white text-slate-700 border-slate-200 hover:border-emerald-300'
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                  activeTab === 'sponsors'
                    ? 'bg-white/20 text-white'
                    : 'bg-emerald-100 text-emerald-600'
                }`}
              >
                <Award size={18} />
              </div>
              <span className="text-2xl font-black leading-none">{sponsors.length}</span>
            </div>
            <div>
              <p
                className={`text-[10px] font-black ${
                  activeTab === 'sponsors' ? 'text-emerald-100' : 'text-slate-400'
                }`}
              >
                Patrocinadores
              </p>
            </div>
          </button>
          </>}
        </div>
      </div>

      {/* Tab Content */}
      {!isJudge && activeTab === 'categories' && (
        <EventCategoriesManager
          event={event}
          activeSports={activeSports}
          onUpdateCategories={handleUpdateCategories}
          onUpdateEvent={safeUpdateEvent}
          adminEmail={adminEmail}
          isReadOnly={isReadOnly || isHelper}
          canCheckInParticipants={!isReadOnly && (isPrimary || isCoAdmin || isHelper)}
          adminPin={adminPin}
        />
      )}

      {!isHelper && !isJudge && activeTab === 'registrations' && (
        <EventRegistrationsManager
          event={event}
          onUpdateEntries={handleUpdateEntries}
          onUpdateEvent={safeUpdateEvent}
          adminEmail={adminEmail}
          initialExpandedPin={targetRegistrationEmail}
          isReadOnly={isReadOnly}
        />
      )}

      {!isJudge && activeTab === 'sponsors' && (
        <EventSponsorsManager
          event={event}
          onUpdateSponsors={handleUpdateSponsors}
          onUpdateEvent={safeUpdateEvent}
          isReadOnly={isReadOnly || isHelper}
        />
      )}

      {activeTab === 'formed-teams' && (
        <EventFormedTeamsView
          event={event}
          onUpdateEvent={safeUpdateEvent}
          isReadOnly={isReadOnly}
          canCheckInParticipants={!isReadOnly && (isPrimary || isCoAdmin || isHelper || isJudge)}
          adminEmail={adminEmail}
          adminPin={adminPin}
        />
      )}

      {!isHelper && !isJudge && activeTab === 'pending-payments' && (
        <EventPaymentsView
          event={event}
          onUpdateEvent={safeUpdateEvent}
        />
      )}

      {activeTab === 'checkins' && (
        <section className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 border-b border-slate-100 p-5">
            <CheckCircle2 size={24} className="text-indigo-500" />
            <div>
              <h3 className="text-base font-black text-slate-800">Check-in dos Participantes</h3>
              <p className="text-xs font-bold text-slate-400">{checkedInCount} de {entries.length} participantes com check-in hoje.</p>
              <p className="mt-1 text-[10px] font-bold text-slate-400">Categorias de maior prioridade primeiro; presentes aparecem antes dos pendentes.</p>
            </div>
          </div>
          {(() => {
            const hasQuery = checkInSearchQuery.trim().length > 0;
            const hasResults = filteredCheckInEntries.length > 0;
            const searchStyles = getSearchInputStyles({ query: checkInSearchQuery, resultCount: filteredCheckInEntries.length });
            const wrapperBorder = !hasQuery
              ? 'border-blue-200 bg-blue-50/40'
              : hasResults
                ? 'border-emerald-400 bg-emerald-50/40'
                : 'border-rose-400 bg-rose-50/40';
            return (
              <div className={`mx-4 rounded-2xl border-2 p-2.5 transition-all ${wrapperBorder}`}>
                <div className="relative w-full">
                  <Search size={15} className={`absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors ${searchStyles.iconClasses}`} />
                  <input
                    type="text"
                    value={checkInSearchQuery}
                    onChange={(e) => setCheckInSearchQuery(e.target.value)}
                    placeholder="Pesquisar por nome ou ID da inscrição..."
                    className={`w-full h-11 pl-9 pr-8 border-2 rounded-xl font-bold text-sm outline-none transition-all ${searchStyles.inputClasses}`}
                  />
                  {checkInSearchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setCheckInSearchQuery('');
                        setIsArrivedCheckInsExpanded(false);
                        setIsPendingCheckInsExpanded(false);
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer transition-colors"
                      title="Limpar pesquisa"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                {hasQuery && (
                  <p className={`mt-1.5 px-1 text-[11px] font-bold ${hasResults ? 'text-emerald-700' : 'text-rose-600'}`}>
                    {hasResults
                      ? `${filteredCheckInEntries.length} ${filteredCheckInEntries.length === 1 ? 'resultado encontrado' : 'resultados encontrados'}`
                      : `Nenhum resultado para "${checkInSearchQuery}"`}
                  </p>
                )}
              </div>
            );
          })()}
          {filteredCheckInEntries.length === 0 ? (
            <p className="p-6 text-center text-sm font-bold text-slate-400">
              {checkInSearchQuery.trim() ? 'Nenhum atleta encontrado.' : 'Nenhum participante inscrito.'}
            </p>
          ) : (
            <div className="space-y-3 p-4">
              <section className="overflow-hidden rounded-3xl border-2 border-emerald-300/80 bg-white shadow-sm transition-all hover:border-emerald-400">
                <button
                  type="button"
                  onClick={() => setIsArrivedCheckInsExpanded((prev) => !prev)}
                  className="group flex w-full cursor-pointer select-none items-center justify-between gap-3 p-4 text-left"
                >
                  <span className="text-sm font-black tracking-tight text-slate-800">Já chegaram · {arrivedCheckInEntries.length} atletas</span>
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition-colors group-hover:bg-slate-200">
                    {isArrivedCheckInsExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </span>
                </button>
                {isArrivedCheckInsExpanded && (
                  <div className="animate-in fade-in divide-y divide-slate-100 border-t border-slate-100">
                    {arrivedCheckInEntries.length > 0
                      ? arrivedCheckInEntries.map(renderCheckInEntry)
                      : <p className="px-4 py-5 text-center text-xs font-bold text-slate-400">Ninguém chegou ainda nesta pesquisa.</p>}
                  </div>
                )}
              </section>

              <section className="overflow-hidden rounded-3xl border-2 border-amber-300/80 bg-white shadow-sm transition-all hover:border-amber-400">
                <button
                  type="button"
                  onClick={() => setIsPendingCheckInsExpanded((prev) => !prev)}
                  className="group flex w-full cursor-pointer select-none items-center justify-between gap-3 p-4 text-left"
                >
                  <span className="text-sm font-black tracking-tight text-slate-800">Precisam fazer check-in · {pendingCheckInEntries.length} atletas</span>
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition-colors group-hover:bg-slate-200">
                    {isPendingCheckInsExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </span>
                </button>
                {isPendingCheckInsExpanded && (
                  <div className="animate-in fade-in divide-y divide-slate-100 border-t border-slate-100">
                    {pendingCheckInEntries.length > 0
                      ? pendingCheckInEntries.map(renderCheckInEntry)
                      : <p className="px-4 py-5 text-center text-xs font-bold text-emerald-600">Todos os atletas encontrados já chegaram.</p>}
                  </div>
                )}
              </section>
            </div>
          )}
        </section>
      )}
    </div>
  );
};
