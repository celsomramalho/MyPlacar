export type PlanType = 'free' | 'premium';

export interface UserProfile {
  name: string;
  nickname: string;
  email: string;
  phone: string;
  pin: string;
  gender?: 'M' | 'F';
  isProfileComplete: boolean;
  emailVerified?: boolean;
  authMethod?: 'pin' | 'password';
  qrCodeData?: string;
  isAdmin?: boolean;
  planType?: PlanType;
  premiumUntil?: string;
  passkeyCredentialId?: string;
  passkeyPublicKey?: string;
  referredByPin?: string;
}
