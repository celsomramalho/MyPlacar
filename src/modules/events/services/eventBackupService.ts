import { getDb } from '@infra/firebase';
import { fetchEventByPin, fetchEventEntries, saveAdminEventEntry } from '@infra/firebase/events';
import type { TournamentEvent, TournamentEntry } from '@modules/events/types';

export type RestoreBackupResult =
  | { ok: true; event: TournamentEvent; entries: TournamentEntry[] }
  | { ok: false; error: string };

export interface EventBackupData {
  _meta: {
    version: number;
    exportedAt: string;
    exportedBy: string;
    pin: string;
    eventName: string;
  };
  event: Omit<TournamentEvent, 'entries'>;
  entries: TournamentEntry[];
}

/**
 * Busca os dados mais recentes do evento (documento raiz + subcoleção entries)
 * e monta o objeto de backup completo.
 */
export const buildEventBackup = async (
  event: TournamentEvent,
  adminEmail?: string,
): Promise<EventBackupData> => {
  const db = getDb();

  let freshEvent: TournamentEvent = event;
  let freshEntries: TournamentEntry[] = event.entries || [];

  if (db) {
    try {
      const [fetchedEvent, fetchedEntries] = await Promise.all([
        fetchEventByPin(db, event.pin),
        fetchEventEntries(db, event.pin),
      ]);
      if (fetchedEvent) freshEvent = fetchedEvent as TournamentEvent;
      if (fetchedEntries?.length) freshEntries = fetchedEntries as TournamentEntry[];
    } catch {
      // Fallback: usa os dados já carregados em memória
    }
  }

  // Separa entries do documento raiz para evitar duplicação
  const { entries: _entries, ...eventWithoutEntries } = freshEvent as any;

  return {
    _meta: {
      version: 1,
      exportedAt: new Date().toISOString(),
      exportedBy: adminEmail || 'desconhecido',
      pin: event.pin,
      eventName: event.name || event.pin,
    },
    event: eventWithoutEntries as Omit<TournamentEvent, 'entries'>,
    entries: freshEntries,
  };
};

/**
 * Dispara o download de um arquivo JSON no navegador com os dados do backup.
 */
export const downloadEventBackup = (backup: EventBackupData): void => {
  const dateStr = new Date()
    .toISOString()
    .slice(0, 16)
    .replace('T', '_')
    .replace(':', 'h')
    .replace(':', 'm');

  const filename = `backup_${backup._meta.pin}_${dateStr}.json`;
  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  setTimeout(() => URL.revokeObjectURL(url), 10_000);
};

/**
 * Abre um seletor de arquivo JSON e valida se é um backup de evento válido.
 * Retorna os dados do evento e as inscrições, ou um erro descritivo.
 */
export const readEventBackupFromFile = (): Promise<RestoreBackupResult> => {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';

    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve({ ok: false, error: 'Nenhum arquivo selecionado.' });
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const raw = JSON.parse(e.target?.result as string) as Partial<EventBackupData>;

          if (!raw._meta || !raw.event || !raw._meta.pin) {
            resolve({ ok: false, error: 'Arquivo inválido: não é um backup de evento MyPlacar.' });
            return;
          }

          const event = { ...raw.event, pin: raw._meta.pin } as TournamentEvent;
          const entries = Array.isArray(raw.entries) ? raw.entries : [];

          resolve({ ok: true, event, entries });
        } catch {
          resolve({ ok: false, error: 'Erro ao ler o arquivo. Verifique se é um JSON válido.' });
        }
      };

      reader.onerror = () => resolve({ ok: false, error: 'Erro ao ler o arquivo.' });
      reader.readAsText(file);
    };

    input.oncancel = () => resolve({ ok: false, error: 'Cancelado.' });

    document.body.appendChild(input);
    input.click();
    document.body.removeChild(input);
  });
};

/**
 * Salva as inscrições do backup no Firestore subcoleção /entries do evento.
 */
export const restoreEventEntriesToFirestore = async (
  eventPin: string,
  entries: TournamentEntry[],
  adminEmail?: string,
): Promise<number> => {
  const db = getDb();
  if (!db || !Array.isArray(entries) || entries.length === 0) return 0;

  let restoredCount = 0;
  for (const entry of entries) {
    if (entry && entry.email) {
      try {
        await saveAdminEventEntry(db, eventPin, entry, adminEmail);
        restoredCount++;
      } catch (err) {
        console.warn(`[Restore] Erro ao restaurar inscrição ${entry.email}:`, err);
      }
    }
  }
  return restoredCount;
};
