import type { UserProfile } from '@modules/auth/types';
import type { Screen } from '../types.ts';

export const getUrlParams = () => new URLSearchParams(globalThis.location.search);

/** Tela inicial a partir da URL e do perfil salvo em localStorage. */
export const getInitialScreen = (): Screen => {
  try {
    const _viewMode = new URLSearchParams(window.location.search).get('viewMode');
    const _viewPin = new URLSearchParams(window.location.search).get('viewPin');
    const _viewMatch = new URLSearchParams(window.location.search).get('viewMatch');
    if (_viewPin && _viewMode === 'scoreboard') {
      return 'public-scoreboard';
    }
    if (_viewMatch || _viewPin) {
      return 'spectator';
    }

    const params = getUrlParams();
    if (params.get('mode') === 'resetPassword' || params.get('oobCode')) return 'auth';

    const saved = localStorage.getItem('myPlacarUserProfile');
    if (saved) {
      const profile = JSON.parse(saved) as UserProfile;
      if (profile?.email && profile?.pin && profile?.isProfileComplete) {
        return 'home';
      }
    }
    return 'auth';
  } catch {
    return 'auth';
  }
};
