import React, { useState, type RefObject } from 'react';
import { Edit3, Image as ImageIcon, Loader2, Plus, Save, Ticket, Trash2, X, ChevronRight, ChevronUp, FileText, ShieldCheck, Search } from 'lucide-react';
import {
  EVENT_STATUS_OPTIONS,
  EVENT_TYPE_OPTIONS,
  DRAW_TYPE_OPTIONS,
  type EventStatusOption,
  type EventTypeOption,
  type DrawTypeOption,
  type TournamentEntry,
  type TournamentEvent,
} from '@modules/events/types';
import { findUserByPin, findUsersByPins, getDb } from '@infra/firebase';
import { ensureEventEntriesRegistrationIds, fetchEventByPin, fetchEventEntries, subscribeEventEntries } from '@infra/firebase/events';
import type { FirebaseAdminSportIcon } from '@infra/firebase/adminIcons';
import { Button } from '@shared/components/Button';
import { Toggle } from '@shared/components/Toggle';
import { EventDashboardView } from './EventDashboardView';
import { isPrimaryAdminEmail } from '@modules/events/services/eventAdminAccess';

interface AdminEventsPanelProps {
  eventList: TournamentEvent[];
  editingEvent: TournamentEvent | null;
  selectedDashboardEvent?: TournamentEvent | null;
  onSelectDashboardEvent?: (event: TournamentEvent | null | ((prev: TournamentEvent | null) => TournamentEvent | null)) => void;
  isLoadingEvents: boolean;
  isSavingEvent: boolean;
  bannerInputRef: RefObject<HTMLInputElement>;
  activeSports?: FirebaseAdminSportIcon[];
  adminEmail?: string;
  onCreateEvent: () => void;
  onStartEditEvent?: (event: TournamentEvent) => void;
  onChangeEditingEvent: (event: TournamentEvent | null) => void;
  onSaveEvent: () => void;
  onSaveDashboardEvent?: (event: TournamentEvent) => void;
  onDeleteEvent: (pin: string) => void;
}

