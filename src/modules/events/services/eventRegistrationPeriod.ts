import type { TournamentEvent } from '../types';

export type RegistrationPeriodStatus = 'not_started' | 'open' | 'closed';

export interface RegistrationPeriodInfo {
  status: RegistrationPeriodStatus;
  isOpen: boolean;
  message: string;
}

/**
 * Avalia se o período de inscrições de um evento está aberto.
 * Compara as datas startDate e endDate no fuso horário local (formato YYYY-MM-DD).
 */
export const getRegistrationPeriodStatus = (
  event: Pick<TournamentEvent, 'startDate' | 'endDate' | 'active'>,
  now = new Date()
): RegistrationPeriodInfo => {
  if (event.active === false) {
    return { status: 'closed', isOpen: false, message: 'Evento inativo' };
  }

  // Data local do cliente no formato YYYY-MM-DD
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${day}`;

  if (event.startDate && todayStr < event.startDate) {
    const [sY, sM, sD] = event.startDate.split('-');
    const formattedStart = `${sD}/${sM}/${sY}`;
    return {
      status: 'not_started',
      isOpen: false,
      message: `Inscrições abrem em ${formattedStart}`,
    };
  }

  if (event.endDate && todayStr > event.endDate) {
    return {
      status: 'closed',
      isOpen: false,
      message: 'Inscrições encerradas',
    };
  }

  let message = 'Inscrições abertas';
  if (event.endDate) {
    const [eY, eM, eD] = event.endDate.split('-');
    message = `Inscrições até ${eD}/${eM}/${eY}`;
  }

  return {
    status: 'open',
    isOpen: true,
    message,
  };
};

export const isRegistrationPeriodOpen = (
  event: Pick<TournamentEvent, 'startDate' | 'endDate' | 'active'>,
  now = new Date()
): boolean => {
  return getRegistrationPeriodStatus(event, now).isOpen;
};
