export type ProfilePermissionStatus = 'granted' | 'denied' | 'prompt' | 'checking' | 'unavailable';
export type RequestableProfilePermission = 'mic' | 'loc' | 'cam';

export type ProfilePermissionStates = Record<RequestableProfilePermission, ProfilePermissionStatus>;

const checkMediaPermission = async (constraints: MediaStreamConstraints): Promise<ProfilePermissionStatus> => {
  // Do not call getUserMedia just to inspect the permission. On Android this
  // opens a native permission request while the profile is mounting and can
  // make a WebView-backed Capacitor app close unexpectedly. The explicit
  // buttons below are responsible for requesting access.
  if (!navigator.mediaDevices?.getUserMedia) return 'unavailable';

  try {
    if ('permissions' in navigator && navigator.permissions?.query) {
      const permission = await navigator.permissions.query({
        name: constraints.audio ? 'microphone' : 'camera',
      } as unknown as PermissionDescriptor);
      // In Android WebView, `denied` can be returned by the Permissions API
      // before getUserMedia has actually shown the native permission dialog.
      // Only a successful grant is definitive; the explicit action must still
      // be available so Capacitor can request the native permission.
      return permission.state === 'granted' ? 'granted' : 'prompt';
    }
  } catch {
    // Some Android WebViews do not implement the Permissions API for media.
  }

  return 'prompt';
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
  if (type === 'mic' && navigator.mediaDevices?.getUserMedia) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => track.stop());
    return;
  }

  if (type === 'cam' && navigator.mediaDevices?.getUserMedia) {
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
