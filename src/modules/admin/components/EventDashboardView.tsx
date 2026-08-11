import React, { useState } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  Tag,
  Users,
  Trophy,
  DollarSign,
  CheckCircle2,
  Settings,
} from 'lucide-react';
import type { TournamentEvent, EventCategory, TournamentEntry } from '@modules/events/types';
import type { FirebaseAdminSportIcon } from '@infra/firebase/adminIcons';
import { EventCategoriesManager } from './EventCategoriesManager';
import { EventRegistrationsManager } from './EventRegistrationsManager';
import { EventFormedTeamsView } from './EventFormedTeamsView';

export type EventDashboardTab =
  | 'categories'
  | 'registrations'
  | 'formed-teams'
  | 'pending-payments'
  | 'checkins'
  | 'config';

interface Props {
  event: TournamentEvent;
  activeSports: FirebaseAdminSportIcon[];
  adminEmail?: string;
  onBackToEvents: () => void;
  onEditEventConfig: () => void;
  onUpdateEvent: (updatedEvent: TournamentEvent) => void;
}

export const EventDashboardView: React.FC<Props> = ({
  event,
  activeSports,
  adminEmail,
  onBackToEvents,
  onEditEventConfig,
  onUpdateEvent,
}) => {
  const [activeTab, setActiveTab] = useState<EventDashboardTab>('categories');

  const categories = event.categories || [];
  const entries = event.entries || [];
  const pairs = event.pairs || [];

  const pendingPaymentsCount = entries.filter(
    (e) => !e.paymentStatus || e.paymentStatus === 'Pendente'
  ).length;

  const checkedInCount = entries.filter((e) => e.checkedIn).length;

  const handleUpdateCategories = (newCategories: EventCategory[]) => {
    onUpdateEvent({ ...event, categories: newCategories });
  };

  const handleUpdateEntries = (newEntries: TournamentEntry[]) => {
    onUpdateEvent({ ...event, entries: newEntries });
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Event Header Banner */}
      <div className="bg-white p-5 rounded-[2.5rem] shadow-sm border border-slate-100 space-y-4">
        {/* Header layout according to Image 4:
            Line 1: Tournament Title (left) + Chevron edit button (top right)
            Line 2: PIN & Status Badges (left) + Voltar button (bottom right) */}
        <div className="space-y-3">
          {/* First line: Nome do torneio + Botão Chevron (canto superior direito) */}
          <div className="flex items-start justify-between gap-2">
            <h1 className="text-base font-black text-slate-800 tracking-tight leading-tight flex-1">
              {event.name}
            </h1>

            {/* Botão Chevron no canto superior direito - abre direto o cadastro para edição */}
            <button
              onClick={onEditEventConfig}
              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl active:scale-95 transition-all shrink-0"
              title="Editar cadastro do evento"
            >
              <ChevronDown size={20} />
            </button>
          </div>

          {/* Second line: Badges (PIN & Status) + Botão Voltar (canto inferior direito) */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-black uppercase text-amber-600 bg-amber-50 px-2.5 py-1 rounded-md">
                PIN: {event.pin}
              </span>
              <span className="text-[11px] font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-md capitalize">
                {event.eventStatus || 'Em configuração'}
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
                className={`text-[10px] font-black uppercase tracking-wider ${
                  activeTab === 'categories' ? 'text-emerald-100' : 'text-slate-400'
                }`}
              >
                Categorias
              </p>
            </div>
          </button>

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
                className={`text-[10px] font-black uppercase tracking-wider ${
                  activeTab === 'registrations' ? 'text-emerald-100' : 'text-slate-400'
                }`}
              >
                Inscrições
              </p>
            </div>
          </button>

          {/* Card 3: Times Formados */}
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
              <span className="text-2xl font-black leading-none">{pairs.length}</span>
            </div>
            <div>
              <p
                className={`text-[10px] font-black uppercase tracking-wider ${
                  activeTab === 'formed-teams' ? 'text-blue-100' : 'text-slate-400'
                }`}
              >
                Times formados
              </p>
            </div>
          </button>

          {/* Card 4: Pagamentos Pendentes */}
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
            <div>
              <p
                className={`text-[10px] font-black uppercase tracking-wider ${
                  activeTab === 'pending-payments' ? 'text-amber-100' : 'text-slate-400'
                }`}
              >
                Pagamentos pendentes
              </p>
            </div>
          </button>

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
                className={`text-[10px] font-black uppercase tracking-wider ${
                  activeTab === 'checkins' ? 'text-indigo-100' : 'text-slate-400'
                }`}
              >
                Check-ins realizados
              </p>
            </div>
          </button>

          {/* Card 6: Configurações do Torneio */}
          <button
            onClick={() => setActiveTab('config')}
            className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between space-y-2 ${
              activeTab === 'config'
                ? 'bg-purple-600 text-white border-purple-600 shadow-md scale-[1.02]'
                : 'bg-slate-50/80 hover:bg-white text-slate-700 border-slate-200 hover:border-purple-300'
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                  activeTab === 'config'
                    ? 'bg-white/20 text-white'
                    : 'bg-purple-100 text-purple-600'
                }`}
              >
                <Settings size={18} />
              </div>
              <span className="text-xs font-black truncate max-w-[110px] text-right">
                {activeSports.find((s) => s.id === event.config?.sportType)?.name ||
                  event.config?.sportType ||
                  'Beach Tennis'}
              </span>
            </div>
            <div>
              <p
                className={`text-[10px] font-black uppercase tracking-wider ${
                  activeTab === 'config' ? 'text-purple-100' : 'text-slate-400'
                }`}
              >
                Configurações
              </p>
            </div>
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'categories' && (
        <EventCategoriesManager
          event={event}
          activeSports={activeSports}
          onUpdateCategories={handleUpdateCategories}
          onUpdateEvent={onUpdateEvent}
        />
      )}

      {activeTab === 'registrations' && (
        <EventRegistrationsManager
          event={event}
          onUpdateEntries={handleUpdateEntries}
          onUpdateEvent={onUpdateEvent}
          adminEmail={adminEmail}
        />
      )}

      {activeTab === 'formed-teams' && <EventFormedTeamsView event={event} />}

      {activeTab === 'pending-payments' && (
        <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm text-center space-y-3">
          <DollarSign size={40} className="mx-auto text-amber-500 opacity-80" />
          <h3 className="text-lg font-black text-slate-800">Pagamentos Pendentes</h3>
          <p className="text-xs text-slate-400 font-bold max-w-md mx-auto">
            Módulo financeiro de pagamentos pendentes. Atualmente {pendingPaymentsCount} participante(s) estão com status pendente de confirmação.
          </p>
          <button
            onClick={() => setActiveTab('registrations')}
            className="bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-black px-4 py-2 rounded-xl transition-all mt-2"
          >
            Ver Inscrições e Pagamentos
          </button>
        </div>
      )}

      {activeTab === 'checkins' && (
        <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm text-center space-y-3">
          <CheckCircle2 size={40} className="mx-auto text-indigo-500 opacity-80" />
          <h3 className="text-lg font-black text-slate-800">Check-in dos Participantes</h3>
          <p className="text-xs text-slate-400 font-bold max-w-md mx-auto">
            Módulo de recepção e check-in presencial no evento. {checkedInCount} de {entries.length} participantes já efetuaram o check-in.
          </p>
        </div>
      )}

      {activeTab === 'config' && (
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-5">
          <div className="flex items-center gap-2 border-b pb-3">
            <Settings size={20} className="text-purple-600" />
            <h3 className="font-black text-slate-800 text-sm">Configurações do torneio</h3>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-700">Travar regras para as partidas</span>
              <input
                type="checkbox"
                checked={event.config?.isLocked || false}
                onChange={(e) =>
                  onUpdateEvent({
                    ...event,
                    config: { ...event.config, sets: event.config?.sets || 1, gamesPerSet: event.config?.gamesPerSet || 6, noAd: event.config?.noAd ?? true, sportType: event.config?.sportType || 'beach-tennis', isLocked: e.target.checked },
                  })
                }
                className="w-5 h-5 accent-purple-600 rounded cursor-pointer"
              />
            </div>

            <div className={`space-y-4 transition-all ${event.config?.isLocked ? 'opacity-50 pointer-events-none' : ''}`}>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 ml-1">Esporte</label>
                <select
                  value={event.config?.sportType || 'beach-tennis'}
                  onChange={(e) =>
                    onUpdateEvent({
                      ...event,
                      config: { ...event.config, sets: event.config?.sets || 1, gamesPerSet: event.config?.gamesPerSet || 6, noAd: event.config?.noAd ?? true, isLocked: event.config?.isLocked || false, sportType: e.target.value },
                    })
                  }
                  className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 font-bold text-xs outline-none focus:border-purple-500 cursor-pointer"
                >
                  {activeSports.length === 0 ? (
                    <option value="beach-tennis">Beach Tennis</option>
                  ) : (
                    activeSports.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 ml-1">Sets</label>
                  <select
                    value={event.config?.sets || 1}
                    onChange={(e) =>
                      onUpdateEvent({
                        ...event,
                        config: { ...event.config, gamesPerSet: event.config?.gamesPerSet || 6, noAd: event.config?.noAd ?? true, isLocked: event.config?.isLocked || false, sportType: event.config?.sportType || 'beach-tennis', sets: Number(e.target.value) as 1 | 3 | 5 },
                      })
                    }
                    className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 font-bold text-xs outline-none focus:border-purple-500 cursor-pointer"
                  >
                    <option value={1}>Set único</option>
                    <option value={3}>Melhor de 3</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 ml-1">Games por set</label>
                  <select
                    value={event.config?.gamesPerSet || 6}
                    onChange={(e) =>
                      onUpdateEvent({
                        ...event,
                        config: { ...event.config, sets: event.config?.sets || 1, noAd: event.config?.noAd ?? true, isLocked: event.config?.isLocked || false, sportType: event.config?.sportType || 'beach-tennis', gamesPerSet: Number(e.target.value) },
                      })
                    }
                    className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 font-bold text-xs outline-none focus:border-purple-500 cursor-pointer"
                  >
                    <option value={4}>4 games</option>
                    <option value={6}>6 games</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-xs font-black text-slate-700">Sistema sem vantagem (No-ad)</span>
                <input
                  type="checkbox"
                  checked={event.config?.noAd ?? true}
                  onChange={(e) =>
                    onUpdateEvent({
                      ...event,
                      config: { ...event.config, sets: event.config?.sets || 1, gamesPerSet: event.config?.gamesPerSet || 6, isLocked: event.config?.isLocked || false, sportType: event.config?.sportType || 'beach-tennis', noAd: e.target.checked },
                    })
                  }
                  className="w-5 h-5 accent-purple-600 rounded cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
