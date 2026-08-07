import React, { useState } from 'react';
import { Edit3, Image as ImageIcon, Loader2, Plus, Save, Ticket, Trash2, X, ChevronRight, ArrowLeft } from 'lucide-react';
import type { RefObject } from 'react';
import { EVENT_STATUS_OPTIONS, type EventStatusOption, type TournamentEntry, type TournamentEvent } from '@modules/events/types';
import type { FirebaseAdminSportIcon } from '@infra/firebase/adminIcons';
import { getDb } from '@infra/firebase';
import { fetchEventEntries } from '@infra/firebase/events';
import { Button } from '@shared/components/Button';
import { Toggle } from '@shared/components/Toggle';
import { EventDashboardView } from './EventDashboardView';

interface AdminEventsPanelProps {
  eventList: TournamentEvent[];
  editingEvent: TournamentEvent | null;
  isLoadingEvents: boolean;
  isSavingEvent: boolean;
  bannerInputRef: RefObject<HTMLInputElement>;
  activeSports?: FirebaseAdminSportIcon[];
  onCreateEvent: () => void;
  onChangeEditingEvent: (event: TournamentEvent | null) => void;
  onSaveEvent: () => void;
  onSaveDashboardEvent?: (event: TournamentEvent) => void;
  onDeleteEvent: (pin: string) => void;
}

