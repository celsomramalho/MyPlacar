import React, { useMemo } from 'react';
import { AuthScreen } from '@modules/auth';
import { useGame } from '@modules/game';
import { useUI } from '@modules/ui';

interface AuthRouteProps {
  appUrl: string;
  handleCheckUpdate: () => Promise<string | null>;
  setIsUpdatingVersion: React.Dispatch<React.SetStateAction<boolean>>;
  setIsOfflineMode: React.Dispatch<React.SetStateAction<boolean>>;
  onOfflineMode: () => void;
}

export function AuthRoute({
  appUrl,
  handleCheckUpdate,
  setIsUpdatingVersion,
  setIsOfflineMode,
  onOfflineMode,
}: AuthRouteProps) {
  const { setUserProfile } = useGame();
  const { setCurrentScreen } = useUI();

  const initialReferralPin = useMemo(() => {
    try { return localStorage.getItem('myPlacarPendingReferralPin') || ''; } catch { return ''; }
  }, []);

  return (
    <AuthScreen
      appUrl={appUrl}
      onAuthSuccess={(p, s) => {
        setIsOfflineMode(false);
        if (s) {
          try {
            localStorage.setItem('myPlacarUserProfile', JSON.stringify(p));
            localStorage.setItem('myPlacarSavedPin', p.pin);
            localStorage.setItem('myPlacarSavedEmail', p.email);
          } catch {}
        }
        setUserProfile(p);
        setCurrentScreen('home');
      }}
      onCheckUpdate={() => handleCheckUpdate().then(v => v ?? false)}
      setIsUpdatingVersion={setIsUpdatingVersion}
      initialReferralPin={initialReferralPin}
      onOfflineMode={onOfflineMode}
    />
  );
}
