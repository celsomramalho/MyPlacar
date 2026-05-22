import { Edit3, Image as ImageIcon, Loader2, Plus, Save, Ticket, Trash2, X } from 'lucide-react';
import type { RefObject } from 'react';
import type { TournamentEvent } from '@modules/events/types';
import { Button } from '@shared/components/Button';
import { Toggle } from '@shared/components/Toggle';

interface AdminEventsPanelProps {
  eventList: TournamentEvent[];
  editingEvent: TournamentEvent | null;
  isLoadingEvents: boolean;
  isSavingEvent: boolean;
  bannerInputRef: RefObject<HTMLInputElement>;
  onCreateEvent: () => void;
  onChangeEditingEvent: (event: TournamentEvent | null) => void;
  onSaveEvent: () => void;
  onDeleteEvent: (pin: string) => void;
}

export const AdminEventsPanel = ({
  eventList,
  editingEvent,
  isLoadingEvents,
  isSavingEvent,
  bannerInputRef,
  onCreateEvent,
  onChangeEditingEvent,
  onSaveEvent,
  onDeleteEvent,
}: AdminEventsPanelProps) => (
  <div className="space-y-6 animate-in fade-in">
    <section className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-white space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center">
            <Ticket size={22} />
          </div>
          <h3 className="font-black text-black tracking-tight leading-none">Gestão de eventos</h3>
        </div>
        <button onClick={onCreateEvent} className="p-2 bg-amber-500 text-white rounded-xl active:scale-90 shadow-sm">
          <Plus size={20} />
        </button>
      </div>

      {editingEvent && (
        <div className="bg-slate-50 p-5 rounded-3xl border border-slate-200 space-y-5 animate-in slide-in-from-top-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-black text-slate-500 tracking-tight">Configurar evento</h4>
            <button onClick={() => onChangeEditingEvent(null)} className="p-1 text-slate-400">
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
            <div className="flex items-center justify-between px-1">
              <span className="text-[10px] font-black text-slate-400">Status do evento</span>
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
      )}

      <div className="space-y-3">
        {isLoadingEvents ? (
          <div className="py-12 flex flex-col items-center gap-3 text-slate-300">
            <Loader2 className="animate-spin" size={32} />
            <span className="text-xs font-bold tracking-tight">Carregando eventos...</span>
          </div>
        ) : eventList.length === 0 ? (
          <div className="bg-slate-50 rounded-3xl p-10 text-center border-2 border-dashed border-slate-200">
            <p className="text-slate-400 font-bold text-sm">Nenhum evento criado ainda.</p>
          </div>
        ) : (
          eventList.map((event) => (
            <div key={event.pin} className="bg-white p-5 rounded-[2rem] shadow-sm border border-slate-100 flex items-center justify-between group">
              <div className="flex-1 min-w-0 pr-4">
                <p className="font-black text-black text-sm truncate">{event.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-[10px] font-black text-amber-500 uppercase">{event.pin}</p>
                  <span className="text-[8px] font-black text-slate-300">•</span>
                  <p className={`text-[8px] font-black uppercase ${event.active ? 'text-green-500' : 'text-red-500'}`}>
                    {event.active ? 'Ativo' : 'Encerrado'}
                  </p>
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => onChangeEditingEvent(event)} className="p-3 bg-slate-50 text-slate-600 rounded-xl border border-slate-100 active:scale-90 transition-all">
                  <Edit3 size={16} />
                </button>
                <button onClick={() => onDeleteEvent(event.pin)} className="p-3 bg-red-50 text-red-500 rounded-xl border border-red-100 active:scale-90 transition-all">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  </div>
);
