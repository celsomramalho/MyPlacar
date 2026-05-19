import type { UserProfile } from '@modules/auth';
import type { Screen } from '../types.ts';

export const getUrlParams = () => new URLSearchParams(globalThis.location.search);

/** Tela inicial a partir da URL e do perfil salvo em localStorage. */
export const getInitialScreen = (): Screen => {
  try {
    const _viewMode = new URLSearchParams(window.location.search).get('viewMode');
    const _viewPin = new URLSearchParams(window.location.search).get('viewPin');
    const _viewMatch = new URLSearchParams(window.location.search).get('viewMatch');
    console.log('[DEBUG currentScreen init] viewMode:', _viewMode, 'viewPin:', _viewPin, 'viewMatch:', _viewMatch);
    if (_viewPin && _viewMode === 'scoreboard') {
      console.log('[DEBUG] → public-scoreboard');
      return 'public-scoreboard';
    }
    if (_viewMatch || _viewPin) {
      console.log('[DEBUG] → spectator');
      return 'spectator';
    }

    const params = getUrlParams();
    if (params.get('mode') === 'resetPassword' || params.get('oobCode')) return 'auth';

    const saved = localStorage.getItem('myPlacarUserProfile');
    if (saved) {
      const profile = JSON.parse(saved) as UserProfile;
      if (profile?.email && profile?.pin && profile?.isProfileComplete) {
        return 'settings';
      }
    }
    return 'auth';
  } catch {
    return 'auth';
  }
};
