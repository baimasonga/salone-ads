import { useEffect, useState } from 'react';
import {
  fetchCountries,
  fetchCurrencies,
  fetchDistricts,
  fetchMyOpportunities,
  fetchOpportunityTypes,
  fetchSectors,
} from '../../lib/procurement/opportunityApi';
import type {
  CurrencyOption,
  OpportunityListItem,
  TaxonomyOption,
} from '../../lib/procurement/opportunityApi';
import { deleteSavedSearch, fetchSavedSearches, hasFeature } from '../../lib/procurementApi';
import type { SavedSearch } from '../../lib/procurementApi';
import { retainValidTaxonomySelection } from './model';

export function useTenderWorkspace({
  organizationId,
  enabled,
}: {
  organizationId: string;
  enabled: boolean;
}) {
  const [opportunities, setOpportunities] = useState<OpportunityListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [sectors, setSectors] = useState<TaxonomyOption[]>([]);
  const [countries, setCountries] = useState<TaxonomyOption[]>([]);
  const [districts, setDistricts] = useState<TaxonomyOption[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyOption[]>([]);
  const [opportunityTypes, setOpportunityTypes] = useState<TaxonomyOption[]>([]);
  const [countryId, setCountryId] = useState('');
  const [districtId, setDistrictId] = useState('');
  const [canPublish, setCanPublish] = useState(false);
  const [canViewDetails, setCanViewDetails] = useState(false);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    setLoading(true);
    setFeedback('');

    Promise.all([
      fetchMyOpportunities(organizationId),
      fetchSectors(),
      fetchCountries(),
      fetchCurrencies(),
      fetchOpportunityTypes(),
      hasFeature(organizationId, 'tender_publishing'),
      hasFeature(organizationId, 'tender_alerts_and_details'),
      fetchSavedSearches().catch(() => []),
    ])
      .then(([nextOpportunities, nextSectors, nextCountries, nextCurrencies, nextTypes, publishing, details, nextSavedSearches]) => {
        if (cancelled) return;
        setOpportunities(nextOpportunities);
        setSectors(nextSectors);
        setCountries(nextCountries);
        setCurrencies(nextCurrencies);
        setOpportunityTypes(nextTypes);
        setCanPublish(publishing);
        setCanViewDetails(details);
        setSavedSearches(nextSavedSearches);
        setCountryId((current) => current || nextCountries[0]?.id || '');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setFeedback(`Error: ${error instanceof Error ? error.message : 'Could not load tenders.'}`);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, organizationId]);

  useEffect(() => {
    if (!countryId) {
      setDistricts([]);
      setDistrictId('');
      return;
    }

    let cancelled = false;
    fetchDistricts(countryId)
      .then((nextDistricts) => {
        if (cancelled) return;
        setDistricts(nextDistricts);
        setDistrictId((current) => retainValidTaxonomySelection(current, nextDistricts));
      })
      .catch(() => {
        if (!cancelled) {
          setDistricts([]);
          setDistrictId('');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [countryId]);

  const removeSavedSearch = async (id: string) => {
    const previous = savedSearches;
    setSavedSearches((current) => current.filter((savedSearch) => savedSearch.id !== id));
    try {
      await deleteSavedSearch(id);
    } catch {
      setSavedSearches(previous);
      setFeedback('Error: The saved search could not be deleted.');
    }
  };

  return {
    opportunities,
    setOpportunities,
    loading,
    feedback,
    setFeedback,
    sectors,
    countries,
    districts,
    currencies,
    opportunityTypes,
    countryId,
    setCountryId,
    districtId,
    setDistrictId,
    canPublish,
    canViewDetails,
    savedSearches,
    removeSavedSearch,
  };
}
