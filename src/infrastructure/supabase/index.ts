// Barrel export — Supabase infrastructure
export { supabase } from './client';
export { mirrorMatches, deleteSupabaseMatch, deleteSupabaseMatches, deleteAllSupabaseMatches } from './matches';
export { mirrorUser, mirrorPartners, deletePartners, mirrorIcon, deleteIcon } from './mirror';
export type { SupabaseMirrorUserProfile, SupabaseMirrorPartner } from './mirror';
