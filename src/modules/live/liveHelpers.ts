export const LIVE_OWNER_PIN_KEY = 'myPlacar_LiveOwnerPin';

export const persistLiveOwnerPin = (pin: string) => {
  try { localStorage.setItem(LIVE_OWNER_PIN_KEY, pin.toUpperCase()); } catch {}
};

export const clearLiveOwnerPin = () => {
  try { localStorage.removeItem(LIVE_OWNER_PIN_KEY); } catch {}
};

export const getPersistedLiveOwnerPin = (): string | null => {
  try { return localStorage.getItem(LIVE_OWNER_PIN_KEY); } catch { return null; }
};

export const assertOwnerPin = (targetPin: string | undefined, ownerPin: string | undefined, context: string): boolean => {
  if (!targetPin) {
    console.error(`[LiveGuard:${context}] targetPin indefinido — escrita abortada.`);
    return false;
  }
  const persisted = getPersistedLiveOwnerPin();
  if (ownerPin && targetPin !== ownerPin.toUpperCase() && persisted && targetPin !== persisted) {
    console.error(`[LiveGuard:${context}] targetPin "${targetPin}" diverge do ownerPin "${ownerPin}" e do persisted "${persisted}" — escrita abortada.`);
    return false;
  }
  return true;
};
