import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, Trophy, Calendar, Ticket, Loader2, ChevronRight, Menu, MapPin, Zap, X, Bell, ShieldCheck } from 'lucide-react';
import { getDb, updateEvent, saveEventEntry } from '@infra/firebase';
import type { Firestore } from 'firebase/firestore';
import { fetchActiveEvents } from '../services/fetchActiveEvents';
import { fetchEventByPin, fetchEventEntry } from '@infra/firebase/events';
import type { EventRegistration, TournamentEntry, TournamentEvent } from '../types';
import type { UserProfile } from '@modules/auth/types';
import { EventRegistrationForm } from '../domain/registration';
import { canUseEventAdminAccess, isPrimaryAdminEmail } from '../services/eventAdminAccess';
import { getRegistrationPeriodStatus } from '../services/eventRegistrationPeriod';
import { useScreenOnboarding, ScreenIntroCard, SpotlightTour, getOnboardingStatus } from '@shared/onboarding';

interface Props {
  registrations: EventRegistration[];
  onBack: () => void;
  onJoin: (pin: string, entryData: Partial<TournamentEntry>) => void;
  onSelectEvent: (event: EventRegistration) => void;
  onSelectAdminEvent?: (event: TournamentEvent | EventRegistration) => void;
  onOpenMenu: () => void;
  userProfile?: UserProfile;
  onOpenCommunications?: () => void;
  unreadCount?: number;
  onRefreshRegistrations?: () => Promise<void> | void;
  onRegisterReplayTour?: (replayFn: () => void) => void;
  onProfileSync?: (updates: { phone?: string; gender?: 'M' | 'F' }) => void;
}

