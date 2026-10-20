const WATCH_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const generateEmailVerificationCode = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export const generateUserPin = (): string => {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
};

export const generateWatchCode = (): string => {
  const random = new Uint32Array(6);
  globalThis.crypto.getRandomValues(random);
  return Array.from(random, (value) => WATCH_CODE_CHARS[value % WATCH_CODE_CHARS.length]).join('');
};
