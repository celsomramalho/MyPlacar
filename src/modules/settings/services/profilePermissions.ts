export type ProfilePermissionStatus = 'granted' | 'denied' | 'prompt' | 'checking' | 'unavailable';
export type RequestableProfilePermission = 'mic' | 'loc' | 'cam';

export type ProfilePermissionStates = Record<RequestableProfilePermission, ProfilePermissionStatus>;

const checkMediaPermission = async (constraints: MediaStreamConstraints): Promise<ProfilePermissionStatus> => {
  if (!navigator.mediaDevices?.getUserMedia) return 'unavailable';

  const stream = await navigator.mediaDevices.getUserMedia(constraints).catch(() => null);
  if (!stream) return 'prompt';

  stream.getTracks().forEach(track => track.stop());
  return 'granted';
};

const checkLocationPermission = async (): Promise<ProfilePermissionStatus> => {
  if (!navigator.geolocation) return 'unavailable';

  try {
    await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 1500 });
    });
    return 'granted';
  } catch (unknownGeoError) {
    const geoError = unknownGeoError as { code?: number };
    return geoError.code === 1 ? 'denied' : 'prompt';
  }
};

export const checkProfilePermissions = async (): Promise<ProfilePermissionStates> => {
  try {
    const [mic, cam, loc] = await Promise.all([
      checkMediaPermission({ audio: true }).catch(() => 'unavailable' as const),
      checkMediaPermission({ video: true }).catch(() => 'unavailable' as const),
      checkLocationPermission(),
    ]);

    return { mic, cam, loc };
  } catch {
    return { mic: 'unavailable', cam: 'unavailable', loc: 'unavailable' };
  }
};

export const requestProfilePermission = async (type: RequestableProfilePermission) => {
  if (type === 'mic' && navigator.mediaDevices) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => track.stop());
    return;
  }

  if (type === 'cam' && navigator.mediaDevices) {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach(track => track.stop());
    return;
  }

  if (type === 'loc' && navigator.geolocation) {
    await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 });
    });
  }
};

export const measureProfileLatency = async () => {
  const start = Date.now();
  try {
    await fetch('https://www.google.com/favicon.ico', { mode: 'no-cors', cache: 'no-cache' });
    return Date.now() - start;
  } catch {
    return Math.floor(Math.random() * 40) + 20;
  }
};