export const AdminEventsPanel: React.FC<AdminEventsPanelProps> = ({
  eventList,
  editingEvent,
  selectedDashboardEvent: selectedDashboardEventProp,
  onSelectDashboardEvent,
  isLoadingEvents,
  isSavingEvent,
  bannerInputRef,
  activeSports = [],
  adminEmail,
  onCreateEvent,
  onStartEditEvent,
  onChangeEditingEvent,
  onSaveEvent,
  onSaveDashboardEvent,
  onDeleteEvent,
}) => {
  const [localSelectedDashboardEvent, setLocalSelectedDashboardEvent] = useState<TournamentEvent | null>(null);
  const selectedDashboardEvent = selectedDashboardEventProp !== undefined ? selectedDashboardEventProp : localSelectedDashboardEvent;
  const setSelectedDashboardEvent = (val: TournamentEvent | null | ((prev: TournamentEvent | null) => TournamentEvent | null)) => {
    if (onSelectDashboardEvent) {
      if (typeof val === 'function') {
        onSelectDashboardEvent(val(selectedDashboardEvent));
      } else {
        onSelectDashboardEvent(val);
      }
    } else {
      setLocalSelectedDashboardEvent(val);
    }
  };
  const [isLoadingEntries, setIsLoadingEntries] = useState(false);
  const [coAdminPin, setCoAdminPin] = useState('');
  const [coAdminLookupName, setCoAdminLookupName] = useState('');
  const [coAdminNamesByPin, setCoAdminNamesByPin] = useState<Record<string, string>>({});
  const [isSearchingCoAdminPin, setIsSearchingCoAdminPin] = useState(false);
  const [pendingCoAdminRemovalPin, setPendingCoAdminRemovalPin] = useState<string | null>(null);
  const regulationInputRef = React.useRef<HTMLInputElement>(null);
  const canManageEventAdmins = isPrimaryAdminEmail(adminEmail);

  // Sync selectedDashboardEvent with updated eventList only for fields that
  // don't exist in local state (like active, name, eventStatus, etc.)
  // We preserve categories and entries which are managed locally.
  React.useEffect(() => {
    if (selectedDashboardEvent) {
      const updatedInList = eventList.find((e) => e.pin === selectedDashboardEvent.pin);
      if (updatedInList) {
        setSelectedDashboardEvent((prev) =>
          prev
            ? {
                ...updatedInList,          // Base: latest from list (has name, status, etc.)
                pairs: prev.pairs ?? updatedInList.pairs, // Prefer local pairs
                categories: prev.categories ?? updatedInList.categories, // Prefer local categories
                sponsors: prev.sponsors ?? updatedInList.sponsors,     // Prefer local sponsors
                entries: prev.entries,     // Always keep locally loaded entries
              }
            : null
        );
      }
    }
  }, [eventList]);

  const handleSaveEventAndSyncDashboard = () => {
    if (editingEvent) {
      if (selectedDashboardEvent && selectedDashboardEvent.pin === editingEvent.pin) {
        setSelectedDashboardEvent({
          ...selectedDashboardEvent,
          ...editingEvent,
        });
      }
    }
    onSaveEvent();
  };

  // Always prefer local selectedDashboardEvent (updated synchronously) over eventList
  // to avoid race condition: eventList only updates after async Firebase save
  const currentDashboardEvent = selectedDashboardEvent ?? null;

  const handleSelectDashboardEvent = async (event: TournamentEvent) => {
    setIsLoadingEntries(true);
    // Find freshest event from eventList props to ensure categories and eventStatus aren't lost
    const freshestEvent = eventList.find((e) => e.pin === event.pin) || event;
    try {
      const db = getDb();
      if (db) {
        const [freshEventDoc, fetchedEntries] = await Promise.all([
          fetchEventByPin(db, event.pin),
          fetchEventEntries(db, event.pin),
        ]);
        const baseEvent: TournamentEvent = {
          ...freshestEvent,
          ...(freshEventDoc ? {
            name: freshEventDoc.name || freshestEvent.name,
            bannerUrl: freshEventDoc.bannerUrl ?? freshestEvent.bannerUrl,
            active: freshEventDoc.active ?? freshestEvent.active,
            pairs: (freshEventDoc.pairs as any) || freshestEvent.pairs || [],
            matches: (freshEventDoc.matches as any) || freshestEvent.matches,
            coAdminPins: freshEventDoc.coAdminPins || freshestEvent.coAdminPins,
            regulationUrl: freshEventDoc.regulationUrl || freshestEvent.regulationUrl,
            regulationFileName: freshEventDoc.regulationFileName || freshestEvent.regulationFileName,
            information: freshEventDoc.information || freshestEvent.information,
            eventType: (freshEventDoc.eventType as any) || freshestEvent.eventType,
            setsCount: (freshEventDoc.setsCount as any) ?? freshestEvent.setsCount,
            teamDrawType: (freshEventDoc.teamDrawType as any) || freshestEvent.teamDrawType,
            bracketDrawType: (freshEventDoc.bracketDrawType as any) || freshestEvent.bracketDrawType,
            matchDrawType: (freshEventDoc.matchDrawType as any) || freshestEvent.matchDrawType,
            ...(freshEventDoc as any),
          } : {}),
        };
        // Map FirebaseTournamentEntry to TournamentEntry shape
        const entries: TournamentEntry[] = fetchedEntries.map((fe) => ({
          email: fe.email,
          name: fe.name,
          nickname: fe.nickname,
          pin: fe.pin,
          joinedAt: fe.joinedAt,
          gender: fe.gender,
          checkedIn: fe.checkedIn,
          phone: fe.phone || '',
          shirtSize: fe.shirtSize || 'M',
          categoryIds: fe.categoryIds || [],
          dueAmount: fe.dueAmount,
          paidAmount: fe.paidAmount,
          paymentStatus: fe.paymentStatus,
          payments: fe.payments,
          partnerName: fe.partnerName,
          partnerEmail: fe.partnerEmail,
          partnerPhone: fe.partnerPhone,
          categoryPartners: fe.categoryPartners,
        }));
        setSelectedDashboardEvent({ ...baseEvent, entries });
      } else {
        setSelectedDashboardEvent(freshestEvent);
      }
    } catch {
      setSelectedDashboardEvent(freshestEvent);
    } finally {
      setIsLoadingEntries(false);
    }
  };

  React.useEffect(() => {
    if (!selectedDashboardEvent) return;
    const db = getDb();
    if (!db) return;
    return subscribeEventEntries(db, selectedDashboardEvent.pin, (freshEntries) => {
      void ensureEventEntriesRegistrationIds(db, selectedDashboardEvent.pin, freshEntries).then((withIds) => {
        const entries: TournamentEntry[] = withIds.map((fe) => ({
          registrationId: fe.registrationId,
          email: fe.email,
          name: fe.name,
          nickname: fe.nickname,
          pin: fe.pin,
          joinedAt: fe.joinedAt,
          gender: fe.gender,
          checkedIn: fe.checkedIn,
          categoryIds: fe.categoryIds || [],
          phone: fe.phone || '',
          shirtSize: fe.shirtSize || 'M',
          dueAmount: fe.dueAmount,
          paidAmount: fe.paidAmount,
          paymentStatus: fe.paymentStatus,
          payments: fe.payments,
          partnerName: fe.partnerName,
          partnerEmail: fe.partnerEmail,
          partnerPhone: fe.partnerPhone,
          categoryPartners: fe.categoryPartners,
        }));
        setSelectedDashboardEvent((current) => current ? { ...current, entries } : current);
      });
    });
  }, [selectedDashboardEvent?.pin]);

  React.useEffect(() => {
    const pins = editingEvent?.coAdminPins || [];
    setPendingCoAdminRemovalPin(null);
    if (pins.length === 0) {
      setCoAdminNamesByPin({});
      return;
    }

    const db = getDb();
    if (!db) return;

    findUsersByPins(db, pins)
      .then((usersByPin) => {
        const names: Record<string, string> = {};
        pins.forEach((pin) => {
          const normalizedPin = pin.toUpperCase().trim();
          names[normalizedPin] = usersByPin.get(normalizedPin)?.nickname || 'Administrador';
        });
        setCoAdminNamesByPin(names);
      })
      .catch(() => setCoAdminNamesByPin({}));
  }, [editingEvent?.coAdminPins]);

  React.useEffect(() => {
    const lookup = async () => {
      const pin = coAdminPin.toUpperCase().trim();
      if (pin.length !== 5) {
        setCoAdminLookupName('');
        return;
      }

      setIsSearchingCoAdminPin(true);
      const db = getDb();
      if (!db) {
        setIsSearchingCoAdminPin(false);
        return;
      }

      try {
        const user = await findUserByPin(db, pin);
        setCoAdminLookupName(user ? user.nickname : 'Usuário não localizado');
      } catch {
        setCoAdminLookupName('');
      } finally {
        setIsSearchingCoAdminPin(false);
      }
    };

    lookup();
  }, [coAdminPin]);

  const handleAddCoAdmin = () => {
    if (!editingEvent || !canManageEventAdmins) return;
    const pin = coAdminPin.toUpperCase().trim();
    if (pin.length < 5 || coAdminLookupName === 'Usuário não localizado') return;

    const currentAdmins = (editingEvent.coAdminPins || []).map((adminPin) => adminPin.toUpperCase().trim());
    if (currentAdmins.includes(pin)) return;

    onChangeEditingEvent({ ...editingEvent, coAdminPins: [...currentAdmins, pin] });
    setCoAdminPin('');
    setCoAdminLookupName('');
  };

  const handleConfirmRemoveCoAdmin = (pin: string) => {
    if (!editingEvent || !canManageEventAdmins) return;
    onChangeEditingEvent({
      ...editingEvent,
      coAdminPins: (editingEvent.coAdminPins || []).filter((adminPin) => adminPin.toUpperCase().trim() !== pin.toUpperCase().trim()),
    });
    setPendingCoAdminRemovalPin(null);
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
            <h4 className="text-sm font-black text-slate-800 tracking-tight">Configurar evento</h4>
          </div>
          <button
            onClick={() => onChangeEditingEvent(null)}
            className="w-10 h-10 bg-slate-100 text-slate-700 rounded-full flex items-center justify-center hover:bg-slate-200 active:scale-95 transition-all"
            title="Recolher configuração"
          >
            <ChevronUp size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between px-1 pb-1 border-b border-slate-200">
            <span className="text-[10px] font-black text-slate-400">Ativo</span>
            <Toggle
              id="sw-event-active"
              checked={editingEvent.active}
              onChange={(active) => onChangeEditingEvent({ ...editingEvent, active })}
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
            <label className="text-[10px] font-black text-slate-400 ml-1">Regulamento (PDF)</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => regulationInputRef.current?.click()} className="flex-1 h-12 bg-white border border-slate-200 rounded-xl px-4 flex items-center justify-center gap-2 font-black text-xs text-slate-500"><FileText size={16} /> {editingEvent.regulationFileName || 'Carregar regulamento'}</button>
              <input ref={regulationInputRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => onChangeEditingEvent({ ...editingEvent, regulationUrl: String(reader.result), regulationFileName: file.name }); reader.readAsDataURL(file); }} />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 ml-1">Informações do evento</label>
            <textarea rows={5} value={editingEvent.information || ''} onChange={(event) => onChangeEditingEvent({ ...editingEvent, information: event.target.value })} placeholder="Orientações e informações para os participantes" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 font-bold text-xs outline-none resize-y" />
          </div>

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
            <label className="text-[10px] font-black text-slate-400 ml-1">Local (Clube / Cidade)</label>
            <input
              type="text"
              value={editingEvent.location || ''}
              onChange={(event) => onChangeEditingEvent({ ...editingEvent, location: event.target.value })}
              placeholder="ex: Clube Carmo - Belo Horizonte"
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

          <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2">
              <ShieldCheck size={17} className="text-indigo-600" />
              <div>
                <p className="text-xs font-black text-slate-900">Administradores do evento</p>
                <p className="text-[10px] font-bold text-slate-400">Acesso liberado somente com evento ativo e dentro das datas.</p>
              </div>
            </div>

            {canManageEventAdmins && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={coAdminPin}
                      onChange={(event) => setCoAdminPin(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5))}
                      placeholder="PIN"
                      className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl px-4 pr-10 font-black text-sm uppercase outline-none focus:border-indigo-500"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300">
                      {isSearchingCoAdminPin ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddCoAdmin}
                    disabled={!coAdminPin || coAdminLookupName === 'Usuário não localizado'}
                    className="h-12 px-5 bg-indigo-600 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl font-black text-xs shadow-sm active:scale-95 transition-all"
                  >
                    Adicionar
                  </button>
                </div>
                {coAdminLookupName && (
                  <p className={`text-[10px] font-black ml-1 ${coAdminLookupName === 'Usuário não localizado' ? 'text-red-500' : 'text-indigo-600'}`}>
                    {coAdminLookupName}
                  </p>
                )}
              </div>
            )}

            {(editingEvent.coAdminPins || []).length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {(editingEvent.coAdminPins || []).map((pin) => {
                  const normalizedPin = pin.toUpperCase().trim();
                  const isConfirmingRemoval = pendingCoAdminRemovalPin === normalizedPin;
                  return (
                    <span key={normalizedPin} className="inline-flex items-center gap-2 rounded-xl bg-indigo-50 px-3 py-2 text-[11px] font-black text-indigo-700 border border-indigo-100">
                      {coAdminNamesByPin[normalizedPin] || 'Administrador'} - {normalizedPin}
                      {canManageEventAdmins && !isConfirmingRemoval && (
                        <button
                          type="button"
                          onClick={() => setPendingCoAdminRemovalPin(normalizedPin)}
                          className="text-indigo-400 hover:text-red-500 active:scale-90"
                          title="Remover administrador"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                      {canManageEventAdmins && isConfirmingRemoval && (
                        <span className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleConfirmRemoveCoAdmin(normalizedPin)}
                            className="rounded-lg bg-red-500 px-2 py-1 text-[10px] font-black text-white active:scale-95"
                          >
                            Confirmar
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingCoAdminRemovalPin(null)}
                            className="rounded-lg bg-white px-2 py-1 text-[10px] font-black text-slate-500 border border-slate-200 active:scale-95"
                          >
                            Cancelar
                          </button>
                        </span>
                      )}
                    </span>
                  );
                })}
              </div>
            ) : (
              <p className="text-[11px] font-bold text-slate-400">Nenhum administrador adicional cadastrado.</p>
            )}
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
            <label className="text-[10px] font-black text-slate-400 ml-1">Tipo de evento</label>
            <select
              value={editingEvent.eventType || 'Chave classificatória'}
              onChange={(event) => onChangeEditingEvent({ ...editingEvent, eventType: event.target.value as EventTypeOption })}
              className="w-full h-12 bg-white border border-slate-200 rounded-xl px-4 font-black text-sm outline-none cursor-pointer text-slate-700"
            >
              {EVENT_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 h-12">
            <span className="text-sm font-black text-slate-700">Set melhor de</span>
            <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
              {([1, 3, 5] as const).map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => onChangeEditingEvent({ ...editingEvent, setsCount: num })}
                  className={`w-10 h-8 rounded-lg text-xs font-black transition-all ${(editingEvent.setsCount ?? 1) === num ? 'bg-blue-600 text-white shadow-md' : 'text-slate-700'}`}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 ml-1">Sorteio formação times</label>
              <select
                value={editingEvent.teamDrawType || 'Manual'}
                onChange={(event) => onChangeEditingEvent({ ...editingEvent, teamDrawType: event.target.value as DrawTypeOption })}
                className="w-full h-12 bg-white border border-slate-200 rounded-xl px-3 font-black text-xs outline-none cursor-pointer text-slate-700"
              >
                {DRAW_TYPE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 ml-1">Sorteio das chaves</label>
              <select
                value={editingEvent.bracketDrawType || 'Manual'}
                onChange={(event) => onChangeEditingEvent({ ...editingEvent, bracketDrawType: event.target.value as DrawTypeOption })}
                className="w-full h-12 bg-white border border-slate-200 rounded-xl px-3 font-black text-xs outline-none cursor-pointer text-slate-700"
              >
                {DRAW_TYPE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 ml-1">Sorteio das partidas</label>
            <select
              value={editingEvent.matchDrawType || 'Manual'}
              onChange={(event) => onChangeEditingEvent({ ...editingEvent, matchDrawType: event.target.value as DrawTypeOption })}
              className="w-full h-12 bg-white border border-slate-200 rounded-xl px-4 font-black text-sm outline-none cursor-pointer text-slate-700"
            >
              {DRAW_TYPE_OPTIONS.map((option) => (
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



          {/* Quantidade de quadras movida para o final */}
          <div className="space-y-1 pt-2 border-t border-slate-200">
            <label className="text-[10px] font-black text-slate-400 ml-1">Quantidade de quadras</label>
            <input
              type="number"
              min={0}
              value={editingEvent.courtsCount ?? ''}
              onChange={(e) => {
                const count = e.target.value ? Math.max(0, Number(e.target.value)) : undefined;
                const currentNames = editingEvent.courtNames || [];
                let newNames: string[] = [];
                if (count && count > 0) {
                  newNames = Array.from({ length: count }, (_, i) => currentNames[i] || `Quadra ${i + 1}`);
                }
                onChangeEditingEvent({
                  ...editingEvent,
                  courtsCount: count,
                  courtNames: newNames,
                });
              }}
              placeholder="ex: 4"
              className="w-full h-12 bg-white border border-slate-200 rounded-xl px-4 font-black text-sm outline-none"
            />
          </div>

          {/* Campos dinâmicos para o nome de cada quadra */}
          {editingEvent.courtsCount && editingEvent.courtsCount > 0 ? (
            <div className="space-y-2 bg-slate-100 p-3 rounded-2xl border border-slate-200">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block ml-1">
                Nomes das Quadras
              </label>
              <div className="grid grid-cols-1 gap-2">
                {Array.from({ length: editingEvent.courtsCount }).map((_, index) => {
                  const currentNames = editingEvent.courtNames || [];
                  const val = currentNames[index] !== undefined ? currentNames[index] : `Quadra ${index + 1}`;
                  return (
                    <div key={index} className="flex items-center gap-2">
                      <span className="text-[11px] font-black text-slate-400 w-16 text-right shrink-0">
                        Quadra {index + 1}:
                      </span>
                      <input
                        type="text"
                        value={val}
                        onChange={(e) => {
                          const updatedNames = Array.from(
                            { length: editingEvent.courtsCount || 0 },
                            (_, i) => currentNames[i] || `Quadra ${i + 1}`
                          );
                          updatedNames[index] = e.target.value;
                          onChangeEditingEvent({
                            ...editingEvent,
                            courtNames: updatedNames,
                          });
                        }}
                        placeholder={`Nome da Quadra ${index + 1}`}
                        className="w-full h-10 bg-white border border-slate-200 rounded-xl px-3 font-bold text-xs outline-none focus:border-emerald-500"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        <Button onClick={handleSaveEventAndSyncDashboard} disabled={isSavingEvent} className="w-full !bg-amber-500 !py-4 rounded-xl font-black flex gap-2 text-white">
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
        onEditEventConfig={() => (onStartEditEvent ? onStartEditEvent(currentDashboardEvent) : onChangeEditingEvent(currentDashboardEvent))}
        onUpdateEvent={handleUpdateDashboardEvent}
        adminEmail={adminEmail}
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
                    <span className="text-[8px] font-black text-slate-300">•</span>
                    <p className="text-[8px] font-bold capitalize text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                      {event.eventStatus || 'Em configuração'}
                    </p>
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
