-- ============================================================================
-- Manohub — full setup for a NEW Supabase project (project ref rffjehmbrycztiekcyho)
-- Generated from the live SaloneReach schema. Run these files IN ORDER in the
-- new project's Dashboard → SQL Editor (they run as the project owner, no egress
-- restrictions). Order: 01_tables → 02_constraints → 03_indexes → 04_functions
-- → 05_triggers → 06_rls → 07_storage → 08_data.
-- Safe to re-run (IF NOT EXISTS / OR REPLACE used throughout).
-- ============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ---------------------------------------------------------------------------
-- TABLES (public schema)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ad_campaigns (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  business_name text NOT NULL DEFAULT ''::text,
  start_date date,
  end_date date,
  reach_goal integer,
  status text NOT NULL DEFAULT 'active'::text,
  org_id uuid,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.advert_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  advert_id uuid NOT NULL,
  kind text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.advertisement_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  requested_by uuid,
  category text NOT NULL DEFAULT 'business'::text,
  subject text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'submitted'::text,
  platform text,
  reach_count integer,
  run_count integer,
  start_date date,
  end_date date,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  media_url text
);
CREATE TABLE IF NOT EXISTS public.adverts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'business'::text,
  business_name text NOT NULL,
  summary text,
  content text NOT NULL DEFAULT ''::text,
  media_url text,
  social_platform text,
  social_url text,
  status text NOT NULL DEFAULT 'draft'::text,
  org_id uuid,
  request_id uuid,
  created_by uuid,
  published_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  creative_url text,
  accent_color text,
  logo_url text,
  theme text NOT NULL DEFAULT 'dark'::text,
  format text NOT NULL DEFAULT 'square'::text,
  with_photo boolean NOT NULL DEFAULT true,
  view_count integer NOT NULL DEFAULT 0,
  click_count integer NOT NULL DEFAULT 0,
  og_image_url text,
  campaign_id uuid,
  starts_at timestamp with time zone,
  ends_at timestamp with time zone
);
CREATE TABLE IF NOT EXISTS public.audience_segments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  name text NOT NULL,
  districts text[] NOT NULL DEFAULT '{}'::text[],
  diaspora_markets text[] NOT NULL DEFAULT '{}'::text[],
  interests text[] NOT NULL DEFAULT '{}'::text[],
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  actor_id uuid,
  org_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.brand_kits (
  org_id uuid NOT NULL,
  brand_name text NOT NULL DEFAULT ''::text,
  legal_name text NOT NULL DEFAULT ''::text,
  mission text NOT NULL DEFAULT ''::text,
  tagline text NOT NULL DEFAULT ''::text,
  primary_color text NOT NULL DEFAULT '#059669'::text,
  secondary_color text NOT NULL DEFAULT '#D97706'::text,
  fonts text NOT NULL DEFAULT 'Inter, Outfit'::text,
  tone_of_voice text NOT NULL DEFAULT 'Warm, Honest, Proudly Leonean'::text,
  prohibited_terminology text[] NOT NULL DEFAULT '{}'::text[],
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.buyer_profiles (
  org_id uuid NOT NULL,
  description text,
  logo_url text,
  website text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.campaigns (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT ''::text,
  objective text NOT NULL DEFAULT ''::text,
  status text NOT NULL DEFAULT 'Planning'::text,
  total_budget numeric NOT NULL DEFAULT 0,
  start_date date,
  end_date date,
  channels text[] NOT NULL DEFAULT '{}'::text[],
  district text,
  diaspora_market text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  sector_id uuid,
  name text NOT NULL,
  slug text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.content_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  title text NOT NULL,
  content_type text NOT NULL,
  platform text,
  headline text,
  body_text text,
  hashtags text[] NOT NULL DEFAULT '{}'::text[],
  scheduled_date date,
  status text NOT NULL DEFAULT 'Draft'::text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  campaign_id uuid
);
CREATE TABLE IF NOT EXISTS public.countries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  currency_code text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.currencies (
  code text NOT NULL,
  name text NOT NULL,
  symbol text,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS public.directory_profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  business_name text NOT NULL,
  category text,
  description text,
  district text,
  city text,
  whatsapp text,
  email text,
  is_verified boolean NOT NULL DEFAULT false,
  diaspora_support boolean NOT NULL DEFAULT false,
  claimed_by_org_id uuid,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.districts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  country_id uuid NOT NULL,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.followed_buyers (
  user_id uuid NOT NULL,
  buyer_org_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.followed_sectors (
  user_id uuid NOT NULL,
  sector_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.funding_agencies (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  website text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.influencer_profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  location text,
  district text,
  categories text[] NOT NULL DEFAULT '{}'::text[],
  platforms text[] NOT NULL DEFAULT '{}'::text[],
  audience_size text,
  engagement_rate text,
  rate_range text,
  is_verified boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.leads (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  name text NOT NULL,
  email text,
  telephone text,
  whatsapp text,
  district text,
  source text,
  status text NOT NULL DEFAULT 'New'::text,
  estimated_value numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.media_assets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  folder text NOT NULL DEFAULT 'General'::text,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  file_size integer,
  mime_type text,
  uploaded_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id uuid NOT NULL,
  org_id uuid NOT NULL,
  category text NOT NULL,
  channel text NOT NULL,
  frequency text NOT NULL DEFAULT 'immediate'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  org_id uuid,
  category text NOT NULL,
  title text NOT NULL,
  body text,
  link_url text,
  channel text NOT NULL DEFAULT 'in_app'::text,
  status text NOT NULL DEFAULT 'pending'::text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  read_at timestamp with time zone
);
CREATE TABLE IF NOT EXISTS public.opportunities (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  title text NOT NULL,
  reference_number text,
  summary text,
  description text,
  opportunity_type_id uuid,
  procurement_method_id uuid,
  sector_id uuid,
  country_id uuid,
  district_id uuid,
  city text,
  buyer_org_id uuid,
  buyer_name text NOT NULL,
  funding_agency_id uuid,
  publication_date date,
  clarification_deadline timestamp with time zone,
  submission_deadline timestamp with time zone NOT NULL,
  opening_date timestamp with time zone,
  estimated_value numeric,
  currency_code text,
  eligibility_requirements text,
  bid_security text,
  application_fee text,
  contact_details text,
  submission_instructions text,
  source_name text,
  source_url text,
  source_type text NOT NULL DEFAULT 'buyer_submission'::text,
  status_id uuid NOT NULL,
  is_featured boolean NOT NULL DEFAULT false,
  data_confidence text NOT NULL DEFAULT 'high'::text,
  view_count integer NOT NULL DEFAULT 0,
  created_by uuid,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  review_note text
);
CREATE TABLE IF NOT EXISTS public.opportunity_amendments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  opportunity_id uuid NOT NULL,
  created_by uuid,
  amendment_type text NOT NULL,
  summary text NOT NULL,
  previous_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.opportunity_awards (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  opportunity_id uuid NOT NULL,
  winning_supplier_name text NOT NULL,
  awarded_value numeric,
  currency_code text,
  award_date date,
  notes text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.opportunity_categories (
  opportunity_id uuid NOT NULL,
  category_id uuid NOT NULL
);
CREATE TABLE IF NOT EXISTS public.opportunity_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  opportunity_id uuid NOT NULL,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  file_size integer,
  is_public boolean NOT NULL DEFAULT true,
  uploaded_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.opportunity_responses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  opportunity_id uuid NOT NULL,
  org_id uuid NOT NULL,
  user_id uuid,
  kind text NOT NULL DEFAULT 'interest'::text,
  note text,
  status text NOT NULL DEFAULT 'active'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.opportunity_statuses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code text NOT NULL,
  label text NOT NULL,
  is_terminal boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS public.opportunity_types (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code text NOT NULL,
  label text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS public.organization_members (
  org_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'owner'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL DEFAULT 'Small Business'::text,
  country text NOT NULL DEFAULT 'Sierra Leone'::text,
  district text,
  primary_objective text,
  monthly_budget text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  is_buyer boolean NOT NULL DEFAULT false,
  is_supplier boolean NOT NULL DEFAULT false,
  buyer_verified boolean NOT NULL DEFAULT false,
  supplier_verified_until timestamp with time zone
);
CREATE TABLE IF NOT EXISTS public.pipeline_records (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  opportunity_id uuid NOT NULL,
  stage text NOT NULL DEFAULT 'saved'::text,
  bid_value numeric,
  probability integer,
  internal_deadline date,
  loss_reason text,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.pipeline_tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  pipeline_record_id uuid NOT NULL,
  title text NOT NULL,
  is_done boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.plan_features (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL,
  feature_key text NOT NULL,
  feature_label text NOT NULL,
  limit_value integer,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.plans (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  description text,
  monthly_price numeric,
  annual_price numeric,
  currency_code text NOT NULL DEFAULT 'SLE'::text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.procurement_methods (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code text NOT NULL,
  label text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid NOT NULL,
  full_name text NOT NULL DEFAULT ''::text,
  email text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  platform_role text NOT NULL DEFAULT 'user'::text
);
CREATE TABLE IF NOT EXISTS public.saved_opportunities (
  user_id uuid NOT NULL,
  opportunity_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.saved_searches (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  keyword text,
  sector_id uuid,
  district_id uuid,
  opportunity_type_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.sectors (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.service_request_activities (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL,
  author_id uuid,
  note text NOT NULL,
  is_internal boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.service_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  requested_by uuid,
  service_type text NOT NULL,
  related_opportunity_id uuid,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'submitted'::text,
  quote_amount numeric,
  quote_currency text,
  assigned_to uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.social_connections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  platform text NOT NULL,
  account_name text,
  status text NOT NULL DEFAULT 'Not Configured'::text,
  connection_health text NOT NULL DEFAULT 'None'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  plan_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text,
  billing_cycle text NOT NULL DEFAULT 'monthly'::text,
  payment_method text NOT NULL DEFAULT 'manual_bank_transfer'::text,
  current_period_start date,
  current_period_end date,
  approved_by uuid,
  approved_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.supplier_profiles (
  org_id uuid NOT NULL,
  trading_name text,
  registration_number text,
  tax_identification_number text,
  description text,
  website text,
  year_established integer,
  employee_count text,
  geographic_coverage text,
  certifications text,
  major_clients text,
  is_public boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.supplier_sectors (
  org_id uuid NOT NULL,
  sector_id uuid NOT NULL
);
CREATE TABLE IF NOT EXISTS public.tracking_link_clicks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tracking_link_id uuid NOT NULL,
  org_id uuid NOT NULL,
  clicked_at timestamp with time zone NOT NULL DEFAULT now(),
  referrer text
);
CREATE TABLE IF NOT EXISTS public.tracking_links (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  label text NOT NULL,
  target_url text NOT NULL,
  short_code text NOT NULL,
  click_count integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  campaign_id uuid
);
CREATE TABLE IF NOT EXISTS public.verification_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  request_type text NOT NULL,
  status text NOT NULL DEFAULT 'submitted'::text,
  notes text,
  reviewer_note text,
  submitted_by uuid,
  submitted_at timestamp with time zone NOT NULL DEFAULT now(),
  reviewed_by uuid,
  reviewed_at timestamp with time zone
);
