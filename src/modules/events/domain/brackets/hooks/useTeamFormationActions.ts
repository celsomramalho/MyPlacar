import type { Dispatch, SetStateAction } from 'react';
import { useMemo } from 'react';
import type { Firestore } from 'firebase/firestore';
import {
  minifyPairForStorage,
  type EventCategory,
  type TournamentEntry,
  type TournamentEvent,
  type TournamentPair,
} from '@modules/events/types';
import type { ModalConfig } from '@modules/ui/types';
import { getDb } from '@infra/firebase';
import { updateEvent } from '@infra/firebase/events';
import {
  createTournamentPair,
  pairHasSameParticipants,
  validateCategoryGenders,
} from '../engine/teamFormationEngine';

interface UseTeamFormationActionsOptions {
  event: TournamentEvent;
  selectedCategory?: EventCategory;
  selectedEntries: Set<string>;
  selectedPair: TournamentPair | null;
  categoryEntries: TournamentEntry[];
  categoryPairs: TournamentPair[];
  pairs: TournamentPair[];
  matches: TournamentEvent['matches'];
  onUpdateEvent: (event: TournamentEvent) => void;
  setSelectedEntries: Dispatch<SetStateAction<Set<string>>>;
  setModalConfig: Dispatch<SetStateAction<ModalConfig | null>>;
}

const sortBracketPairs = (pairs: TournamentPair[]): TournamentPair[] =>
  [...pairs].sort((a, b) => {
    if (a.bracketOrder !== undefined && b.bracketOrder !== undefined) {
      return a.bracketOrder - b.bracketOrder;
    }
    if (a.bracketOrder !== undefined) return -1;
    if (b.bracketOrder !== undefined) return 1;
    return (a.teamNumber || 0) - (b.teamNumber || 0);
  });

