import { describe, expect, it } from 'vitest';
import { getAuthScreenMode, getInitialView } from './authRouting';

describe('authentication routing', () => {
  it('preserves the password recovery screen mode', () => {
    expect(getAuthScreenMode('update-password')).toBe('update-password');
  });

  it('preserves the forgot-password request screen mode', () => {
    expect(getAuthScreenMode('forgot-password')).toBe('forgot-password');
  });

  it('opens the password recovery screen from its callback URL', () => {
    expect(getInitialView('?auth=update-password')).toBe('update-password');
  });

  it('does not expose onboarding through a public query parameter', () => {
    expect(getInitialView('?auth=onboarding')).toBe('landing');
  });
});
