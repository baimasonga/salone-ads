interface ReleaseConfiguration {
  MANOHUB_ENVIRONMENT?: string;
  RELEASE_VERSION?: string;
  CONTAINER_REVISION?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
}

// Preserve the build suffix: the final deployment must start a fresh instance
// after its secret bindings are configured, even for the same source commit.
export const releaseContainerId = (env: ReleaseConfiguration) =>
  `${env.MANOHUB_ENVIRONMENT || 'production'}-${(env.CONTAINER_REVISION || env.RELEASE_VERSION || 'development').slice(0, 64)}`;

export function validateStagingConfiguration(env: ReleaseConfiguration): void {
  if (env.MANOHUB_ENVIRONMENT !== 'staging') return;
  let project: URL;
  try { project = new URL(env.VITE_SUPABASE_URL || ''); }
  catch { throw new Error('Staging requires a dedicated Supabase project URL.'); }
  if (project.protocol !== 'https:' || project.hostname === 'rffjehmbrycztiekcyho.supabase.co' || !env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY === 'STAGING_SUPABASE_ANON_KEY') {
    throw new Error('Staging requires isolated Supabase configuration.');
  }
}
