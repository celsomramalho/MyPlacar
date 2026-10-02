import { useLivePublisher } from './useLivePublisher.ts';
import { useLiveSubscriber } from './useLiveSubscriber.tsx';

export interface UseLiveFirestoreSyncParams {
  deviceId: string;
  currentFullDeviceName: string;
  initialSpectatorPin: string | null;
}

/**
 * useLiveFirestoreSync (Fachada / Orquestrador de Sincronismo em Tempo Real)
 * 
 * Orquestra de forma desacoplada os dois canais fundamentais do sistema de Live:
 * 1. Canal de Publicação (useLivePublisher): responsável por deltas de placar do juiz/controlador,
 *    heartbeats de presença periódicos, incrementos de liveVersion e indicador FB Sync.
 * 2. Canal de Assinatura (useLiveSubscriber): responsável pelos ouvintes onSnapshot de documento e coleção,
 *    modo placar público (espectador), watchdog de conexão remota e alertas de UI.
 */
export function useLiveFirestoreSync(params: UseLiveFirestoreSyncParams): void {
  const { deviceId, currentFullDeviceName, initialSpectatorPin } = params;

  // 1. Canal de Escrita / Publicação (apenas envio de deltas e heartbeats)
  const { markStateAsSent } = useLivePublisher({
    deviceId,
    currentFullDeviceName,
  });

  // 2. Canal de Leitura / Assinatura (escuta de snapshots, reconciliação e espectadores)
  useLiveSubscriber({
    deviceId,
    currentFullDeviceName,
    initialSpectatorPin,
    markStateAsSent,
  });
}
