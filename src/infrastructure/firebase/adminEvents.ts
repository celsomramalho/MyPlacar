import { collection, deleteDoc, deleteField, doc, getDocs, setDoc, updateDoc, type Firestore } from 'firebase/firestore';
import type { TournamentEvent } from '@modules/events/types';

export type FirebaseAdminTournamentEvent = TournamentEvent;

/**
 * Remove recursivamente campos `undefined` e garante que o objeto seja estritamente serializável antes de salvar no Firestore.
 * O Firestore rejeita objetos com funções, protótipos customizados ou campos `undefined`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sanitizeForFirestore<T>(value: T): T {
  if (value === undefined) return undefined as any;
  if (value === null) return null as any;

  if (Array.isArray(value)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return value.map(sanitizeForFirestore).filter((v) => v !== undefined) as any;
  }

  if (typeof value === 'object') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cleaned: Record<string, any> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined && typeof v !== 'function') {
        cleaned[k] = sanitizeForFirestore(v);
      }
    }
    return cleaned as T;
  }

  return value;
}

export const fetchAdminEvents = async (db: Firestore): Promise<FirebaseAdminTournamentEvent[]> => {
  const snapshot = await getDocs(collection(db, 'events'));
  const events: FirebaseAdminTournamentEvent[] = [];

  snapshot.forEach(docSnapshot => {
    events.push({ pin: docSnapshot.id, ...docSnapshot.data() } as FirebaseAdminTournamentEvent);
  });

  return events;
};

/**
 * Salva um evento no Firestore.
 * Estratégia:
 * 1. Tenta salvar diretamente via Firestore SDK (requer Firebase Auth ativo com isAdmin).
 * 2. Se falhar por permissão, usa a API serverless `/api/admin-save-event`
 *    que usa o Firebase Admin SDK (ignora regras de segurança).
 *
 * O `adminEmail` é necessário para a validação de segurança na API serverless.
 */
export const saveAdminEvent = async (
  db: Firestore,
  event: FirebaseAdminTournamentEvent,
  adminEmail?: string,
) => {
  // Strip entries array from main event document (entries are saved in events/{pin}/entries subcollection)
  const { entries: _entries, ...eventWithoutEntries } = event;
  const rawPlain = JSON.parse(JSON.stringify({
    ...eventWithoutEntries,
    createdAt: event.createdAt || Date.now(),
  }));
  const sanitized = sanitizeForFirestore(rawPlain);

  try {
    // Tenta salvar diretamente (funciona se usuário está autenticado no Firebase Auth com isAdmin)
    await setDoc(doc(db, 'events', event.pin), sanitized, { merge: true });
    // Garante que o campo entries[] legado seja removido do doc raiz (a fonte de verdade é a subcoleção)
    await updateDoc(doc(db, 'events', event.pin), { entries: deleteField() }).catch(() => {});
  } catch (err: unknown) {
    const firebaseErr = err as { code?: string; message?: string };

    // Se falhou por permissão, usa a API serverless com Firebase Admin SDK
    if (
      firebaseErr?.code === 'permission-denied' ||
      firebaseErr?.message?.includes('Missing or insufficient permissions')
    ) {
      if (!adminEmail) {
        throw new Error('Permissão negada e adminEmail não fornecido para fallback via API.');
      }

      // Detectar base URL dinamicamente
      const baseUrl =
        typeof window !== 'undefined' && window.location.origin
          ? window.location.origin
          : 'https://myplacar.app.br';

      const response = await fetch(`${baseUrl}/api/admin-save-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, adminEmail }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(
          (errorBody as { error?: string }).error ||
          `Erro na API (${response.status}): ${response.statusText}`
        );
      }
    } else {
      // Outro tipo de erro — relança
      throw err;
    }
  }
};

export const deleteAdminEvent = (
  db: Firestore,
  eventPin: string,
) => deleteDoc(doc(db, 'events', eventPin));
