/** Formats an estimated wait as minutes plus a readable hour/minute duration. */
export const formatWaitDuration = (waitMinutes: number): string => {
  const roundedMinutes = Math.max(0, Math.round(waitMinutes));
  const hours = Math.floor(roundedMinutes / 60);
  const minutes = roundedMinutes % 60;
  if (hours === 0) return `${minutes}min`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}min`;
};
