import React, { useState, useMemo, useCallback, useRef } from 'react';
import type { Partner } from '@modules/partners/types';
import {
  ArrowLeft,
  Sparkles,
  Trophy,
  Users,
  Share2,
  Copy,
  Eye,
  Bell,
  Clock,
  CheckCircle2,
  Calendar,
  AlertCircle,
  Play,
  UserCheck,
  RotateCw,
  LogOut,
  X,
  Link2,
  CreditCard,
  Lock,
} from 'lucide-react';
import type {
  TournamentEvent,
  TournamentEntry,
  TournamentPair,
  TournamentMatch,
  MatchSetScore,
  EventCategory,
} from '../types';
import { minifyPairForStorage } from '../types';
import type { UserProfile } from '@modules/auth/types';
import {
  getDb,
  updateEvent,
  updateEventMatches,
  deleteUserEventRegistration,
  deleteEventEntry,
  saveEventEntry,
} from '@infra/firebase';
import { addCommunication } from '@infra/firebase/communications';

import type { Firestore } from 'firebase/firestore';
import { copyToClipboard } from '@shared/utils/clipboard';
import type { ModalConfig } from '@modules/ui/types';
import { EventRegistrationForm } from '../components/EventRegistrationForm';
import { RankingStandingStatsBlock } from '../components/RankingStandingStatsBlock';
import { Super8StandingStatsBlock } from '../components/Super8StandingStatsBlock';
import { MatchCard } from '../components/matches/MatchCard';
import { TeamCard } from '../components/teams/TeamCard';
import { ParticipantRow } from '../components/registration/ParticipantRow';
import { useEventPermissions } from '../domain/access/useEventPermissions';
import { useEventRealtime } from '../domain/realtime/useEventRealtime';
import { calculateSuper8PlayerStandings, calculateBracketStandings } from '../services/matchProgression';
import { calculateQueueState } from '../services/queueManager';
import { validateCategoryGenders } from '../services/matchGenerator';
import { createMercadoPagoPreference, getMercadoPagoPaymentStatus, type PixPaymentResult } from '../services/mercadoPagoCheckout';
import { getRegistrationPeriodStatus } from '../services/eventRegistrationPeriod';
import { isRankingEvent, isSuper8Event } from '../services/eventTypeHelpers';
import { openPdfOrUrl } from '../services/openRegulationPdf';

interface Props {
  event: TournamentEvent;
  onBack: () => void;
  userProfile: UserProfile;
  onExitTournament: () => void;
  onAddPartner: (pin: string, nickname: string, gender: 'M' | 'F', name?: string) => void;
  partners: Partner[];
  onStartTournamentMatch: (
    match: TournamentMatch,
    pair1: TournamentPair,
    pair2: TournamentPair,
    event: TournamentEvent
  ) => void;
  setModalConfig: React.Dispatch<React.SetStateAction<ModalConfig | null>>;
  appUrl: string;
  onOpenCommunications?: () => void;
  unreadCount?: number;
}

