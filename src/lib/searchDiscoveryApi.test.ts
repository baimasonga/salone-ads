import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock('./supabaseClient', () => ({ supabase: { rpc: mocks.rpc, from: mocks.from, auth: { getUser: async () => ({ data: { user: { id: 'user' } } }) } } }));
import { DISCOVERY_RESULT_TYPES, fetchDiscoverySavedSearches, fetchDiscoverySuggestions, searchDiscovery } from './searchDiscoveryApi';
beforeEach(() => { vi.clearAllMocks(); window.localStorage.clear(); });
describe('discovery after feature retirement', () => {
  it('sends only supported types when searching everything and filters obsolete responses', async () => {
    mocks.rpc.mockResolvedValue({ data: [{ result_type: 'influencer', result_id: 'old' }, { result_type: 'business', result_id: 'business', title: 'Shop' }], error: null });
    const results = await searchDiscovery({});
    expect(mocks.rpc).toHaveBeenCalledWith('search_discovery', expect.objectContaining({ p_result_types: DISCOVERY_RESULT_TYPES }));
    expect(results.map(row => row.id)).toEqual(['business']);
  });
  it('preserves explicit business filtering', async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    await searchDiscovery({ resultTypes: ['business'] });
    expect(mocks.rpc).toHaveBeenCalledWith('search_discovery', expect.objectContaining({ p_result_types: ['business'] }));
  });
  it('does not show retired autocomplete suggestions', async () => {
    mocks.rpc.mockResolvedValue({ data: [{ term: 'Old creator', result_type: 'influencer' }, { term: 'Shop', result_type: 'business' }], error: null });
    expect(await fetchDiscoverySuggestions('sh')).toEqual([{ term: 'Shop', resultType: 'business' }]);
  });
  it('reads old saved searches without rewriting or deleting their database records', async () => {
    const builder: any = { select: () => builder, eq: () => builder, order: async () => ({ data: [{ id: 'saved', filters: { resultTypes: ['influencer', 'business'], district: 'Bo' } }], error: null }) };
    mocks.from.mockReturnValue(builder);
    expect((await fetchDiscoverySavedSearches())[0].filters).toEqual({ resultTypes: ['business'], district: 'Bo' });
    expect(mocks.from).toHaveBeenCalledWith('saved_searches');
  });
});
