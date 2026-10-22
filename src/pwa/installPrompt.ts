import { useEffect, useState } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let capturedPrompt: BeforeInstallPromptEvent | null = null;
let installedStatus: boolean | null = null;
let installedStatusRevision = 0;
const promptListeners = new Set<(prompt: BeforeInstallPromptEvent | null) => void>();
const installListeners = new Set<(installed: boolean) => void>();

const setInstalledStatus = (installed: boolean) => {
  installedStatus = installed;
  installedStatusRevision += 1;
  installListeners.forEach((listener) => listener(installed));
};

const clearInstallPrompt = () => {
  capturedPrompt = null;
  promptListeners.forEach((listener) => listener(null));
};

export const isAppInstalled = (): boolean => {
  if (typeof window === 'undefined') return false;
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
  const isIosStandalone = (window.navigator as any).standalone === true;
  const isAndroidTwa = document.referrer.includes('android-app://');
  const isCapacitor = Boolean((window as any).Capacitor?.isNativePlatform?.());
  return Boolean(isStandalone || isIosStandalone || isAndroidTwa || isCapacitor);
};

export const isAndroidDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  return /android/i.test(navigator.userAgent);
};

export const isAppleDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent;
  const isIOS = /iphone|ipad|ipod/i.test(ua);
  const isIPadOS = /macintosh/i.test(ua) && ((navigator as any).maxTouchPoints > 1);
  const isMac = /macintosh|mac os x/i.test(ua);
  return isIOS || isIPadOS || isMac;
};

export const isSafariBrowser = (): boolean => {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent;
  const isSafari = /safari/i.test(ua) && !/chrome|crios|crmo|firefox|fxios|edg|opr/i.test(ua);
  return isSafari;
};

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event: Event) => {
    event.preventDefault();
    capturedPrompt = event as BeforeInstallPromptEvent;
    promptListeners.forEach((listener) => listener(capturedPrompt));
  });

  window.addEventListener('appinstalled', () => {
    clearInstallPrompt();
    setInstalledStatus(true);
  });
}

interface InstalledRelatedApp {
  platform: string;
  url?: string;
}

interface NavigatorWithInstalledRelatedApps extends Navigator {
  getInstalledRelatedApps?: () => Promise<InstalledRelatedApp[]>;
}

const checkInstalledRelatedPwa = async (): Promise<boolean | null> => {
  if (typeof window === 'undefined' || !isAndroidDevice()) return null;

  const getInstalledRelatedApps = (navigator as NavigatorWithInstalledRelatedApps).getInstalledRelatedApps;
  if (!getInstalledRelatedApps) return null;

  try {
    const installedApps = await getInstalledRelatedApps.call(navigator);
    const manifestUrl = new URL('/manifest.json', window.location.origin).href;
    return installedApps.some((app) => app.platform === 'webapp' && app.url === manifestUrl);
  } catch (err) {
    console.warn('Falha ao verificar se a PWA está instalada:', err);
    return null;
  }
};

export function useInstallPwa() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(capturedPrompt);
  const [isInstalled, setIsInstalled] = useState<boolean>(() => installedStatus ?? isAppInstalled());
  const [isInstallStatusReady, setIsInstallStatusReady] = useState<boolean>(() => !isAndroidDevice());

  useEffect(() => {
    const handlePromptChange = (prompt: BeforeInstallPromptEvent | null) => {
      setDeferredPrompt(prompt);
    };

    const handleInstallChange = (installed: boolean) => {
      setIsInstalled(installed);
    };

    promptListeners.add(handlePromptChange);
    installListeners.add(handleInstallChange);

    let isActive = true;
    const checkRevision = installedStatusRevision;
    void checkInstalledRelatedPwa().then((installed) => {
      if (!isActive) return;
      if (installed !== null && installedStatusRevision === checkRevision) {
        setInstalledStatus(isAppInstalled() || installed);
      }
      setIsInstallStatusReady(true);
    });

    const mql = window.matchMedia('(display-mode: standalone)');
    const handleMqlChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setInstalledStatus(true);
      }
    };
    mql.addEventListener?.('change', handleMqlChange);

    return () => {
      isActive = false;
      promptListeners.delete(handlePromptChange);
      installListeners.delete(handleInstallChange);
      mql.removeEventListener?.('change', handleMqlChange);
    };
  }, []);

  const triggerInstall = async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!deferredPrompt) return 'unavailable';
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        clearInstallPrompt();
        setInstalledStatus(true);
      }
      return outcome;
    } catch (err) {
      console.warn('Falha ao acionar prompt de instalação PWA:', err);
      return 'unavailable';
    }
  };

  return { 
    deferredPrompt, 
    isInstalled, 
    isInstallStatusReady,
    triggerInstall,
    isAndroid: isAndroidDevice(),
    isApple: isAppleDevice(),
    isSafari: isSafariBrowser(),
  };
}

