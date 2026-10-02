import type { FieldValue } from 'firebase/firestore';
import { getDb } from '@infra/firebase';
import type { ControllerRecord, GameState } from '../../../types.ts';
import type { UserProfile } from '@modules/auth/types';
import { isWatchDevice } from '@shared/utils/device';

export interface SafeLiveExitParams {
  deviceId: string;
  userProfile: UserProfile;
  currentGs: GameState | null;
  activeLives: GameState[];
  tookControlAt: number;
  lostControlAt: number;
}

/**
 * Executa a rotina segura de saída do usuário da transmissão (visibilitychange/beforeunload).
 * Preserva a live ativa caso outro dispositivo (juiz/relógio) ainda esteja conectado.
 */
export async function performSafeLiveExit(params: SafeLiveExitParams): Promise<void> {
  const { deviceId, userProfile, currentGs, activeLives, tookControlAt, lostControlAt } = params;

  // Se a flag 'alive' existe, o app foi montado recentemente — é um reload,
  // não uma saída definitiva. Consome a flag e aborta para não fechar a live.
  try {
    if (sessionStorage.getItem('myPlacar_alive')) {
      sessionStorage.removeItem('myPlacar_alive');
      return;
    }
  } catch {}

  if (!currentGs?.isMirroringActive || !userProfile.email || !navigator.onLine) return;
  const db = getDb();
  if (!db) return;

  const { doc, updateDoc, deleteField } = await import('firebase/firestore');
  const myPin = userProfile.pin?.toUpperCase();
  const judgeMatch = activeLives.find(
    l => l.judgePin?.toUpperCase() === myPin || l.judge?.pin?.toUpperCase() === myPin,
  );

  // Calcula isOwner de forma síncrona com base no estado atual
  const gsOwnerDeviceId = currentGs.ownerDeviceId;
  const isOwnerByDeviceId = !isWatchDevice() && Boolean(gsOwnerDeviceId) && gsOwnerDeviceId === deviceId;
  const isOwnerByPin =
    !isWatchDevice() &&
    !gsOwnerDeviceId &&
    currentGs.ownerPin?.toUpperCase() === myPin &&
    !activeLives.some(
      l => l.ownerDeviceId && l.ownerDeviceId !== deviceId && l.ownerPin?.toUpperCase() === myPin,
    );
  const isOwnerViaRef = isOwnerByDeviceId || isOwnerByPin;

  // Usa apenas PIN autorizado: live própria do usuário logado ou live onde ele é juiz
  const targetPin =
    judgeMatch && judgeMatch.ownerPin
      ? judgeMatch.ownerPin.toUpperCase()
      : isOwnerViaRef && myPin
      ? myPin
      : null;

  if (!targetPin) return;

  const isController = currentGs.commandOwnerId === deviceId;
  const justLostControl = Date.now() - lostControlAt < 30000;
  const justTookControl = Date.now() - tookControlAt < 15000;

  // Regra: o owner só fecha a live via performExit se ELE é o controller ativo.
  // Se outro device (relógio, juiz) está controlando, o owner saindo da tela
  // apenas remove sua presença — a live continua sob o controle do outro device.
  if (isOwnerViaRef && isController && !justLostControl && !justTookControl) {
    const hasActiveJudge = Boolean(
      currentGs.judgePin &&
      Object.values(currentGs.controllers || {}).some(
        (c: ControllerRecord) => c.role === 'judge' && Date.now() - (c.lastSeen || 0) < 60000,
      ),
    );
    const controllersEntries = Object.entries(currentGs.controllers || {});
    const hasActiveOwnerDevice = controllersEntries.some(
      ([id, c]) =>
        id !== deviceId &&
        (c as ControllerRecord).role === 'owner' &&
        Date.now() - ((c as ControllerRecord).lastSeen || 0) < 60000,
    );

    if (hasActiveJudge || hasActiveOwnerDevice) {
      const presenceUpdate: Record<
        string,
        FieldValue | null | string | number | boolean | object | undefined
      > = {
        [`controllers.${deviceId}`]: deleteField(),
        commandOwnerId: null,
        commandOwner: null,
      };
      updateDoc(doc(db, 'live_matches', targetPin), presenceUpdate).catch(() => {});
    } else {
      updateDoc(doc(db, 'live_matches', targetPin), {
        isLiveClosed: true,
        isMirroringActive: false,
      }).catch(() => {});
    }
  } else if (isOwnerViaRef && !isController) {
    updateDoc(doc(db, 'live_matches', targetPin), {
      [`controllers.${deviceId}`]: deleteField(),
    }).catch(() => {});
  } else {
    const presenceUpdate: Record<
      string,
      FieldValue | null | string | number | boolean | object | undefined
    > = {
      [`controllers.${deviceId}`]: deleteField(),
    };
    if (isController) {
      presenceUpdate.commandOwnerId = null;
      presenceUpdate.commandOwner = null;
    }
    updateDoc(doc(db, 'live_matches', targetPin), presenceUpdate).catch(() => {});
  }
}