export function useTeamFormationActions({
  event,
  selectedCategory,
  selectedEntries,
  selectedPair,
  categoryEntries,
  categoryPairs,
  pairs,
  matches = [],
  onUpdateEvent,
  setSelectedEntries,
  setModalConfig,
}: UseTeamFormationActionsOptions) {
  const selectedEntriesList = useMemo(() => {
    return Array.from(selectedEntries)
      .map((email) => categoryEntries.find((entry) => entry.email === email))
      .filter(Boolean) as TournamentEntry[];
  }, [selectedEntries, categoryEntries]);

  const genderValidation =
    selectedCategory && selectedEntriesList.length === 2 && !selectedPair
      ? validateCategoryGenders(selectedCategory, selectedEntriesList)
      : { valid: true };

  const persistPairs = async (nextPairs: TournamentPair[], errorMessage: string) => {
    const db = getDb();
    if (!db) return;
    try {
      await updateEvent(db as Firestore, event.pin, { pairs: nextPairs });
    } catch (err) {
      console.error(errorMessage, err);
    }
  };

  const handleFormTeam = async () => {
    if (selectedPair) {
      setModalConfig({
        title: 'Desfazer time?',
        message: selectedPair.teamCode
          ? `Deseja desfazer o time ${selectedPair.teamCode}?`
          : 'Deseja desfazer o time selecionado?',
        confirmLabel: 'Desfazer',
        variant: 'danger',
        onConfirm: async () => {
          setModalConfig(null);
          const nextPairs = pairs.filter((pair) => pair.id !== selectedPair.id);
          onUpdateEvent({ ...event, pairs: nextPairs });
          setSelectedEntries(new Set());
          await persistPairs(nextPairs, 'Erro ao atualizar pairs no Firestore:');
        },
        onCancel: () => setModalConfig(null),
      });
      return;
    }

    if (!selectedCategory || selectedEntries.size !== 2) return;

    const selected = Array.from(selectedEntries)
      .map((email) => categoryEntries.find((entry) => entry.email === email))
      .filter(Boolean) as TournamentEntry[];
    if (selected.length !== 2) return;

    if (selected.some((entry) => entry.disabled || entry.paymentStatus === 'Cancelado')) {
      setModalConfig({
        title: 'Inscrição cancelada',
        message: 'Não é possível formar time com participantes com inscrição cancelada ou desativada.',
        onConfirm: () => setModalConfig(null),
      });
      return;
    }

    const validation = validateCategoryGenders(selectedCategory, selected);
    if (!validation.valid) {
      setModalConfig({
        title: 'Atenção',
        message: validation.message || 'Formação de time incompatível com os requisitos da categoria.',
        onConfirm: () => setModalConfig(null),
      });
      return;
    }

    const alreadyFormedPair = categoryPairs.find((pair) =>
      pairHasSameParticipants(pair, selected[0], selected[1])
    );
    if (alreadyFormedPair) {
      setModalConfig({
        title: 'Time já formado',
        message: `Este time já existe em ${alreadyFormedPair.teamCode || 'Times'}. Selecione uma combinação diferente de jogadores.`,
        onConfirm: () => setModalConfig(null),
      });
      return;
    }

    const newPair = createTournamentPair({
      first: selected[0],
      second: selected[1],
      category: selectedCategory,
      pairs,
      categoryPairs,
    });
    const nextPairs = [...pairs.map(minifyPairForStorage), newPair];
    onUpdateEvent({ ...event, pairs: nextPairs });
    setSelectedEntries(new Set());
    await persistPairs(nextPairs, 'Erro ao salvar novo pair no Firestore:');
  };

  const handleToggleTeamBracket = async (pair: TournamentPair) => {
    const hasCatMatches = matches.some(
      (match) =>
        (match.categoryId === selectedCategory?.id || !match.categoryId) &&
        (match.pair1Id === pair.id || match.pair2Id === pair.id)
    );
    if (hasCatMatches) {
      window.alert('Não é possível trocar este time de chave porque ele já está em uma partida.');
      return;
    }

    const nextBracket: 1 | 2 = (pair.bracket ?? 1) === 1 ? 2 : 1;
    const destBracketCount = categoryPairs.filter(
      (categoryPair) => (categoryPair.bracket ?? 1) === nextBracket && categoryPair.id !== pair.id
    ).length;
    const nextPairs = pairs.map((candidate) =>
      candidate.id === pair.id
        ? { ...candidate, bracket: nextBracket, bracketOrder: destBracketCount + 1 }
        : candidate
    );

    onUpdateEvent({ ...event, pairs: nextPairs });
    await persistPairs(nextPairs, 'Erro ao alternar chave no Firestore:');
  };

  const handleRandomizeCategoryDraw = async () => {
    if (!selectedCategory) return;

    const hasCatMatches = matches.some(
      (match) =>
        match.categoryId === selectedCategory.id ||
        (!match.categoryId &&
          pairs.some(
            (pair) =>
              (pair.id === match.pair1Id || pair.id === match.pair2Id) &&
              pair.categoryId === selectedCategory.id
          ))
    );
    if (hasCatMatches) {
      window.alert('As chaves estão bloqueadas pois as partidas já foram geradas.');
      return;
    }

    const shuffled = [...categoryPairs].sort(() => Math.random() - 0.5);
    const half = Math.ceil(shuffled.length / 2);
    const bracket1Pairs = shuffled.slice(0, half);
    const bracket2Pairs = shuffled.slice(half);

    const updatedPairs = pairs.map((pair) => {
      const idx1 = bracket1Pairs.findIndex((bracketPair) => bracketPair.id === pair.id);
      if (idx1 !== -1) {
        return { ...pair, bracket: 1 as const, bracketOrder: idx1 + 1 };
      }

      const idx2 = bracket2Pairs.findIndex((bracketPair) => bracketPair.id === pair.id);
      if (idx2 !== -1) {
        return { ...pair, bracket: 2 as const, bracketOrder: idx2 + 1 };
      }

      return pair;
    });

    onUpdateEvent({ ...event, pairs: updatedPairs });
    await persistPairs(updatedPairs, 'Erro ao sortear chaves no Firestore:');
  };

  const handleMoveTeamPosition = async (pair: TournamentPair, direction: 'up' | 'down') => {
    const currentBracket = pair.bracket ?? 1;
    const bracketPairs = sortBracketPairs(
      categoryPairs.filter((categoryPair) => (categoryPair.bracket ?? 1) === currentBracket)
    );
    const currentIndex = bracketPairs.findIndex((categoryPair) => categoryPair.id === pair.id);
    if (currentIndex === -1) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= bracketPairs.length) return;

    const targetPair = bracketPairs[targetIndex];
    const updatedPairs = pairs.map((candidate) => {
      if (candidate.id === pair.id) {
        return { ...candidate, bracketOrder: targetIndex + 1 };
      }
      if (candidate.id === targetPair.id) {
        return { ...candidate, bracketOrder: currentIndex + 1 };
      }
      return candidate;
    });

    onUpdateEvent({ ...event, pairs: updatedPairs });
    await persistPairs(updatedPairs, 'Erro ao mover posição do time no Firestore:');
  };

  return {
    selectedEntriesList,
    genderValidation,
    handleFormTeam,
    handleToggleTeamBracket,
    handleRandomizeCategoryDraw,
    handleMoveTeamPosition,
  };
}
