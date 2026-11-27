import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';

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
  setUserProfile: Dispatch<SetStateAction<UserProfile>>;
  authReady: boolean;
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
  setUserProfile,
  authReady,
  matchSettings,
  setModalConfig,
}: UseAppStartupParams): void {

  // Keep the locally cached profile plan in sync across browser origins/dev servers.
  useEffect(() => {
    if (!authReady || !userProfile.email || !navigator.onLine) return;
    let cancelled = false;

    void Promise.all([
      import('@infra/firebase/client'),
      import('@infra/firebase/userProfiles'),
    ])
      .then(async ([{ getDb }, { fetchUserProfileFromServer }]) => {
        const db = getDb();
        if (!db) return null;
        return fetchUserProfileFromServer(db, userProfile.email);
      })
      .then((cloudProfile) => {
        if (cancelled || !cloudProfile) return;
        setUserProfile((current) => {
          if (current.email.toLowerCase().trim() !== userProfile.email.toLowerCase().trim()) return current;
          const updated = {
            ...current,
            planType: cloudProfile.planType === 'premium' ? 'premium' as const : 'free' as const,
            premiumUntil: cloudProfile.premiumUntil,
          };
          try {
            localStorage.setItem('myPlacarUserProfile', JSON.stringify(updated));
          } catch {}
          return updated;
        });
      })
      .catch((error) => {
        console.warn('MyPlacar: não foi possível sincronizar o plano do perfil:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [authReady, userProfile.email, setUserProfile]);

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
            onConfirm: async () => {
              const { clearFirestoreCache } = await import('@infra/firebase/client');
              await clearFirestoreCache();
            },
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
    } catch {}
    if (userProfile.email && navigator.onLine) {
      void import('@infra/firebase/client')
        .then(({ getDb }) => {
          const db = getDb();
          if (!db) return;
          return import('firebase/firestore').then(({ doc, setDoc }) =>
            setDoc(
              doc(db, 'user_queue_metadata', userProfile.email.toLowerCase().trim()),
              { queue_list: playerQueue, updatedAt: Date.now() },
              { merge: true },
            ),
          );
        })
        .catch(() => {});
    }
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
