import { supabase } from './client';

const isDev = import.meta.env.DEV;

const warn = (fn: string, err: unknown) => {
  if (isDev) console.warn(`[supabaseMirror] ${fn}:`, err);
  else {
    const msg = err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : (typeof err === 'object' && err !== null)
          ? JSON.stringify(err)
          : String(err);
    const normalizedMsg = msg || '';
    if (!normalizedMsg.includes('duplicate') && !normalizedMsg.includes('conflict')) {
      console.warn(`[supabaseMirror] ${fn}:`, normalizedMsg);
    }
  }
};

export interface SupabaseMirrorUserProfile {
  email?: string;
  name?: string;
  nickname?: string;
  phone?: string;
  gender?: string;
  pin?: string;
  authMethod?: string;
  isProfileComplete?: boolean;
  emailVerified?: boolean;
  isAdmin?: boolean;
  planType?: string;
  premiumUntil?: string | null;
  qrCodeData?: string | null;
  passkeyCredentialId?: string | null;
  passkeyPublicKey?: string | null;
  referredByPin?: string | null;
}

export interface SupabaseMirrorPartner {
  pin: string;
  name?: string;
  nickname?: string;
  origin?: string;
  addedAt?: number;
  gender?: string;
}

interface SportIconItem {
  id: string;
  name: string;
  url: string;
  group?: string;
  engine?: string;
  isActive?: boolean;
  updatedAt?: string;
}

interface CategoryIconItem {
  id: string;
  name: string;
  url: string;
  isActive?: boolean;
  updatedAt?: string;
}

export const mirrorUser = (profile: SupabaseMirrorUserProfile): void => {
  if (!profile.email) return;

  const row = {
    email: profile.email.toLowerCase().trim(),
    name: profile.name || '',
    nickname: profile.nickname || '',
    phone: profile.phone || '',
    gender: profile.gender || 'M',
    pin: profile.pin || '',
    auth_method: profile.authMethod || 'pin',
    is_profile_complete: profile.isProfileComplete ?? false,
    email_verified: profile.emailVerified ?? false,
    is_admin: profile.isAdmin === true,
    plan_type: profile.planType || 'free',
    premium_until: profile.premiumUntil || null,
    qr_code_data: profile.qrCodeData || null,
    passkey_credential_id: profile.passkeyCredentialId || null,
    passkey_public_key: profile.passkeyPublicKey || null,
    referred_by_pin: profile.referredByPin || null,
    updated_at: new Date().toISOString(),
  };

  supabase
    .from('users')
    .upsert(row, { onConflict: 'email' })
    .then(({ error }) => { if (error) warn('mirrorUser', error); });
};

export const mirrorPartners = (
  ownerEmail: string,
  partners: SupabaseMirrorPartner[],
): void => {
  if (!ownerEmail || !partners.length) return;

  const rows = partners.map(p => ({
    owner_email: ownerEmail.toLowerCase().trim(),
    partner_pin: p.pin.toUpperCase().trim(),
    partner_name: p.name || '',
    nickname: p.nickname || '',
    origin: p.origin || 'manual',
    added_at: p.addedAt ?? 0,
    gender: p.gender || 'M',
  }));

  supabase
    .from('user_partners')
    .upsert(rows, { onConflict: 'owner_email,partner_pin' })
    .then(({ error }) => { if (error) warn('mirrorPartners', error); });
};

export const deletePartners = (
  ownerEmail: string,
  deletedPins: string[],
): void => {
  if (!ownerEmail || !deletedPins.length) return;

  supabase
    .from('user_partners')
    .delete()
    .eq('owner_email', ownerEmail.toLowerCase().trim())
    .in('partner_pin', deletedPins.map(p => p.toUpperCase().trim()))
    .then(({ error }) => { if (error) warn('deletePartners', error); });
};

export const mirrorIcon = (
  type: 'sport' | 'category',
  item: SportIconItem | CategoryIconItem,
): void => {
  if (!item.id) return;

  if (type === 'sport') {
    const sport = item as SportIconItem;
    const row = {
      id: sport.id,
      name: sport.name || '',
      url: sport.url || '',
      category_id: sport.group || 'outros',
      engine: sport.engine || 'rally',
      is_active: sport.isActive ?? true,
      updated_at: sport.updatedAt || new Date().toISOString(),
    };
    supabase
      .from('sport_icons')
      .upsert(row, { onConflict: 'id' })
      .then(({ error }) => { if (error) warn('mirrorIcon/sport', error); });
    return;
  }

  const cat = item as CategoryIconItem;
  const row = {
    id: cat.id,
    name: cat.name || '',
    url: cat.url || '',
    is_active: cat.isActive ?? true,
    updated_at: cat.updatedAt || new Date().toISOString(),
  };
  supabase
    .from('category_icons')
    .upsert(row, { onConflict: 'id' })
    .then(({ error }) => { if (error) warn('mirrorIcon/category', error); });
};

export const deleteIcon = (type: 'sport' | 'category', id: string): void => {
  if (!id) return;

  const table = type === 'sport' ? 'sport_icons' : 'category_icons';

  supabase
    .from(table)
    .delete()
    .eq('id', id)
    .then(({ error }) => { if (error) warn('deleteIcon', error); });
};
