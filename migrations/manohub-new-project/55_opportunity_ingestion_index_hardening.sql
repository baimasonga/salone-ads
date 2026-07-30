-- Cover opportunity-ingestion foreign keys used by joins, review filters and deletes.
-- Kept separate from migration 54 because that migration is already deployed.

create index if not exists opportunity_sources_country_idx
  on public.opportunity_sources(country_id);

create index if not exists opportunity_sources_created_by_idx
  on public.opportunity_sources(created_by);

create index if not exists opportunity_ingestion_country_idx
  on public.opportunity_ingestion_items(country_id);

create index if not exists opportunity_ingestion_created_by_idx
  on public.opportunity_ingestion_items(created_by);

create index if not exists opportunity_ingestion_currency_idx
  on public.opportunity_ingestion_items(currency_code);

create index if not exists opportunity_ingestion_district_idx
  on public.opportunity_ingestion_items(district_id);

create index if not exists opportunity_ingestion_duplicate_idx
  on public.opportunity_ingestion_items(duplicate_opportunity_id);

create index if not exists opportunity_ingestion_type_idx
  on public.opportunity_ingestion_items(opportunity_type_id);

create index if not exists opportunity_ingestion_sector_idx
  on public.opportunity_ingestion_items(sector_id);
