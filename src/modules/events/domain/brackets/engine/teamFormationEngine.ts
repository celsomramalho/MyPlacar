import {
  minifyEntryForPair,
  orderPairEntriesForMixed,
  type EventCategory,
  type TournamentEntry,
  type TournamentPair,
} from '@modules/events/types';
import type { BracketNumber, CreateTournamentPairInput } from '../types';

export const isCategoryMixed = (category: EventCategory): boolean => {
  const catNameLower = (category.name || '').toLowerCase();
  const catDescLower = (category.description || '').toLowerCase();
  const isExplicitMixed =
    (category.gender1 === 'M' && category.gender2 === 'F') ||
    (category.gender1 === 'F' && category.gender2 === 'M');
  const isTextMixed =
    catNameLower.includes('misto') ||
    catNameLower.includes('mista') ||
    catNameLower.includes('mix') ||
    catDescLower.includes('misto') ||
    catDescLower.includes('mista');

  return Boolean(isExplicitMixed || isTextMixed);
};

export const validateCategoryGenders = (
  cat: EventCategory,
  selectedPlayers: TournamentEntry[]
): { valid: boolean; message?: string } => {
  if (selectedPlayers.length !== 2) {
    return { valid: false, message: 'Selecione exatamente 2 jogadores.' };
  }

  const mCount = selectedPlayers.filter((p) => p.gender === 'M').length;
  const fCount = selectedPlayers.filter((p) => p.gender === 'F').length;

  const catNameLower = (cat.name || '').toLowerCase();
  const catDescLower = (cat.description || '').toLowerCase();
  const isExplicitMixed =
    (cat.gender1 === 'M' && cat.gender2 === 'F') ||
    (cat.gender1 === 'F' && cat.gender2 === 'M');
  const isTextMixed =
    catNameLower.includes('misto') ||
    catNameLower.includes('mista') ||
    catNameLower.includes('mix') ||
    catDescLower.includes('misto') ||
    catDescLower.includes('mista');

  if (isExplicitMixed || isTextMixed) {
    if (mCount !== 1 || fCount !== 1) {
      return {
        valid: false,
        message: `A categoria "${cat.name}" é mista e exige 1 atleta masculino e 1 jogadora feminina.`,
      };
    }
    return { valid: true };
  }

  const isExplicitFemale = cat.gender1 === 'F' && cat.gender2 === 'F';
  const isTextFemale =
    (catNameLower.includes('fem') || catDescLower.includes('fem')) &&
    !isTextMixed;

  if (isExplicitFemale || isTextFemale) {
    if (fCount !== 2) {
      return {
        valid: false,
        message: `A categoria "${cat.name}" é feminina e exige 2 atletas do gênero feminino.`,
      };
    }
    return { valid: true };
  }

  const isExplicitMale = cat.gender1 === 'M' && cat.gender2 === 'M';
  const isTextMale =
    (catNameLower.includes('masc') || catDescLower.includes('masc')) &&
    !isTextMixed;

  if (isExplicitMale || isTextMale) {
    if (mCount !== 2) {
      return {
        valid: false,
        message: `A categoria "${cat.name}" é masculina e exige 2 atletas do gênero masculino.`,
      };
    }
    return { valid: true };
  }

  if (cat.gender1 && cat.gender2) {
    const requiredM = (cat.gender1 === 'M' ? 1 : 0) + (cat.gender2 === 'M' ? 1 : 0);
    const requiredF = (cat.gender1 === 'F' ? 1 : 0) + (cat.gender2 === 'F' ? 1 : 0);
    if (mCount !== requiredM || fCount !== requiredF) {
      return {
        valid: false,
        message: `Os atletas selecionados (${mCount} masc / ${fCount} fem) não correspondem à categoria "${cat.name}".`,
      };
    }
  }

  return { valid: true };
};

export const getParticipantKey = (entry?: Partial<TournamentEntry> | null): string =>
  (entry?.email || entry?.pin || entry?.name || '').toLowerCase().trim();

export const pairHasSameParticipants = (
  pair: TournamentPair,
  first: TournamentEntry,
  second: TournamentEntry
): boolean => {
  const pairP1 = getParticipantKey(pair.p1);
  const pairP2 = getParticipantKey(pair.p2);
  const firstKey = getParticipantKey(first);
  const secondKey = getParticipantKey(second);

  if (!pairP1 || !pairP2 || !firstKey || !secondKey) return false;

  return (
    (pairP1 === firstKey && pairP2 === secondKey) ||
    (pairP1 === secondKey && pairP2 === firstKey)
  );
};

export const getNextTeamNumber = (pairs: TournamentPair[]): number =>
  Math.max(
    0,
    ...pairs.map(
      (pair, index) =>
        pair.teamNumber ||
        Number(pair.teamCode?.match(/^\d{3}/)?.[0]) ||
        index + 1
    )
  ) + 1;

export const buildTeamCode = (
  teamNumber: number,
  category: Pick<EventCategory, 'abbreviation'>
): string => `${String(teamNumber).padStart(3, '0')} - ${category.abbreviation}`;

export const getNextBracketOrder = (
  categoryPairs: TournamentPair[],
  bracket: BracketNumber = 1
): number => categoryPairs.filter((pair) => (pair.bracket ?? 1) === bracket).length + 1;

export const createTournamentPair = ({
  first,
  second,
  category,
  pairs,
  categoryPairs,
  id = `pair_${Date.now()}`,
  bracket = 1,
}: CreateTournamentPairInput): TournamentPair => {
  const teamNumber = getNextTeamNumber(pairs);
  const [orderedP1, orderedP2] = orderPairEntriesForMixed(first, second);

  return {
    id,
    p1: minifyEntryForPair(orderedP1),
    p2: minifyEntryForPair(orderedP2),
    categoryId: category.id,
    teamNumber,
    teamCode: buildTeamCode(teamNumber, category),
    bracket,
    bracketOrder: getNextBracketOrder(categoryPairs, bracket),
  };
};
