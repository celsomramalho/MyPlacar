const PRODUCTION_ORIGIN = 'https://myplacar.app.br';
const PRODUCTION_LINK_DOMAIN = 'myplacar.app.br';

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
  const { hostname, origin } = globalThis.location;
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
  const url = new URL(isLocalhost ? origin : PRODUCTION_ORIGIN);
  url.searchParams.set('mode', 'resetPassword');
  url.searchParams.set('email', email.toLowerCase().trim());
  return url.toString();
};

export const buildPasswordResetActionCodeSettings = (email: string) => {
  const { hostname } = globalThis.location;
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

  return {
    url: buildPasswordResetContinueUrl(email),
    handleCodeInApp: true,
    ...(isLocalhost ? {} : { linkDomain: PRODUCTION_LINK_DOMAIN }),
  };
};

export const getPasswordResetParams = () => {
  const readParams = (params: URLSearchParams) => ({
    email: params.get('email') || '',
    isResetPassword: params.get('mode') === 'resetPassword',
    oobCode: params.get('oobCode') || '',
  });

  const currentParams = new URLSearchParams(globalThis.location.search);
  const direct = readParams(currentParams);
  if (direct.oobCode || direct.isResetPassword) return direct;

  for (const key of ['continueUrl', 'continue', 'url']) {
    const nestedUrl = currentParams.get(key);
    if (!nestedUrl) continue;

    try {
      const nestedParams = new URL(nestedUrl).searchParams;
      const nested = readParams(nestedParams);
      if (nested.oobCode || nested.isResetPassword) return nested;
    } catch {
      // Ignore malformed nested URLs and fall through to the direct params.
    }
  }

  return direct;
};

export const clearAuthUrlParams = () => {
  globalThis.history.replaceState(null, '', globalThis.location.pathname);
};
