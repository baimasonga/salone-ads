import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authCallback: undefined as undefined | ((event: string, session: unknown) => void),
  bundle: vi.fn(), organizations: vi.fn(), staff: vi.fn(), catalog: vi.fn(),
}));
vi.mock('./lib/supabaseClient', () => ({ supabase: { auth: {
  onAuthStateChange: (callback: typeof mocks.authCallback) => { mocks.authCallback = callback; return { data: { subscription: { unsubscribe: vi.fn() } } }; },
  mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { nextLevel: 'aal1', currentLevel: 'aal1' }, error: null }) },
}, } }));
vi.mock('./lib/api', () => ({ fetchMyOrganizations: mocks.organizations, fetchOrgBundle: mocks.bundle,
  fetchDirectoryProfiles: mocks.catalog, fetchInfluencerProfiles: mocks.catalog, fetchMyPlatformRole: async () => null,
  getStoredActiveOrganizationId: () => null, storeActiveOrganizationId: vi.fn(),
}));
vi.mock('./lib/platformStaffApi', () => ({ fetchMyPlatformStaffAccess: mocks.staff }));
vi.mock('./lib/accountSecurityApi', () => ({ observeAccountSession: async () => {} }));
vi.mock('./lib/procurement/entitlementAssistApi', () => ({ hasFeature: async () => false }));
vi.mock('./lib/procurement/subscriptionRequestApi', () => ({ fetchMySubscriptions: async () => [] }));
vi.mock('./lib/cmsApi', () => ({ fetchCmsCurrentRole: async () => null }));
vi.mock('./lib/procurement/notificationApi', () => ({ fetchMyNotifications: async () => [], markNotificationRead: vi.fn() }));
vi.mock('./components/LandingPage', () => ({ LandingPage: () => <div>Public landing</div> }));
vi.mock('./components/Workspaces', () => ({ Workspaces: ({ activeOrg }: { activeOrg: { name: string } }) => <div>Workspace: {activeOrg.name}</div> }));
vi.mock('./components/AuthScreens', () => ({ AuthScreens: ({ mode }: { mode: string }) => <div>Auth: {mode}</div> }));
import App from './App';

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const org = (name: string) => ({ id: name, name, type: 'Business', status: 'active', subscriberType: 'free' });
const bundle = (name: string) => ({ organization: org(name), brandKit: { brandName: name }, campaigns: [], contentItems: [], leads: [], socialConnections: [] });
const signIn = (id: string) => mocks.authCallback!('SIGNED_IN', { user: { id } });
beforeEach(() => { vi.clearAllMocks(); mocks.catalog.mockRejectedValue(new Error('Retired catalog is unavailable')); mocks.staff.mockResolvedValue(null); window.history.replaceState({}, '', '/?auth=signin'); });
describe('workspace hydration races', () => {
  it('does not restore a dashboard when an older load completes after sign-out', async () => {
    const pending = deferred<ReturnType<typeof bundle>>();
    mocks.organizations.mockResolvedValue([org('Old')]); mocks.bundle.mockReturnValue(pending.promise);
    render(<MemoryRouter><App /></MemoryRouter>);
    act(() => signIn('old-user'));
    await waitFor(() => expect(mocks.bundle).toHaveBeenCalledTimes(1));
    act(() => mocks.authCallback!('SIGNED_OUT', null));
    await screen.findByText('Public landing');
    await act(async () => { pending.resolve(bundle('Old')); await pending.promise; });
    expect(screen.queryByText('Workspace: Old')).not.toBeInTheDocument();
    expect(screen.getByText('Public landing')).toBeInTheDocument();
  });
  it('keeps the newer account when an older request finishes last', async () => {
    const pending = deferred<ReturnType<typeof bundle>>();
    mocks.organizations.mockResolvedValueOnce([org('Old')]).mockResolvedValueOnce([org('New')]);
    mocks.bundle.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(bundle('New'));
    render(<MemoryRouter><App /></MemoryRouter>);
    act(() => signIn('old-user'));
    await waitFor(() => expect(mocks.bundle).toHaveBeenCalledTimes(1));
    act(() => signIn('new-user'));
    await screen.findByText('Workspace: New');
    await act(async () => { pending.resolve(bundle('Old')); await pending.promise; });
    expect(screen.getByText('Workspace: New')).toBeInTheDocument();
    expect(mocks.catalog).not.toHaveBeenCalled();
    expect(screen.queryByText('Workspace: Old')).not.toBeInTheDocument();
  });
});
