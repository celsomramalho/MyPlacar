export interface PasswordValidation {
  hasMinLength: boolean;
  hasUpper: boolean;
  hasLower: boolean;
  hasSpecial: boolean;
  isValid: boolean;
}

export const validatePassword = (password: string): PasswordValidation => {
  const hasMinLength = password.length >= 6;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);

  return {
    hasMinLength,
    hasUpper,
    hasLower,
    hasSpecial,
    isValid: hasMinLength && hasUpper && hasLower && hasSpecial,
  };
};
