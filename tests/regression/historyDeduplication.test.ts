import { describe, it, expect, beforeEach, vi } from 'vitest';
import { persistLocalHistory } from '../../src/modules/history/services/persistLocalHistory';
import { mergeDownloadedHistory } from '../../src/modules/history/services/mergeDownloadedHistory';
import type { MatchHistoryItem } from '../../src/modules/history/types';

const createMockMatch = (id: string, date: string = '19/09/2026', time: string = '13:10'): MatchHistoryItem => ({
  id,
  date,
  time,
  sportType: 'pickleball',
  p1Name: 'Andrea',
  p1Partner: 'Cris',
  p2Name: 'Simone',
  p2Partner: 'Vana',
  p1Color: 'azul',
  p2Color: 'vermelho',
  scoreSummary: '0 - 1',
  p1Sets: [0],
  p2Sets: [1],
  winner: 'Simone',
  winnerTeam: 2,
  duration: 1200,
  isSynced: true,
  ownerEmail: 'test@example.com',
  pointHistory: [],
  involvedPins: [],
});

describe('History Deduplication', () => {
  let store: Record<string, string> = {};

  beforeEach(() => {
    store = {};
    const localStorageMock = {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = String(value);
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      },
    };
    vi.stubGlobal('localStorage', localStorageMock);
    vi.restoreAllMocks();
  });

  describe('persistLocalHistory', () => {
    it('should deduplicate items with the same id and keep the first occurrence', () => {
      const match1 = createMockMatch('match_1', '19/09/2026', '13:10');
      const match1Duplicate = createMockMatch('match_1', '19/09/2026', '13:10');
      const match2 = createMockMatch('match_2', '19/09/2026', '14:00');

      const result = persistLocalHistory([match1, match1Duplicate, match2]);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('match_1');
      expect(result[1].id).toBe('match_2');

      const stored = JSON.parse(localStorage.getItem('myPlacarHistory') || '[]');
      expect(stored).toHaveLength(2);
      expect(stored[0].id).toBe('match_1');
      expect(stored[1].id).toBe('match_2');
    });

    it('should respect the limit option after deduplication', () => {
      const list = [
        createMockMatch('m1'),
        createMockMatch('m1'), // duplicate
        createMockMatch('m2'),
        createMockMatch('m3'),
      ];

      const result = persistLocalHistory(list, { limit: 2 });
      expect(result).toHaveLength(2);
      expect(result.map((m) => m.id)).toEqual(['m1', 'm2']);
    });
  });

  describe('mergeDownloadedHistory', () => {
    it('should merge downloaded and current history without any duplicate ids', () => {
      const localMatches = [
        createMockMatch('match_1'),
        createMockMatch('match_2'),
      ];
      const downloadedMatches = [
        createMockMatch('match_2'), // existing in local
        createMockMatch('match_3'),
      ];

      const result = mergeDownloadedHistory(downloadedMatches, localMatches);

      expect(result).toHaveLength(3);
      const ids = result.map((m) => m.id);
      expect(new Set(ids).size).toBe(3);
      expect(ids).toContain('match_1');
      expect(ids).toContain('match_2');
      expect(ids).toContain('match_3');
    });

    it('should handle duplicate items even if present within downloaded or local arrays', () => {
      const localMatches = [
        createMockMatch('match_1'),
        createMockMatch('match_1'), // duplicate in local
      ];
      const downloadedMatches = [
        createMockMatch('match_2'),
        createMockMatch('match_2'), // duplicate in downloaded
      ];

      const result = mergeDownloadedHistory(downloadedMatches, localMatches);

      expect(result).toHaveLength(2);
      const ids = result.map((m) => m.id);
      expect(ids).toContain('match_1');
      expect(ids).toContain('match_2');
    });
  });

  describe('Auto-repair on startup pattern', () => {
    it('should clean up corrupted localStorage with duplicated matches', () => {
      const corruptedData = [
        createMockMatch('match_dup'),
        createMockMatch('match_dup'),
        createMockMatch('match_unique'),
      ];
      localStorage.setItem('myPlacarHistory', JSON.stringify(corruptedData));

      // Simulates the GameProvider startup logic
      const raw = JSON.parse(localStorage.getItem('myPlacarHistory') || '[]');
      const seenIds = new Set<string>();
      const cleanList: MatchHistoryItem[] = [];
      let hasDuplicates = false;
      for (const item of raw) {
        if (item?.id && !seenIds.has(item.id)) {
          seenIds.add(item.id);
          cleanList.push(item);
        } else if (item?.id) {
          hasDuplicates = true;
        }
      }
      if (hasDuplicates) {
        localStorage.setItem('myPlacarHistory', JSON.stringify(cleanList));
      }

      expect(hasDuplicates).toBe(true);
      expect(cleanList).toHaveLength(2);
      expect(cleanList[0].id).toBe('match_dup');
      expect(cleanList[1].id).toBe('match_unique');

      const saved = JSON.parse(localStorage.getItem('myPlacarHistory') || '[]');
      expect(saved).toHaveLength(2);
    });
  });
});
