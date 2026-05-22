const DEVICE_LABEL_STORAGE_KEY = 'myPlacar_LocalDeviceLabel';

export const readLocalDeviceLabel = () => {
  return localStorage.getItem(DEVICE_LABEL_STORAGE_KEY) || '';
};

export const saveLocalDeviceLabel = (label: string) => {
  localStorage.setItem(DEVICE_LABEL_STORAGE_KEY, label);
};

export const detectDeviceLabel = (isWatchMode?: boolean) => {
  if (isWatchMode) return 'Relógio';

  const userAgent = navigator.userAgent.toLowerCase();
  const isMobile = /android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);

  return isMobile ? 'Celular' : 'Note';
};
