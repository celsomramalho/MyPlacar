import { useState, useEffect, useCallback } from 'react';
import { type Firestore } from 'firebase/firestore';
import { CheckCircle } from 'lucide-react';
import { getDb } from '@infra/firebase';
import type { UserProfile } from '@modules/auth/types';
import { fetchRegisteredEvents } from '@modules/events/services/fetchRegisteredEvents';
import { getActiveEventEntryDate } from '@modules/events/services/getActiveEventEntryDate';
import { joinTournamentEvent } from '@modules/events/services/joinTournamentEvent';
import type { EventRegistration, PaymentItem, TournamentEntry, TournamentEvent } from '@modules/events/types';
import { useUI } from '@modules/ui/UIContext';
import { useGame } from '@modules/game/useGame';
import { safeJsonParse } from '@shared/utils/safeJsonParse';
import { getUrlParams } from '@app/appNavigation';

/** Evento ativo, inscrições e join por PIN/URL. */
export function useTournamentSession() {
  const { userProfile } = useGame();
  const { currentScreen, setCurrentScreen, setModalConfig, setPlayerQueue } = useUI();

  const [activeEvent, setActiveEvent] = useState<TournamentEvent | null>(() =>
    safeJsonParse('myPlacarActiveEvent', null),
  );
  const [userEntryDate, setUserEntryDate] = useState<number | null>(null);
  const [registeredEvents, setRegisteredEvents] = useState<EventRegistration[]>(() =>
    safeJsonParse('myPlacarRegisteredEvents', []) as EventRegistration[],
  );

  const clearTournamentSession = useCallback(() => {
    setActiveEvent(null);
    setRegisteredEvents([]);
    setUserEntryDate(null);
  }, []);

  useEffect(() => {
    if (activeEvent) {
      localStorage.setItem('myPlacarActiveEvent', JSON.stringify(activeEvent));
      const db = getDb();
      if (db && userProfile.email && navigator.onLine) {
        getActiveEventEntryDate(db as Firestore, activeEvent.pin, userProfile.email)
          .then(setUserEntryDate)
          .catch(() => setUserEntryDate(null));
      }
    } else {
      localStorage.removeItem('myPlacarActiveEvent');
      setUserEntryDate(null);
    }
  }, [activeEvent, userProfile.email]);

  useEffect(() => {
    localStorage.setItem('myPlacarRegisteredEvents', JSON.stringify(registeredEvents));
  }, [registeredEvents]);

  const fetchUserRegistrations = useCallback(async (email: string) => {
    const db = getDb();
    if (!db) return;
    try {
      const list = await fetchRegisteredEvents(db as Firestore, email);
      setRegisteredEvents(list);
    } catch (e) {
      console.error('Erro ao buscar inscrições:', e);
    }
  }, []);

  const handleJoinTournament = useCallback(
    async (pin: string, silent = false, profileOverride?: UserProfile & { phone?: string; shirtSize?: 'P' | 'M' | 'G'; partnerName?: string; partnerEmail?: string; partnerPhone?: string; categoryPartners?: Record<string, import('@modules/events/types').CategoryPartnerInfo>; payments?: PaymentItem[]; dueAmount?: number; paidAmount?: number; paymentStatus?: 'Pendente' | 'Pago' | 'Isento' }, paymentData?: { payments?: PaymentItem[]; dueAmount?: number; paidAmount?: number; paymentStatus?: 'Pendente' | 'Pago' | 'Isento' }, entryOverride?: Partial<TournamentEntry>) => {
      const db = getDb();
      const activeProfile = profileOverride || userProfile;
      if (!db || !navigator.onLine) {
        if (!silent) {
          setModalConfig({
            title: 'Erro',
            message: 'Verifique sua conexão com a internet.',
            onConfirm: () => setModalConfig(null),
          });
        }
        return;
      }
      if (!activeProfile.email) return;
      try {
        const joined = await joinTournamentEvent(db as Firestore, pin, activeProfile, paymentData, entryOverride || (profileOverride as unknown as Partial<TournamentEntry>));
        if (joined) {
          setUserEntryDate(joined.joinedAt);
          setActiveEvent(joined.event);
          setRegisteredEvents((prev) => {
            if (prev.some((e) => e.pin === pin)) return prev;
            return [joined.registration, ...prev];
          });
          setCurrentScreen('event-detail');
          if (!silent) {
            setModalConfig({
              title: 'Inscrição confirmada',
              message: `Você entrou no evento "${joined.event.name}".`,
              variant: 'success',
              icon: <CheckCircle className="text-green-500 w-16 h-16" />,
              onConfirm: () => setModalConfig(null),
            });
          }
        } else if (!silent) {
          setModalConfig({
            title: 'Atenção',
            message: 'O código do evento não foi encontrado ou está inativo.',
            onConfirm: () => setModalConfig(null),
          });
        }
      } catch {
        if (!silent) {
          setModalConfig({
            title: 'Erro',
            message: 'Falha ao buscar evento.',
            onConfirm: () => setModalConfig(null),
          });
        }
      }
    },
    [userProfile, setCurrentScreen, setModalConfig],
  );

  const handleExitTournament = useCallback(() => {
    setActiveEvent(null);
    setUserEntryDate(null);
    if (userProfile?.email) {
      fetchUserRegistrations(userProfile.email);
    }
    setCurrentScreen('tournaments');
  }, [userProfile?.email, fetchUserRegistrations, setCurrentScreen]);

  const handleSelectEvent = useCallback(
    (ev: TournamentEvent) => {
      setActiveEvent(ev);
      setCurrentScreen('event-detail');
    },
    [setCurrentScreen],
  );

  useEffect(() => {
    if (userProfile.email && navigator.onLine) {
      const db = getDb();
      if (db) {
        import('firebase/firestore').then(({ doc, getDoc }) => {
          getDoc(doc(db, 'user_queue_metadata', userProfile.email.toLowerCase().trim())).then(
            (snap) => {
              if (snap.exists() && snap.data().queue_list) {
                setPlayerQueue(snap.data().queue_list);
              }
            },
          );
        });
        fetchUserRegistrations(userProfile.email);
      }
    }
  }, [userProfile.pin, userProfile.email, fetchUserRegistrations, setPlayerQueue]);

  useEffect(() => {
    if (userProfile.email && userProfile.pin) {
      const params = getUrlParams();
      const isResetting = params.get('mode') === 'resetPassword' || params.get('oobCode');

      const pendingJoin = localStorage.getItem('myPlacarPendingJoinEvent');
      if (pendingJoin) {
        handleJoinTournament(pendingJoin, true, userProfile);
        localStorage.removeItem('myPlacarPendingJoinEvent');
      } else if (currentScreen === 'auth' && !isResetting) {
        setCurrentScreen('settings');
      }
    }
  }, [userProfile.email, userProfile.pin, currentScreen, handleJoinTournament, setCurrentScreen]);

  return {
    activeEvent,
    userEntryDate,
    registeredEvents,
    fetchUserRegistrations,
    handleJoinTournament,
    handleExitTournament,
    handleSelectEvent,
    clearTournamentSession,
  };
}
