import type { TournamentEvent } from '@modules/events/types';

export const PRIMARY_ADMIN_EMAIL = 'celsomramalho@gmail.com';

export const isPrimaryAdminEmail = (email?: string | null) =>
  email?.toLowerCase().trim() === PRIMARY_ADMIN_EMAIL;

const normalizePin = (pin?: string | null) => pin?.toUpperCase().trim() || '';

const parseDateOnly = (value?: string) => {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const isDateWithinEventRange = (event: Pick<TournamentEvent, 'startDate' | 'endDate'>, now = new Date()) => {
  const start = parseDateOnly(event.startDate);
  const end = parseDateOnly(event.endDate);
  if (!start || !end) return false;

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
  return today.getTime() >= start.getTime() && today.getTime() <= end.getTime();
};

export const canUseEventAdminAccess = (
  event: Pick<TournamentEvent, 'active' | 'coAdminPins' | 'startDate' | 'endDate'>,
  userPin?: string | null,
) => {
  const pin = normalizePin(userPin);
  if (!pin || event.active !== true) return false;
  return (event.coAdminPins || []).map(normalizePin).includes(pin);
};
