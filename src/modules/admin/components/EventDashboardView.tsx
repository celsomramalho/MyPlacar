import React, { useState } from 'react';
import {
  ArrowLeft,
  Edit2,
  Tag,
  Users,
  Trophy,
  DollarSign,
  CheckCircle2,
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
  | 'checkins';

interface Props {
  event: TournamentEvent;
  activeSports: FirebaseAdminSportIcon[];
  onBackToEvents: () => void;
  onEditEventConfig: () => void;
  onUpdateEvent: (updatedEvent: TournamentEvent) => void;
}

export const EventDashboardView: React.FC<Props> = ({
  event,
  activeSports,
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
        {/* Title row + action buttons */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-[10px] font-black uppercase text-emerald-600 tracking-wider">
                Torneio Selecionado
              </span>
              <span className="text-[10px] font-black uppercase text-amber-500 bg-amber-50 px-2 py-0.5 rounded-md">
                PIN: {event.pin}
              </span>
              {event.eventStatus && (
                <span className="text-[10px] font-black uppercase text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                  {event.eventStatus}
                </span>
              )}
            </div>
            <h1 className="text-sm font-black text-slate-800 tracking-tight leading-tight truncate">
              {event.name}
            </h1>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onEditEventConfig}
              className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-xs px-3 py-2 rounded-2xl active:scale-95 transition-all"
            >
              <Edit2 size={14} /> Editar
            </button>
            <button
              onClick={onBackToEvents}
              className="flex items-center gap-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-black text-xs px-3 py-2 rounded-2xl active:scale-95 transition-all"
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
            className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between space-y-3 ${
              activeTab === 'categories'
                ? 'bg-emerald-500 text-white border-emerald-500 shadow-md scale-[1.02]'
                : 'bg-slate-50/80 hover:bg-white text-slate-700 border-slate-200 hover:border-emerald-300'
            }`}
          >
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                activeTab === 'categories'
                  ? 'bg-white/20 text-white'
                  : 'bg-emerald-100 text-emerald-600'
              }`}
            >
              <Tag size={18} />
            </div>
            <div>
              <p
                className={`text-[10px] font-black uppercase ${
                  activeTab === 'categories' ? 'text-emerald-100' : 'text-slate-400'
                }`}
              >
                Categorias
              </p>
              <p className="text-2xl font-black leading-none mt-1">{categories.length}</p>
              <p
                className={`text-[10px] font-bold mt-1 ${
                  activeTab === 'categories' ? 'text-white' : 'text-emerald-600'
                }`}
              >
                {categories.length === 1 ? '1 cadastrada' : `${categories.length} cadastradas`}
              </p>
            </div>
          </button>

          {/* Card 2: Inscrições */}
          <button
            onClick={() => setActiveTab('registrations')}
            className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between space-y-3 ${
              activeTab === 'registrations'
                ? 'bg-emerald-500 text-white border-emerald-500 shadow-md scale-[1.02]'
                : 'bg-slate-50/80 hover:bg-white text-slate-700 border-slate-200 hover:border-emerald-300'
            }`}
          >
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                activeTab === 'registrations'
                  ? 'bg-white/20 text-white'
                  : 'bg-emerald-100 text-emerald-600'
              }`}
            >
              <Users size={18} />
            </div>
            <div>
              <p
                className={`text-[10px] font-black uppercase ${
                  activeTab === 'registrations' ? 'text-emerald-100' : 'text-slate-400'
                }`}
              >
                Inscrições
              </p>
              <p className="text-2xl font-black leading-none mt-1">{entries.length}</p>
              <p
                className={`text-[10px] font-bold mt-1 ${
                  activeTab === 'registrations' ? 'text-white' : 'text-emerald-600'
                }`}
              >
                {entries.length === 1 ? '1 jogador' : `${entries.length} jogadores`}
              </p>
            </div>
          </button>

          {/* Card 3: Times Formados */}
          <button
            onClick={() => setActiveTab('formed-teams')}
            className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between space-y-3 ${
              activeTab === 'formed-teams'
                ? 'bg-blue-600 text-white border-blue-600 shadow-md scale-[1.02]'
                : 'bg-slate-50/80 hover:bg-white text-slate-700 border-slate-200 hover:border-blue-300'
            }`}
          >
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                activeTab === 'formed-teams'
                  ? 'bg-white/20 text-white'
                  : 'bg-blue-100 text-blue-600'
              }`}
            >
              <Trophy size={18} />
            </div>
            <div>
              <p
                className={`text-[10px] font-black uppercase ${
                  activeTab === 'formed-teams' ? 'text-blue-100' : 'text-slate-400'
                }`}
              >
                Times formados
              </p>
              <p className="text-2xl font-black leading-none mt-1">{pairs.length}</p>
              <p
                className={`text-[10px] font-bold mt-1 ${
                  activeTab === 'formed-teams' ? 'text-white' : 'text-blue-600'
                }`}
              >
                {pairs.length === 1 ? '1 dupla' : `${pairs.length} duplas`}
              </p>
            </div>
          </button>

          {/* Card 4: Pagamentos Pendentes */}
          <button
            onClick={() => setActiveTab('pending-payments')}
            className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between space-y-3 ${
              activeTab === 'pending-payments'
                ? 'bg-amber-500 text-white border-amber-500 shadow-md scale-[1.02]'
                : 'bg-slate-50/80 hover:bg-white text-slate-700 border-slate-200 hover:border-amber-300'
            }`}
          >
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                activeTab === 'pending-payments'
                  ? 'bg-white/20 text-white'
                  : 'bg-amber-100 text-amber-600'
              }`}
            >
              <DollarSign size={18} />
            </div>
            <div>
              <p
                className={`text-[10px] font-black uppercase ${
                  activeTab === 'pending-payments' ? 'text-amber-100' : 'text-slate-400'
                }`}
              >
                Pagamentos pendentes
              </p>
              <p className="text-2xl font-black leading-none mt-1">
                {pendingPaymentsCount}
              </p>
              <p
                className={`text-[10px] font-bold mt-1 ${
                  activeTab === 'pending-payments' ? 'text-white' : 'text-amber-600'
                }`}
              >
                {pendingPaymentsCount > 0 ? 'Ação necessária' : 'Regularizado'}
              </p>
            </div>
          </button>

          {/* Card 5: Check-ins Realizados */}
          <button
            onClick={() => setActiveTab('checkins')}
            className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between space-y-3 ${
              activeTab === 'checkins'
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-md scale-[1.02]'
                : 'bg-slate-50/80 hover:bg-white text-slate-700 border-slate-200 hover:border-indigo-300'
            }`}
          >
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                activeTab === 'checkins'
                  ? 'bg-white/20 text-white'
                  : 'bg-indigo-100 text-indigo-600'
              }`}
            >
              <CheckCircle2 size={18} />
            </div>
            <div>
              <p
                className={`text-[10px] font-black uppercase ${
                  activeTab === 'checkins' ? 'text-indigo-100' : 'text-slate-400'
                }`}
              >
                Check-ins realizados
              </p>
              <p className="text-2xl font-black leading-none mt-1">
                {checkedInCount}{' '}
                <span className="text-xs font-bold text-slate-400">/ {entries.length}</span>
              </p>
              <p
                className={`text-[10px] font-bold mt-1 ${
                  activeTab === 'checkins' ? 'text-white' : 'text-indigo-600'
                }`}
              >
                {entries.length > 0
                  ? `${Math.round((checkedInCount / entries.length) * 100)}% confirmados`
                  : 'Sem inscritos'}
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
        />
      )}

      {activeTab === 'registrations' && (
        <EventRegistrationsManager
          event={event}
          onUpdateEntries={handleUpdateEntries}
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
    </div>
  );
};
