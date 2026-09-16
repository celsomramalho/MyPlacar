import React, { useState, type RefObject } from 'react';
import { Loader2, Plus, Ticket } from 'lucide-react';
import type { TournamentEntry, TournamentEvent } from '@modules/events/types';
import { findUsersByPins, getDb } from '@infra/firebase';
import { ensureEventEntriesRegistrationIds, fetchEventByPin, fetchEventEntries, subscribeEventEntries } from '@infra/firebase/events';
import type { FirebaseAdminSportIcon } from '@infra/firebase/adminIcons';
import { EventDashboardView } from './EventDashboardView';
import { isPrimaryAdminEmail } from '@modules/events/services/eventAdminAccess';
import { AdminEventCard, EventConfigForm } from './events';

interface AdminEventsPanelProps {
  eventList: TournamentEvent[];
  editingEvent: TournamentEvent | null;
  selectedDashboardEvent?: TournamentEvent | null;
  onSelectDashboardEvent?: (event: TournamentEvent | null | ((prev: TournamentEvent | null) => TournamentEvent | null)) => void;
  onBackToTournaments?: () => void;
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
  onBackToTournaments,
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
  const [coAdminNamesByPin, setCoAdminNamesByPin] = useState<Record<string, string>>({});
  const isPrimaryAdmin = isPrimaryAdminEmail(adminEmail);
  const isReadOnlyRegistration = !isPrimaryAdmin;
  const canManageEventAdmins = isPrimaryAdmin;

  // Sync selectedDashboardEvent with updated eventList
  React.useEffect(() => {
    if (selectedDashboardEvent) {
      const updatedInList = eventList.find((e) => e.pin === selectedDashboardEvent.pin);
      if (updatedInList) {
        setSelectedDashboardEvent((prev) =>
          prev
            ? {
                ...updatedInList,
                pairs: prev.pairs ?? updatedInList.pairs,
                categories: prev.categories ?? updatedInList.categories,
                sponsors: prev.sponsors ?? updatedInList.sponsors,
                entries: prev.entries,
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

  const currentDashboardEvent = selectedDashboardEvent ?? null;

  const handleSelectDashboardEvent = async (event: TournamentEvent) => {
    setIsLoadingEntries(true);
    const freshestEvent = eventList.find((e) => e.pin === event.pin) || event;
    try {
      const db = getDb();
      if (db) {
        const [rawEventDoc, fetchedEntries] = await Promise.all([
          fetchEventByPin(db, event.pin),
          fetchEventEntries(db, event.pin),
        ]);
        const freshEventDoc = rawEventDoc as any;
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
            eventStatus: freshEventDoc.eventStatus || freshestEvent.eventStatus,
            paymentType: freshEventDoc.paymentType || freshestEvent.paymentType || 'manual',
            courtsCount: freshEventDoc.courtsCount ?? freshestEvent.courtsCount,
            courtNames: freshEventDoc.courtNames ?? freshestEvent.courtNames,
            interdictedCourts: freshEventDoc.interdictedCourts ?? freshestEvent.interdictedCourts,
            allowUserScoreEntry: freshEventDoc.allowUserScoreEntry ?? freshestEvent.allowUserScoreEntry,
            showRegisteredParticipants: freshEventDoc.showRegisteredParticipants ?? freshestEvent.showRegisteredParticipants,
            categories: (freshEventDoc.categories as any) || freshestEvent.categories || [],
            sponsors: (freshEventDoc.sponsors as any) || freshestEvent.sponsors || [],
          } : {}),
        };
        const entries: TournamentEntry[] = (fetchedEntries || []).map((fe) => ({
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

  const handleUpdateDashboardEvent = (updated: TournamentEvent) => {
    setSelectedDashboardEvent(updated);
    if (onSaveDashboardEvent) {
      onSaveDashboardEvent(updated);
    }
  };

  // 1. TELA DE CONFIGURAÇÃO / EDIÇÃO DO EVENTO
  if (editingEvent) {
    return (
      <EventConfigForm
        editingEvent={editingEvent}
        isReadOnlyRegistration={isReadOnlyRegistration}
        canManageEventAdmins={canManageEventAdmins}
        isSavingEvent={isSavingEvent}
        bannerInputRef={bannerInputRef}
        coAdminNamesByPin={coAdminNamesByPin}
        adminEmail={adminEmail}
        onChangeEditingEvent={onChangeEditingEvent}
        onSaveEvent={handleSaveEventAndSyncDashboard}
        onClose={() => onChangeEditingEvent(null)}
      />
    );
  }

  // 2. DASHBOARD DO EVENTO
  if (currentDashboardEvent) {
    return (
      <EventDashboardView
        event={currentDashboardEvent}
        activeSports={activeSports}
        onBackToEvents={() => {
          setSelectedDashboardEvent(null);
          if (!isPrimaryAdmin && onBackToTournaments) {
            onBackToTournaments();
          }
        }}
        onEditEventConfig={() => (onStartEditEvent ? onStartEditEvent(currentDashboardEvent) : onChangeEditingEvent(currentDashboardEvent))}
        onUpdateEvent={handleUpdateDashboardEvent}
        adminEmail={adminEmail}
      />
    );
  }

  // 3. LISTA DE EVENTOS DO PAINEL ADMIN
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
            className="p-2 bg-amber-500 text-white rounded-xl active:scale-90 shadow-sm cursor-pointer"
          >
            <Plus size={20} />
          </button>
        </div>

        {/* Lista de Eventos */}
        <div className="space-y-2.5">
          {isLoadingEvents || isLoadingEntries ? (
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
              <AdminEventCard
                key={event.pin}
                event={event}
                onSelect={handleSelectDashboardEvent}
                onDelete={onDeleteEvent}
              />
            ))
          )}
        </div>
      </section>
    </div>
  );
};
