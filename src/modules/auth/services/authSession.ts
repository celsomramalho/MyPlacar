import type { UserProfile } from '../types';

const SAVED_EMAIL_KEY = 'MyPlacarSavedEmail';
const SAVED_PIN_KEY = 'MyPlacarSavedPin';
const LEGACY_USER_KEY = 'MyPlacarUser';
const REMEMBER_ME_KEY = 'MyPlacarRememberMe';
const USER_PROFILE_KEY = 'MyPlacarUserProfile';
const LOWER_USER_PROFILE_KEY = 'myPlacarUserProfile';
const PENDING_VERIFY_CODE_KEY = 'MyPlacarPendingVerifyCode';
const PENDING_NAME_KEY = 'MyPlacarPendingName';
const PENDING_PASSWORD_KEY = 'MyPlacarPendingPassword';
const PENDING_REFERRAL_KEY = 'MyPlacarPendingReferral';
const PENDING_REFERRAL_PIN_KEY = 'MyPlacarPendingReferralPin';

const parseProfile = (value: string | null): UserProfile | null => {
  if (!value) return null;

  try {
    return JSON.parse(value) as UserProfile;
  } catch {
    return null;
  }
};

export const getSavedEmail = () => localStorage.getItem(SAVED_EMAIL_KEY) || '';

export const getSavedPin = () => localStorage.getItem(SAVED_PIN_KEY) || '';

export const getSavedAuthMethod = (): 'pin' | 'password' => {
  const profile = parseProfile(localStorage.getItem(USER_PROFILE_KEY));
  if (profile?.authMethod === 'pin' || profile?.authMethod === 'password') {
    return profile.authMethod;
  }

  return 'password';
};

export const getOfflineProfile = (): UserProfile | null => {
  return parseProfile(localStorage.getItem(USER_PROFILE_KEY));
};

export const getPendingVerifyCode = () => localStorage.getItem(PENDING_VERIFY_CODE_KEY) || '';

export const getPendingName = () => localStorage.getItem(PENDING_NAME_KEY) || '';

export const getPendingPassword = () => localStorage.getItem(PENDING_PASSWORD_KEY) || '';

export const saveUrlVerificationCode = (code: string) => {
  localStorage.setItem(PENDING_VERIFY_CODE_KEY, code);
};

export const clearPasswordResetSession = () => {
  localStorage.removeItem(SAVED_EMAIL_KEY);
  localStorage.removeItem(SAVED_PIN_KEY);
  localStorage.removeItem(LEGACY_USER_KEY);
  localStorage.removeItem(REMEMBER_ME_KEY);
};

export const savePendingRegistration = (data: {
  code: string;
  name: string;
  email: string;
  password: string;
}) => {
  localStorage.setItem(PENDING_VERIFY_CODE_KEY, data.code);
  localStorage.setItem(PENDING_NAME_KEY, data.name);
  localStorage.setItem(SAVED_EMAIL_KEY, data.email);
  localStorage.setItem(PENDING_PASSWORD_KEY, data.password);
};

export const clearPendingRegistration = () => {
  localStorage.removeItem(PENDING_PASSWORD_KEY);
  localStorage.removeItem(PENDING_REFERRAL_KEY);
  localStorage.removeItem(PENDING_REFERRAL_PIN_KEY);
  localStorage.removeItem(PENDING_VERIFY_CODE_KEY);
  localStorage.removeItem(PENDING_NAME_KEY);
};

export const rememberEmail = (email: string) => {
  localStorage.setItem(SAVED_EMAIL_KEY, email);
};

export const forgetEmail = () => {
  localStorage.removeItem(SAVED_EMAIL_KEY);
};

export const rememberPin = (pin: string) => {
  localStorage.setItem(SAVED_PIN_KEY, pin);
};

export const forgetPin = () => {
  localStorage.removeItem(SAVED_PIN_KEY);
};

export const saveWatchLoginCache = (data: {
  email: string;
  pin: string;
  rememberMe?: boolean;
  profile?: unknown;
}) => {
  localStorage.setItem(SAVED_EMAIL_KEY, data.email);
  localStorage.setItem(SAVED_PIN_KEY, data.pin);

  if (data.rememberMe) {
    localStorage.setItem(LOWER_USER_PROFILE_KEY, JSON.stringify(data.profile));
  }
};
