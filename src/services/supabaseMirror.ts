/**
 * supabaseMirror.ts
 *
 * Espelho passivo: replica escritas do Firebase para o Supabase.
 * - Fire-and-forget: nunca bloqueia a UI, nunca lança exceção para o chamador.
 * - O Firebase continua sendo a fonte de verdade em todas as leituras.
 * - Erros são silenciosos (apenas console.warn em dev).
 *
 * Pontos de injeção (todos sem await):
 *   mirrorUser       → App.tsx:handleSaveProfile
 *                    → AuthScreen:cadastro (dois fluxos)
 *                    → AdminScreen:toggleUserPremium
 *   mirrorMatches    → App.tsx:syncHistoryToFirebase (após batch.commit)
 *   mirrorPartners   → PartnersScreen:uploadToCloud (após setDoc do metadata)
 *                    → App.tsx:setDoc da subcoleção users/{pin}/partners (juiz)
 *   deletePartners   → App.tsx:deletePartnersFromFirebase (junto com Firebase)
 *   mirrorIcon       → AdminScreen:handleSaveItem (após setDoc)
 *   deleteIcon       → AdminScreen:handleDeleteItem (após deleteDoc)
 */

import { supabase } from '../integrations/supabase/client.ts';
import type { UserProfile, MatchHistoryItem, Partner } from '../types.ts';

// ─── helpers ────────────────────────────────────────────────────────────────

const isDev = import.meta.env.DEV;

