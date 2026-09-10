import { useEffect, useState } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let capturedPrompt: BeforeInstallPromptEvent | null = null;
const promptListeners = new Set<(prompt: BeforeInstallPromptEvent | null) => void>();
const installListeners = new Set<(installed: boolean) => void>();

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
    capturedPrompt = null;
    promptListeners.forEach((listener) => listener(null));
    installListeners.forEach((listener) => listener(true));
  });
}

export function useInstallPwa() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(capturedPrompt);
  const [isInstalled, setIsInstalled] = useState<boolean>(() => isAppInstalled());

  useEffect(() => {
    const handlePromptChange = (prompt: BeforeInstallPromptEvent | null) => {
      setDeferredPrompt(prompt);
    };

    const handleInstallChange = (installed: boolean) => {
      setIsInstalled(installed);
    };

    promptListeners.add(handlePromptChange);
    installListeners.add(handleInstallChange);

    const mql = window.matchMedia('(display-mode: standalone)');
    const handleMqlChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setIsInstalled(true);
      }
    };
    mql.addEventListener?.('change', handleMqlChange);

    return () => {
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
        setIsInstalled(true);
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
    triggerInstall,
    isAndroid: isAndroidDevice(),
    isApple: isAppleDevice(),
    isSafari: isSafariBrowser(),
  };
}

