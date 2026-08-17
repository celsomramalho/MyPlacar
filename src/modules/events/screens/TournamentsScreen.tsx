import React, { useState, useEffect, useMemo } from 'react';
import { Search, Trophy, Calendar, Ticket, Loader2, ChevronRight, Menu, MapPin, Zap, X } from 'lucide-react';
import { getDb } from '@infra/firebase';
import type { Firestore } from 'firebase/firestore';
import { fetchActiveEvents } from '../services/fetchActiveEvents';
import { fetchEventByPin } from '@infra/firebase/events';
import type { EventRegistration, TournamentEntry, TournamentEvent } from '../types';
import type { UserProfile } from '@modules/auth/types';
import { EventRegistrationForm } from '../components/EventRegistrationForm';

interface Props {
  registrations: EventRegistration[];
  onBack: () => void;
  onJoin: (pin: string, entryData: Partial<TournamentEntry>) => void;
  onSelectEvent: (event: EventRegistration) => void;
  onOpenMenu: () => void;
  userProfile?: UserProfile;
}

export const TournamentsScreen: React.FC<Props> = ({ registrations, onJoin, onSelectEvent, onOpenMenu, userProfile }) => {
  const [pinInput, setPinInput] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [joiningPin, setJoiningPin] = useState<string | null>(null);
  const [activeEvents, setActiveEvents] = useState<TournamentEvent[]>([]);
  const [isLoadingActive, setIsLoadingActive] = useState(true);

  // Pre-join form state
  const [pendingEvent, setPendingEvent] = useState<TournamentEvent | null>(null);
  const [pendingPin, setPendingPin] = useState<string | null>(null);

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
  };

  // Open pre-join form for a PIN-typed join
  const handleRequestJoinPin = async () => {
    const targetPin = pinInput.trim();
    if (!targetPin) return;
    setPendingPin(targetPin);
    setIsSearching(true);
    const db = getDb();
    const event = db ? await fetchEventByPin(db as Firestore, targetPin) : null;
    setIsSearching(false);
    if (event) {
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
      joinedAt: Date.now(),
      dueAmount: pendingEvent?.registrationFee ?? 0,
      paidAmount: 0,
      paymentStatus: 'Pendente',
      payments: [],
    };
  }, [userProfile, pendingEvent]);

  const registeredPins = useMemo(() => new Set(registrations.map((r) => r.pin.toUpperCase())), [registrations]);

  const normalizedSearch = pinInput.trim().toLowerCase();

  // Torneios disponíveis: somente eventos ativos nos quais o usuário ainda não se inscreveu
  const availableEvents = useMemo(() => {
    return activeEvents.filter((ev) => {
      const isNotRegistered = !registeredPins.has(ev.pin.toUpperCase());
      const isActive = Boolean(ev.active);
      if (!isNotRegistered || !isActive) return false;
      if (!normalizedSearch) return true;
      const matchName = ev.name?.toLowerCase().includes(normalizedSearch);
      const matchPin = ev.pin?.toLowerCase().includes(normalizedSearch);
      return matchName || matchPin;
    });
  }, [activeEvents, registeredPins, normalizedSearch]);

  // Minhas inscrições: todos os eventos nos quais o usuário já se inscreveu (mesmo inativos)
  const filteredRegistrations = useMemo(() => {
    if (!normalizedSearch) return registrations;
    return registrations.filter((reg) => {
      const matchName = reg.name?.toLowerCase().includes(normalizedSearch);
      const matchPin = reg.pin?.toLowerCase().includes(normalizedSearch);
      return matchName || matchPin;
    });
  }, [registrations, normalizedSearch]);

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
        <div className="w-10"></div>
      </header>

      <div className="flex-1 overflow-y-auto p-5 space-y-8 no-scrollbar pb-6">

        {/* BUSCAR EVENTO POR PIN OU NOME */}
        <div className="space-y-4">
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
              <p className="text-slate-400 font-bold text-xs">
                {pinInput ? 'Nenhum torneio disponível encontrado com este termo.' : 'Nenhum novo torneio disponível no momento.'}
              </p>
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
                <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Inscrição no evento</p>
                <h2 className="text-base font-black text-slate-900 leading-tight mt-0.5">{preJoinEventName}</h2>
              </div>
              <button
                onClick={handleCancelPreJoin}
                className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 active:scale-90 transition-all"
              >
                <X size={18} />
              </button>
            </div>

            {/* Formulário completo e idêntico */}
            <div className="overflow-y-auto px-6 py-5 space-y-5 no-scrollbar">
              <EventRegistrationForm
                key={pendingEvent.pin}
                event={pendingEvent}
                entry={initialUserEntry}
                mode="user"
                onSave={async (savedEntry) => {
                  await onJoin(pendingEvent.pin, savedEntry);
                  setPendingEvent(null);
                  setPendingPin(null);
                }}
                onCancel={handleCancelPreJoin}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