export const TournamentsScreen: React.FC<Props> = ({ registrations, onJoin, onSelectEvent, onSelectAdminEvent, onOpenMenu, userProfile, onOpenCommunications, unreadCount = 0, onRefreshRegistrations, onRegisterReplayTour, onProfileSync }) => {
  const [pinInput, setPinInput] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [joiningPin, setJoiningPin] = useState<string | null>(null);
  const [activeEvents, setActiveEvents] = useState<TournamentEvent[]>([]);
  const [isLoadingActive, setIsLoadingActive] = useState(true);
  const [directRegistrationPins, setDirectRegistrationPins] = useState<Set<string>>(new Set());
  const [isCheckingDirectRegistrations, setIsCheckingDirectRegistrations] = useState(true);

  // Pre-join form state
  const [pendingEvent, setPendingEvent] = useState<TournamentEvent | null>(null);
  const [pendingPin, setPendingPin] = useState<string | null>(null);

  // Mapa suplementar: eventos das inscrições do usuário que não estão em activeEvents
  const [registeredEventsMap, setRegisteredEventsMap] = useState<Map<string, TournamentEvent>>(new Map());
  const refreshRegistrationsRef = useRef(onRefreshRegistrations);

  const {
    config: onboardingConfig,
    showIntro,
    showTour,
    handleDismissIntro,
    handleStepChange,
    handleCompleteTour,
    handleSkipTour,
    replayTour,
  } = useScreenOnboarding('tournaments');

  const {
    config: athleteRegOnboardingConfig,
    showIntro: showAthleteRegIntro,
    showTour: showAthleteRegTour,
    handleDismissIntro: handleDismissAthleteRegIntro,
    handleStepChange: handleAthleteRegStepChange,
    handleCompleteTour: handleCompleteAthleteRegTour,
    handleSkipTour: handleSkipAthleteRegTour,
    replayTour: replayAthleteRegTour,
  } = useScreenOnboarding('athlete-registration');

  useEffect(() => {
    if (onRegisterReplayTour) {
      onRegisterReplayTour(replayTour);
    }
  }, [onRegisterReplayTour, replayTour]);

  useEffect(() => {
    refreshRegistrationsRef.current = onRefreshRegistrations;
  }, [onRefreshRegistrations]);

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
    if (refreshRegistrationsRef.current) {
      void refreshRegistrationsRef.current();
    }
    return () => { isMounted = false; };
  }, []);

  const activeEventPins = useMemo(
    () => activeEvents.map((event) => event.pin.trim()).filter(Boolean).sort(),
    [activeEvents]
  );
  const activeEventPinsKey = activeEventPins.join('|');

  // O índice user_registrations pode demorar a refletir inscrições criadas pelo admin.
  // Confere também a inscrição real do atleta em cada evento ativo.
  useEffect(() => {
    const email = userProfile?.email?.toLowerCase().trim();
    const db = getDb();
    if (!db || !email || activeEventPins.length === 0) {
      setDirectRegistrationPins(new Set());
      setIsCheckingDirectRegistrations(false);
      return;
    }

    let isMounted = true;
    setIsCheckingDirectRegistrations(true);
    Promise.all(
      activeEventPins.map(async (eventPin) => {
        try {
          const entry = await fetchEventEntry(db as Firestore, eventPin, email);
          if (!entry || entry.disabled || entry.paymentStatus === 'Cancelado') return null;
          return eventPin.toUpperCase();
        } catch {
          return null;
        }
      })
    ).then((pins) => {
      if (isMounted) {
        setDirectRegistrationPins(new Set(pins.filter((pin): pin is string => Boolean(pin))));
        setIsCheckingDirectRegistrations(false);
      }
    });

    return () => { isMounted = false; };
  }, [activeEventPinsKey, userProfile?.email]);

  // Para cada inscrição que NÃO está em activeEvents, buscar o evento completo para checar coAdminPins
  useEffect(() => {
    if (!userProfile?.pin && !isPrimaryAdminEmail(userProfile?.email)) return;
    let isMounted = true;
    const db = getDb();
    if (!db || registrations.length === 0) return;

    const fetchMissingEvents = async () => {
      const activeMap = new Map<string, boolean>();
      activeEvents.forEach((ev) => { if (ev.pin) activeMap.set(ev.pin.toUpperCase(), true); });

      const missing = registrations.filter((r) => !activeMap.has(r.pin.toUpperCase()));
      if (missing.length === 0) return;

      const fetched = new Map<string, TournamentEvent>();
      await Promise.all(
        missing.map(async (r) => {
          try {
            const ev = await fetchEventByPin(db as Firestore, r.pin);
            if (ev && isMounted) fetched.set(r.pin.toUpperCase(), ev as TournamentEvent);
          } catch { /* ignorar erros individuais */ }
        })
      );
      if (isMounted) setRegisteredEventsMap(fetched);
    };

    fetchMissingEvents();
    return () => { isMounted = false; };
  }, [registrations, activeEvents, userProfile?.pin, userProfile?.email]);

  // Open pre-join form for a known event card
  const handleRequestJoinEvent = async (ev: TournamentEvent) => {
    if (registeredPins.has(ev.pin.toUpperCase())) {
      const existing = registrations.find((r) => r.pin.toUpperCase() === ev.pin.toUpperCase());
      if (existing) {
        onSelectEvent(existing);
        return;
      }
    }

    const period = getRegistrationPeriodStatus(ev);
    if (!period.isOpen) {
      onSelectEvent({ pin: ev.pin, name: ev.name, joinedAt: 0 });
      return;
    }

    const db = getDb();
    const freshEvent = db ? await fetchEventByPin(db as Firestore, ev.pin) : null;
    const targetEvent = (freshEvent as TournamentEvent | null) || ev;
    const freshPeriod = getRegistrationPeriodStatus(targetEvent);
    if (!freshPeriod.isOpen) {
      onSelectEvent({ pin: targetEvent.pin, name: targetEvent.name, joinedAt: 0 });
      return;
    }

    setPendingEvent(targetEvent);
    setPendingPin(null);
  };

  // Open pre-join form for a PIN-typed join
  const handleRequestJoinPin = async () => {
    const targetPin = pinInput.trim();
    if (!targetPin) return;
    if (registeredPins.has(targetPin.toUpperCase())) {
      const existing = registrations.find((r) => r.pin.toUpperCase() === targetPin.toUpperCase());
      if (existing) {
        onSelectEvent(existing);
        return;
      }
    }
    setPendingPin(targetPin);
    setIsSearching(true);
    const db = getDb();
    const event = db ? await fetchEventByPin(db as Firestore, targetPin) : null;
    setIsSearching(false);
    if (event) {
      const period = getRegistrationPeriodStatus(event as TournamentEvent);
      if (!period.isOpen) {
        onSelectEvent({ pin: (event as TournamentEvent).pin, name: (event as TournamentEvent).name, joinedAt: 0 });
        setPendingPin(null);
        return;
      }
      setPendingEvent(event as TournamentEvent);
    } else {
      alert('Torneio não encontrado com o PIN informado ou está inativo.');
      setPendingPin(null);
    }
  };

  const handleCancelPreJoin = () => {
    setPendingEvent(null);
    setPendingPin(null);
  };

  const initialUserEntry: TournamentEntry = useMemo(() => {
    return {
      email: userProfile?.email || '',
      name: userProfile?.name || '',
      nickname: userProfile?.nickname || userProfile?.name || '',
      pin: userProfile?.pin || `TEMP${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      phone: userProfile?.phone || '',
      shirtSize: (userProfile as unknown as { shirtSize?: 'P' | 'M' | 'G' })?.shirtSize || 'M',
      gender: userProfile?.gender || 'M',
      categoryIds: [],
      joinedAt: 0,
      regulationAccepted: false,
      dueAmount: pendingEvent?.registrationFee ?? 0,
      paidAmount: 0,
      paymentStatus: 'Pendente',
      payments: [],
    };
  }, [userProfile, pendingEvent]);

  const adminEventPins = useMemo(() => {
    const userPin = userProfile?.pin;
    const isPrimary = isPrimaryAdminEmail(userProfile?.email);
    return new Set(
      activeEvents
        .filter((event) => isPrimary || canUseEventAdminAccess(event, userPin))
        .map((event) => event.pin.trim().toUpperCase())
    );
  }, [activeEvents, userProfile?.pin, userProfile?.email]);

  const registeredPins = useMemo(() => {
    const pins = new Set<string>();
    const activePinsSet = new Set(activeEventPins.map((p) => p.toUpperCase()));

    // Inscrições de eventos inativos/histórico
    registrations.forEach((registration) => {
      if (registration.paymentStatus === 'Cancelado') return;
      const pinUpper = registration.pin.trim().toUpperCase();
      if (!activePinsSet.has(pinUpper)) {
        pins.add(pinUpper);
      }
    });

    // Para eventos ativos, a checagem em tempo real no Firestore é a autoridade máxima
    directRegistrationPins.forEach((pin) => {
      pins.add(pin);
    });

    return pins;
  }, [registrations, directRegistrationPins, activeEventPins]);

  const normalizedSearch = pinInput.trim().toLowerCase();

  // Torneios disponíveis: inscrições abertas onde o usuário não possui inscrição ativa
  const availableEvents = useMemo(() => {
    return activeEvents.filter((ev) => {
      const eventPin = ev.pin.trim().toUpperCase();
      const isNotRegistered = !registeredPins.has(eventPin);
      const isRegistrationOpen = getRegistrationPeriodStatus(ev).isOpen;
      if (!isNotRegistered || !isRegistrationOpen) return false;
      if (!normalizedSearch) return true;
      const matchName = ev.name?.toLowerCase().includes(normalizedSearch);
      const matchPin = ev.pin?.toLowerCase().includes(normalizedSearch);
      return matchName || matchPin;
    });
  }, [activeEvents, registeredPins, normalizedSearch]);

  // Mapa de eventos ativos por PIN
  const activeEventsMap = useMemo(() => {
    const map = new Map<string, TournamentEvent>();
    activeEvents.forEach((ev) => {
      if (ev.pin) map.set(ev.pin.toUpperCase(), ev);
    });
    return map;
  }, [activeEvents]);

  // Combina inscrições do usuário com eventos ativos onde ele foi cadastrado como administrador
  const allUserEvents = useMemo(() => {
    const activePinsSet = new Set(activeEventPins.map((p) => p.toUpperCase()));

    // Filtra inscrições canceladas ou que já foram excluídas no Firestore
    const list = registrations.filter((r) => {
      if (r.paymentStatus === 'Cancelado') return false;
      const pinUpper = r.pin.trim().toUpperCase();
      if (activePinsSet.has(pinUpper) && !directRegistrationPins.has(pinUpper)) {
        return false;
      }
      return true;
    });

    activeEvents.forEach((ev) => {
      const pinUpper = ev.pin?.trim().toUpperCase();
      if (!pinUpper || !adminEventPins.has(pinUpper)) return;
      const alreadyInList = list.some((registration) => registration.pin.trim().toUpperCase() === pinUpper);
      if (!alreadyInList) {
        list.push({
          pin: ev.pin,
          name: ev.name,
          joinedAt: ev.createdAt || Date.now(),
          bannerUrl: ev.bannerUrl || null,
        });
      }
    });
    return list;
  }, [registrations, activeEvents, adminEventPins, activeEventPins, directRegistrationPins]);

  // Minhas inscrições: todos os eventos nos quais o usuário já se inscreveu (mesmo inativos) + eventos que administra
  const filteredRegistrations = useMemo(() => {
    if (!normalizedSearch) return allUserEvents;
    return allUserEvents.filter((reg) => {
      const matchName = reg.name?.toLowerCase().includes(normalizedSearch);
      const matchPin = reg.pin?.toLowerCase().includes(normalizedSearch);
      return matchName || matchPin;
    });
  }, [allUserEvents, normalizedSearch]);

  const showPreJoin = pendingEvent !== null;
  const preJoinEventName = pendingEvent?.name ?? `Evento PIN: ${pendingPin}`;

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

      <div className="flex-1 overflow-y-auto p-5 space-y-8 no-scrollbar pb-6">

        {/* BUSCAR EVENTO POR PIN OU NOME */}
        <div id="tournaments-search-bar" className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <Search size={18} className="text-amber-500" />
            <h3 className="text-sm font-black text-black tracking-tight">Localizar torneios</h3>
          </div>
          <div className="bg-white rounded-[2rem] p-2.5 px-4 shadow-sm border border-gray-100 flex items-center gap-3">
            <Search size={20} className="text-amber-500 shrink-0" />
            <input
              type="text"
              placeholder="Digite o PIN ou nome do evento"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              className="flex-1 h-12 bg-transparent font-black text-sm outline-none placeholder:text-slate-400 placeholder:font-bold"
            />
            {pinInput && (
              <button
                type="button"
                onClick={() => setPinInput('')}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
                title="Limpar busca"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        {/* TORNEIOS DISPONÍVEIS */}
        <div id="tournaments-available-section" className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <Zap size={18} className="text-emerald-600" />
            <h3 className="text-sm font-black text-black tracking-tight">Torneios disponíveis</h3>
          </div>

          {isLoadingActive || isCheckingDirectRegistrations ? (
            <div className="py-8 bg-white rounded-[2rem] border border-gray-100 flex flex-col items-center justify-center gap-2 text-slate-400">
              <Loader2 size={24} className="animate-spin text-emerald-500" />
              <span className="text-xs font-bold">Buscando torneios disponíveis...</span>
            </div>
          ) : availableEvents.length === 0 ? (
            <div className="py-8 bg-white rounded-[2rem] border border-dashed border-slate-200 text-center">
              <p className="text-slate-400 font-bold text-xs">
                {pinInput ? 'Nenhum torneio disponível encontrado com este termo.' : 'Nenhum novo torneio disponível no momento.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {availableEvents.map((ev) => {
                const isJoiningThis = isSearching && joiningPin === ev.pin;
                const period = getRegistrationPeriodStatus(ev);
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
                        <div className="flex flex-wrap items-center gap-2 text-slate-400 text-[10px] font-bold">
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
                          <span className="bg-amber-50 text-amber-600 font-black px-2 py-0.5 rounded-md">PIN: {ev.pin}</span>
                          {(ev.registrationFee ?? 0) > 0 && (
                            <span className="bg-emerald-50 text-emerald-600 font-black px-2 py-0.5 rounded-md">
                              R$ {ev.registrationFee?.toFixed(2)}
                            </span>
                          )}
                          <span className={`font-black px-2 py-0.5 rounded-md ${
                            period.isOpen
                              ? 'bg-emerald-50 text-emerald-700'
                              : period.status === 'not_started'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-slate-100 text-slate-500'
                          }`}>
                            {period.message}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0 pl-2">
                      {isJoiningThis ? (
                        <Loader2 size={20} className="animate-spin text-emerald-500" />
                      ) : period.isOpen ? (
                        <span className="bg-emerald-500 text-white text-[11px] font-black px-3 py-1.5 rounded-xl group-hover:bg-emerald-600 transition-colors shadow-sm">
                          Inscrever-se
                        </span>
                      ) : (
                        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-xl ${
                          period.status === 'not_started'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200/80'
                            : 'bg-slate-100 text-slate-500 border border-slate-200'
                        }`}>
                          {period.status === 'not_started' ? 'Em breve' : 'Encerrado'}
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
        <div id="tournaments-registrations-section" className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <Ticket size={18} className="text-blue-500" />
            <h3 className="text-sm font-black text-black tracking-tight">Minhas inscrições</h3>
          </div>

          {filteredRegistrations.length === 0 ? (
            <div className="py-12 bg-white rounded-[2.5rem] border border-dashed border-slate-200 text-center space-y-2">
              <p className="text-slate-400 font-bold text-sm">
                {pinInput ? 'Nenhuma inscrição encontrada para a busca.' : 'Nenhum torneio localizado ainda.'}
              </p>
              {!pinInput && <p className="text-[10px] text-slate-300 font-medium italic">Inscreva-se acima ou use o PIN fornecido pela organização.</p>}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRegistrations.map((reg) => {
                const { pin, name, joinedAt, paymentStatus } = reg;
                // Usa o evento completo do mapa ativo; se não estiver lá, usa o mapa de inscrições (eventos inativos)
                const eventObj = activeEventsMap.get(pin.toUpperCase()) ?? registeredEventsMap.get(pin.toUpperCase());
                const isUserAdmin =
                  isPrimaryAdminEmail(userProfile?.email) ||
                  (eventObj ? canUseEventAdminAccess(eventObj, userProfile?.pin) : false);
                const isActualRegistration =
                  directRegistrationPins.has(pin.toUpperCase()) ||
                  (!activeEventsMap.has(pin.toUpperCase()) &&
                    registrations.some(
                      (registration) =>
                        registration.pin.trim().toUpperCase() === pin.trim().toUpperCase() &&
                        registration.paymentStatus !== 'Cancelado'
                    ));

                // Badge de status de inscrição
                const statusConfig: Record<string, { label: string; className: string }> = {
                  'Confirmado': { label: 'Inscrição ativa', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
                  'Pago':       { label: 'Inscrição ativa', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
                  'Isento':     { label: 'Isento',          className: 'bg-blue-100 text-blue-700 border-blue-200' },
                  'Pendente':   { label: 'Pendente de pagamento', className: 'bg-amber-100 text-amber-700 border-amber-200' },
                  'Recusado':   { label: 'Pagamento recusado', className: 'bg-red-100 text-red-700 border-red-200' },
                  'Cancelado':  { label: 'Cancelado',       className: 'bg-red-100 text-red-700 border-red-200' },
                };
                const statusInfo = paymentStatus ? statusConfig[paymentStatus] : null;

                return (
                  <div
                    key={pin}
                    onClick={() => onSelectEvent(reg)}
                    className="w-full bg-white rounded-[2rem] p-5 shadow-sm border border-gray-100 flex items-center justify-between active:scale-[0.99] transition-all group cursor-pointer hover:border-amber-200"
                  >
                    <div className="flex items-center gap-4 flex-1 min-w-0 pr-2">
                      <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-500 shadow-inner shrink-0">
                        <Trophy size={24} />
                      </div>
                      <div className="text-left min-w-0 flex-1">
                        <p className="text-sm font-black text-gray-900 mb-1 truncate">{name}</p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="flex items-center gap-1.5 text-slate-400">
                            <Calendar size={12} className="shrink-0" />
                            <p className="text-[10px] font-bold">
                              {isActualRegistration
                                ? `Inscrito em ${new Date(joinedAt).toLocaleDateString('pt-BR')}`
                                : 'Administrador do evento'}
                            </p>
                          </div>
                          {statusInfo && (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black border ${statusInfo.className}`}>
                              {statusInfo.label}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isUserAdmin && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onSelectAdminEvent) {
                              onSelectAdminEvent(eventObj || reg);
                            }
                          }}
                          className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-600 hover:bg-indigo-600 hover:text-white flex items-center justify-center transition-all active:scale-90 shadow-sm"
                          title="Acessar como administrador do evento"
                        >
                          <ShieldCheck size={20} />
                        </button>
                      )}
                      <ChevronRight size={20} className="text-gray-300 group-hover:text-amber-500 transition-colors" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ──────────────────────────────────────────────────
          PRE-JOIN BOTTOM SHEET (IDÊNTICO AO CADASTRO DO EVENTO)
      ────────────────────────────────────────────────── */}
      {showPreJoin && pendingEvent && (
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
                <p className="text-[10px] font-bold text-emerald-600 tracking-widest">Inscrição no evento</p>
                <h2 className="text-base font-black text-slate-900 leading-tight mt-0.5">{preJoinEventName}</h2>
              </div>
              <div className="flex items-center gap-2">
                {(() => {
                  const regStatus = getOnboardingStatus('athlete-registration');
                  const regStatusStyle =
                    regStatus === 'completed'
                      ? 'text-emerald-700 bg-emerald-50 border-emerald-300 font-black'
                      : regStatus === 'partial'
                      ? 'text-sky-600 bg-sky-50 border-sky-200 font-extrabold'
                      : 'text-amber-500 bg-amber-50/90 border-amber-200 font-bold';
                  return (
                    <button
                      type="button"
                      onClick={replayAthleteRegTour}
                      className={`p-1 rounded-full text-xs w-7 h-7 flex items-center justify-center shrink-0 border transition-all active:scale-90 hover:scale-110 shadow-xs cursor-pointer ${regStatusStyle}`}
                      title="Ajuda e tour das etapas de inscrição"
                      aria-label="Ajuda e tour das etapas de inscrição"
                    >
                      ?
                    </button>
                  );
                })()}
                <button
                  onClick={handleCancelPreJoin}
                  className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 active:scale-90 transition-all"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Formulário completo e idêntico */}
            <div className="overflow-y-auto px-6 py-5 space-y-5 no-scrollbar">
              <EventRegistrationForm
                key={pendingEvent.pin}
                event={pendingEvent}
                entry={initialUserEntry}
                mode="user"
                isNew={true}
                userProfile={userProfile}
                onProfileSync={onProfileSync}
                onSave={async (savedEntry) => {
                  await onJoin(pendingEvent.pin, savedEntry);
                  setPendingEvent(null);
                  setPendingPin(null);
                }}
                onSaveDraft={async (savedEntry) => {
                  const db = getDb();
                  if (!db) throw new Error('Não foi possível salvar a inscrição temporariamente.');
                  await saveEventEntry(db as Firestore, pendingEvent.pin, savedEntry as any);
                }}
                onUpdateEvent={(updatedEvent) => {
                  const db = getDb();
                  if (!db) return;
                  void updateEvent(db as Firestore, updatedEvent.pin, { pairs: updatedEvent.pairs });
                }}
                onCancel={handleCancelPreJoin}
              />
            </div>
          </div>
        </div>
      )}

      {/* Camada 1: Cartão de Boas-Vindas */}
      {onboardingConfig && (
        <ScreenIntroCard
          config={onboardingConfig}
          isOpen={showIntro}
          onDismiss={handleDismissIntro}
        />
      )}

      {/* Camada 2: Spotlight Tour dos elementos */}
      {onboardingConfig && (
        <SpotlightTour
          steps={onboardingConfig.steps}
          isActive={showTour}
          onComplete={handleCompleteTour}
          onSkip={handleSkipTour}
          onStepChange={handleStepChange}
        />
      )}

      {/* Onboarding da Inscrição do Atleta (Modal Pre-join) */}
      {showPreJoin && athleteRegOnboardingConfig && (
        <>
          <ScreenIntroCard
            config={athleteRegOnboardingConfig}
            isOpen={showAthleteRegIntro}
            onDismiss={handleDismissAthleteRegIntro}
          />
          <SpotlightTour
            steps={athleteRegOnboardingConfig.steps}
            isActive={showAthleteRegTour}
            onComplete={handleCompleteAthleteRegTour}
            onSkip={handleSkipAthleteRegTour}
            onStepChange={handleAthleteRegStepChange}
          />
        </>
      )}
    </div>
  );
};
