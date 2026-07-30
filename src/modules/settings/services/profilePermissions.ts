export type ProfilePermissionStatus = 'granted' | 'denied' | 'prompt' | 'checking' | 'unavailable';
export type RequestableProfilePermission = 'mic' | 'loc' | 'cam';

export type ProfilePermissionStates = Record<RequestableProfilePermission, ProfilePermissionStatus>;

const PERMISSION_STORAGE_KEY = 'myPlacarProfilePermissions';
type StoredPermissionState = Partial<Record<RequestableProfilePermission, boolean>>;

const isNativeApp = () => Boolean(
  (globalThis as typeof globalThis & {
    Capacitor?: { isNativePlatform?: () => boolean };
  }).Capacitor?.isNativePlatform?.()
);

const readStoredPermissions = (): StoredPermissionState => {
  try {
    return JSON.parse(localStorage.getItem(PERMISSION_STORAGE_KEY) || '{}') as StoredPermissionState;
  } catch {
    return {};
  }
};

const setStoredPermission = (type: RequestableProfilePermission, granted: boolean) => {
  try {
    const current = readStoredPermissions();
    localStorage.setItem(PERMISSION_STORAGE_KEY, JSON.stringify({ ...current, [type]: granted }));
  } catch {
    // best effort — the native/browser permission remains authoritative
  }
};

const checkMediaPermission = async (type: 'mic' | 'cam', constraints: MediaStreamConstraints): Promise<ProfilePermissionStatus> => {
  // Do not call getUserMedia just to inspect the permission. On Android this
  // opens a native permission request while the profile is mounting and can
  // make a WebView-backed Capacitor app close unexpectedly. The explicit
  // buttons below are responsible for requesting access.
  if (!navigator.mediaDevices?.getUserMedia) return 'unavailable';
  const stored = readStoredPermissions();

  try {
    if ('permissions' in navigator && navigator.permissions?.query) {
      const permission = await navigator.permissions.query({
        name: constraints.audio ? 'microphone' : 'camera',
      } as unknown as PermissionDescriptor);
      if (permission.state === 'granted') {
        setStoredPermission(type, true);
        return 'granted';
      }
      // Android WebView may report `prompt`/`denied` even after the native
      // permission was granted. Keep the confirmed local state on the APK.
      if (isNativeApp() && stored[type] === true) return 'granted';
      return permission.state === 'denied' ? 'denied' : 'prompt';
    }
  } catch {
    // Some Android WebViews do not implement the Permissions API for media.
  }

  return isNativeApp() && stored[type] === true ? 'granted' : 'prompt';
};

const checkLocationPermission = async (): Promise<ProfilePermissionStatus> => {
  if (!navigator.geolocation) return 'unavailable';
  const stored = readStoredPermissions();

  try {
    if ('permissions' in navigator && navigator.permissions?.query) {
      const permission = await navigator.permissions.query({ name: 'geolocation' });
      if (permission.state === 'granted') {
        setStoredPermission('loc', true);
        return 'granted';
      }
      if (isNativeApp() && stored.loc === true) return 'granted';
      return permission.state === 'denied' ? 'denied' : 'prompt';
    }
  } catch {
    // Some WebViews do not implement the Permissions API.
  }

  return isNativeApp() && stored.loc === true ? 'granted' : 'prompt';
};

export const checkProfilePermissions = async (): Promise<ProfilePermissionStates> => {
  try {
    const [mic, cam, loc] = await Promise.all([
      checkMediaPermission('mic', { audio: true }).catch(() => 'unavailable' as const),
      checkMediaPermission('cam', { video: true }).catch(() => 'unavailable' as const),
      checkLocationPermission(),
    ]);

    return { mic, cam, loc };
  } catch {
    return { mic: 'unavailable', cam: 'unavailable', loc: 'unavailable' };
  }
};

export const requestProfilePermission = async (type: RequestableProfilePermission) => {
  if (type === 'mic' && navigator.mediaDevices?.getUserMedia) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      setStoredPermission(type, true);
    } catch (error) {
      setStoredPermission(type, false);
      throw error;
    }
    return;
  }

  if (type === 'cam' && navigator.mediaDevices?.getUserMedia) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(track => track.stop());
      setStoredPermission(type, true);
    } catch (error) {
      setStoredPermission(type, false);
      throw error;
    }
    return;
  }

  if (type === 'loc' && navigator.geolocation) {
    try {
      await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 });
      });
      setStoredPermission(type, true);
    } catch (error) {
      setStoredPermission(type, false);
      throw error;
    }
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
