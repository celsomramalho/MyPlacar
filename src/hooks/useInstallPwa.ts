import { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function useInstallPwa() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    globalThis.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => globalThis.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  return { deferredPrompt };
}
