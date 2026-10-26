import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ plans: vi.fn(), subscriptions: vi.fn() }));
vi.mock('../lib/supabaseClient', () => {
  const query = () => {
    const builder: any = new Proxy({}, { get: (_target, key) => key === 'then'
      ? (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve)
      : () => builder });
    return builder;
  };
  return { supabase: { from: query, rpc: async () => ({ data: [], error: null }), auth: {
    getUser: async () => ({ data: { user: { id: 'user' } } }), getSession: async () => ({ data: { session: null } }),
  } } };
});
vi.mock('../lib/procurement/subscriptionRequestApi', async importOriginal => ({
  ...await importOriginal<typeof import('../lib/procurement/subscriptionRequestApi')>(),
  fetchPlans: mocks.plans, fetchMySubscriptions: mocks.subscriptions,
}));
vi.mock('../modules/finance/FinancialDocumentsPanel', () => ({ FinancialDocumentsPanel: () => <div>Financial documents</div> }));
vi.mock('../modules/service-requests/AdminServiceRequestsWorkspace', () => ({ AdminServiceRequestsWorkspace: () => <div>Support cases inbox</div> }));
vi.mock('./CampaignBuilderPage', () => ({ CampaignBuilderPage: () => <div>Campaign management</div> }));
import { Workspaces } from './Workspaces';
const props = {
  activeTab: 'billing', setActiveTab: vi.fn(),
  activeOrg: { id: 'org', name: 'Business', type: 'Business', subscriberType: 'viewer', status: 'active' },
  setActiveOrg: vi.fn(), subscriberAccess: null, currentUserId: 'user',
  isPlatformAdmin: false, isPlatformResearcher: false, platformStaffRole: null,
  campaigns: [], contentItems: [], setContentItems: vi.fn(), leads: [], setLeads: vi.fn(),
  socialConnections: [], setSocialConnections: vi.fn(), brandKit: { brandName: 'Business', toneOfVoice: 'Professional' }, setBrandKit: vi.fn(),
} as unknown as React.ComponentProps<typeof Workspaces>;
beforeEach(() => { vi.clearAllMocks(); mocks.plans.mockResolvedValue([]); mocks.subscriptions.mockResolvedValue([]); });
describe('single ownership of delegated workspaces', () => {
  it('loads billing plans and subscriptions once, through the active billing page', async () => {
    render(<MemoryRouter><Workspaces {...props} /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Subscription & Payment' });
    await waitFor(() => expect(mocks.plans).toHaveBeenCalledTimes(1));
    expect(mocks.subscriptions).toHaveBeenCalledTimes(1);
    expect(mocks.subscriptions).toHaveBeenCalledWith('org');
    expect(screen.getByText('Financial documents')).toBeInTheDocument();
  });
  it.each(['campaigns', 'campaign-builder'])('preserves %s as a route to the active campaign builder', async activeTab => {
    render(<MemoryRouter><Workspaces {...props} activeTab={activeTab} /></MemoryRouter>);
    expect(await screen.findAllByText('Campaign management')).toHaveLength(1);
    expect(mocks.plans).not.toHaveBeenCalled();
  });
  it('preserves support-staff access while denying the case inbox to ordinary subscribers', async () => {
    const { rerender } = render(<MemoryRouter><Workspaces {...props} activeTab="admin-services" /></MemoryRouter>);
    expect(screen.getByText('You do not have platform admin access.')).toBeInTheDocument();
    expect(screen.queryByText('Support cases inbox')).not.toBeInTheDocument();
    rerender(<MemoryRouter><Workspaces {...props} activeTab="admin-services" platformStaffRole="support" /></MemoryRouter>);
    expect(await screen.findByText('Support cases inbox')).toBeInTheDocument();
  });
});
