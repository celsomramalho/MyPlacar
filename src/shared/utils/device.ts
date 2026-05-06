export const isWatchDevice = (): boolean => {
  if (typeof window === 'undefined') return false;

  const ua = navigator.userAgent.toLowerCase();
  const isWatchUA = /watch|wear os|applewatch|samsungbrowser.*wearable/i.test(ua);
  const isSmallScreen = globalThis.innerWidth < 450 && globalThis.innerHeight < 450;

  return isWatchUA || isSmallScreen;
};

export const getDeviceType = (): 'watch' | 'phone' | 'tablet' | 'laptop' => {
  if (isWatchDevice()) return 'watch';

  const isMobile = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  if (isMobile) return 'phone';

  const label = (localStorage.getItem('myPlacar_LocalDeviceLabel') || '').toLowerCase();
  const isLaptop = label.includes('note') || label.includes('laptop') || label.includes('pc') || label.includes('computador');

  return isLaptop ? 'laptop' : 'tablet';
};
