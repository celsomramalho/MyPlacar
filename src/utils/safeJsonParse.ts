// ─── src/utils/safeJsonParse.ts ──────────────────────────────────────────────
// Utilitário de leitura segura do localStorage.
//
// Extraído do App.tsx (Fase 4 — Passo 4.0) para ser compartilhado com o
// GameContext.tsx, que precisa inicializar estados a partir do localStorage
// sem depender do App.tsx.
// ─────────────────────────────────────────────────────────────────────────────

import { isValidGameState, isValidMatchSettings } from '@modules/game/domain/validation';

/**
 * Lê e faz parse de um valor do localStorage de forma segura.
 * - Retorna `fallback` se a chave não existir, estiver vazia ou for inválida.
 * - Para `myPlacarActiveGameState`: valida via `isValidGameState` e remove a
 *   chave se inválida, evitando que um estado corrompido bloqueie o app.
 * - Para `myPlacarSettings`: valida via `isValidMatchSettings`.
 *
 * O tipo genérico `T` é inferido a partir do `fallback`, preservando a tipagem
 * nos call sites sem necessidade de cast explícito.
 */
export function safeJsonParse<T>(key: string, fallback: T): T {
  try {
    if (typeof window === 'undefined' || !globalThis.localStorage) return fallback;
    const saved = localStorage.getItem(key);
    if (saved && saved !== "undefined" && saved !== "null" && saved.trim() !== "") {
      const parsed = JSON.parse(saved);
      if (key === 'myPlacarActiveGameState' && parsed !== null) {
        if (!isValidGameState(parsed)) {
          localStorage.removeItem(key);
          return fallback;
        }
      }
      if (key === 'myPlacarSettings' && parsed !== null) {
        if (!isValidMatchSettings(parsed)) {
          return fallback;
        }
      }
      return parsed as T;
    }
  } catch {}
  return fallback;
}
