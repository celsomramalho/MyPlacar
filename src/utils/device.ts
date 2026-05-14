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

export const resolveWatchMode = (currentValue: boolean): boolean =>
  isWatchDevice() ? true : currentValue;
/**
 * Detecta o tipo do dispositivo atual.
 * Usado para ícones e registro nos controllers da live.
 */
export const getDeviceType = (): 'watch' | 'phone' | 'tablet' | 'laptop' => {
  if (isWatchDevice()) return 'watch';
  const isMobile = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  if (isMobile) return 'phone';
  // Consulta o label salvo para distinguir notebook/PC de tablet genérico
  const label = (localStorage.getItem('myPlacar_LocalDeviceLabel') || '').toLowerCase();
  const isLaptop = label.includes('note') || label.includes('laptop') || label.includes('pc') || label.includes('computador');
  return isLaptop ? 'laptop' : 'tablet';
};

/**
 * Obtém ou gera um ID único persistente para este dispositivo.
 */
export const getDeviceId = (): string => {
  try {
    let id = localStorage.getItem('myPlacar_DeviceId');
    if (!id) {
      id = Math.random().toString(36).substring(2, 11);
      localStorage.setItem('myPlacar_DeviceId', id);
    }
    return id;
  } catch (_e) {
    return "session_" + Math.random().toString(36).substring(2, 11);
  }
};
