import type { EventCategory } from '@modules/events/types';

export interface QueueCategoryColor {
  backgroundColor: string;
  borderColor: string;
  color: string;
  indicatorColor: string;
}

/** Generates a repeatable, evenly spaced pastel color for every event category. */
export const getQueueCategoryColors = (categories: EventCategory[]) => {
  const colors = new Map<string, QueueCategoryColor>();
  [...categories].sort((a, b) => a.id.localeCompare(b.id)).forEach((category, index, sortedCategories) => {
    const hue = Math.round((index * 360) / Math.max(sortedCategories.length, 1));
    colors.set(category.id, {
      backgroundColor: `hsl(${hue} 75% 95%)`,
      borderColor: `hsl(${hue} 55% 78%)`,
      color: `hsl(${hue} 65% 28%)`,
      indicatorColor: `hsl(${hue} 65% 42%)`,
    });
  });
  return colors;
};