export const EventDetailScreen: React.FC<Props> = ({
  event: initialEvent,
  onBack,
  userProfile,
  onExitTournament,
  onStartTournamentMatch,
  setModalConfig,
  appUrl,
  onOpenCommunications,
  unreadCount = 0,
}) => {
  // Sincronização em tempo real unificada
  const { event, setEvent, entries, liveScores, refreshEntries } = useEventRealtime(initialEvent);

  // Permissões e papéis unificados
  const permissions = useEventPermissions(event, userProfile, entries);
  const {
    isReadOnly,
    canManageEvent,
    canSubmitScore,
    canViewParticipants,
    currentUserEntry,
    isParticipant,
    hasActiveRegistration,
    canViewEventDetails,
  } = permissions;

  const isRanking = isRankingEvent(event);
  const isSuper8 = isSuper8Event(event);
  const isChaveEvent = !isRanking && !isSuper8;

  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set());
  const [selectedPairs, setSelectedPairs] = useState<Set<string>>(new Set());
  const [userSelectedCategoryId, setUserSelectedCategoryId] = useState<string | null>(null);
  const [userCategoryView, setUserCategoryView] = useState<'entries' | 'teams' | 'matches'>(
    isChaveEvent ? 'teams' : 'entries'
  );
  const [showMyRegistrationModal, setShowMyRegistrationModal] = useState(false);
  const [isStartingPayment, setIsStartingPayment] = useState(false);
  const [pixPaymentData, setPixPaymentData] = useState<PixPaymentResult | null>(null);
  const pixPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [deleteRequestMatch, setDeleteRequestMatch] = useState<TournamentMatch | null>(null);
  const [deleteRequestReason, setDeleteRequestReason] = useState('');
  const [isSendingDeleteRequest, setIsSendingDeleteRequest] = useState(false);

  const saveMatchesTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const baseUrl = appUrl.endsWith('/') ? appUrl.slice(0, -1) : appUrl;
  const inviteLink = useMemo(() => {
    return `${baseUrl}/?joinEvent=${event.pin}&refPin=${userProfile.pin.toUpperCase()}`;
  }, [baseUrl, event.pin, userProfile.pin]);

  const qrCodeUrl = useMemo(() => {
    return `https://quickchart.io/qr?text=${encodeURIComponent(inviteLink)}&size=400&margin=1&ecLevel=H&dark=0f172a`;
  }, [inviteLink]);

  const defaultUserEntry: TournamentEntry = useMemo(() => {
    const isFree = (event?.registrationFee ?? 0) === 0 && (event?.extraCategoryFee ?? 0) === 0;
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
      dueAmount: isFree ? 0 : (event?.registrationFee ?? 0),
      paidAmount: 0,
      paymentStatus: isFree ? 'Confirmado' : 'Pendente',
      payments: [],
    };
  }, [userProfile, event]);

  const currentEntryDueAmount = currentUserEntry?.dueAmount ?? event.registrationFee ?? 0;
  const currentEntryPaidAmount = currentUserEntry?.paidAmount ?? currentUserEntry?.payments?.reduce((sum, item) => sum + Number(item.amount || 0), 0) ?? 0;
  const currentEntryPendingAmount = Math.max(0, currentEntryDueAmount - currentEntryPaidAmount);
  const canPayCurrentEntry = Boolean(
      currentUserEntry &&
      event.paymentType === 'mercadopago' &&
      currentEntryPendingAmount > 0 &&
      !['Confirmado', 'Pago', 'Isento'].includes(currentUserEntry.paymentStatus || '')
  );

  const checkDetailPixPaymentConfirmation = async (paymentId: string, email: string) => {
    try {
      const status = await getMercadoPagoPaymentStatus({
        paymentId,
        eventPin: event.pin,
        email,
      });
      if (status.status === 'approved') {
        if (pixPollingRef.current) clearInterval(pixPollingRef.current);
        pixPollingRef.current = null;
        setPixPaymentData(null);
        await refreshEntries();
        setModalConfig({
          title: 'Pagamento Confirmado',
          message: 'Seu pagamento Pix foi aprovado com sucesso!',
          onConfirm: () => setModalConfig(null),
        });
        return true;
      }
    } catch {
      // Polling silencioso
    }
    return false;
  };

  const handleStartMercadoPagoPayment = async () => {
    if (!currentUserEntry || isStartingPayment) return;
    setIsStartingPayment(true);
    try {
      const checkout = await createMercadoPagoPreference({
        eventPin: event.pin,
        entryEmail: currentUserEntry.email,
      });
      setPixPaymentData(checkout);

      if (pixPollingRef.current) clearInterval(pixPollingRef.current);
      pixPollingRef.current = setInterval(() => {
        void checkDetailPixPaymentConfirmation(checkout.paymentId, currentUserEntry.email);
      }, 4000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Não foi possível iniciar o pagamento.';
      setModalConfig({
        title: 'Pagamento indisponível',
        message,
        onConfirm: () => setModalConfig(null),
      });
    } finally {
      setIsStartingPayment(false);
    }
  };

  React.useEffect(() => {
    return () => {
      if (pixPollingRef.current) {
        clearInterval(pixPollingRef.current);
        pixPollingRef.current = null;
      }
    };
  }, []);

  React.useEffect(() => {
    if (!pixPaymentData || !currentUserEntry) return;
    const handleRecheck = () => {
      void checkDetailPixPaymentConfirmation(pixPaymentData.paymentId, currentUserEntry.email);
    };
    window.addEventListener('focus', handleRecheck);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') handleRecheck();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', handleRecheck);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [pixPaymentData, currentUserEntry]);

  // Mapa de categorias do usuário
  const userCategoryIds = useMemo(() => {
    const userEmail = userProfile.email.toLowerCase().trim();
    const userPin = userProfile.pin.toLowerCase().trim();
    const myEntry = entries.find(
      (e) =>
        (e.email && e.email.toLowerCase().trim() === userEmail) ||
        (e.pin && e.pin.toLowerCase().trim() === userPin)
    );
    return new Set(myEntry?.categoryIds || []);
  }, [entries, userProfile.email, userProfile.pin]);

  const userCategories = useMemo(() => {
    const all = event.categories || [];
    if (canManageEvent || isRanking) {
      return [...all].sort((a, b) => a.priority - b.priority);
    }
    return all
      .filter((c) => userCategoryIds.has(c.id))
      .sort((a, b) => a.priority - b.priority);
  }, [event.categories, canManageEvent, isRanking, userCategoryIds]);

  // Fila de espera global
  const orderedQueue = useMemo(() => {
    try {
      return calculateQueueState(event).orderedQueue;
    } catch {
      return [];
    }
  }, [event]);

  // Categoria ativa selecionada
  const activeCategory = useMemo(() => {
    if (userSelectedCategoryId) {
      const found = (event.categories || []).find((c) => c.id === userSelectedCategoryId);
      if (found) return found;
    }
    return userCategories[0] || event.categories?.[0] || null;
  }, [event.categories, userCategories, userSelectedCategoryId]);

  // Dados filtrados pela categoria ativa
  const categoryPairs = useMemo(() => {
    if (!activeCategory) return [];
    return (event.pairs || []).filter((p) => p.categoryId === activeCategory.id);
  }, [event.pairs, activeCategory]);

  const categoryMatches = useMemo(() => {
    if (!activeCategory) return [];
    return (event.matches || []).filter((m) => m.categoryId === activeCategory.id);
  }, [event.matches, activeCategory]);

  const pairsById = useMemo(() => {
    const map = new Map<string, TournamentPair>();
    (event.pairs || []).forEach((p) => map.set(p.id, p));
    return map;
  }, [event.pairs]);

  const isCurrentUserEntry = useCallback(
    (entry?: Partial<TournamentEntry> | null) => {
      if (!entry) return false;
      const userEmail = userProfile.email?.toLowerCase().trim();
      const userPin = userProfile.pin?.toUpperCase().trim();
      const entryEmail = entry.email?.toLowerCase().trim();
      const entryPin = entry.pin?.toUpperCase().trim();
      return Boolean(
        (userEmail && entryEmail && userEmail === entryEmail) ||
          (userPin && entryPin && userPin === entryPin)
      );
    },
    [userProfile.email, userProfile.pin]
  );

  const isCurrentUserInMatch = useCallback(
    (match: TournamentMatch) => {
      const pair1 = match.pair1 || (match.pair1Id ? pairsById.get(match.pair1Id) : undefined);
      const pair2 = match.pair2 || (match.pair2Id ? pairsById.get(match.pair2Id) : undefined);
      return Boolean(
        isCurrentUserEntry(pair1?.p1) ||
          isCurrentUserEntry(pair1?.p2) ||
          isCurrentUserEntry(pair2?.p1) ||
          isCurrentUserEntry(pair2?.p2)
      );
    },
    [isCurrentUserEntry, pairsById]
  );

  // Formação de duplas pelo gestor dentro da categoria
  const toggleEntrySelection = (entry: TournamentEntry) => {
    if (!canManageEvent || isSuper8 || entry.disabled || entry.paymentStatus === 'Cancelado') return;
    const key = entry.email || entry.pin;
    setSelectedEntries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        if (next.size >= 2) next.clear();
        next.add(key);
      }
      return next;
    });
  };

  const handleFormTeam = async () => {
    if (!canManageEvent || selectedEntries.size !== 2 || !activeCategory) return;
    const selectedList = entries.filter((e) => selectedEntries.has(e.email || e.pin));
    if (selectedList.length !== 2) return;

    if (selectedList.some((e) => e.disabled || e.paymentStatus === 'Cancelado')) {
      setModalConfig({
        title: 'Inscrição cancelada',
        message: 'Não é possível formar time com participantes com inscrição cancelada ou desativada.',
        onConfirm: () => setModalConfig(null),
      });
      return;
    }

    const [first, second] = selectedList;

    // Validação de gênero
    const genderRes = validateCategoryGenders(activeCategory, [first, second]);
    if (!genderRes.valid) {
      setModalConfig({
        title: 'Gênero incompatível',
        message: genderRes.message || 'Gênero incompatível com a categoria.',
        onConfirm: () => setModalConfig(null),
      });
      return;
    }


    const pairId = `pair_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const nextNumber = categoryPairs.length + 1;
    const teamCode = `${String(nextNumber).padStart(3, '0')} - ${activeCategory.abbreviation}`;

    const newPair: TournamentPair = {
      id: pairId,
      p1: first,
      p2: second,
      categoryId: activeCategory.id,
      teamNumber: nextNumber,
      teamCode,
      bracket: (nextNumber % 2 === 1 ? 1 : 2) as 1 | 2,
    };

    const nextPairs = [...(event.pairs || []), newPair];
    setEvent((prev) => ({ ...prev, pairs: nextPairs }));
    setSelectedEntries(new Set());

    const db = getDb();
    if (db) {
      try {
        await updateEvent(db as Firestore, event.pin, { pairs: nextPairs.map(minifyPairForStorage) });
      } catch (err) {
        console.error('Erro ao salvar dupla no Firestore:', err);
      }
    }
  };

  const handleUndoPair = async (pairId: string) => {
    if (!canManageEvent) return;
    setModalConfig({
      title: 'Desfazer time',
      message: 'Tem certeza que deseja desfazer este time? Confrontos associados serão cancelados.',
      onConfirm: async () => {
        setModalConfig(null);
        const nextPairs = (event.pairs || []).filter((p) => p.id !== pairId);
        const nextMatches = (event.matches || []).filter(
          (m) => m.pair1Id !== pairId && m.pair2Id !== pairId
        );
        setEvent((prev) => ({ ...prev, pairs: nextPairs, matches: nextMatches }));
        const db = getDb();
        if (db) {
          try {
            await updateEvent(db as Firestore, event.pin, {
              pairs: nextPairs.map(minifyPairForStorage),
              matches: nextMatches,
            });
          } catch (err) {
            console.error('Erro ao desfazer time no Firestore:', err);
          }
        }
      },
      onCancel: () => setModalConfig(null),
    });
  };

  // Lançamento e Controle de Placares de Partida
  const handleScoreChange = (matchId: string, player: 'p1' | 'p2', rawVal: string) => {
    if (isReadOnly || !canSubmitScore) return;
    const parsedNum = rawVal.trim() === '' ? null : parseInt(rawVal, 10);
    const val = isNaN(parsedNum as number) ? null : parsedNum;

    const nextMatches = (event.matches || []).map((m) => {
      if (m.id !== matchId) return m;

      const currentScores: MatchSetScore[] = [
        {
          p1: m.scores?.[0]?.p1 !== undefined ? m.scores[0].p1 : null,
          p2: m.scores?.[0]?.p2 !== undefined ? m.scores[0].p2 : null,
        },
      ];

      currentScores[0] = {
        ...currentScores[0],
        [player]: val,
      };

      const s1 = currentScores[0].p1;
      const s2 = currentScores[0].p2;
      const hasAnyScore = s1 !== null || s2 !== null;
      const result = s1 !== null && s2 !== null ? `${s1}/${s2}` : m.result || '';

      return {
        ...m,
        scores: currentScores,
        result,
        status: m.status === 'finished' ? ('finished' as const) : hasAnyScore ? ('live' as const) : ('waiting' as const),
      };
    });

    setEvent((prev) => ({ ...prev, matches: nextMatches }));

    if (saveMatchesTimeoutRef.current) clearTimeout(saveMatchesTimeoutRef.current);
    saveMatchesTimeoutRef.current = setTimeout(async () => {
      const db = getDb();
      if (db) {
        try {
          await updateEventMatches(db as Firestore, event.pin, nextMatches);
        } catch (err) {
          console.error('Erro ao atualizar placar no Firestore:', err);
        }
      }
    }, 600);
  };

  const handleMatchDateChange = (matchId: string, dateVal: string) => {
    if (isReadOnly || !canSubmitScore) return;
    const nextMatches = (event.matches || []).map((m) =>
      m.id !== matchId ? m : { ...m, matchDate: dateVal || undefined }
    );
    setEvent((prev) => ({ ...prev, matches: nextMatches }));

    if (saveMatchesTimeoutRef.current) clearTimeout(saveMatchesTimeoutRef.current);
    saveMatchesTimeoutRef.current = setTimeout(async () => {
      const db = getDb();
      if (db) {
        try {
          await updateEventMatches(db as Firestore, event.pin, nextMatches);
        } catch (err) {
          console.error('Erro ao salvar data da partida:', err);
        }
      }
    }, 600);
  };

  const handleFinishRankingMatch = async (matchId: string) => {
    if (isReadOnly || !canSubmitScore) return;
    const match = (event.matches || []).find((m) => m.id === matchId);
    if (!match) return;

    if (!match.matchDate) {
      setModalConfig({
        title: 'Data obrigatória',
        message: 'Informe a data da partida antes de finalizar.',
        onConfirm: () => setModalConfig(null),
      });
      return;
    }

    const s1 = match.scores?.[0]?.p1;
    const s2 = match.scores?.[0]?.p2;

    if (s1 === null || s1 === undefined || s2 === null || s2 === undefined) {
      setModalConfig({
        title: 'Placar incompleto',
        message: 'Digite o placar de ambas as equipes antes de finalizar.',
        onConfirm: () => setModalConfig(null),
      });
      return;
    }

    const n1 = Number(s1);
    const n2 = Number(s2);
    if (n1 === n2) {
      setModalConfig({
        title: 'Empate não permitido',
        message: 'O placar não pode terminar empatado.',
        onConfirm: () => setModalConfig(null),
      });
      return;
    }

    const winnerPairId = n1 > n2 ? match.pair1Id : match.pair2Id;
    const loserPairId = n1 > n2 ? match.pair2Id : match.pair1Id;
    const pair1Obj = match.pair1 || (match.pair1Id ? pairsById.get(match.pair1Id) : undefined);
    const pair2Obj = match.pair2 || (match.pair2Id ? pairsById.get(match.pair2Id) : undefined);

    const nextMatches = (event.matches || []).map((m) => {
      if (m.id !== matchId) return m;
      return {
        ...m,
        status: 'finished' as const,
        result: `${n1}/${n2}`,
        winnerPairId,
        loserPairId,
        pair1: pair1Obj ? minifyPairForStorage(pair1Obj) : m.pair1,
        pair2: pair2Obj ? minifyPairForStorage(pair2Obj) : m.pair2,
        finishedAt: new Date().toISOString(),
      };
    });

    setEvent((prev) => ({ ...prev, matches: nextMatches }));
    const db = getDb();
    if (db) {
      try {
        await updateEvent(db as Firestore, event.pin, { matches: nextMatches });
      } catch (err) {
        console.error('Erro ao finalizar partida:', err);
      }
    }
  };

  const handleReopenMatch = async (matchId: string) => {
    if (isReadOnly || !canSubmitScore) return;
    const match = (event.matches || []).find((m) => m.id === matchId);
    if (isRanking && (!match || !isCurrentUserInMatch(match))) return;

    const nextMatches = (event.matches || []).map((m) => {
      if (m.id !== matchId) return m;
      return {
        ...m,
        status: 'live' as const,
        winnerPairId: undefined,
        loserPairId: undefined,
      };
    });

    setEvent((prev) => ({ ...prev, matches: nextMatches }));
    const db = getDb();
    if (db) {
      try {
        await updateEvent(db as Firestore, event.pin, { matches: nextMatches });
      } catch (err) {
        console.error('Erro ao reabrir partida:', err);
      }
    }
  };

  const getMatchRequestDetails = useCallback(
    (match: TournamentMatch) => {
      const pair1 = match.pair1 || (match.pair1Id ? pairsById.get(match.pair1Id) : undefined);
      const pair2 = match.pair2 || (match.pair2Id ? pairsById.get(match.pair2Id) : undefined);
      const team1 = pair1
        ? `${pair1.p1.nickname || pair1.p1.name} & ${pair1.p2.nickname || pair1.p2.name}`
        : match.pair1Label || 'A definir';
      const team2 = pair2
        ? `${pair2.p1.nickname || pair2.p1.name} & ${pair2.p2.nickname || pair2.p2.name}`
        : match.pair2Label || 'A definir';
      const category = (event.categories || []).find((cat) => cat.id === match.categoryId);
      const matchCode = match.matchCode || String(match.matchNumber || 1).padStart(2, '0');
      const result = match.result ? ` | Placar: ${match.result}` : '';

      return {
        categoryLabel: category ? `${category.name} (${category.abbreviation})` : 'Categoria não informada',
        matchLabel: `[${matchCode}] ${team1} x ${team2}${result}`,
      };
    },
    [event.categories, pairsById]
  );

  const openDeleteMatchRequest = (matchId: string) => {
    const match = (event.matches || []).find((m) => m.id === matchId);
    if (!match || !isRanking || !isCurrentUserInMatch(match)) return;
    setDeleteRequestMatch(match);
    setDeleteRequestReason('');
  };

  const closeDeleteMatchRequest = () => {
    if (isSendingDeleteRequest) return;
    setDeleteRequestMatch(null);
    setDeleteRequestReason('');
  };

  const submitDeleteMatchRequest = async () => {
    if (!deleteRequestMatch || isSendingDeleteRequest) return;
    const reason = deleteRequestReason.trim();
    if (reason.length < 5) {
      setModalConfig({
        title: 'Motivo obrigatório',
        message: 'Informe o motivo da solicitação antes de enviar ao administrador.',
        onConfirm: () => setModalConfig(null),
      });
      return;
    }

    const db = getDb();
    if (!db) {
      setModalConfig({
        title: 'Sem conexão',
        message: 'Não foi possível enviar a solicitação agora. Tente novamente em instantes.',
        onConfirm: () => setModalConfig(null),
      });
      return;
    }

    const { categoryLabel, matchLabel } = getMatchRequestDetails(deleteRequestMatch);
    const requesterName = userProfile.nickname || userProfile.name || currentUserEntry?.nickname || currentUserEntry?.name || 'Participante';
    const requesterPin = userProfile.pin || currentUserEntry?.pin || '';
    const requesterEmail = userProfile.email || currentUserEntry?.email || '';

    setIsSendingDeleteRequest(true);
    try {
      await addCommunication(db as Firestore, {
        type: 'message',
        title: 'Solicitação de remoção de partida',
        content: [
          `Evento: ${event.name} (PIN: ${event.pin})`,
          `Categoria: ${categoryLabel}`,
          `Partida: ${matchLabel}`,
          `Solicitante: ${requesterName}${requesterPin ? ` | PIN: ${requesterPin}` : ''}${requesterEmail ? ` | E-mail: ${requesterEmail}` : ''}`,
          `Motivo: ${reason}`,
        ].join('\n'),
        authorId: requesterPin || requesterEmail || 'participant',
        authorName: requesterName,
        createdAt: Date.now(),
        targetUserId: 'admin',
        isPinned: true,
        readBy: [],
        eventPin: event.pin,
        categoryId: deleteRequestMatch.categoryId,
        notificationType: 'match_delete_request',
      });

      setDeleteRequestMatch(null);
      setDeleteRequestReason('');
      setModalConfig({
        title: 'Solicitação enviada',
        message: 'O administrador recebeu seu pedido para avaliar a remoção da partida.',
        variant: 'success',
        onConfirm: () => setModalConfig(null),
      });
    } catch (err) {
      console.error('Erro ao solicitar remoção da partida:', err);
      setModalConfig({
        title: 'Erro ao enviar',
        message: 'Não foi possível enviar a solicitação ao administrador. Tente novamente.',
        variant: 'danger',
        onConfirm: () => setModalConfig(null),
      });
    } finally {
      setIsSendingDeleteRequest(false);
    }
  };

  const handleConfirmExitTournament = () => {
    setModalConfig({
      title: 'Sair do torneio',
      message: `Tem certeza que deseja cancelar sua participação no evento "${event.name}"?`,
      onConfirm: async () => {
        setModalConfig(null);
        const db = getDb();
        if (db) {
          try {
            await deleteUserEventRegistration(db as Firestore, userProfile.email, event.pin);
            await deleteEventEntry(db as Firestore, event.pin, userProfile.email);
          } catch (e) {
            console.error('Erro ao sair do evento:', e);
          }
        }
        onExitTournament();
      },
      onCancel: () => setModalConfig(null),
    });
  };

  // Inscritos na categoria ativa
  const categoryEntries = useMemo(() => {
    if (!activeCategory) return [];
    return entries.filter((e) => e.categoryIds?.includes(activeCategory.id));
  }, [entries, activeCategory]);

  // Classificações calculadas para a categoria ativa (Super 8 e Ranking possuem ranking individual por atleta)
  const isIndividualRanking = isSuper8 || isRanking;

  const standingsData = useMemo(() => {
    if (!activeCategory) return { teamStandings: [], playerStandings: [] };
    if (isIndividualRanking) {
      return {
        teamStandings: [],
        playerStandings: calculateSuper8PlayerStandings(
          categoryEntries,
          categoryMatches,
          isRanking ? 'rankingPoints' : 'wins'
        ),
      };
    }
    const b1Pairs = categoryPairs.filter((p) => (p.bracket ?? 1) === 1);
    const b2Pairs = categoryPairs.filter((p) => p.bracket === 2);
    const b1Matches = categoryMatches.filter((m) => m.phase === 'chave1' || m.phase === 'chave 1');
    const b2Matches = categoryMatches.filter((m) => m.phase === 'chave2' || m.phase === 'chave 2');

    const s1 = calculateBracketStandings(b1Pairs, b1Matches);
    const s2 = calculateBracketStandings(b2Pairs, b2Matches);

    return {
      teamStandings: [...s1, ...s2],
      playerStandings: [],
    };
  }, [activeCategory, isIndividualRanking, categoryEntries, categoryMatches, isRanking, categoryPairs]);

  const teamStandingsMap = useMemo(() => {
    const map = new Map<string, (typeof standingsData.teamStandings)[0]>();
    standingsData.teamStandings.forEach((s) => map.set(s.pair.id, s));
    return map;
  }, [standingsData.teamStandings]);

  const playerStandingsMap = useMemo(() => {
    const map = new Map<string, (typeof standingsData.playerStandings)[0]>();
    standingsData.playerStandings.forEach((s) => {
      const key = (s.entry.email || s.entry.pin || '').toLowerCase().trim();
      map.set(key, s);
    });
    return map;
  }, [standingsData.playerStandings]);

  const sortedCategoryEntries = useMemo(() => {
    if (!isIndividualRanking) return categoryEntries;
    return [...categoryEntries].sort((a, b) => {
      const aKey = (a.email || a.pin || '').toLowerCase().trim();
      const bKey = (b.email || b.pin || '').toLowerCase().trim();
      const aStanding = playerStandingsMap.get(aKey);
      const bStanding = playerStandingsMap.get(bKey);
      if (aStanding?.rank !== undefined && bStanding?.rank !== undefined && aStanding.rank !== bStanding.rank) {
        return aStanding.rank - bStanding.rank;
      }
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [categoryEntries, isIndividualRanking, playerStandingsMap]);

  const allCatFinished = categoryMatches.length > 0 && categoryMatches.every((m) => m.status === 'finished');
  const finalMatch = categoryMatches.find((m) => m.phase === 'final');
  const thirdMatch = categoryMatches.find((m) => m.phase === '3lugar');
  const isCurrentPlayerCancelled = Boolean(
    currentUserEntry?.disabled || currentUserEntry?.paymentStatus === 'Cancelado'
  );
  const lockParticipantMatchControls = isChaveEvent || isSuper8 || (!canManageEvent && isCurrentPlayerCancelled);

  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden animate-in fade-in duration-300 font-sans">
      {/* Header Fixo */}
      <header className="px-6 py-4 flex items-center bg-white border-b border-gray-100 sticky top-0 z-40 min-h-[72px]">
        <button onClick={onBack} className="p-2 -ml-2 text-black active:scale-90 cursor-pointer">
          <ArrowLeft size={24} />
        </button>
        <div className="flex-1 flex items-center justify-center gap-2">
          <Trophy size={22} className="text-amber-500 stroke-[2.5]" />
          <h1 className="text-lg font-black text-black tracking-tight truncate max-w-[220px]">
            {event.name}
          </h1>
        </div>
        {onOpenCommunications ? (
          <button
            type="button"
            onClick={onOpenCommunications}
            className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-700 active:scale-95 transition-all relative cursor-pointer"
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

      {/* Conteúdo com Scroll */}
      <div className="flex-1 overflow-y-auto no-scrollbar pb-32">
        {/* Banner do Torneio */}
        {event.bannerUrl && (
          <div className="w-full h-48 relative overflow-hidden">
            <img src={event.bannerUrl} className="w-full h-full object-cover" alt="Capa do evento" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            <div className="absolute bottom-6 left-6 right-6">
              <h2 className="text-white font-black text-2xl tracking-tight leading-tight">{event.name}</h2>
              <p className="text-amber-400 font-bold text-xs uppercase mt-1">
                Evento oficial • PIN: {event.pin}
              </p>
            </div>
          </div>
        )}

        <div className="p-5 flex flex-col gap-6">
          {/* Alerta de Leitura */}
          {isReadOnly && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center gap-3 text-amber-800 text-xs font-bold shadow-xs">
              <AlertCircle size={18} className="shrink-0 text-amber-600" />
              <span>
                Evento inativo (modo somente leitura). Alterações são permitidas apenas pelo organizador.
              </span>
            </div>
          )}

          {/* Bloco de Inscrição do Usuário */}
          {isParticipant && currentUserEntry ? (
            (() => {
              const isFree = (event.registrationFee ?? 0) === 0 && (event.extraCategoryFee ?? 0) === 0;
              const isCancelled = Boolean(
                currentUserEntry.disabled ||
                currentUserEntry.paymentStatus === 'Cancelado'
              );
              const isConfirmed = !isCancelled && (
                isFree ||
                currentUserEntry.paymentStatus === 'Confirmado' ||
                currentUserEntry.paymentStatus === 'Pago' ||
                currentUserEntry.paymentStatus === 'Isento'
              );

              return (
                <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-black text-slate-800">Minha inscrição no evento</p>
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        isCancelled
                          ? 'bg-red-100 text-red-700 border border-red-200'
                          : isConfirmed
                          ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                          : 'bg-amber-100 text-amber-700 border border-amber-200'
                      }`}>
                        {isCancelled ? 'Inscrição Cancelada' : isConfirmed ? 'Inscrição Ativa' : 'Pendente de Pagamento'}
                      </span>
                    </div>
                    <p className="text-[11px] font-bold text-slate-400 mt-0.5">
                      {currentUserEntry.nickname || currentUserEntry.name}
                    </p>
                    {canPayCurrentEntry && !isCancelled && (
                      <p className="text-[11px] font-black text-amber-600 mt-1">
                        Pendente: R$ {currentEntryPendingAmount.toFixed(2)}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {canPayCurrentEntry && !isCancelled && (
                      <button
                        type="button"
                        onClick={handleStartMercadoPagoPayment}
                        disabled={isStartingPayment}
                        className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 rounded-xl text-xs font-black transition-all active:scale-95 cursor-pointer inline-flex items-center justify-center gap-2"
                      >
                        {isStartingPayment ? <RotateCw size={15} className="animate-spin" /> : <CreditCard size={15} />}
                        Pagar inscrição
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowMyRegistrationModal(true)}
                      className="px-4 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-xl text-xs font-black transition-all active:scale-95 cursor-pointer"
                    >
                      Gerenciar Inscrição
                    </button>
                  </div>
                </div>
              );
            })()
          ) : (
            (() => {
              const period = getRegistrationPeriodStatus(event);
              if (period.isOpen) {
                return (
                  <div className="bg-white p-4 rounded-3xl border border-emerald-200/80 shadow-sm flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-black text-slate-800">Inscrição no torneio</p>
                      <p className="text-[11px] font-bold text-slate-400">
                        Você ainda não está inscrito neste evento.
                      </p>
                      <p className="text-[11px] font-bold text-emerald-600 mt-0.5">
                        ⚡ {period.message}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowMyRegistrationModal(true)}
                      className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white rounded-xl text-xs font-black transition-all cursor-pointer shadow-sm flex items-center justify-center gap-1.5"
                    >
                      <CheckCircle2 size={15} />
                      Inscrever-se no evento
                    </button>
                  </div>
                );
              }
              return (
                <div className="bg-slate-50 p-4 rounded-3xl border border-slate-200/80 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-black text-slate-700">Inscrições</p>
                    <p className="text-[11px] font-bold text-slate-400">
                      {period.message}
                    </p>
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg bg-slate-200 text-slate-600">
                    {period.status === 'not_started' ? 'Em breve' : 'Encerradas'}
                  </span>
                </div>
              );
            })()
          )}

          {/* Ações e Compartilhamento (QR Code / WhatsApp) */}
          <div className="bg-[#0f172a] rounded-[2.5rem] p-6 shadow-xl border border-white/10 flex flex-col items-center gap-5">
            <div className="bg-white p-3 rounded-2xl shadow-xl w-40 h-40 flex items-center justify-center shrink-0 border-4 border-sky-500/20">
              <img src={qrCodeUrl} alt="Convite evento" className="w-full h-full object-contain" />
            </div>
            <p className="text-[11px] font-bold text-slate-400 text-center leading-tight">
              Compartilhe o convite para que seus parceiros se inscrevam no evento com facilidade.
            </p>
            <div className="grid grid-cols-2 gap-2 w-full">
              <button
                onClick={() => {
                  const text = `Participe do evento ${event.name} comigo no MyPlacar! Link: ${inviteLink}`;
                  globalThis.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
                }}
                className="bg-[#25D366] text-white py-3 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-2 shadow active:scale-95 transition-all cursor-pointer"
              >
                <Share2 size={16} /> WhatsApp
              </button>
              <button
                onClick={async () => {
                  const ok = await copyToClipboard(inviteLink);
                  setModalConfig({
                    title: ok ? 'Link copiado' : 'Aviso',
                    message: ok ? 'Link de convite copiado para a área de transferência.' : inviteLink,
                    onConfirm: () => setModalConfig(null),
                  });
                }}
                className="bg-white/10 text-white py-3 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-2 border border-white/20 active:scale-95 transition-all cursor-pointer"
              >
                <Copy size={16} /> Copiar link
              </button>
            </div>
            {event.regulationUrl && (
              <button
                type="button"
                onClick={() => openPdfOrUrl(event.regulationUrl!, event.regulationFileName || 'regulamento.pdf')}
                className="w-full bg-amber-500 hover:bg-amber-600 text-white py-2.5 px-4 rounded-xl font-black text-xs flex items-center justify-center gap-2 shadow active:scale-95 transition-all cursor-pointer"
              >
                <Eye size={16} /> Ver regulamento
              </button>
            )}
          </div>

          {/* Seção de Categorias, Inscritos, Times e Jogos - Exclusiva para inscrições ativas */}
          {canViewEventDetails ? (
            <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2 text-emerald-600 font-black">
                <Trophy size={18} />
                <h3 className="text-sm font-black text-black tracking-tight">
                  {isRanking ? 'Categorias do Ranking' : 'Categorias'}
                </h3>
              </div>
            </div>

            {userCategories.length === 0 ? (
              <div className="py-10 text-center text-gray-400 font-bold text-xs bg-white rounded-3xl border border-dashed">
                Nenhuma categoria vinculada ou disponível no momento.
              </div>
            ) : (
              <div className="space-y-4">
                {/* Abas Seletoras de Categoria */}
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
                  {userCategories.map((cat) => {
                    const isSelected = activeCategory?.id === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => {
                          setUserSelectedCategoryId(cat.id);
                          setSelectedEntries(new Set());
                          setSelectedPairs(new Set());
                        }}
                        className={`px-4 py-2.5 rounded-2xl text-xs font-black transition-all shrink-0 cursor-pointer ${
                          isSelected
                            ? 'bg-slate-900 text-white shadow-md'
                            : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {cat.name} ({cat.abbreviation})
                      </button>
                    );
                  })}
                </div>

                {/* Sub-Abas da Categoria Ativa: Inscritos | Times | Partidas */}
                {activeCategory && (
                  <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-4 space-y-4">
                    <div className="pb-3 border-b border-slate-100 flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-base font-black text-slate-800">
                          {userCategoryView === 'entries' ? 'Inscritos' : userCategoryView === 'teams' ? 'Times' : 'Jogos'} ({activeCategory.name})
                        </h3>
                        <p className="text-xs text-slate-400 font-bold mt-0.5">
                          {userCategoryView === 'entries' && isIndividualRanking
                            ? 'Classificação individual e estatísticas dos atletas.'
                            : userCategoryView === 'entries'
                            ? `${sortedCategoryEntries.length} ${sortedCategoryEntries.length === 1 ? 'inscrito' : 'inscritos'} nesta categoria.`
                            : userCategoryView === 'teams'
                            ? `${categoryPairs.length} ${categoryPairs.length === 1 ? 'time formado' : 'times formados'} nesta categoria.`
                            : `${categoryMatches.length} ${categoryMatches.length === 1 ? 'partida configurada' : 'partidas configuradas'} nesta categoria.`}
                        </p>
                      </div>
                      {canManageEvent && userCategoryView === 'entries' && selectedEntries.size === 2 && (
                        <button
                          type="button"
                          onClick={handleFormTeam}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black flex items-center gap-1 shadow-sm transition-all active:scale-95 cursor-pointer"
                        >
                          <Link2 size={14} /> Formar Dupla
                        </button>
                      )}
                    </div>

                    <div className="flex items-center justify-between pb-1">
                      <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl">
                        {canViewParticipants && (
                          <button
                            type="button"
                            onClick={() => setUserCategoryView('entries')}
                            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                              userCategoryView === 'entries'
                                ? 'bg-white text-slate-900 shadow-xs'
                                : 'text-slate-500 hover:text-slate-900'
                            }`}
                          >
                            Inscritos ({categoryEntries.length})
                          </button>
                        )}
                        {!isSuper8 && (
                          <button
                            type="button"
                            onClick={() => setUserCategoryView('teams')}
                            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                              userCategoryView === 'teams'
                                ? 'bg-white text-slate-900 shadow-xs'
                                : 'text-slate-500 hover:text-slate-900'
                            }`}
                          >
                            Times ({categoryPairs.length})
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setUserCategoryView('matches')}
                          className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                            userCategoryView === 'matches'
                              ? 'bg-white text-slate-900 shadow-xs'
                              : 'text-slate-500 hover:text-slate-900'
                          }`}
                        >
                          Jogos ({categoryMatches.length})
                        </button>
                      </div>

                      </div>

                    {/* ABA: INSCRITOS */}
                    {userCategoryView === 'entries' && (
                      <div className="space-y-2">
                        {isIndividualRanking && (
                          <div className="flex items-center justify-between gap-2 px-3.5 py-2 bg-slate-50 border border-slate-100 rounded-2xl">
                            <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 border border-emerald-200/60 px-2.5 py-1 rounded-lg">
                              Classificação {isRanking ? 'Ranking' : 'Super 8'}
                            </span>
                          </div>
                        )}

                        {isRanking && sortedCategoryEntries.length > 0 && (
                          <div className="px-3.5 py-2 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center gap-2">
                            <Sparkles size={13} className="text-emerald-600 shrink-0" />
                            <span className="text-[11px] font-black text-emerald-700">
                              Disponíveis para formar novos times ({sortedCategoryEntries.length})
                            </span>
                          </div>
                        )}

                        {sortedCategoryEntries.length === 0 ? (
                          <div className="py-8 text-center text-slate-400 font-bold text-xs">
                            Nenhum inscrito nesta categoria ainda.
                          </div>
                        ) : (
                          sortedCategoryEntries.map((entry) => {
                            const isCurrentUser =
                              entry.email?.toLowerCase().trim() === userProfile.email.toLowerCase().trim() ||
                              entry.pin?.toUpperCase().trim() === userProfile.pin.toUpperCase().trim();
                            const standingKey = (entry.email || entry.pin || '').toLowerCase().trim();
                            const standing = isIndividualRanking ? playerStandingsMap.get(standingKey) : null;
                            const pair = isRanking ? null : categoryPairs.find(
                              (p) =>
                                (p.p1.email && entry.email && p.p1.email.toLowerCase().trim() === entry.email.toLowerCase().trim()) ||
                                (p.p2.email && entry.email && p.p2.email.toLowerCase().trim() === entry.email.toLowerCase().trim()) ||
                                (p.p1.pin && entry.pin && p.p1.pin.toUpperCase().trim() === entry.pin.toUpperCase().trim()) ||
                                (p.p2.pin && entry.pin && p.p2.pin.toUpperCase().trim() === entry.pin.toUpperCase().trim())
                            );

                            return (
                              <ParticipantRow
                                key={entry.email || entry.pin}
                                entry={entry}
                                category={activeCategory}
                                isCurrentUser={isCurrentUser}
                                pair={pair}
                                standing={standing}
                                isIndividualRanking={isIndividualRanking}
                                isRanking={isRanking}
                                isSuper8={isSuper8}
                                isSelected={selectedEntries.has(entry.email || entry.pin)}
                                canSelect={canManageEvent && !pair && !isSuper8}
                                hasCategoryMatches={categoryMatches.length > 0}
                                onToggleSelect={toggleEntrySelection}
                              />
                            );
                          })
                        )}
                      </div>
                    )}

                    {/* ABA: TIMES */}
                    {userCategoryView === 'teams' && (
                      <div className="space-y-3">
                        {categoryPairs.length === 0 ? (
                          <div className="py-8 text-center text-slate-400 font-bold text-xs">
                            Nenhum time formado nesta categoria ainda.
                          </div>
                        ) : (
                          categoryPairs.map((pair, idx) => {
                            const standing = teamStandingsMap.get(pair.id);
                            return (
                              <TeamCard
                                key={pair.id}
                                pair={pair}
                                category={activeCategory}
                                standing={standing}
                                hasCategoryMatches={categoryMatches.length > 0}
                                categoryMatches={categoryMatches}
                                pairsById={pairsById}
                                allCategoryFinished={allCatFinished}
                                finalMatch={finalMatch}
                                thirdMatch={thirdMatch}
                                index={idx}
                                isRanking={isRanking}
                                canManage={canManageEvent}
                                onUndoPair={handleUndoPair}
                              />
                            );
                          })
                        )}
                      </div>
                    )}

                    {/* ABA: PARTIDAS */}
                    {userCategoryView === 'matches' && (
                      <div className="space-y-3">
                        {categoryMatches.length === 0 ? (
                          <div className="py-8 text-center text-slate-400 font-bold text-xs">
                            Nenhuma partida programada para esta categoria.
                          </div>
                        ) : (
                          categoryMatches.map((match) => {
                            const queuePos =
                              match.status === 'waiting'
                                ? orderedQueue.findIndex((item) => item.match.id === match.id) + 1
                                : 0;
                            const live = liveScores[match.id];
                            const isCurrentUserMatchParticipant = isCurrentUserInMatch(match);
                            const canUseRankingMatchActions =
                              isRanking && canSubmitScore && isCurrentUserMatchParticipant && !isCurrentPlayerCancelled;

                            return (
                              <MatchCard
                                key={match.id}
                                match={match}
                                pairsById={pairsById}
                                variant={isRanking ? 'detailed' : 'compact'}
                                isRanking={isRanking}
                                totalSets={(event.setsCount || event.config?.sets || 1) as number}
                                gamesPerSet={activeCategory.gamesPerSet ?? (isSuper8 ? 4 : 6)}
                                liveScore={
                                  live
                                    ? {
                                        p1Score: live.p1Score ?? 0,
                                        p2Score: live.p2Score ?? 0,
                                      }
                                    : undefined
                                }
                                queuePosition={queuePos}
                                canSubmitScore={lockParticipantMatchControls ? false : canSubmitScore}
                                canManage={lockParticipantMatchControls ? false : canUseRankingMatchActions}
                                isReadOnly={isReadOnly}
                                allCategoryFinished={allCatFinished}
                                onScoreChange={lockParticipantMatchControls ? undefined : handleScoreChange}
                                onMatchDateChange={lockParticipantMatchControls ? undefined : handleMatchDateChange}
                                onFinishMatch={lockParticipantMatchControls ? undefined : handleFinishRankingMatch}
                                onReopenMatch={
                                  lockParticipantMatchControls || !canUseRankingMatchActions
                                    ? undefined
                                    : handleReopenMatch
                                }
                                onDeleteMatch={
                                  lockParticipantMatchControls || !canUseRankingMatchActions
                                    ? undefined
                                    : openDeleteMatchRequest
                                }
                                onStartLiveMatch={(m, p1, p2) => {
                                  if (!canManageEvent && isCurrentPlayerCancelled) {
                                    setModalConfig({
                                      title: 'Inscrição cancelada',
                                      message: 'Sua inscrição está cancelada. Você não pode participar de partidas.',
                                      onConfirm: () => setModalConfig(null),
                                    });
                                    return;
                                  }
                                  onStartTournamentMatch(m, p1, p2, event);
                                }}
                              />
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-slate-200/80 p-6 text-center space-y-3.5 shadow-sm">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto">
                <Lock size={22} />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-black text-slate-800">
                  Conteúdo exclusivo para inscritos confirmados
                </h3>
                <p className="text-xs text-slate-500 font-bold max-w-md mx-auto leading-relaxed">
                  {!currentUserEntry
                    ? 'As categorias, lista de inscritos, times e jogos deste evento estão disponíveis apenas para atletas com inscrição ativa e confirmada.'
                    : currentUserEntry.disabled || currentUserEntry.paymentStatus === 'Cancelado'
                    ? 'Sua inscrição neste evento está cancelada ou desativada. Reative sua inscrição para acessar as categorias, times e partidas.'
                    : 'Sua inscrição está aguardando confirmação do pagamento. Conclua o pagamento para liberar o acesso às categorias, times e jogos.'}
                </p>
              </div>
              {!currentUserEntry && getRegistrationPeriodStatus(event).isOpen && (
                <button
                  type="button"
                  onClick={() => setShowMyRegistrationModal(true)}
                  className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white rounded-xl text-xs font-black transition-all cursor-pointer shadow-sm inline-flex items-center gap-1.5"
                >
                  <CheckCircle2 size={15} />
                  Fazer inscrição para ver o evento
                </button>
              )}
              {currentUserEntry && !currentUserEntry.disabled && currentUserEntry.paymentStatus !== 'Cancelado' && canPayCurrentEntry && (
                <button
                  type="button"
                  onClick={handleStartMercadoPagoPayment}
                  disabled={isStartingPayment}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-xs font-black transition-all cursor-pointer shadow-sm inline-flex items-center gap-1.5"
                >
                  <CreditCard size={15} />
                  Pagar inscrição agora
                </button>
              )}
            </div>
          )}

          {/* Botão Sair do Torneio */}
          {hasActiveRegistration && (
            <div className="pt-4 flex justify-center">
              <button
                type="button"
                onClick={handleConfirmExitTournament}
                className="flex items-center gap-2 text-rose-500 hover:text-rose-700 text-xs font-black py-3 px-6 rounded-2xl bg-rose-50 border border-rose-100 active:scale-95 transition-all cursor-pointer"
              >
                <LogOut size={16} /> Sair do torneio
              </button>
            </div>
          )}
        </div>
      </div>

      {deleteRequestMatch && (
        <div className="fixed inset-0 z-[999999] flex items-center justify-center p-5 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[2rem] bg-white p-6 shadow-2xl animate-in zoom-in duration-200 space-y-5">
            <div className="space-y-1 text-center">
              <h3 className="text-xl font-black text-slate-900">Solicitar remoção da partida</h3>
              <p className="text-xs font-bold text-slate-500">
                Seu pedido será enviado ao administrador do evento como aviso.
              </p>
            </div>

            {(() => {
              const { categoryLabel, matchLabel } = getMatchRequestDetails(deleteRequestMatch);
              return (
                <div className="rounded-2xl bg-slate-50 border border-slate-100 p-3 space-y-2 text-left">
                  <p className="text-[11px] font-black text-slate-500">
                    Evento: <span className="text-slate-800">{event.name}</span>
                  </p>
                  <p className="text-[11px] font-black text-slate-500">
                    Categoria: <span className="text-slate-800">{categoryLabel}</span>
                  </p>
                  <p className="text-[11px] font-black text-slate-500">
                    Partida: <span className="text-slate-800">{matchLabel}</span>
                  </p>
                  <p className="text-[11px] font-black text-slate-500">
                    Solicitante:{' '}
                    <span className="text-slate-800">
                      {userProfile.nickname || userProfile.name || currentUserEntry?.nickname || currentUserEntry?.name || 'Participante'}
                    </span>
                  </p>
                </div>
              );
            })()}

            <div className="space-y-2">
              <label className="block text-[11px] font-black text-slate-500 ml-1">
                Motivo da solicitação
              </label>
              <textarea
                value={deleteRequestReason}
                onChange={(e) => setDeleteRequestReason(e.target.value)}
                rows={5}
                placeholder="Explique por que esta partida deve ser removida."
                className="w-full resize-none rounded-2xl border-2 border-slate-200 bg-white p-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={closeDeleteMatchRequest}
                disabled={isSendingDeleteRequest}
                className="flex-1 py-3.5 rounded-2xl bg-slate-100 text-slate-600 font-black text-xs active:scale-95 transition-all disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={submitDeleteMatchRequest}
                disabled={isSendingDeleteRequest || deleteRequestReason.trim().length < 5}
                className="flex-1 py-3.5 rounded-2xl bg-blue-600 text-white font-black text-xs shadow-lg shadow-blue-100 active:scale-95 transition-all disabled:opacity-60"
              >
                {isSendingDeleteRequest ? 'Enviando...' : 'Enviar aviso'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal / Bottom Sheet: Formulário de Inscrição Oficial */}
      {showMyRegistrationModal && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-xs animate-in fade-in"
            onClick={() => setShowMyRegistrationModal(false)}
          />
          <div className="relative bg-white rounded-t-[2.5rem] shadow-2xl animate-in slide-in-from-bottom duration-300 max-h-[90vh] flex flex-col">
            <div className="px-6 pt-5 pb-3 flex items-center justify-between border-b border-slate-100">
              <h2 className="text-base font-black text-slate-900">
                {currentUserEntry ? 'Minha Inscrição' : 'Fazer Inscrição'}
              </h2>
              <button
                type="button"
                onClick={() => setShowMyRegistrationModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700"
              >
                <X size={16} />
              </button>
            </div>
            <div className="overflow-y-auto px-6 py-4 space-y-4 no-scrollbar">
              <EventRegistrationForm
                event={event}
                entry={currentUserEntry || defaultUserEntry}
                mode="user"
                isNew={!currentUserEntry}
                onSave={async (updated) => {
                  const db = getDb();
                  if (db) {
                    try {
                      await saveEventEntry(db as Firestore, event.pin, updated as any);
                      if (updated.email) {
                        const { saveUserEventRegistration } = await import('@infra/firebase/events');
                        await saveUserEventRegistration(db as Firestore, updated.email, event.pin, {
                          pin: event.pin,
                          name: event.name || event.pin,
                          joinedAt: updated.joinedAt || Date.now(),
                          bannerUrl: event.bannerUrl || null,
                        }).catch(() => {});
                      }
                      await refreshEntries();
                      setShowMyRegistrationModal(false);
                      setModalConfig({
                        title: 'Sucesso',
                        message: currentUserEntry
                          ? 'Dados da inscrição atualizados com sucesso.'
                          : 'Inscrição realizada com sucesso!',
                        onConfirm: () => setModalConfig(null),
                      });
                    } catch (err) {
                      console.error('Erro ao salvar inscrição:', err);
                    }
                  }
                }}
                onDelete={async () => {
                  const db = getDb();
                  const targetEmail = (currentUserEntry?.email || userProfile.email || '').toLowerCase().trim();
                  if (db && event.pin && targetEmail) {
                    const { deleteEventEntry, deleteUserEventRegistration } = await import('@infra/firebase/events');
                    await deleteEventEntry(db as Firestore, event.pin, targetEmail);
                    await deleteUserEventRegistration(db as Firestore, targetEmail, event.pin).catch(() => {});
                  }
                  await refreshEntries();
                  setShowMyRegistrationModal(false);
                }}
                onCancel={async () => {
                  await refreshEntries();
                  setShowMyRegistrationModal(false);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal de Pagamento Pix com QR Code */}
      {pixPaymentData && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-xs animate-in fade-in"
            onClick={() => {
              if (pixPollingRef.current) clearInterval(pixPollingRef.current);
              pixPollingRef.current = null;
              setPixPaymentData(null);
            }}
          />
          <div className="relative bg-white rounded-t-[2.5rem] sm:rounded-3xl shadow-2xl animate-in slide-in-from-bottom duration-300 max-h-[90vh] w-full sm:max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-sm shrink-0">
                  <CreditCard size={18} />
                </div>
                <div>
                  <span className="text-sm font-black text-slate-800 block">Pagar via Pix</span>
                  <span className="text-xs font-bold text-emerald-700">R$ {pixPaymentData.amount.toFixed(2)}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (pixPollingRef.current) clearInterval(pixPollingRef.current);
                  pixPollingRef.current = null;
                  setPixPaymentData(null);
                }}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {pixPaymentData.qrCodeBase64 && (
              <div className="flex justify-center my-2">
                <img
                  src={`data:image/png;base64,${pixPaymentData.qrCodeBase64}`}
                  alt="QR Code Pix"
                  className="w-52 h-52 rounded-2xl border-4 border-slate-100 shadow-md"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <p className="text-[10px] font-black text-slate-400">PIX COPIA E COLA</p>
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl p-3">
                <span className="text-[10px] font-mono text-slate-600 flex-1 truncate">{pixPaymentData.qrCode}</span>
                <button
                  type="button"
                  onClick={() => {
                    void copyToClipboard(pixPaymentData.qrCode);
                    setModalConfig({
                      title: 'Copiado!',
                      message: 'Código Pix copiado para a área de transferência.',
                      onConfirm: () => setModalConfig(null),
                    });
                  }}
                  className="shrink-0 bg-emerald-500 text-white text-xs font-black px-3 py-1.5 rounded-xl hover:bg-emerald-600 active:scale-95 transition-all cursor-pointer"
                >
                  Copiar
                </button>
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => currentUserEntry && void checkDetailPixPaymentConfirmation(pixPaymentData.paymentId, currentUserEntry.email)}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs rounded-2xl flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
              >
                <CheckCircle2 size={16} />
                <span>Já fiz o Pix! Confirmar agora</span>
              </button>
              <p className="text-xs font-medium text-slate-500 text-center bg-emerald-50 border border-emerald-100 rounded-2xl p-3 leading-relaxed">
                ⏳ Aguardando confirmação do pagamento...<br />
                <span className="text-[10px] text-slate-400">A confirmação é automática após o pagamento.</span>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
