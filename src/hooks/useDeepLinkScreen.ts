import { useState, useEffect } from 'react';
import { useUI } from '@modules/ui';
import { getUrlParams } from '../utils/appNavigation.ts';

/** Deep links: espectador, placar público, referral e reset de senha na URL. */
export function useDeepLinkScreen(onForceLogout?: () => void | Promise<void>) {
  const urlParams = getUrlParams();
  const { setCurrentScreen } = useUI();

  const initialSpectatorMatchId = urlParams.get('viewMatch');
  const initialSpectatorPin = urlParams.get('viewPin');
  const initialViewMode = urlParams.get('viewMode');

  const [spectatorMatchId] = useState<string | null>(initialSpectatorMatchId);
  const [spectatorPin, setSpectatorPin] = useState<string | null>(initialSpectatorPin);

  useEffect(() => {
    const params = getUrlParams();
    if (params.get('mode') === 'resetPassword' || params.get('oobCode')) {
      setCurrentScreen('auth');
    }
  }, [setCurrentScreen]);

  useEffect(() => {
    try {
      const referral = urlParams.get('ref');
      const referralPin = urlParams.get('pin_ref') || urlParams.get('refPin');
      const joinEvent = urlParams.get('joinEvent');
      if (referral) localStorage.setItem('myPlacarPendingReferral', referral);
      if (referralPin) localStorage.setItem('myPlacarPendingReferralPin', referralPin);
      if (joinEvent) localStorage.setItem('myPlacarPendingJoinEvent', joinEvent);
      if (urlParams.get('logout') === 'true') {
        void onForceLogout?.();
      }
    } catch {
      /* best-effort */
    }
  }, [urlParams, onForceLogout]);

  const handleExitSpectator = () => {
    globalThis.location.href = globalThis.location.pathname;
  };

  return {
    urlParams,
    initialSpectatorMatchId,
    initialSpectatorPin,
    initialViewMode,
    spectatorMatchId,
    spectatorPin,
    setSpectatorPin,
    handleExitSpectator,
  };
}
