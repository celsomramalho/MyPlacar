/**
 * Lê e faz parse de um valor do localStorage de forma segura e genérica.
 *
 * Opcionalmente aceita um validador `validate` para garantir que o formato do dado
 * lido é correto e uma callback `onInvalid` para tratar a invalidação (ex: remover do localStorage).
 */
export function safeJsonParse<T>(
  key: string,
  fallback: T,
  options?: {
    validate?: (parsed: any) => boolean;
    onInvalid?: () => void;
  }
): T {
  try {
    if (typeof window === 'undefined' || !globalThis.localStorage) return fallback;
    const saved = localStorage.getItem(key);
    if (saved && saved !== "undefined" && saved !== "null" && saved.trim() !== "") {
      const parsed = JSON.parse(saved);
      if (options?.validate && !options.validate(parsed)) {
        if (options.onInvalid) {
          options.onInvalid();
        }
        return fallback;
      }
      return parsed as T;
    }
  } catch {}
  return fallback;
}
