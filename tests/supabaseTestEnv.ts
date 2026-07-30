/**
 * Target project for the browser gates.
 *
 * Every one of these gates is strictly read-only — they navigate public pages,
 * assert visibility, abort network calls, run axe scans, and probe that
 * privileged endpoints deny access. None of them sign in or write data, so
 * running them against the live project behaves as synthetic monitoring.
 *
 * They still default to the live project so the release gate never silently
 * degrades, but the target is overridable: set CI_SUPABASE_URL and
 * CI_SUPABASE_ANON_KEY (or the STAGING_* equivalents) as repository variables
 * to point the gates at a dedicated project and decouple CI from production
 * availability. Nothing needs to change here to do that.
 */
const DEFAULT_SUPABASE_URL = 'https://rffjehmbrycztiekcyho.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_HiizVcWA4JQxSoCxO3N6kQ_Ov4hGGmk';

export function resolveSupabaseTestEnv(): { url: string; anonKey: string } {
  return {
    url: process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL,
    anonKey: process.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY,
  };
}
