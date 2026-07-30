/**
 * Browser gates drive real user journeys, so they must never be pointed at the
 * production project by default. Both Playwright configs resolve their target
 * through here and fail loudly when it is unset.
 */
export function requireSupabaseTestEnv(): { url: string; anonKey: string } {
  const url = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must point at a CI or staging '
      + 'Supabase project before running the browser gates. In CI these come from the '
      + 'CI_SUPABASE_URL / CI_SUPABASE_ANON_KEY repository variables; locally, export '
      + 'them or put them in .env. They are intentionally not defaulted to production.',
    );
  }

  return { url, anonKey };
}
