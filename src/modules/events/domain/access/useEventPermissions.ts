import { useMemo, useCallback } from 'react';
import type { TournamentEvent, TournamentEntry } from '../../types';
import type { UserProfile } from '@modules/auth/types';
import { isPrimaryAdminEmail, canUseEventAdminAccess } from '../../services/eventAdminAccess';

export interface EventPermissions {
  /** Indica se o usuário autenticado é o administrador principal do sistema */
  isPrimaryAdmin: boolean;
  /** Indica se o usuário é co-administrador listado no evento */
  isCoAdmin: boolean;
  /** Indica se o usuário está inscrito como participante no evento */
  isParticipant: boolean;
  /** Indica se o evento está marcado como ativo */
  isEventActive: boolean;
  /** Indica se o evento está em modo somente leitura (inativo para não-admins principais) */
  isReadOnly: boolean;
  /** Indica se o usuário tem privilégios totais de gestão do evento (Primary Admin ou Co-Admin ativo) */
  canManageEvent: boolean;
  /** Indica se o usuário pode lançar/editar placares (Gestor ou participante com permissão liberada) */
  canSubmitScore: boolean;
  /** Indica se a lista de participantes inscritos pode ser visualizada pelo usuário */
  canViewParticipants: boolean;
  /** Função utilitária para verificar se o usuário pode editar os dados de uma inscrição específica */
  canEditEntry: (entry?: Partial<TournamentEntry> | null) => boolean;
  /** Objeto da inscrição do usuário atual, caso esteja inscrito */
  currentUserEntry: TournamentEntry | null;
}

/**
 * Hook central de controle de permissões e papéis em um evento.
 */
export function useEventPermissions(
  event: TournamentEvent,
  userProfile?: UserProfile | null,
  entries?: TournamentEntry[]
): EventPermissions {
  const userEmail = userProfile?.email?.toLowerCase().trim() || '';
  const userPin = userProfile?.pin?.toUpperCase().trim() || '';

  const isPrimaryAdmin = useMemo(() => isPrimaryAdminEmail(userEmail), [userEmail]);
  const isEventActive = event.active === true;
  const isReadOnly = !isEventActive && !isPrimaryAdmin;

  const isCoAdmin = useMemo(() => {
    if (!userPin) return false;
    return canUseEventAdminAccess(event, userPin);
  }, [event, userPin]);

  const canManageEvent = useMemo(() => {
    if (isPrimaryAdmin) return true;
    if (isReadOnly) return false;
    return isCoAdmin;
  }, [isPrimaryAdmin, isReadOnly, isCoAdmin]);

  const entryList = entries || event.entries || [];

  const currentUserEntry = useMemo(() => {
    if (!userEmail && !userPin) return null;
    return (
      entryList.find((e) => {
        const emailMatch = userEmail && e.email?.toLowerCase().trim() === userEmail;
        const pinMatch = userPin && e.pin?.toUpperCase().trim() === userPin;
        return Boolean(emailMatch || pinMatch);
      }) || null
    );
  }, [entryList, userEmail, userPin]);

  const isParticipant = currentUserEntry !== null;

  const isCurrentEntryCancelled = Boolean(
    currentUserEntry?.disabled || currentUserEntry?.paymentStatus === 'Cancelado'
  );

  const canSubmitScore = useMemo(() => {
    if (isReadOnly) return false;
    if (canManageEvent) return true;
    if (isCurrentEntryCancelled) return false;
    return event.allowUserScoreEntry === true;
  }, [isReadOnly, canManageEvent, isCurrentEntryCancelled, event.allowUserScoreEntry]);

  const canViewParticipants = useMemo(() => {
    if (canManageEvent) return true;
    return event.showRegisteredParticipants === true;
  }, [canManageEvent, event.showRegisteredParticipants]);

  const canEditEntry = useCallback(
    (entry?: Partial<TournamentEntry> | null) => {
      if (!entry) return false;
      if (canManageEvent) return true;
      if (isReadOnly) return false;
      const isSameEmail = userEmail && entry.email?.toLowerCase().trim() === userEmail;
      const isSamePin = userPin && entry.pin?.toUpperCase().trim() === userPin;
      return Boolean(isSameEmail || isSamePin);
    },
    [canManageEvent, isReadOnly, userEmail, userPin]
  );

  return {
    isPrimaryAdmin,
    isCoAdmin,
    isParticipant,
    isEventActive,
    isReadOnly,
    canManageEvent,
    canSubmitScore,
    canViewParticipants,
    canEditEntry,
    currentUserEntry,
  };
}
