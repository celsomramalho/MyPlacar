/**
 * Detecta se o dispositivo atual é um relógio inteligente (Watch).
 * Baseado em dimensões de tela e User Agent.
 */
export const isWatchDevice = (): boolean => {
  if (typeof window === 'undefined') return false;

  const ua = navigator.userAgent.toLowerCase();
  const isWatchUA = /watch|wear os|applewatch|samsungbrowser.*wearable/i.test(ua);
  
  // Relógios geralmente têm telas menores que 450px em ambas as dimensões
  const isSmallScreen = globalThis.innerWidth < 450 && globalThis.innerHeight < 450;
  
  return isWatchUA || isSmallScreen;
};