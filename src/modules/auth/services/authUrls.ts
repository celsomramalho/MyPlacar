const PRODUCTION_ORIGIN = 'https://myplacar.app.br';

export const getPublicAuthOrigin = () => {
  const { hostname, origin } = globalThis.location;
  const isPrivateAiStudio = hostname.startsWith('ais-dev-');
  const isPublicAiStudio = hostname.startsWith('ais-pre-');
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
  const isRunApp = hostname.includes('run.app');

  if (isPrivateAiStudio) {
    return origin.replace('ais-dev-', 'ais-pre-');
  }

  if (isLocalhost || isPublicAiStudio || isRunApp) {
    return origin;
  }

  return PRODUCTION_ORIGIN;
};

export const buildPasswordResetContinueUrl = (email: string) => {
  const url = new URL(getPublicAuthOrigin());
  url.searchParams.set('mode', 'resetPassword');
  url.searchParams.set('email', email.toLowerCase().trim());
  return url.toString();
};

export const clearAuthUrlParams = () => {
  globalThis.history.replaceState(null, '', globalThis.location.pathname);
};
