import type { EventCategory, TournamentEvent } from '../types';

export const getCategoryTieBreakCriteria = (
  event: TournamentEvent,
  category: EventCategory,
  sets = Number(event.setsCount || event.config?.sets || 1),
): string[] => {
  const scoreTarget = category.scoreTarget || event.scoreTarget || 'Inscrito';
  const isSuper8 = (event.eventType || '').toLowerCase().includes('super 8');
  const technical = category.technicalTieBreak || event.technicalTieBreak || 'rank compartilhado';

  if (isSuper8 && scoreTarget === 'Inscrito') {
    return [
      '1. Maior número de vitórias.',
      '2. Maior saldo geral de games (games pró menos games contra).',
      '3. Maior número de games pró.',
      '4. Maior número de vitórias no confronto direto, quando exatamente dois inscritos continuam empatados nos critérios anteriores.',
      '5. Maior saldo de games no confronto direto, se as vitórias diretas também permanecerem empatadas.',
      '6. Maior percentual de games pró sobre o total de games disputados.',
      `7. Desempate técnico: ${technical}.`,
    ];
  }

  if (isSuper8) {
    return [
      '1. Maior número de vitórias.',
      '2. Confronto direto, quando houver exatamente dois times empatados.',
      ...(sets > 1 ? ['3. Maior saldo de sets.'] : []),
      `${sets > 1 ? '4' : '3'}. Maior saldo de games.`,
      `${sets > 1 ? '5' : '4'}. Maior percentual de games pró sobre o total de games disputados.`,
      `${sets > 1 ? '6' : '5'}. Sorteio da comissão quando os critérios matemáticos permanecerem iguais.`,
    ];
  }

  return [
    '1. Maior número de vitórias na fase de classificação.',
    '2. Confronto direto, quando aplicável.',
    ...(sets > 1 ? ['3. Maior saldo de sets.'] : []),
    `${sets > 1 ? '4' : '3'}. Maior saldo de games.`,
    `${sets > 1 ? '5' : '4'}. Maior percentual de games pró sobre o total de games disputados.`,
    `${sets > 1 ? '6' : '5'}. Sorteio/desempate técnico conforme regulamento da categoria.`,
  ];
};
