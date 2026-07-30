export type AuthScreenMode =
  | 'signin'
  | 'signup'
  | 'onboarding'
  | 'forgot-password'
  | 'update-password';

export type AppView = 'landing' | AuthScreenMode | 'dashboard';

const PUBLIC_AUTH_VIEWS = new Set<AuthScreenMode>([
  'signin',
  'signup',
  'forgot-password',
  'update-password',
]);

export function getInitialView(search: string): AppView {
  const requestedView = new URLSearchParams(search).get('auth');
  return PUBLIC_AUTH_VIEWS.has(requestedView as AuthScreenMode)
    ? requestedView as AuthScreenMode
    : 'landing';
}

export function getAuthScreenMode(view: AppView): AuthScreenMode | null {
  if (view === 'landing' || view === 'dashboard') return null;
  return view;
}