export const AdminEventsPanel: React.FC<AdminEventsPanelProps> = ({
  eventList,
  editingEvent,
  isLoadingEvents,
  isSavingEvent,
  bannerInputRef,
  activeSports = [],
  onCreateEvent,
  onChangeEditingEvent,
  onSaveEvent,
  onSaveDashboardEvent,
  onDeleteEvent,
}) => {
  const [selectedDashboardEvent, setSelectedDashboardEvent] = useState<TournamentEvent | null>(null);
  const [isLoadingEntries, setIsLoadingEntries] = useState(false);

  // Always prefer local selectedDashboardEvent (updated synchronously) over eventList
  // to avoid race condition: eventList only updates after async Firebase save
  const currentDashboardEvent = selectedDashboardEvent ?? null;

  const handleSelectDashboardEvent = async (event: TournamentEvent) => {
    setIsLoadingEntries(true);
    try {
      const db = getDb();
      if (db) {
        const fetchedEntries = await fetchEventEntries(db, event.pin);
        // Map FirebaseTournamentEntry to TournamentEntry shape
        const entries: TournamentEntry[] = fetchedEntries.map((fe) => ({
          email: fe.email,
          name: fe.name,
          nickname: fe.nickname,
          pin: fe.pin,
          joinedAt: fe.joinedAt,
          gender: fe.gender,
          checkedIn: fe.checkedIn,
        }));
        setSelectedDashboardEvent({ ...event, entries });
      } else {
        setSelectedDashboardEvent(event);
      }
    } catch {
      setSelectedDashboardEvent(event);
    } finally {
      setIsLoadingEntries(false);
    }
  };

  const handleUpdateDashboardEvent = (updated: TournamentEvent) => {
    setSelectedDashboardEvent(updated);
    if (onSaveDashboardEvent) {
      onSaveDashboardEvent(updated);
    }
  };

  // 1. DEDICATED EVENT EDIT SCREEN (Requirement a)
  if (editingEvent) {
    return (
      <div className="bg-slate-50 p-6 rounded-[2.5rem] border border-slate-200 space-y-5 animate-in slide-in-from-top-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onChangeEditingEvent(null)}
              className="p-1.5 text-slate-500 hover:text-black rounded-xl hover:bg-slate-200 transition-colors"
            >
              <ArrowLeft size={18} />
            </button>
            <h4 className="text-sm font-black text-slate-800 tracking-tight">Configurar evento</h4>
          </div>
          <button
            onClick={() => onChangeEditingEvent(null)}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-200 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 ml-1">Pin exclusivo (ex: CarmoFev26)</label>
            <input
              type="text"
              value={editingEvent.pin}
              onChange={(event) => onChangeEditingEvent({ ...editingEvent, pin: event.target.value })}
              placeholder="Pin do evento"
              className="w-full h-12 bg-white border border-slate-200 rounded-xl px-4 font-black text-sm outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 ml-1">Nome do evento</label>
            <input
              type="text"
              value={editingEvent.name}
              onChange={(event) => onChangeEditingEvent({ ...editingEvent, name: event.target.value })}
              placeholder="Nome visível"
              className="w-full h-12 bg-white border border-slate-200 rounded-xl px-4 font-black text-sm outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 ml-1">Data do Evento</label>
            <input
              type="text"
              value={editingEvent.eventDateText || ''}
              onChange={(event) => onChangeEditingEvent({ ...editingEvent, eventDateText: event.target.value })}
              placeholder="ex: 15 a 17 de Março"
              className="w-full h-12 bg-white border border-slate-200 rounded-xl px-4 font-black text-sm outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 ml-1">Data Inicio</label>
              <input
                type="date"
                value={editingEvent.startDate || ''}
                onChange={(event) => onChangeEditingEvent({ ...editingEvent, startDate: event.target.value })}
                className="w-full h-12 bg-white border border-slate-200 rounded-xl px-3 font-black text-xs outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 ml-1">Data fim</label>
              <input
                type="date"
                value={editingEvent.endDate || ''}
                onChange={(event) => onChangeEditingEvent({ ...editingEvent, endDate: event.target.value })}
                className="w-full h-12 bg-white border border-slate-200 rounded-xl px-3 font-black text-xs outline-none"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 ml-1">Quantidade de quadras</label>
            <input
              type="number"
              min={0}
              value={editingEvent.courtsCount ?? ''}
              onChange={(event) => onChangeEditingEvent({ ...editingEvent, courtsCount: event.target.value ? Number(event.target.value) : undefined })}
              placeholder="ex: 4"
              className="w-full h-12 bg-white border border-slate-200 rounded-xl px-4 font-black text-sm outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 ml-1">Valor Inscrição (R$)</label>
              <input
                type="number"
                step="0.01"
                min={0}
                value={editingEvent.registrationFee ?? ''}
                onChange={(event) => onChangeEditingEvent({ ...editingEvent, registrationFee: event.target.value ? Number(event.target.value) : undefined })}
                placeholder="0,00"
                className="w-full h-12 bg-white border border-slate-200 rounded-xl px-3 font-black text-xs outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 ml-1">Valor categoria extra (R$)</label>
              <input
                type="number"
                step="0.01"
                min={0}
                value={editingEvent.extraCategoryFee ?? ''}
                onChange={(event) => onChangeEditingEvent({ ...editingEvent, extraCategoryFee: event.target.value ? Number(event.target.value) : undefined })}
                placeholder="0,00"
                className="w-full h-12 bg-white border border-slate-200 rounded-xl px-3 font-black text-xs outline-none"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 ml-1">Status do evento</label>
            <select
              value={editingEvent.eventStatus || 'Em configuração'}
              onChange={(event) => onChangeEditingEvent({ ...editingEvent, eventStatus: event.target.value as EventStatusOption })}
              className="w-full h-12 bg-white border border-slate-200 rounded-xl px-4 font-black text-sm outline-none cursor-pointer text-slate-700"
            >
              {EVENT_STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 ml-1">Banner do evento (imagem)</label>
            <div className="flex gap-3">
              <button
                onClick={() => bannerInputRef.current?.click()}
                className="flex-1 h-12 bg-white border border-slate-200 rounded-xl px-4 flex items-center justify-center gap-2 font-black text-xs text-slate-500"
              >
                <ImageIcon size={16} /> Carregar capa
              </button>
              {editingEvent.bannerUrl && (
                <div className="w-12 h-12 rounded-xl overflow-hidden border border-slate-200 shrink-0">
                  <img src={editingEvent.bannerUrl} className="w-full h-full object-cover" />
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between px-1 pt-1">
            <span className="text-[10px] font-black text-slate-400">Ativo</span>
            <Toggle
              id="sw-event-active"
              checked={editingEvent.active}
              onChange={(active) => onChangeEditingEvent({ ...editingEvent, active })}
            />
          </div>
        </div>

        <Button onClick={onSaveEvent} disabled={isSavingEvent} className="w-full !bg-amber-500 !py-4 rounded-xl font-black flex gap-2 text-white">
          {isSavingEvent ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />} Salvar evento
        </Button>
      </div>
    );
  }

  // 2. DEDICATED EVENT DASHBOARD VIEW
  if (currentDashboardEvent) {
    return (
      <EventDashboardView
        event={currentDashboardEvent}
        activeSports={activeSports}
        onBackToEvents={() => setSelectedDashboardEvent(null)}
        onEditEventConfig={() => onChangeEditingEvent(currentDashboardEvent)}
        onUpdateEvent={handleUpdateDashboardEvent}
      />
    );
  }

  // 3. MAIN EVENT MANAGEMENT LIST VIEW
  return (
    <div className="space-y-6 animate-in fade-in">
      <section className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-white space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center">
              <Ticket size={22} />
            </div>
            <h3 className="font-black text-black tracking-tight leading-none">Gestão de eventos</h3>
          </div>
          <button
            onClick={() => {
              setSelectedDashboardEvent(null);
              onCreateEvent();
            }}
            className="p-2 bg-amber-500 text-white rounded-xl active:scale-90 shadow-sm"
          >
            <Plus size={20} />
          </button>
        </div>

        {/* Event List */}
        <div className="space-y-2.5">
          {(isLoadingEvents || isLoadingEntries) ? (
            <div className="py-12 flex flex-col items-center gap-3 text-slate-300">
              <Loader2 className="animate-spin" size={32} />
              <span className="text-xs font-bold tracking-tight">
                {isLoadingEntries ? 'Carregando inscrições...' : 'Carregando eventos...'}
              </span>
            </div>
          ) : eventList.length === 0 ? (
            <div className="bg-slate-50 rounded-3xl p-10 text-center border-2 border-dashed border-slate-200">
              <p className="text-slate-400 font-bold text-sm">Nenhum evento criado ainda.</p>
            </div>
          ) : (
            eventList.map((event) => (
              <div
                key={event.pin}
                onClick={() => handleSelectDashboardEvent(event)}
                className="bg-white py-3 px-4 rounded-[1.5rem] shadow-xs border border-slate-100 flex items-center justify-between group cursor-pointer hover:border-amber-300 hover:shadow-sm transition-all"
              >
                <div className="flex-1 min-w-0 pr-3">
                  <p className="font-black text-black text-sm truncate leading-tight">{event.name}</p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                    <p className="text-[10px] font-black text-amber-500 uppercase">{event.pin}</p>
                    <span className="text-[8px] font-black text-slate-300">•</span>
                    <p className={`text-[8px] font-black uppercase ${event.active ? 'text-green-500' : 'text-red-500'}`}>
                      {event.active ? 'Ativo' : 'Inativo'}
                    </p>
                    {event.eventStatus && (
                      <>
                        <span className="text-[8px] font-black text-slate-300">•</span>
                        <p className="text-[8px] font-black uppercase text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                          {event.eventStatus}
                        </p>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteEvent(event.pin);
                    }}
                    className="p-2.5 bg-red-50 text-red-500 rounded-xl border border-red-100 active:scale-90 transition-all hover:bg-red-100"
                    title="Excluir evento"
                  >
                    <Trash2 size={16} />
                  </button>
                  <ChevronRight size={18} className="text-slate-300 group-hover:text-amber-500 transition-colors" />
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
};
