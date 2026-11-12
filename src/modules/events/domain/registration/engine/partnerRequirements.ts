import type { EventCategory } from '@modules/events/types';

export const isPreDefinedTeamDraw = (teamDrawType?: string): boolean => {
  const normalized = (teamDrawType || 'Manual')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  return (
    normalized.includes('pre definida') ||
    normalized.includes('pre-definida') ||
    normalized.includes('pre_definida') ||
    normalized.includes('predefinida')
  );
};

export const requiresPartnerDetails = (
  teamDrawType: string | undefined,
  categories: EventCategory[],
  selectedCategoryIds: string[],
): boolean =>
  isPreDefinedTeamDraw(teamDrawType) && selectedCategoryIds.some((categoryId) => {
    const cat = categories.find((c) => c.id === categoryId);
    return cat?.format === 'Duplas' && cat?.requiresPartner !== false;
  });
