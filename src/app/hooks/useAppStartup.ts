import { useEffect } from 'react';
import { getDb, clearFirestoreCache } from '@infra/firebase';

import { APP_VERSION as LOCAL_CODE_VERSION } from '../../constants.ts';
import type { Partner, MatchSettings } from '../../types.ts';
import type { UserProfile } from '@modules/auth';
import type { QueuePlayer } from '@modules/partners/types';
import type { ModalConfig } from '@modules/ui';

const CURRENT_DATA_VERSION = '3.1.0'; // bumped: limpa SavedSettings_* para forçar novos defaults por esporte

interface UseAppStartupParams {
  partners: Partner[];
  playerQueue: QueuePlayer[];
  userProfile: UserProfile;
  matchSettings: MatchSettings;
  setModalConfig: (config: ModalConfig | null) => void;
}

/**
 * Agrupa os 6 `useEffect` de inicialização e persistência que viviam em `AppContent`.
 * Não retorna nada — é puro side-effect.
 *
 * Se no futuro algum effect precisar expor um valor (ex: `migrationDone`),
 * adicionar ao retorno sem quebrar o contrato atual.
 */
export function useAppStartup({
  partners,
  playerQueue,
  userProfile,
  matchSettings,
  setModalConfig,
}: UseAppStartupParams): void {

  // 1. Startup / migration
  useEffect(() => {
    localStorage.setItem('myPlacar_AppVersion', LOCAL_CODE_VERSION);
    localStorage.setItem('myPlacar_CrashCount', '0');

    const runMigration = () => {
      try {
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith('myPlacar_Backup_')) localStorage.removeItem(key);
        });

        const lastVersion = localStorage.getItem('myPlacar_DataVersion') || '2.2.23';
        if (lastVersion === CURRENT_DATA_VERSION) return;

        const rawHistory = localStorage.getItem('myPlacarHistory');
        if (rawHistory && rawHistory !== 'undefined' && rawHistory !== 'null') {
          const history = JSON.parse(rawHistory) as any[];
          const rawAssets = localStorage.getItem('myPlacarAssets');
          const assets: Record<string, string> =
            rawAssets && rawAssets !== 'undefined' && rawAssets !== 'null'
              ? JSON.parse(rawAssets)
              : {};
          const cleanedHistory = history.map(item => {
            if (item && item.customIcon && item.sportType) {
              assets[item.sportType] = item.customIcon;
              const { customIcon: _customIcon, ...rest } = item;
              return rest;
            }
            return item;
          });
          localStorage.setItem('myPlacarHistory', JSON.stringify(cleanedHistory));
          localStorage.setItem('myPlacarAssets', JSON.stringify(assets));
        }
        // Limpa configurações salvas por esporte para que os novos
        // defaults (sets, noAd, gamesPerSet) sejam aplicados na próxima seleção
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith('myPlacar_SavedSettings_')) localStorage.removeItem(key);
        });
        localStorage.setItem('myPlacar_DataVersion', CURRENT_DATA_VERSION);
      } catch (_e) {
        try { localStorage.setItem('myPlacar_DataVersion', CURRENT_DATA_VERSION); } catch {}
      }
    };
    runMigration();
    // Limpa flag de atualização de PWA em andamento
    try { sessionStorage.removeItem('myPlacar_pwa_updating'); } catch {}
    // Seta flag de "app ativo"
    try { sessionStorage.setItem('myPlacar_alive', '1'); } catch {}
  }, []);

  // 2. Quota error — listener global de QuotaExceededError
  useEffect(() => {
    const checkQuotaError = (name?: string, message?: string, reason?: unknown) => {
      return (
        name === 'QuotaExceededError' ||
        (reason &&
          typeof reason === 'object' &&
          (reason as { name?: string }).name === 'QuotaExceededError') ||
        (message && message.includes('exceeded the quota'))
      );
    };
    const handleQuotaError = (e: ErrorEvent) => {
      const isQuotaError = checkQuotaError(e.error?.name ?? e.type, e.message, undefined);
      if (isQuotaError) {
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith('myPlacar_Backup_')) localStorage.removeItem(key);
        });
        if (e.message && e.message.includes('firestore_mutations')) {
          setModalConfig({
            title: 'Erro de armazenamento',
            message:
              'O limite de espaço do navegador foi atingido. Deseja limpar o cache técnico e reiniciar?',
            confirmLabel: 'Limpar e reiniciar',
            variant: 'danger',
            onConfirm: async () => { await clearFirestoreCache(); },
            onCancel: () => setModalConfig(null),
          });
        }
      }
    };
    const handleRejectionError = (e: PromiseRejectionEvent) => {
      const isQuotaError = checkQuotaError(undefined, undefined, e.reason);
      if (isQuotaError) {
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith('myPlacar_Backup_')) localStorage.removeItem(key);
        });
      }
    };
    globalThis.addEventListener('error', handleQuotaError);
    globalThis.addEventListener('unhandledrejection', handleRejectionError);
    return () => {
      globalThis.removeEventListener('error', handleQuotaError);
      globalThis.removeEventListener('unhandledrejection', handleRejectionError);
    };
  }, []);

  // 3. Partners persist
  useEffect(() => {
    try {
      const data = JSON.stringify(partners);
      if (data !== 'undefined') localStorage.setItem('myPlacarPartners', data);
    } catch {}
  }, [partners]);

  // 4. PlayerQueue persist + sincroniza metadata na nuvem ao logar
  useEffect(() => {
    try {
      const data = JSON.stringify(playerQueue);
      if (data !== 'undefined') localStorage.setItem('myPlacarPlayerQueue', data);
      if (userProfile.email && navigator.onLine) {
        const db = getDb();
        if (db) {
          import('firebase/firestore').then(({ doc, setDoc }) => {
            setDoc(
              doc(db, 'user_queue_metadata', userProfile.email.toLowerCase().trim()),
              { queue_list: playerQueue, updatedAt: Date.now() },
              { merge: true },
            ).catch(() => {});
          });
        }
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile.email]);

  // 5. Alert override — substitui window.alert pelo modal do app
  useEffect(() => {
    (window as unknown as { alert: (msg: string) => void }).alert = (msg: string) => {
      setModalConfig({ title: 'Atenção', message: msg, onConfirm: () => setModalConfig(null) });
    };
  }, []);

  // 6. Brightness overlay
  useEffect(() => {
    const overlay = document.getElementById('brightness-overlay');
    if (overlay) {
      // Proteção contra NaN/undefined: se brightness for inválido, assume 100 (sem escurecimento).
      // NaN ocorre quando matchConfig vindo do Firebase não tem o campo 'brightness',
      // e no WebKit/Android, opacity:NaN é tratado como opacidade máxima (tela preta).
      const safeBrightness = (typeof matchSettings.brightness === 'number' && !isNaN(matchSettings.brightness))
        ? Math.max(0, Math.min(100, matchSettings.brightness))
        : 100;
      overlay.style.opacity = ((100 - safeBrightness) / 100).toString();
    }
  }, [matchSettings.brightness]);
}
