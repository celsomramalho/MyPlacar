const WATCH_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const generateEmailVerificationCode = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export const generateUserPin = (): string => {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
};

export const generateWatchCode = (): string => {
  return Array.from(
    { length: 4 },
    () => WATCH_CODE_CHARS[Math.floor(Math.random() * WATCH_CODE_CHARS.length)],
  ).join('');
};