const warn = (fn: string, err: unknown) => {
  // Sempre loga em dev para facilitar diagnóstico do espelho Supabase
  if (isDev) console.warn(`[supabaseMirror] ${fn}:`, err);
  // Em produção, loga apenas se for erro crítico (não PostgrestError de conflito)
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

// ─── tipos internos de ícone ────────────────────────────────────────────────

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

// ─── mirrorUser ──────────────────────────────────────────────────────────────

/**
 * Espelha um UserProfile para a tabela `users`.
 * Chamado após qualquer escrita bem-sucedida em users no Firebase.
 */
export const mirrorUser = (profile: UserProfile): void => {
  if (!profile.email) return;

  const row = {
    email:                 profile.email.toLowerCase().trim(),
    name:                  profile.name                  || '',
    nickname:              profile.nickname               || '',
    phone:                 profile.phone                  || '',
    gender:                profile.gender                 || 'M',
    pin:                   profile.pin                    || '',
    auth_method:           profile.authMethod             || 'pin',
    is_profile_complete:   profile.isProfileComplete      ?? false,
    email_verified:        profile.emailVerified          ?? false,
    is_admin:              profile.isAdmin                === true,
    plan_type:             profile.planType               || 'free',
    premium_until:         profile.premiumUntil           || null,
    qr_code_data:          profile.qrCodeData             || null,
    passkey_credential_id: profile.passkeyCredentialId    || null,
    passkey_public_key:    profile.passkeyPublicKey        || null,
    referred_by_pin:       profile.referredByPin           || null,
    updated_at:            new Date().toISOString(),
  };

  supabase
    .from('users')
    .upsert(row, { onConflict: 'email' })
    .then(({ error }) => { if (error) warn('mirrorUser', error); });
};

// ─── mirrorMatches ───────────────────────────────────────────────────────────

/**
 * Espelha um array de MatchHistoryItem para a tabela `matches`.
 * Chamado após batch.commit() no syncHistoryToFirebase.
 * Recebe os mesmos itens já processados pelo sanitizeForFirestore.
 */
export const mirrorMatches = (
  matches: MatchHistoryItem[],
  ownerEmail: string,
  ownerPin: string,
): void => {
  if (!matches.length || !ownerEmail) return;

  const rows = matches.map(m => ({
    id:            m.id,
    owner_email:   ownerEmail.toLowerCase().trim(),
    owner_pin:     ownerPin   || '',
    date:          m.date     || '',
    time:          m.time     || '',
    sport_type:    m.sportType || '',
    p1_name:       m.p1Name   || '',
    p1_partner:    m.p1Partner || '',
    p2_name:       m.p2Name   || '',
    p2_partner:    m.p2Partner || '',
    p1_color:      m.p1Color  || '',
    p2_color:      m.p2Color  || '',
    p1_sets:       m.p1Sets   ?? [],
    p2_sets:       m.p2Sets   ?? [],
    score_summary: m.scoreSummary || '',
    winner:        m.winner   || '',
    winner_team:   m.winnerTeam ?? 1,
    duration:      m.duration ?? 0,
    stats:         m.stats    ?? {},
    point_history: m.pointHistory ?? [],
    location:      m.location ?? null,
    involved_pins: m.involvedPins ?? [],
    is_synced:     true,
    synced_at:     new Date().toISOString(),
  }));

  supabase
    .from('matches')
    .upsert(rows, { onConflict: 'id' })
    .then(({ error }) => { if (error) warn('mirrorMatches', error); });
};

// ─── mirrorPartners ───────────────────────────────────────────────────────────

/**
 * Espelha a lista completa de parceiros de um usuário.
 * Chamado após uploadToCloud no PartnersScreen e após adicionar juiz no App.tsx.
 *
 * Estratégia: upsert do array inteiro (insert or update por PK composta).
 * Não remove linhas órfãs — para remoção use deletePartners().
 */
export const mirrorPartners = (
  ownerEmail: string,
  partners: Partner[],
): void => {
  if (!ownerEmail || !partners.length) return;

  const rows = partners.map(p => ({
    owner_email:  ownerEmail.toLowerCase().trim(),
    partner_pin:  p.pin.toUpperCase().trim(),
    partner_name: p.name     || '',
    nickname:     p.nickname || '',
    origin:       p.origin   || 'manual',
    added_at:     p.addedAt  ?? 0,
    gender:       p.gender   || 'M',
  }));

  supabase
    .from('user_partners')
    .upsert(rows, { onConflict: 'owner_email,partner_pin' })
    .then(({ error }) => { if (error) warn('mirrorPartners', error); });
};

// ─── deletePartners ───────────────────────────────────────────────────────────

/**
 * Remove parceiros deletados da tabela `user_partners`.
 * Chamado junto com deletePartnersFromFirebase no App.tsx,
 * passando os mesmos pins que foram removidos.
 */
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

// ─── mirrorIcon ───────────────────────────────────────────────────────────────

/**
 * Espelha um ícone (sport ou category) para a tabela correspondente.
 * Chamado após setDoc bem-sucedido no handleSaveItem do AdminScreen.
 */
export const mirrorIcon = (
  type: 'sport' | 'category',
  item: SportIconItem | CategoryIconItem,
): void => {
  if (!item.id) return;

  if (type === 'sport') {
    const sport = item as SportIconItem;
    const row = {
      id:          sport.id,
      name:        sport.name      || '',
      url:         sport.url       || '',
      category_id: sport.group     || 'outros',
      engine:      sport.engine    || 'rally',
      is_active:   sport.isActive  ?? true,
      updated_at:  sport.updatedAt || new Date().toISOString(),
    };
    supabase
      .from('sport_icons')
      .upsert(row, { onConflict: 'id' })
      .then(({ error }) => { if (error) warn('mirrorIcon/sport', error); });
    return;
  }

  const cat = item as CategoryIconItem;
  const row = {
    id:         cat.id,
    name:       cat.name      || '',
    url:        cat.url       || '',
    is_active:  cat.isActive  ?? true,
    updated_at: cat.updatedAt || new Date().toISOString(),
  };
  supabase
    .from('category_icons')
    .upsert(row, { onConflict: 'id' })
    .then(({ error }) => { if (error) warn('mirrorIcon/category', error); });
};

// ─── deleteIcon ───────────────────────────────────────────────────────────────

/**
 * Remove um ícone da tabela correspondente no Supabase.
 * Chamado após deleteDoc bem-sucedido no handleDeleteItem do AdminScreen.
 */
export const deleteIcon = (type: 'sport' | 'category', id: string): void => {
  if (!id) return;

  const table = type === 'sport' ? 'sport_icons' : 'category_icons';

  supabase
    .from(table)
    .delete()
    .eq('id', id)
    .then(({ error }) => { if (error) warn('deleteIcon', error); });
};
