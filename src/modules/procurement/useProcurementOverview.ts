import { useEffect, useState } from 'react';
import {
  fetchMyOpportunities,
} from '../../lib/procurement/opportunityApi';
import type { OpportunityListItem } from '../../lib/procurement/opportunityApi';
import { hasFeature } from '../../lib/procurement/entitlementAssistApi';
import {
  fetchPipeline,
  fetchRecommendedOpportunities,
} from '../../lib/procurement/bidPipelineApi';
import { fetchSavedSearches } from '../../lib/procurement/savedSearchApi';
import type { SavedSearch } from '../../lib/procurement/savedSearchApi';
import { resolveProcurementTier } from './model';
import type { ProcurementTier } from './model';

export interface ProcurementOverviewData {
  tier: ProcurementTier;
  pipelineCount: number;
  savedSearchCount: number;
  savedSearches: SavedSearch[];
  recommended: OpportunityListItem[];
  publishedTenderCount: number;
  loading: boolean;
  degraded: boolean;
}

const INITIAL_DATA: ProcurementOverviewData = {
  tier: null,
  pipelineCount: 0,
  savedSearchCount: 0,
  savedSearches: [],
  recommended: [],
  publishedTenderCount: 0,
  loading: false,
  degraded: false,
};

async function safely<T>(request: Promise<T>, fallback: T): Promise<{ value: T; failed: boolean }> {
  try {
    return { value: await request, failed: false };
  } catch {
    return { value: fallback, failed: true };
  }
}

export function useProcurementOverview({
  organizationId,
  enabled,
}: {
  organizationId: string;
  enabled: boolean;
}): ProcurementOverviewData {
  const [data, setData] = useState<ProcurementOverviewData>(INITIAL_DATA);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    setData({ ...INITIAL_DATA, loading: true });

    Promise.all([
      safely(hasFeature(organizationId, 'tender_publishing'), false),
      safely(hasFeature(organizationId, 'tender_alerts_and_details'), false),
      safely(fetchPipeline(organizationId), []),
      safely(fetchSavedSearches(), []),
      safely(fetchRecommendedOpportunities(organizationId), []),
      safely(fetchMyOpportunities(organizationId), []),
    ]).then(([publishing, details, pipeline, savedSearches, recommended, published]) => {
      if (cancelled) return;
      setData({
        tier: resolveProcurementTier(publishing.value, details.value),
        pipelineCount: pipeline.value.length,
        savedSearchCount: savedSearches.value.length,
        savedSearches: savedSearches.value.slice(0, 5),
        recommended: recommended.value.slice(0, 4),
        publishedTenderCount: published.value.length,
        loading: false,
        degraded: [publishing, details, pipeline, savedSearches, recommended, published].some((result) => result.failed),
      });
    });

    return () => {
      cancelled = true;
    };
  }, [enabled, organizationId]);

  return data;
}
