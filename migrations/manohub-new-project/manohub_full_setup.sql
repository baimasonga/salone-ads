-- ============================================================================
-- Manohub -> new Supabase project (rffjehmbrycztiekcyho) - COMPLETE SETUP
-- Run this whole file ONCE in the NEW project's Dashboard -> SQL Editor.
-- Creates extensions, tables, keys, indexes, functions, triggers, RLS +
-- policies, storage buckets, and reference data (dependency-safe order).
-- NOT included: auth users. Sign up fresh on the new project, then run:
--   update public.profiles set platform_role='admin' where email='YOUR_EMAIL';
-- ============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ========================= TABLES =========================
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

-- ====================== CONSTRAINTS =======================
alter table public.ad_campaigns add constraint ad_campaigns_pkey PRIMARY KEY (id);
alter table public.advert_events add constraint advert_events_pkey PRIMARY KEY (id);
alter table public.advertisement_requests add constraint advertisement_requests_pkey PRIMARY KEY (id);
alter table public.adverts add constraint adverts_pkey PRIMARY KEY (id);
alter table public.audience_segments add constraint audience_segments_pkey PRIMARY KEY (id);
alter table public.audit_logs add constraint audit_logs_pkey PRIMARY KEY (id);
alter table public.brand_kits add constraint brand_kits_pkey PRIMARY KEY (org_id);
alter table public.buyer_profiles add constraint buyer_profiles_pkey PRIMARY KEY (org_id);
alter table public.campaigns add constraint campaigns_pkey PRIMARY KEY (id);
alter table public.categories add constraint categories_pkey PRIMARY KEY (id);
alter table public.content_items add constraint content_items_pkey PRIMARY KEY (id);
alter table public.countries add constraint countries_pkey PRIMARY KEY (id);
alter table public.currencies add constraint currencies_pkey PRIMARY KEY (code);
alter table public.directory_profiles add constraint directory_profiles_pkey PRIMARY KEY (id);
alter table public.districts add constraint districts_pkey PRIMARY KEY (id);
alter table public.followed_buyers add constraint followed_buyers_pkey PRIMARY KEY (user_id, buyer_org_id);
alter table public.followed_sectors add constraint followed_sectors_pkey PRIMARY KEY (user_id, sector_id);
alter table public.funding_agencies add constraint funding_agencies_pkey PRIMARY KEY (id);
alter table public.influencer_profiles add constraint influencer_profiles_pkey PRIMARY KEY (id);
alter table public.leads add constraint leads_pkey PRIMARY KEY (id);
alter table public.media_assets add constraint media_assets_pkey PRIMARY KEY (id);
alter table public.notification_preferences add constraint notification_preferences_pkey PRIMARY KEY (user_id, org_id, category, channel);
alter table public.notifications add constraint notifications_pkey PRIMARY KEY (id);
alter table public.opportunities add constraint opportunities_pkey PRIMARY KEY (id);
alter table public.opportunity_amendments add constraint opportunity_amendments_pkey PRIMARY KEY (id);
alter table public.opportunity_awards add constraint opportunity_awards_pkey PRIMARY KEY (id);
alter table public.opportunity_categories add constraint opportunity_categories_pkey PRIMARY KEY (opportunity_id, category_id);
alter table public.opportunity_documents add constraint opportunity_documents_pkey PRIMARY KEY (id);
alter table public.opportunity_responses add constraint opportunity_responses_pkey PRIMARY KEY (id);
alter table public.opportunity_statuses add constraint opportunity_statuses_pkey PRIMARY KEY (id);
alter table public.opportunity_types add constraint opportunity_types_pkey PRIMARY KEY (id);
alter table public.organization_members add constraint organization_members_pkey PRIMARY KEY (org_id, user_id);
alter table public.organizations add constraint organizations_pkey PRIMARY KEY (id);
alter table public.pipeline_records add constraint pipeline_records_pkey PRIMARY KEY (id);
alter table public.pipeline_tasks add constraint pipeline_tasks_pkey PRIMARY KEY (id);
alter table public.plan_features add constraint plan_features_pkey PRIMARY KEY (id);
alter table public.plans add constraint plans_pkey PRIMARY KEY (id);
alter table public.procurement_methods add constraint procurement_methods_pkey PRIMARY KEY (id);
alter table public.profiles add constraint profiles_pkey PRIMARY KEY (id);
alter table public.saved_opportunities add constraint saved_opportunities_pkey PRIMARY KEY (user_id, opportunity_id);
alter table public.saved_searches add constraint saved_searches_pkey PRIMARY KEY (id);
alter table public.sectors add constraint sectors_pkey PRIMARY KEY (id);
alter table public.service_request_activities add constraint service_request_activities_pkey PRIMARY KEY (id);
alter table public.service_requests add constraint service_requests_pkey PRIMARY KEY (id);
alter table public.social_connections add constraint social_connections_pkey PRIMARY KEY (id);
alter table public.subscriptions add constraint subscriptions_pkey PRIMARY KEY (id);
alter table public.supplier_profiles add constraint supplier_profiles_pkey PRIMARY KEY (org_id);
alter table public.supplier_sectors add constraint supplier_sectors_pkey PRIMARY KEY (org_id, sector_id);
alter table public.tracking_link_clicks add constraint tracking_link_clicks_pkey PRIMARY KEY (id);
alter table public.tracking_links add constraint tracking_links_pkey PRIMARY KEY (id);
alter table public.verification_requests add constraint verification_requests_pkey PRIMARY KEY (id);
alter table public.adverts add constraint adverts_slug_key UNIQUE (slug);
alter table public.categories add constraint categories_slug_key UNIQUE (slug);
alter table public.countries add constraint countries_code_key UNIQUE (code);
alter table public.opportunities add constraint opportunities_slug_key UNIQUE (slug);
alter table public.opportunity_awards add constraint opportunity_awards_opportunity_id_key UNIQUE (opportunity_id);
alter table public.opportunity_responses add constraint opportunity_responses_opportunity_id_org_id_key UNIQUE (opportunity_id, org_id);
alter table public.opportunity_statuses add constraint opportunity_statuses_code_key UNIQUE (code);
alter table public.opportunity_types add constraint opportunity_types_code_key UNIQUE (code);
alter table public.pipeline_records add constraint pipeline_records_org_id_opportunity_id_key UNIQUE (org_id, opportunity_id);
alter table public.plan_features add constraint plan_features_plan_id_feature_key_key UNIQUE (plan_id, feature_key);
alter table public.plans add constraint plans_code_key UNIQUE (code);
alter table public.procurement_methods add constraint procurement_methods_code_key UNIQUE (code);
alter table public.sectors add constraint sectors_slug_key UNIQUE (slug);
alter table public.tracking_links add constraint tracking_links_short_code_key UNIQUE (short_code);
alter table public.ad_campaigns add constraint ad_campaigns_status_check CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text])));
alter table public.advert_events add constraint advert_events_kind_check CHECK ((kind = ANY (ARRAY['view'::text, 'click'::text])));
alter table public.advertisement_requests add constraint advertisement_requests_category_check CHECK ((category = ANY (ARRAY['business'::text, 'event'::text, 'goods'::text, 'service'::text])));
alter table public.advertisement_requests add constraint advertisement_requests_status_check CHECK ((status = ANY (ARRAY['submitted'::text, 'in_production'::text, 'live'::text, 'completed'::text, 'cancelled'::text])));
alter table public.adverts add constraint adverts_format_check CHECK ((format = ANY (ARRAY['square'::text, 'story'::text, 'landscape'::text, 'banner'::text, 'editorial'::text])));
alter table public.adverts add constraint adverts_status_chk CHECK ((status = ANY (ARRAY['draft'::text, 'live'::text, 'archived'::text])));
alter table public.adverts add constraint adverts_theme_check CHECK ((theme = ANY (ARRAY['dark'::text, 'light'::text])));
alter table public.campaigns add constraint campaigns_status_check CHECK ((status = ANY (ARRAY['Draft'::text, 'Planning'::text, 'Approved'::text, 'Scheduled'::text, 'Active'::text, 'Completed'::text, 'Failed'::text])));
alter table public.content_items add constraint content_items_content_type_check CHECK ((content_type = ANY (ARRAY['Social Post'::text, 'WhatsApp Promo'::text, 'Video Script'::text, 'Radio Brief'::text, 'Email News'::text])));
alter table public.content_items add constraint content_items_status_check CHECK ((status = ANY (ARRAY['Draft'::text, 'Awaiting Review'::text, 'Approved'::text, 'Scheduled'::text, 'Published'::text, 'Failed'::text])));
alter table public.leads add constraint leads_status_check CHECK ((status = ANY (ARRAY['New'::text, 'Contacted'::text, 'Qualified'::text, 'Proposal Sent'::text, 'Converted'::text, 'Lost'::text])));
alter table public.notification_preferences add constraint notification_preferences_channel_check CHECK ((channel = ANY (ARRAY['in_app'::text, 'email'::text])));
alter table public.notification_preferences add constraint notification_preferences_frequency_check CHECK ((frequency = ANY (ARRAY['immediate'::text, 'daily_digest'::text, 'weekly_digest'::text, 'disabled'::text])));
alter table public.notifications add constraint notifications_channel_check CHECK ((channel = ANY (ARRAY['in_app'::text, 'email'::text])));
alter table public.notifications add constraint notifications_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text, 'read'::text])));
alter table public.opportunities add constraint opportunities_data_confidence_check CHECK ((data_confidence = ANY (ARRAY['high'::text, 'medium'::text, 'low'::text])));
alter table public.opportunities add constraint opportunities_source_type_check CHECK ((source_type = ANY (ARRAY['buyer_submission'::text, 'admin_entry'::text, 'document_extraction'::text, 'website_ingestion'::text, 'api_import'::text])));
alter table public.opportunity_amendments add constraint opportunity_amendments_amendment_type_check CHECK ((amendment_type = ANY (ARRAY['content_update'::text, 'deadline_extension'::text, 'cancellation'::text, 'other'::text])));
alter table public.opportunity_responses add constraint opportunity_responses_kind_check CHECK ((kind = ANY (ARRAY['interest'::text, 'intent_to_bid'::text])));
alter table public.opportunity_responses add constraint opportunity_responses_status_check CHECK ((status = ANY (ARRAY['active'::text, 'withdrawn'::text])));
alter table public.organization_members add constraint organization_members_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text])));
alter table public.pipeline_records add constraint pipeline_records_probability_check CHECK (((probability IS NULL) OR ((probability >= 0) AND (probability <= 100))));
alter table public.pipeline_records add constraint pipeline_records_stage_check CHECK ((stage = ANY (ARRAY['saved'::text, 'reviewing'::text, 'interested'::text, 'go'::text, 'no_go'::text, 'preparing'::text, 'submitted'::text, 'won'::text, 'lost'::text, 'withdrawn'::text, 'archived'::text])));
alter table public.profiles add constraint profiles_platform_role_check CHECK ((platform_role = ANY (ARRAY['user'::text, 'researcher'::text, 'admin'::text])));
alter table public.service_requests add constraint service_requests_service_type_check CHECK ((service_type = ANY (ARRAY['document_retrieval'::text, 'tender_clarification'::text, 'eligibility_assessment'::text, 'bid_readiness_review'::text, 'proposal_review'::text, 'company_profile_prep'::text, 'supplier_registration_assistance'::text, 'featured_placement'::text, 'other'::text])));
alter table public.service_requests add constraint service_requests_status_check CHECK ((status = ANY (ARRAY['submitted'::text, 'quoted'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text])));
alter table public.social_connections add constraint social_connections_connection_health_check CHECK ((connection_health = ANY (ARRAY['Healthy'::text, 'Warning'::text, 'Disconnected'::text, 'None'::text])));
alter table public.social_connections add constraint social_connections_status_check CHECK ((status = ANY (ARRAY['Connected'::text, 'Sandbox'::text, 'Expired'::text, 'Not Configured'::text])));
alter table public.subscriptions add constraint subscriptions_billing_cycle_check CHECK ((billing_cycle = ANY (ARRAY['monthly'::text, 'annual'::text])));
alter table public.subscriptions add constraint subscriptions_payment_method_check CHECK ((payment_method = ANY (ARRAY['manual_bank_transfer'::text, 'mobile_money'::text, 'card'::text, 'invoice'::text])));
alter table public.subscriptions add constraint subscriptions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'active'::text, 'past_due'::text, 'cancelled'::text, 'expired'::text])));
alter table public.verification_requests add constraint verification_requests_request_type_check CHECK ((request_type = ANY (ARRAY['supplier'::text, 'buyer'::text])));
alter table public.verification_requests add constraint verification_requests_status_check CHECK ((status = ANY (ARRAY['submitted'::text, 'under_review'::text, 'additional_info_required'::text, 'verified'::text, 'rejected'::text, 'suspended'::text, 'expired'::text])));
alter table public.ad_campaigns add constraint ad_campaigns_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.ad_campaigns add constraint ad_campaigns_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE SET NULL;
alter table public.advert_events add constraint advert_events_advert_id_fkey FOREIGN KEY (advert_id) REFERENCES adverts(id) ON DELETE CASCADE;
alter table public.advertisement_requests add constraint advertisement_requests_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.advertisement_requests add constraint advertisement_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES auth.users(id);
alter table public.adverts add constraint adverts_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES ad_campaigns(id) ON DELETE SET NULL;
alter table public.adverts add constraint adverts_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE SET NULL;
alter table public.adverts add constraint adverts_request_id_fkey FOREIGN KEY (request_id) REFERENCES advertisement_requests(id) ON DELETE SET NULL;
alter table public.audience_segments add constraint audience_segments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.audience_segments add constraint audience_segments_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.audit_logs add constraint audit_logs_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.audit_logs add constraint audit_logs_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE SET NULL;
alter table public.brand_kits add constraint brand_kits_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.buyer_profiles add constraint buyer_profiles_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.campaigns add constraint campaigns_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.categories add constraint categories_sector_id_fkey FOREIGN KEY (sector_id) REFERENCES sectors(id) ON DELETE SET NULL;
alter table public.content_items add constraint content_items_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL;
alter table public.content_items add constraint content_items_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.countries add constraint countries_currency_code_fkey FOREIGN KEY (currency_code) REFERENCES currencies(code);
alter table public.directory_profiles add constraint directory_profiles_claimed_by_org_id_fkey FOREIGN KEY (claimed_by_org_id) REFERENCES organizations(id) ON DELETE SET NULL;
alter table public.directory_profiles add constraint directory_profiles_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.districts add constraint districts_country_id_fkey FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE CASCADE;
alter table public.followed_buyers add constraint followed_buyers_buyer_org_id_fkey FOREIGN KEY (buyer_org_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.followed_buyers add constraint followed_buyers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.followed_sectors add constraint followed_sectors_sector_id_fkey FOREIGN KEY (sector_id) REFERENCES sectors(id) ON DELETE CASCADE;
alter table public.followed_sectors add constraint followed_sectors_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.leads add constraint leads_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.media_assets add constraint media_assets_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.media_assets add constraint media_assets_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id);
alter table public.notification_preferences add constraint notification_preferences_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.notification_preferences add constraint notification_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.notifications add constraint notifications_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.notifications add constraint notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.opportunities add constraint opportunities_buyer_org_id_fkey FOREIGN KEY (buyer_org_id) REFERENCES organizations(id) ON DELETE SET NULL;
alter table public.opportunities add constraint opportunities_country_id_fkey FOREIGN KEY (country_id) REFERENCES countries(id);
alter table public.opportunities add constraint opportunities_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.opportunities add constraint opportunities_currency_code_fkey FOREIGN KEY (currency_code) REFERENCES currencies(code);
alter table public.opportunities add constraint opportunities_district_id_fkey FOREIGN KEY (district_id) REFERENCES districts(id);
alter table public.opportunities add constraint opportunities_funding_agency_id_fkey FOREIGN KEY (funding_agency_id) REFERENCES funding_agencies(id);
alter table public.opportunities add constraint opportunities_opportunity_type_id_fkey FOREIGN KEY (opportunity_type_id) REFERENCES opportunity_types(id);
alter table public.opportunities add constraint opportunities_procurement_method_id_fkey FOREIGN KEY (procurement_method_id) REFERENCES procurement_methods(id);
alter table public.opportunities add constraint opportunities_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.opportunities add constraint opportunities_sector_id_fkey FOREIGN KEY (sector_id) REFERENCES sectors(id);
alter table public.opportunities add constraint opportunities_status_id_fkey FOREIGN KEY (status_id) REFERENCES opportunity_statuses(id);
alter table public.opportunity_amendments add constraint opportunity_amendments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.opportunity_amendments add constraint opportunity_amendments_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE CASCADE;
alter table public.opportunity_awards add constraint opportunity_awards_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.opportunity_awards add constraint opportunity_awards_currency_code_fkey FOREIGN KEY (currency_code) REFERENCES currencies(code);
alter table public.opportunity_awards add constraint opportunity_awards_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE CASCADE;
alter table public.opportunity_categories add constraint opportunity_categories_category_id_fkey FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE;
alter table public.opportunity_categories add constraint opportunity_categories_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE CASCADE;
alter table public.opportunity_documents add constraint opportunity_documents_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE CASCADE;
alter table public.opportunity_documents add constraint opportunity_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.opportunity_responses add constraint opportunity_responses_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE CASCADE;
alter table public.opportunity_responses add constraint opportunity_responses_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.opportunity_responses add constraint opportunity_responses_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.organization_members add constraint organization_members_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.organization_members add constraint organization_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.organizations add constraint organizations_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.pipeline_records add constraint pipeline_records_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE CASCADE;
alter table public.pipeline_records add constraint pipeline_records_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.pipeline_tasks add constraint pipeline_tasks_pipeline_record_id_fkey FOREIGN KEY (pipeline_record_id) REFERENCES pipeline_records(id) ON DELETE CASCADE;
alter table public.plan_features add constraint plan_features_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE;
alter table public.plans add constraint plans_currency_code_fkey FOREIGN KEY (currency_code) REFERENCES currencies(code);
alter table public.profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.saved_opportunities add constraint saved_opportunities_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE CASCADE;
alter table public.saved_opportunities add constraint saved_opportunities_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.saved_searches add constraint saved_searches_district_id_fkey FOREIGN KEY (district_id) REFERENCES districts(id) ON DELETE SET NULL;
alter table public.saved_searches add constraint saved_searches_opportunity_type_id_fkey FOREIGN KEY (opportunity_type_id) REFERENCES opportunity_types(id) ON DELETE SET NULL;
alter table public.saved_searches add constraint saved_searches_sector_id_fkey FOREIGN KEY (sector_id) REFERENCES sectors(id) ON DELETE SET NULL;
alter table public.saved_searches add constraint saved_searches_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.service_request_activities add constraint service_request_activities_author_id_fkey FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.service_request_activities add constraint service_request_activities_request_id_fkey FOREIGN KEY (request_id) REFERENCES service_requests(id) ON DELETE CASCADE;
alter table public.service_requests add constraint service_requests_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.service_requests add constraint service_requests_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.service_requests add constraint service_requests_quote_currency_fkey FOREIGN KEY (quote_currency) REFERENCES currencies(code);
alter table public.service_requests add constraint service_requests_related_opportunity_id_fkey FOREIGN KEY (related_opportunity_id) REFERENCES opportunities(id) ON DELETE SET NULL;
alter table public.service_requests add constraint service_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.social_connections add constraint social_connections_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.subscriptions add constraint subscriptions_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.subscriptions add constraint subscriptions_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.subscriptions add constraint subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES plans(id);
alter table public.supplier_profiles add constraint supplier_profiles_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.supplier_sectors add constraint supplier_sectors_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.supplier_sectors add constraint supplier_sectors_sector_id_fkey FOREIGN KEY (sector_id) REFERENCES sectors(id) ON DELETE CASCADE;
alter table public.tracking_link_clicks add constraint tracking_link_clicks_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.tracking_link_clicks add constraint tracking_link_clicks_tracking_link_id_fkey FOREIGN KEY (tracking_link_id) REFERENCES tracking_links(id) ON DELETE CASCADE;
alter table public.tracking_links add constraint tracking_links_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL;
alter table public.tracking_links add constraint tracking_links_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.tracking_links add constraint tracking_links_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.verification_requests add constraint verification_requests_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.verification_requests add constraint verification_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.verification_requests add constraint verification_requests_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ===== INDEXES =====
CREATE INDEX advert_events_advert_created_idx ON public.advert_events USING btree (advert_id, created_at);
CREATE INDEX advert_events_created_idx ON public.advert_events USING btree (created_at);
CREATE INDEX adverts_campaign_idx ON public.adverts USING btree (campaign_id);
CREATE INDEX adverts_published_at_idx ON public.adverts USING btree (published_at DESC);
CREATE INDEX adverts_status_idx ON public.adverts USING btree (status);
CREATE INDEX audit_logs_actor_id_idx ON public.audit_logs USING btree (actor_id);
CREATE INDEX audit_logs_org_id_idx ON public.audit_logs USING btree (org_id);
CREATE INDEX campaigns_org_id_idx ON public.campaigns USING btree (org_id);
CREATE INDEX categories_sector_id_idx ON public.categories USING btree (sector_id);
CREATE INDEX content_items_campaign_id_idx ON public.content_items USING btree (campaign_id);
CREATE INDEX content_items_org_id_idx ON public.content_items USING btree (org_id);
CREATE INDEX directory_profiles_claimed_by_idx ON public.directory_profiles USING btree (claimed_by_org_id);
CREATE INDEX districts_country_id_idx ON public.districts USING btree (country_id);
CREATE INDEX leads_org_id_idx ON public.leads USING btree (org_id);
CREATE INDEX media_assets_org_id_idx ON public.media_assets USING btree (org_id);
CREATE INDEX notifications_user_id_idx ON public.notifications USING btree (user_id);
CREATE INDEX opportunities_buyer_org_id_idx ON public.opportunities USING btree (buyer_org_id);
CREATE INDEX opportunities_district_id_idx ON public.opportunities USING btree (district_id);
CREATE INDEX opportunities_sector_id_idx ON public.opportunities USING btree (sector_id);
CREATE INDEX opportunities_status_id_idx ON public.opportunities USING btree (status_id);
CREATE INDEX opportunities_submission_deadline_idx ON public.opportunities USING btree (submission_deadline);
CREATE INDEX opportunity_amendments_opportunity_id_idx ON public.opportunity_amendments USING btree (opportunity_id);
CREATE INDEX opportunity_documents_opportunity_id_idx ON public.opportunity_documents USING btree (opportunity_id);
CREATE INDEX opportunity_responses_opp_idx ON public.opportunity_responses USING btree (opportunity_id);
CREATE INDEX opportunity_responses_org_idx ON public.opportunity_responses USING btree (org_id);
CREATE INDEX organization_members_user_id_idx ON public.organization_members USING btree (user_id);
CREATE INDEX pipeline_records_org_id_idx ON public.pipeline_records USING btree (org_id);
CREATE INDEX pipeline_tasks_pipeline_record_id_idx ON public.pipeline_tasks USING btree (pipeline_record_id);
CREATE INDEX saved_searches_user_id_idx ON public.saved_searches USING btree (user_id);
CREATE INDEX service_request_activities_request_id_idx ON public.service_request_activities USING btree (request_id);
CREATE INDEX service_requests_org_id_idx ON public.service_requests USING btree (org_id);
CREATE INDEX social_connections_org_id_idx ON public.social_connections USING btree (org_id);
CREATE INDEX subscriptions_org_id_idx ON public.subscriptions USING btree (org_id);
CREATE INDEX tracking_link_clicks_link_id_idx ON public.tracking_link_clicks USING btree (tracking_link_id);
CREATE INDEX tracking_link_clicks_org_id_idx ON public.tracking_link_clicks USING btree (org_id, clicked_at);
CREATE INDEX tracking_links_campaign_id_idx ON public.tracking_links USING btree (campaign_id);
CREATE INDEX tracking_links_org_id_idx ON public.tracking_links USING btree (org_id);
CREATE INDEX verification_requests_org_id_idx ON public.verification_requests USING btree (org_id);

-- ===== FUNCTIONS =====
CREATE OR REPLACE FUNCTION public.admin_set_organization_verification(p_org_id uuid, p_request_type text, p_verified boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_platform_admin() then
    raise exception 'Admin access required';
  end if;

  if p_request_type = 'supplier' then
    update public.organizations
    set supplier_verified_until = case when p_verified then now() + interval '1 year' else null end
    where id = p_org_id;
  elsif p_request_type = 'buyer' then
    update public.organizations
    set buyer_verified = p_verified
    where id = p_org_id;
  else
    raise exception 'Unknown request_type: %', p_request_type;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_organization(org_name text, org_type text, org_country text, org_district text, org_primary_objective text, org_monthly_budget text)
 RETURNS organizations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  new_org public.organizations;
  resolved_name text := coalesce(nullif(trim(org_name), ''), 'My Salone Enterprise');
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if exists (select 1 from public.organization_members where user_id = auth.uid()) then
    raise exception 'You already have an organization. Sign in to access your existing workspace instead of creating a new one.';
  end if;

  insert into public.organizations (name, type, country, district, primary_objective, monthly_budget, created_by)
  values (resolved_name, coalesce(org_type, 'Small Business'), coalesce(org_country, 'Sierra Leone'), org_district, org_primary_objective, org_monthly_budget, auth.uid())
  returning * into new_org;

  insert into public.organization_members (org_id, user_id, role)
  values (new_org.id, auth.uid(), 'owner');

  insert into public.brand_kits (org_id, brand_name, legal_name, mission, tagline, tone_of_voice, prohibited_terminology)
  values (
    new_org.id,
    resolved_name,
    resolved_name || ' Ltd',
    'Bring organic native Sierra Leone flavors to families globally',
    'Harvested with Local Pride, Shared with Global Love',
    'Warm, Honest, Proudly Leonean',
    array['cheap','artificial','fake']
  );

  insert into public.social_connections (org_id, platform, account_name, status, connection_health) values
    (new_org.id, 'Facebook & Instagram', 'SaloneReach Sandbox', 'Sandbox', 'Healthy'),
    (new_org.id, 'WhatsApp Business API', 'SaloneReach Broadcast', 'Connected', 'Healthy'),
    (new_org.id, 'TikTok Creator Hub', 'Unconfigured Platform', 'Not Configured', 'None'),
    (new_org.id, 'LinkedIn Professional Profile', 'SaloneReach Corporate', 'Expired', 'Warning');

  insert into public.campaigns (org_id, name, description, objective, status, total_budget, start_date, end_date, channels, district, diaspora_market) values
    (new_org.id, 'Christmas Homecoming Festival', 'Attracting diaspora tourists in the UK and US to Lumley Beach and historic Bunce Island for festive concerts and heritage tours.', 'Tourism & Bookings', 'Active', 45000000, '2026-12-01', '2026-12-31', array['Facebook Video','Instagram Ads','WhatsApp Broadcast'], 'Western Area Urban', 'United Kingdom'),
    (new_org.id, 'Native Parboiled Rice Launch', 'Promoting local organic long-grain parboiled rice processed in Bo. Scoping diaspora sponsorships to buy food directly for parents back home.', 'Product Sales', 'Scheduled', 15000000, '2026-08-01', '2026-09-15', array['WhatsApp click campaign','TikTok Challenge','Manual Flyer Package'], 'Bo', 'United States'),
    (new_org.id, 'Kenema Cocoa Brand Brief', 'Creative brand awareness targeting craft chocolatiers and organic suppliers in North America looking for direct sustainable trade partnerships.', 'Investor Enquiries', 'Planning', 8000000, '2026-09-01', '2026-10-31', array['LinkedIn Organic','YouTube Video'], 'Kenema', 'Canada');

  insert into public.content_items (org_id, title, content_type, platform, headline, body_text, hashtags, scheduled_date, status, version) values
    (new_org.id, 'Lumley Beach Concert Reel', 'Video Script', 'Instagram / TikTok', 'Feel the sand, hear the beat!', 'Are you ready for the ultimate December homecoming? Lumley beach, live African drums, traditional cuisine, and performance from top Salone musicians. Secure your early bird passes before slots run out.', array['#SweetSalone','#Homecoming2026','#SaloneReach','#LumleyBeats'], '2026-12-05', 'Approved', 2),
    (new_org.id, 'Diaspora Native Rice Promo', 'WhatsApp Promo', 'WhatsApp', 'Buy Organic Native Rice for Family Back Home!', 'Tired of expensive wire transfer fees to feed your parents? Buy a bag of parboiled native rice grown with love in Bo. We deliver directly to Freetown, Makeni, and Bo within 48 hours. Support local growers directly!', array['#EatSalone','#SupportBoGrowers','#DiasporaGives'], '2026-08-10', 'Scheduled', 1),
    (new_org.id, 'Sustainable Cocoa Trade Thread', 'Social Post', 'LinkedIn', 'Single-Origin, Single-Harvest Sustainable Cocoa', 'We are transforming eastern Sierra Leone into a premium hub for single-harvest organic cocoa. Our network of 500 smallholder growers in Kenema guarantees complete traceability and zero chemical processing. Direct fairtrade shipping now open.', array['#KenemaCocoa','#SustainableTrade','#SaloneReach','#OrganicChocolate'], '2026-09-02', 'Draft', 1);

  insert into public.leads (org_id, name, email, telephone, whatsapp, district, source, status, estimated_value) values
    (new_org.id, 'Mohamed Bangura', 'mohamed.b@gmail.com', '+44 7712 345678', '+447712345678', 'London Hub', 'Christmas Homecoming Festival', 'Qualified', 12500000),
    (new_org.id, 'Aminata Kallon', 'aminata_k@hotmail.com', '+232 76 456789', '+23276456789', 'Western Area Urban', 'Native Parboiled Rice Launch', 'Converted', 2400000),
    (new_org.id, 'Jeffrey Jenkins', 'j.jenkins@chocolatiers.com', '+1 301 555 1212', '+13015551212', 'Maryland Hub', 'Kenema Cocoa Brand Brief', 'New', 180000000),
    (new_org.id, 'Sarah Kamara', 'skamara@ngoworld.org', '+232 30 998877', '+23230998877', 'Bo', 'Native Parboiled Rice Launch', 'Proposal Sent', 35000000);

  return new_org;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.find_user_id_by_email(p_email text)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select id from public.profiles where lower(email) = lower(p_email) limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_deadline_reminders(p_days_ahead integer DEFAULT 3)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_platform_admin() then
    raise exception 'Admin access required';
  end if;
  return public.run_deadline_reminder_sweep(p_days_ahead);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_admin_analytics_summary()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  result jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'Admin access required';
  end if;

  select jsonb_build_object(
    'opportunities_by_status', (
      select coalesce(jsonb_agg(jsonb_build_object('label', s.label, 'count', c.cnt) order by c.cnt desc), '[]'::jsonb)
      from (select status_id, count(*) as cnt from public.opportunities group by status_id) c
      join public.opportunity_statuses s on s.id = c.status_id
    ),
    'opportunities_by_sector', (
      select coalesce(jsonb_agg(jsonb_build_object('label', sec.name, 'count', c.cnt) order by c.cnt desc), '[]'::jsonb)
      from (select sector_id, count(*) as cnt from public.opportunities where sector_id is not null group by sector_id order by count(*) desc limit 10) c
      join public.sectors sec on sec.id = c.sector_id
    ),
    'opportunities_by_district', (
      select coalesce(jsonb_agg(jsonb_build_object('label', d.name, 'count', c.cnt) order by c.cnt desc), '[]'::jsonb)
      from (select district_id, count(*) as cnt from public.opportunities where district_id is not null group by district_id order by count(*) desc limit 10) c
      join public.districts d on d.id = c.district_id
    ),
    'most_viewed', (
      select coalesce(jsonb_agg(jsonb_build_object('title', o.title, 'slug', o.slug, 'value', o.view_count) order by o.view_count desc), '[]'::jsonb)
      from (select title, slug, view_count from public.opportunities order by view_count desc limit 5) o
    ),
    'most_saved', (
      select coalesce(jsonb_agg(jsonb_build_object('title', o.title, 'slug', o.slug, 'value', c.cnt) order by c.cnt desc), '[]'::jsonb)
      from (select opportunity_id, count(*) as cnt from public.saved_opportunities group by opportunity_id order by count(*) desc limit 5) c
      join public.opportunities o on o.id = c.opportunity_id
    ),
    'most_followed_buyers', (
      select coalesce(jsonb_agg(jsonb_build_object('label', org.name, 'count', c.cnt) order by c.cnt desc), '[]'::jsonb)
      from (select buyer_org_id, count(*) as cnt from public.followed_buyers group by buyer_org_id order by count(*) desc limit 5) c
      join public.organizations org on org.id = c.buyer_org_id
    ),
    'subscriptions_by_plan', (
      select coalesce(jsonb_agg(jsonb_build_object('label', p.name, 'count', c.cnt)), '[]'::jsonb)
      from (select plan_id, count(*) as cnt from public.subscriptions where status = 'active' group by plan_id) c
      join public.plans p on p.id = c.plan_id
    ),
    'awards_by_sector', (
      select coalesce(jsonb_agg(jsonb_build_object('label', sec.name, 'count', c.cnt, 'total_value', c.total_value)), '[]'::jsonb)
      from (
        select o.sector_id, count(*) as cnt, sum(a.awarded_value) as total_value
        from public.opportunity_awards a
        join public.opportunities o on o.id = a.opportunity_id
        where o.sector_id is not null
        group by o.sector_id
      ) c
      join public.sectors sec on sec.id = c.sector_id
    ),
    'total_organizations', (select count(*) from public.organizations),
    'total_suppliers', (select count(*) from public.organizations where is_supplier),
    'total_verified_suppliers', (select count(*) from public.organizations where supplier_verified_until > now()),
    'total_buyers', (select count(*) from public.organizations where is_buyer)
  ) into result;

  return result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_advert_analytics_summary()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare result json;
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;
  select json_build_object(
    'views_total', coalesce((select sum(view_count) from public.adverts), 0),
    'clicks_total', coalesce((select sum(click_count) from public.adverts), 0),
    'live_count', (select count(*) from public.adverts where status = 'live'),
    'views_7d', (select count(*) from public.advert_events where kind='view' and created_at >= now() - interval '7 days'),
    'clicks_7d', (select count(*) from public.advert_events where kind='click' and created_at >= now() - interval '7 days'),
    'views_30d', (select count(*) from public.advert_events where kind='view' and created_at >= now() - interval '30 days'),
    'clicks_30d', (select count(*) from public.advert_events where kind='click' and created_at >= now() - interval '30 days')
  ) into result;
  return result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_campaign_reach()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare result json;
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;
  select coalesce(json_object_agg(campaign_id, stats), '{}'::json) into result
  from (
    select campaign_id,
      json_build_object(
        'adverts', count(*),
        'views', coalesce(sum(view_count), 0),
        'clicks', coalesce(sum(click_count), 0)
      ) as stats
    from public.adverts
    where campaign_id is not null
    group by campaign_id
  ) s;
  return result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_opportunity_detail(p_slug text)
 RETURNS TABLE(id uuid, slug text, title text, buyer_name text, submission_deadline timestamp with time zone, estimated_value numeric, currency_code text, is_featured boolean, review_note text, sector text, district text, country text, opportunity_type text, status_code text, status_label text, reference_number text, summary text, description text, procurement_method text, city text, funding_agency text, publication_date date, clarification_deadline timestamp with time zone, opening_date timestamp with time zone, eligibility_requirements text, bid_security text, application_fee text, contact_details text, submission_instructions text, source_name text, source_url text, buyer_org_id uuid, has_full_access boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v opportunities%rowtype;
  v_entitled boolean;
  v_visible boolean;
begin
  select * into v from opportunities o where o.slug = p_slug;
  if not found then
    return;
  end if;

  v_visible := is_opportunity_publicly_visible(v.id)
    or (v.buyer_org_id is not null and is_org_member(v.buyer_org_id))
    or is_platform_admin();
  if not v_visible then
    return;
  end if;

  v_entitled := (v.buyer_org_id is not null and is_org_member(v.buyer_org_id))
    or is_platform_admin()
    or public.user_has_tender_feature('tender_alerts_and_details')
    or public.user_has_tender_feature('tender_publishing');

  return query
  select
    v.id, v.slug, v.title, v.buyer_name, v.submission_deadline,
    v.estimated_value, v.currency_code, v.is_featured, v.review_note,
    sec.name, dist.name, ctry.name, ot.label, st.code, st.label,
    v.reference_number, v.summary,
    case when v_entitled then v.description else null end,
    pm.label, v.city,
    fa.name, v.publication_date, v.clarification_deadline, v.opening_date,
    case when v_entitled then v.eligibility_requirements else null end,
    case when v_entitled then v.bid_security else null end,
    case when v_entitled then v.application_fee else null end,
    case when v_entitled then v.contact_details else null end,
    case when v_entitled then v.submission_instructions else null end,
    case when v_entitled then v.source_name else null end,
    case when v_entitled then v.source_url else null end,
    v.buyer_org_id,
    v_entitled
  from (select 1) as dummy
  left join sectors sec on sec.id = v.sector_id
  left join districts dist on dist.id = v.district_id
  left join countries ctry on ctry.id = v.country_id
  left join opportunity_types ot on ot.id = v.opportunity_type_id
  left join opportunity_statuses st on st.id = v.status_id
  left join procurement_methods pm on pm.id = v.procurement_method_id
  left join funding_agencies fa on fa.id = v.funding_agency_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_opportunity_response_count(p_opportunity_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select count(*)::int from public.opportunity_responses
  where opportunity_id = p_opportunity_id and status = 'active';
$function$
;

CREATE OR REPLACE FUNCTION public.get_org_feature_limit(p_org_id uuid, p_feature_key text)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  result integer;
begin
  select pf.limit_value into result
  from public.subscriptions s
  join public.plan_features pf on pf.plan_id = s.plan_id and pf.feature_key = p_feature_key
  where s.org_id = p_org_id and s.status = 'active'
  order by s.created_at desc
  limit 1;

  if found then
    return result;
  end if;

  select pf.limit_value into result
  from public.plans p
  join public.plan_features pf on pf.plan_id = p.id and pf.feature_key = p_feature_key
  where p.code = 'free';

  return result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), new.email)
  on conflict (id) do nothing;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.increment_opportunity_view(p_opportunity_id uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update public.opportunities
  set view_count = view_count + 1
  where id = p_opportunity_id
    and exists (select 1 from public.opportunity_statuses s where s.id = status_id and s.code in ('published', 'amended', 'deadline_extended', 'closed', 'awarded'));
$function$
;

CREATE OR REPLACE FUNCTION public.invite_team_member(p_org_id uuid, p_email text, p_role text DEFAULT 'member'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  caller_role text;
  invitee_id uuid;
  current_count integer;
  member_limit integer;
begin
  select role into caller_role from public.organization_members where org_id = p_org_id and user_id = auth.uid();
  if caller_role is null or caller_role not in ('owner', 'admin') then
    raise exception 'Only an org owner or admin can invite team members';
  end if;

  if p_role not in ('owner', 'admin', 'member') then
    raise exception 'Invalid role: %', p_role;
  end if;

  invitee_id := public.find_user_id_by_email(p_email);
  if invitee_id is null then
    raise exception 'No SaloneReach account found for %. Ask them to sign up first.', p_email;
  end if;

  if exists (select 1 from public.organization_members where org_id = p_org_id and user_id = invitee_id) then
    raise exception 'That user is already a member of this organization';
  end if;

  select count(*) into current_count from public.organization_members where org_id = p_org_id;
  member_limit := public.get_org_feature_limit(p_org_id, 'max_team_members');
  if member_limit is not null and current_count >= member_limit then
    raise exception 'Your plan allows up to % team member(s). Upgrade to invite more.', member_limit;
  end if;

  insert into public.organization_members (org_id, user_id, role) values (p_org_id, invitee_id, p_role);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.is_opportunity_publicly_visible(target_opportunity_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.opportunities o
    join public.opportunity_statuses s on s.id = o.status_id
    where o.id = target_opportunity_id
      and s.code in ('published', 'amended', 'deadline_extended', 'closed', 'awarded')
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_org_member(target_org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.organization_members
    where org_id = target_org_id and user_id = auth.uid()
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.profiles where id = auth.uid() and platform_role = 'admin'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.log_audit_event(p_action text, p_entity_type text, p_entity_id text, p_org_id uuid DEFAULT NULL::uuid, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  insert into public.audit_logs (actor_id, org_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), p_org_id, p_action, p_entity_type, p_entity_id, p_metadata);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_matching_users_on_publish()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  new_status_code text;
  matched_user record;
begin
  if old.status_id is not distinct from new.status_id then
    return new;
  end if;

  select code into new_status_code from public.opportunity_statuses where id = new.status_id;
  if new_status_code not in ('published', 'amended') then
    return new;
  end if;

  for matched_user in
    select distinct ss.user_id
    from public.saved_searches ss
    where (ss.sector_id is null or ss.sector_id = new.sector_id)
      and (ss.district_id is null or ss.district_id = new.district_id)
      and (ss.opportunity_type_id is null or ss.opportunity_type_id = new.opportunity_type_id)
      and not exists (
        select 1 from public.notifications n
        where n.user_id = ss.user_id and n.category = 'saved_search_match' and n.metadata->>'opportunity_id' = new.id::text
      )
  loop
    insert into public.notifications (user_id, category, title, body, link_url, channel, metadata)
    values (matched_user.user_id, 'saved_search_match', 'New tender matches your saved search', new.title, '/tenders/' || new.slug, 'in_app', jsonb_build_object('opportunity_id', new.id));
  end loop;

  if new.buyer_org_id is not null then
    for matched_user in
      select fb.user_id
      from public.followed_buyers fb
      where fb.buyer_org_id = new.buyer_org_id
        and not exists (
          select 1 from public.notifications n
          where n.user_id = fb.user_id and n.category = 'followed_buyer' and n.metadata->>'opportunity_id' = new.id::text
        )
    loop
      insert into public.notifications (user_id, category, title, body, link_url, channel, metadata)
      values (matched_user.user_id, 'followed_buyer', 'New tender from a buyer you follow', new.title, '/tenders/' || new.slug, 'in_app', jsonb_build_object('opportunity_id', new.id));
    end loop;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.org_has_feature(p_org_id uuid, p_feature_key text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.get_org_feature_limit(p_org_id, p_feature_key) is null
      or public.get_org_feature_limit(p_org_id, p_feature_key) > 0;
$function$
;

CREATE OR REPLACE FUNCTION public.protect_buyer_mode_activation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.is_buyer = true and old.is_buyer = false then
    if not (is_platform_admin() or public.org_has_feature(new.id, 'tender_publishing')) then
      new.is_buyer := false;
    end if;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.protect_opportunity_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  old_code text;
  new_code text;
  draft_id uuid;
  awaiting_review_id uuid;
begin
  if public.is_platform_admin() then
    return new;
  end if;

  select id into draft_id from public.opportunity_statuses where code = 'draft';
  select id into awaiting_review_id from public.opportunity_statuses where code = 'awaiting_review';

  if TG_OP = 'INSERT' then
    if new.status_id is null or new.status_id not in (draft_id, awaiting_review_id) then
      new.status_id := awaiting_review_id;
    end if;
    new.review_note := null;
    new.reviewed_by := null;
    new.reviewed_at := null;
    return new;
  end if;

  if new.status_id is distinct from old.status_id then
    select code into old_code from public.opportunity_statuses where id = old.status_id;
    select code into new_code from public.opportunity_statuses where id = new.status_id;

    if not (
      (old_code = 'draft' and new_code = 'awaiting_review')
      or (old_code = 'needs_correction' and new_code = 'awaiting_review')
      or (old_code in ('published', 'amended', 'deadline_extended') and new_code = 'amended')
      or (old_code in ('published', 'amended', 'deadline_extended') and new_code = 'deadline_extended')
      or (old_code in ('published', 'amended', 'deadline_extended', 'closed') and new_code = 'awarded')
      or (old_code in ('draft', 'awaiting_review', 'needs_correction', 'published', 'amended', 'deadline_extended') and new_code = 'cancelled')
      or (old_code in ('published', 'amended', 'deadline_extended') and new_code = 'closed')
    ) then
      new.status_id := old.status_id;
    end if;
  end if;

  -- Non-admins can never grant themselves review sign-off fields.
  new.review_note := old.review_note;
  new.reviewed_by := old.reviewed_by;
  new.reviewed_at := old.reviewed_at;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.protect_platform_role()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.platform_role is distinct from old.platform_role and not public.is_platform_admin() then
    new.platform_role := old.platform_role;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.protect_service_request_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if public.is_platform_admin() then
    return new;
  end if;

  if TG_OP = 'UPDATE' then
    if new.status is distinct from old.status and new.status <> 'cancelled' then
      new.status := old.status;
    end if;
    new.quote_amount := old.quote_amount;
    new.quote_currency := old.quote_currency;
    new.assigned_to := old.assigned_to;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.protect_service_request_fulfillment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not is_platform_admin() then
    if new.status is distinct from old.status and new.status <> 'cancelled' then
      new.status := old.status;
    end if;
    new.quote_amount := old.quote_amount;
    new.quote_currency := old.quote_currency;
    new.assigned_to := old.assigned_to;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.protect_subscription_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_platform_admin() then
    new.status := 'pending';
    new.approved_by := null;
    new.approved_at := null;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.resolve_tracking_link(p_code text, p_referrer text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  v_org_id uuid;
  v_target_url text;
begin
  select id, org_id, target_url into v_id, v_org_id, v_target_url
  from tracking_links
  where short_code = p_code;

  if v_id is null then
    return null;
  end if;

  update tracking_links set click_count = click_count + 1 where id = v_id;
  insert into tracking_link_clicks (tracking_link_id, org_id, referrer) values (v_id, v_org_id, p_referrer);

  return v_target_url;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.run_campaign_health_check()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_platform_admin() then
    raise exception 'Admin access required';
  end if;
  return public.run_campaign_health_sweep();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.run_campaign_health_sweep()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  affected integer := 0;
  rec record;
  admin_id uuid;
begin
  -- Flag 1: campaigns sitting in Draft/Planning for a week+ with no content drafted at all.
  for rec in
    select c.id, c.org_id, c.name
    from campaigns c
    where c.status in ('Draft','Planning')
      and c.created_at < now() - interval '7 days'
      and not exists (select 1 from content_items ci where ci.campaign_id = c.id)
  loop
    for admin_id in select id from profiles where platform_role = 'admin' loop
      if not exists (
        select 1 from notifications n
        where n.user_id = admin_id and n.category = 'campaign_health'
          and n.metadata->>'campaign_id' = rec.id::text and n.metadata->>'flag' = 'no_content'
      ) then
        insert into notifications (user_id, org_id, category, title, body, link_url, channel, metadata)
        values (admin_id, rec.org_id, 'campaign_health', 'No content drafted yet: ' || rec.name,
          'This campaign has been in planning for over a week with no content drafted.',
          null, 'in_app', jsonb_build_object('campaign_id', rec.id, 'flag', 'no_content'));
        affected := affected + 1;
      end if;
    end loop;
  end loop;

  -- Flag 2: campaign end_date has passed but status is still Active.
  for rec in
    select c.id, c.org_id, c.name
    from campaigns c
    where c.status = 'Active' and c.end_date is not null and c.end_date < current_date
  loop
    for admin_id in select id from profiles where platform_role = 'admin' loop
      if not exists (
        select 1 from notifications n
        where n.user_id = admin_id and n.category = 'campaign_health'
          and n.metadata->>'campaign_id' = rec.id::text and n.metadata->>'flag' = 'ended_but_active'
      ) then
        insert into notifications (user_id, org_id, category, title, body, link_url, channel, metadata)
        values (admin_id, rec.org_id, 'campaign_health', 'Campaign end date has passed: ' || rec.name,
          'This campaign''s end date has passed but it is still marked Active. Update its status.',
          null, 'in_app', jsonb_build_object('campaign_id', rec.id, 'flag', 'ended_but_active'));
        affected := affected + 1;
      end if;
    end loop;
  end loop;

  -- Flag 3: Active campaign with a linked tracking link but zero clicks in the last 7 days.
  for rec in
    select c.id, c.org_id, c.name
    from campaigns c
    where c.status = 'Active'
      and c.created_at < now() - interval '7 days'
      and exists (select 1 from tracking_links tl where tl.campaign_id = c.id)
      and not exists (
        select 1 from tracking_links tl
        join tracking_link_clicks tlc on tlc.tracking_link_id = tl.id
        where tl.campaign_id = c.id and tlc.clicked_at > now() - interval '7 days'
      )
  loop
    for admin_id in select id from profiles where platform_role = 'admin' loop
      if not exists (
        select 1 from notifications n
        where n.user_id = admin_id and n.category = 'campaign_health'
          and n.metadata->>'campaign_id' = rec.id::text and n.metadata->>'flag' = 'low_activity'
      ) then
        insert into notifications (user_id, org_id, category, title, body, link_url, channel, metadata)
        values (admin_id, rec.org_id, 'campaign_health', 'Low click activity: ' || rec.name,
          'This active campaign has had no tracking-link clicks in the last 7 days.',
          null, 'in_app', jsonb_build_object('campaign_id', rec.id, 'flag', 'low_activity'));
        affected := affected + 1;
      end if;
    end loop;
  end loop;

  return affected;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.run_deadline_reminder_sweep(p_days_ahead integer DEFAULT 3)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  affected integer;
begin
  insert into public.notifications (user_id, category, title, body, link_url, channel, metadata)
  select so.user_id, 'deadline_reminder', 'Deadline approaching: ' || o.title,
    'Submission deadline is ' || to_char(o.submission_deadline, 'DD Mon YYYY'),
    '/tenders/' || o.slug, 'in_app', jsonb_build_object('opportunity_id', o.id)
  from public.saved_opportunities so
  join public.opportunities o on o.id = so.opportunity_id
  join public.opportunity_statuses s on s.id = o.status_id
  where s.code in ('published', 'amended', 'deadline_extended')
    and o.submission_deadline between now() and now() + (p_days_ahead || ' days')::interval
    and not exists (
      select 1 from public.notifications n
      where n.user_id = so.user_id and n.category = 'deadline_reminder' and n.metadata->>'opportunity_id' = o.id::text
    );
  get diagnostics affected = row_count;
  return affected;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.track_advert_click(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.adverts set click_count = click_count + 1
  where id = p_id and status = 'live';
  if found then
    insert into public.advert_events (advert_id, kind) values (p_id, 'click');
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.track_advert_view(p_slug text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid;
begin
  update public.adverts set view_count = view_count + 1
  where slug = p_slug and status = 'live'
  returning id into v_id;
  if v_id is not null then
    insert into public.advert_events (advert_id, kind) values (v_id, 'view');
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.user_has_tender_feature(p_feature_key text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from organization_members om
    where om.user_id = auth.uid()
      and public.org_has_feature(om.org_id, p_feature_key)
  );
$function$
;

-- ===== TRIGGERS =====
CREATE TRIGGER notify_matching_users_on_publish_trigger AFTER UPDATE ON public.opportunities FOR EACH ROW EXECUTE FUNCTION notify_matching_users_on_publish();
CREATE TRIGGER protect_opportunity_transition_trigger BEFORE INSERT OR UPDATE ON public.opportunities FOR EACH ROW EXECUTE FUNCTION protect_opportunity_transition();
CREATE TRIGGER protect_buyer_mode_activation_trigger BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION protect_buyer_mode_activation();
CREATE TRIGGER protect_platform_role_trigger BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION protect_platform_role();
CREATE TRIGGER protect_service_request_fields_trigger BEFORE UPDATE ON public.service_requests FOR EACH ROW EXECUTE FUNCTION protect_service_request_fields();
CREATE TRIGGER protect_service_request_fulfillment_trigger BEFORE UPDATE ON public.service_requests FOR EACH ROW EXECUTE FUNCTION protect_service_request_fulfillment();
CREATE TRIGGER protect_subscription_fields_trigger BEFORE INSERT OR UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION protect_subscription_fields();

-- ===== ENABLE RLS =====
alter table public.ad_campaigns enable row level security;
alter table public.advert_events enable row level security;
alter table public.advertisement_requests enable row level security;
alter table public.adverts enable row level security;
alter table public.audience_segments enable row level security;
alter table public.audit_logs enable row level security;
alter table public.brand_kits enable row level security;
alter table public.buyer_profiles enable row level security;
alter table public.campaigns enable row level security;
alter table public.categories enable row level security;
alter table public.content_items enable row level security;
alter table public.countries enable row level security;
alter table public.currencies enable row level security;
alter table public.directory_profiles enable row level security;
alter table public.districts enable row level security;
alter table public.followed_buyers enable row level security;
alter table public.followed_sectors enable row level security;
alter table public.funding_agencies enable row level security;
alter table public.influencer_profiles enable row level security;
alter table public.leads enable row level security;
alter table public.media_assets enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notifications enable row level security;
alter table public.opportunities enable row level security;
alter table public.opportunity_amendments enable row level security;
alter table public.opportunity_awards enable row level security;
alter table public.opportunity_categories enable row level security;
alter table public.opportunity_documents enable row level security;
alter table public.opportunity_responses enable row level security;
alter table public.opportunity_statuses enable row level security;
alter table public.opportunity_types enable row level security;
alter table public.organization_members enable row level security;
alter table public.organizations enable row level security;
alter table public.pipeline_records enable row level security;
alter table public.pipeline_tasks enable row level security;
alter table public.plan_features enable row level security;
alter table public.plans enable row level security;
alter table public.procurement_methods enable row level security;
alter table public.profiles enable row level security;
alter table public.saved_opportunities enable row level security;
alter table public.saved_searches enable row level security;
alter table public.sectors enable row level security;
alter table public.service_request_activities enable row level security;
alter table public.service_requests enable row level security;
alter table public.social_connections enable row level security;
alter table public.subscriptions enable row level security;
alter table public.supplier_profiles enable row level security;
alter table public.supplier_sectors enable row level security;
alter table public.tracking_link_clicks enable row level security;
alter table public.tracking_links enable row level security;
alter table public.verification_requests enable row level security;

-- ===== STORAGE BUCKETS =====
insert into storage.buckets (id,name,public) values ('advert-creatives','advert-creatives','t') on conflict (id) do nothing;
insert into storage.buckets (id,name,public) values ('media-assets','media-assets','f') on conflict (id) do nothing;
insert into storage.buckets (id,name,public) values ('private-documents','private-documents','f') on conflict (id) do nothing;
insert into storage.buckets (id,name,public) values ('public-assets','public-assets','t') on conflict (id) do nothing;

-- ===== POLICIES =====
create policy ad_campaigns_admin_all on public.ad_campaigns as permissive for all to public using (is_platform_admin()) with check (is_platform_admin());
create policy advert_events_admin_read on public.advert_events as permissive for select to public using (is_platform_admin());
create policy "Admins fulfill advertisement requests" on public.advertisement_requests as permissive for update to public using (is_platform_admin()) with check (is_platform_admin());
create policy "Entitled members can submit advertisement requests" on public.advertisement_requests as permissive for insert to public with check ((is_org_member(org_id) AND org_has_feature(org_id, 'business_advertising'::text) AND (requested_by = auth.uid())));
create policy "Members can view their org's advertisement requests" on public.advertisement_requests as permissive for select to public using ((is_org_member(org_id) OR is_platform_admin()));
create policy adverts_admin_all on public.adverts as permissive for all to public using (is_platform_admin()) with check (is_platform_admin());
create policy adverts_public_read on public.adverts as permissive for select to public using (((status = 'live'::text) AND ((starts_at IS NULL) OR (starts_at <= now())) AND ((ends_at IS NULL) OR (ends_at >= now()))));
create policy "Admins manage audience segments" on public.audience_segments as permissive for all to public using ((is_org_member(org_id) AND is_platform_admin())) with check ((is_org_member(org_id) AND is_platform_admin()));
create policy "Admins can view all audit logs" on public.audit_logs as permissive for select to public using (is_platform_admin());
create policy "Org members can view their org audit logs" on public.audit_logs as permissive for select to public using (((org_id IS NOT NULL) AND is_org_member(org_id)));
create policy "Admins manage brand kit" on public.brand_kits as permissive for all to public using ((is_org_member(org_id) AND is_platform_admin())) with check ((is_org_member(org_id) AND is_platform_admin()));
create policy "Anyone can view buyer profiles" on public.buyer_profiles as permissive for select to public using (true);
create policy "Org members manage their buyer profile" on public.buyer_profiles as permissive for all to public using (is_org_member(org_id)) with check (is_org_member(org_id));
create policy "Admins manage campaigns" on public.campaigns as permissive for all to public using ((is_org_member(org_id) AND is_platform_admin())) with check ((is_org_member(org_id) AND is_platform_admin()));
create policy "Admins manage categories" on public.categories as permissive for all to public using (is_platform_admin()) with check (is_platform_admin());
create policy "Public can view active categories" on public.categories as permissive for select to public using ((is_active OR is_platform_admin()));
create policy "Admins manage content" on public.content_items as permissive for all to public using ((is_org_member(org_id) AND is_platform_admin())) with check ((is_org_member(org_id) AND is_platform_admin()));
create policy "Admins manage countries" on public.countries as permissive for all to public using (is_platform_admin()) with check (is_platform_admin());
create policy "Public can view active countries" on public.countries as permissive for select to public using ((is_active OR is_platform_admin()));
create policy "Admins manage currencies" on public.currencies as permissive for all to public using (is_platform_admin()) with check (is_platform_admin());
create policy "Public can view active currencies" on public.currencies as permissive for select to public using ((is_active OR is_platform_admin()));
create policy "Admins manage directory" on public.directory_profiles as permissive for all to public using (is_platform_admin()) with check (is_platform_admin());
create policy "Admins manage districts" on public.districts as permissive for all to public using (is_platform_admin()) with check (is_platform_admin());
create policy "Public can view active districts" on public.districts as permissive for select to public using ((is_active OR is_platform_admin()));
create policy "Users manage their own followed buyers" on public.followed_buyers as permissive for all to public using ((user_id = auth.uid())) with check ((user_id = auth.uid()));
create policy "Users manage their own followed sectors" on public.followed_sectors as permissive for all to public using ((user_id = auth.uid())) with check ((user_id = auth.uid()));
create policy "Admins manage funding agencies" on public.funding_agencies as permissive for all to public using (is_platform_admin()) with check (is_platform_admin());
create policy "Public can view active funding agencies" on public.funding_agencies as permissive for select to public using ((is_active OR is_platform_admin()));
create policy "Admins manage influencers" on public.influencer_profiles as permissive for all to public using (is_platform_admin()) with check (is_platform_admin());
create policy "Admins manage leads" on public.leads as permissive for all to public using ((is_org_member(org_id) AND is_platform_admin())) with check ((is_org_member(org_id) AND is_platform_admin()));
create policy "Admins manage media assets" on public.media_assets as permissive for all to public using ((is_org_member(org_id) AND is_platform_admin())) with check ((is_org_member(org_id) AND is_platform_admin()));
create policy "Users manage their own notification preferences" on public.notification_preferences as permissive for all to public using ((user_id = auth.uid())) with check ((user_id = auth.uid()));
create policy "Users can mark their own notifications read" on public.notifications as permissive for update to public using ((user_id = auth.uid())) with check ((user_id = auth.uid()));
create policy "Users can view their own notifications" on public.notifications as permissive for select to public using ((user_id = auth.uid()));
create policy "Admins can delete opportunities" on public.opportunities as permissive for delete to public using (is_platform_admin());
create policy "Buyer org members can create opportunities" on public.opportunities as permissive for insert to public with check ((is_platform_admin() OR ((buyer_org_id IS NOT NULL) AND is_org_member(buyer_org_id) AND (EXISTS ( SELECT 1
   FROM organizations o
  WHERE ((o.id = opportunities.buyer_org_id) AND o.is_buyer))))));
create policy "Buyer org members can update their opportunities" on public.opportunities as permissive for update to public using ((is_platform_admin() OR ((buyer_org_id IS NOT NULL) AND is_org_member(buyer_org_id))));
create policy "Public can view published opportunities" on public.opportunities as permissive for select to public using (((EXISTS ( SELECT 1
   FROM opportunity_statuses s
  WHERE ((s.id = opportunities.status_id) AND (s.code = ANY (ARRAY['published'::text, 'amended'::text, 'deadline_extended'::text, 'closed'::text, 'awarded'::text]))))) OR ((buyer_org_id IS NOT NULL) AND is_org_member(buyer_org_id)) OR is_platform_admin()));
create policy "Amendment visibility follows opportunity visibility" on public.opportunity_amendments as permissive for select to public using ((EXISTS ( SELECT 1
   FROM opportunities o
  WHERE ((o.id = opportunity_amendments.opportunity_id) AND (is_opportunity_publicly_visible(o.id) OR ((o.buyer_org_id IS NOT NULL) AND is_org_member(o.buyer_org_id)) OR is_platform_admin())))));
create policy "Buyer org members can log amendments to their opportunities" on public.opportunity_amendments as permissive for insert to public with check ((is_platform_admin() OR (EXISTS ( SELECT 1
   FROM opportunities o
  WHERE ((o.id = opportunity_amendments.opportunity_id) AND (o.buyer_org_id IS NOT NULL) AND is_org_member(o.buyer_org_id))))));
create policy "Award visibility follows opportunity visibility" on public.opportunity_awards as permissive for select to public using ((EXISTS ( SELECT 1
   FROM opportunities o
  WHERE ((o.id = opportunity_awards.opportunity_id) AND (is_opportunity_publicly_visible(o.id) OR ((o.buyer_org_id IS NOT NULL) AND is_org_member(o.buyer_org_id)) OR is_platform_admin())))));
create policy "Buyer org members manage awards for their opportunities" on public.opportunity_awards as permissive for all to public using ((is_platform_admin() OR (EXISTS ( SELECT 1
   FROM opportunities o
  WHERE ((o.id = opportunity_awards.opportunity_id) AND (o.buyer_org_id IS NOT NULL) AND is_org_member(o.buyer_org_id)))))) with check ((is_platform_admin() OR (EXISTS ( SELECT 1
   FROM opportunities o
  WHERE ((o.id = opportunity_awards.opportunity_id) AND (o.buyer_org_id IS NOT NULL) AND is_org_member(o.buyer_org_id))))));
create policy "Buyer org members manage their opportunity categories" on public.opportunity_categories as permissive for all to public using ((is_platform_admin() OR (EXISTS ( SELECT 1
   FROM opportunities o
  WHERE ((o.id = opportunity_categories.opportunity_id) AND (o.buyer_org_id IS NOT NULL) AND is_org_member(o.buyer_org_id)))))) with check ((is_platform_admin() OR (EXISTS ( SELECT 1
   FROM opportunities o
  WHERE ((o.id = opportunity_categories.opportunity_id) AND (o.buyer_org_id IS NOT NULL) AND is_org_member(o.buyer_org_id))))));
create policy "Opportunity categories follow opportunity visibility" on public.opportunity_categories as permissive for select to public using ((is_opportunity_publicly_visible(opportunity_id) OR (EXISTS ( SELECT 1
   FROM opportunities o
  WHERE ((o.id = opportunity_categories.opportunity_id) AND (o.buyer_org_id IS NOT NULL) AND is_org_member(o.buyer_org_id)))) OR is_platform_admin()));
create policy "Buyer org members manage their opportunity documents" on public.opportunity_documents as permissive for all to public using ((is_platform_admin() OR (EXISTS ( SELECT 1
   FROM opportunities o
  WHERE ((o.id = opportunity_documents.opportunity_id) AND (o.buyer_org_id IS NOT NULL) AND is_org_member(o.buyer_org_id)))))) with check ((is_platform_admin() OR (EXISTS ( SELECT 1
   FROM opportunities o
  WHERE ((o.id = opportunity_documents.opportunity_id) AND (o.buyer_org_id IS NOT NULL) AND is_org_member(o.buyer_org_id))))));
create policy "Public documents follow opportunity visibility" on public.opportunity_documents as permissive for select to public using (((is_public AND is_opportunity_publicly_visible(opportunity_id) AND (user_has_tender_feature('tender_alerts_and_details'::text) OR user_has_tender_feature('tender_publishing'::text))) OR (EXISTS ( SELECT 1
   FROM opportunities o
  WHERE ((o.id = opportunity_documents.opportunity_id) AND (o.buyer_org_id IS NOT NULL) AND is_org_member(o.buyer_org_id)))) OR is_platform_admin()));
create policy opp_responses_delete on public.opportunity_responses as permissive for delete to public using ((is_org_member(org_id) OR is_platform_admin()));
create policy opp_responses_insert on public.opportunity_responses as permissive for insert to public with check ((is_org_member(org_id) AND (user_has_tender_feature('tender_alerts_and_details'::text) OR user_has_tender_feature('tender_publishing'::text))));
create policy opp_responses_select on public.opportunity_responses as permissive for select to public using ((is_org_member(org_id) OR is_platform_admin() OR (EXISTS ( SELECT 1
   FROM opportunities o
  WHERE ((o.id = opportunity_responses.opportunity_id) AND (o.buyer_org_id IS NOT NULL) AND is_org_member(o.buyer_org_id))))));
create policy opp_responses_update on public.opportunity_responses as permissive for update to public using ((is_org_member(org_id) OR is_platform_admin())) with check ((is_org_member(org_id) OR is_platform_admin()));
create policy "Admins manage opportunity statuses" on public.opportunity_statuses as permissive for all to public using (is_platform_admin()) with check (is_platform_admin());
create policy "Public can view opportunity statuses" on public.opportunity_statuses as permissive for select to public using (true);
create policy "Admins manage opportunity types" on public.opportunity_types as permissive for all to public using (is_platform_admin()) with check (is_platform_admin());
create policy "Public can view active opportunity types" on public.opportunity_types as permissive for select to public using ((is_active OR is_platform_admin()));
create policy "Members can view org membership" on public.organization_members as permissive for select to public using (is_org_member(org_id));
create policy "Org owners can remove other members" on public.organization_members as permissive for delete to public using (((EXISTS ( SELECT 1
   FROM organization_members om
  WHERE ((om.org_id = organization_members.org_id) AND (om.user_id = auth.uid()) AND (om.role = 'owner'::text)))) AND (user_id <> auth.uid())));
create policy "Members can view their orgs" on public.organizations as permissive for select to public using (is_org_member(id));
create policy "Owners and admins can update their org" on public.organizations as permissive for update to public using ((EXISTS ( SELECT 1
   FROM organization_members
  WHERE ((organization_members.org_id = organizations.id) AND (organization_members.user_id = auth.uid()) AND (organization_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));
create policy "Org members manage their own pipeline records" on public.pipeline_records as permissive for all to public using (is_org_member(org_id)) with check (is_org_member(org_id));
create policy "Org members manage their own pipeline tasks" on public.pipeline_tasks as permissive for all to public using ((EXISTS ( SELECT 1
   FROM pipeline_records pr
  WHERE ((pr.id = pipeline_tasks.pipeline_record_id) AND is_org_member(pr.org_id))))) with check ((EXISTS ( SELECT 1
   FROM pipeline_records pr
  WHERE ((pr.id = pipeline_tasks.pipeline_record_id) AND is_org_member(pr.org_id)))));
create policy "Admins manage plan features" on public.plan_features as permissive for all to public using (is_platform_admin()) with check (is_platform_admin());
create policy "Anyone can view features of visible plans" on public.plan_features as permissive for select to public using ((EXISTS ( SELECT 1
   FROM plans p
  WHERE ((p.id = plan_features.plan_id) AND (p.is_active OR is_platform_admin())))));
create policy "Admins manage plans" on public.plans as permissive for all to public using (is_platform_admin()) with check (is_platform_admin());
create policy "Anyone can view active plans" on public.plans as permissive for select to public using ((is_active OR is_platform_admin()));
create policy "Admins manage procurement methods" on public.procurement_methods as permissive for all to public using (is_platform_admin()) with check (is_platform_admin());
create policy "Public can view active procurement methods" on public.procurement_methods as permissive for select to public using ((is_active OR is_platform_admin()));
create policy "Admins can update any profile" on public.profiles as permissive for update to public using (is_platform_admin());
create policy "Admins can view all profiles" on public.profiles as permissive for select to public using (is_platform_admin());
create policy "Org members can view fellow members' profiles" on public.profiles as permissive for select to public using ((EXISTS ( SELECT 1
   FROM (organization_members om1
     JOIN organization_members om2 ON ((om1.org_id = om2.org_id)))
  WHERE ((om1.user_id = auth.uid()) AND (om2.user_id = profiles.id)))));
create policy "Users can update own profile" on public.profiles as permissive for update to public using ((auth.uid() = id));
create policy "Users can view own profile" on public.profiles as permissive for select to public using ((auth.uid() = id));
create policy "Users manage their own saved opportunities" on public.saved_opportunities as permissive for all to public using ((user_id = auth.uid())) with check ((user_id = auth.uid()));
create policy "Users manage their own saved searches" on public.saved_searches as permissive for all to public using ((user_id = auth.uid())) with check ((user_id = auth.uid()));
create policy "Admins manage sectors" on public.sectors as permissive for all to public using (is_platform_admin()) with check (is_platform_admin());
create policy "Public can view active sectors" on public.sectors as permissive for select to public using ((is_active OR is_platform_admin()));
create policy "Admins can add any note" on public.service_request_activities as permissive for insert to public with check ((is_platform_admin() AND (author_id = auth.uid())));
create policy "Customer notes visible to org and admin, internal notes admin-o" on public.service_request_activities as permissive for select to public using ((((NOT is_internal) AND (EXISTS ( SELECT 1
   FROM service_requests sr
  WHERE ((sr.id = service_request_activities.request_id) AND is_org_member(sr.org_id))))) OR is_platform_admin()));
create policy "Org members can add customer-visible notes" on public.service_request_activities as permissive for insert to public with check (((NOT is_internal) AND (author_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM service_requests sr
  WHERE ((sr.id = service_request_activities.request_id) AND is_org_member(sr.org_id))))));
create policy "Org members and admins can update service requests" on public.service_requests as permissive for update to public using ((is_org_member(org_id) OR is_platform_admin()));
create policy "Org members and admins can view their service requests" on public.service_requests as permissive for select to public using ((is_org_member(org_id) OR is_platform_admin()));
create policy "Org members can create service requests" on public.service_requests as permissive for insert to public with check ((is_org_member(org_id) AND (requested_by = auth.uid())));
create policy "Admins manage social connections" on public.social_connections as permissive for all to public using ((is_org_member(org_id) AND is_platform_admin())) with check ((is_org_member(org_id) AND is_platform_admin()));
create policy "Admins manage all subscriptions" on public.subscriptions as permissive for all to public using (is_platform_admin()) with check (is_platform_admin());
create policy "Org members can request a subscription" on public.subscriptions as permissive for insert to public with check (is_org_member(org_id));
create policy "Org members can update their pending subscription" on public.subscriptions as permissive for update to public using (is_org_member(org_id));
create policy "Org members can view their subscription" on public.subscriptions as permissive for select to public using (is_org_member(org_id));
create policy "Anyone can view public supplier profiles" on public.supplier_profiles as permissive for select to public using ((is_public OR is_org_member(org_id) OR is_platform_admin()));
create policy "Org members manage their supplier profile" on public.supplier_profiles as permissive for all to public using (is_org_member(org_id)) with check (is_org_member(org_id));
create policy "Anyone can view supplier sectors of visible profiles" on public.supplier_sectors as permissive for select to public using ((EXISTS ( SELECT 1
   FROM supplier_profiles sp
  WHERE ((sp.org_id = supplier_sectors.org_id) AND (sp.is_public OR is_org_member(sp.org_id) OR is_platform_admin())))));
create policy "Org members manage their supplier sectors" on public.supplier_sectors as permissive for all to public using (is_org_member(org_id)) with check (is_org_member(org_id));
create policy "Admins view tracking link clicks" on public.tracking_link_clicks as permissive for select to public using ((is_org_member(org_id) AND is_platform_admin()));
create policy "Admins manage tracking links" on public.tracking_links as permissive for all to public using ((is_org_member(org_id) AND is_platform_admin())) with check ((is_org_member(org_id) AND is_platform_admin()));
create policy "Admins manage all verification requests" on public.verification_requests as permissive for update to public using (is_platform_admin()) with check (is_platform_admin());
create policy "Org members and admins can view their verification requests" on public.verification_requests as permissive for select to public using ((is_org_member(org_id) OR is_platform_admin()));
create policy "Org members can submit verification requests" on public.verification_requests as permissive for insert to public with check ((is_org_member(org_id) AND (submitted_by = auth.uid()) AND (status = 'submitted'::text)));
create policy "Admins manage their media-assets folder" on storage.objects as permissive for all to public using (((bucket_id = 'media-assets'::text) AND is_org_member(((storage.foldername(name))[1])::uuid) AND is_platform_admin())) with check (((bucket_id = 'media-assets'::text) AND is_org_member(((storage.foldername(name))[1])::uuid) AND is_platform_admin()));
create policy "Org members can delete their public-assets folder" on storage.objects as permissive for delete to public using (((bucket_id = 'public-assets'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)));
create policy "Org members can manage their private-documents folder" on storage.objects as permissive for all to public using (((bucket_id = 'private-documents'::text) AND is_org_member(((storage.foldername(name))[1])::uuid))) with check (((bucket_id = 'private-documents'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)));
create policy "Org members can manage their public-assets folder" on storage.objects as permissive for insert to public with check (((bucket_id = 'public-assets'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)));
create policy "Org members can update their public-assets folder" on storage.objects as permissive for update to public using (((bucket_id = 'public-assets'::text) AND is_org_member(((storage.foldername(name))[1])::uuid)));
create policy "Public read for public-assets" on storage.objects as permissive for select to public using ((bucket_id = 'public-assets'::text));
create policy advert_creatives_insert on storage.objects as permissive for insert to authenticated with check ((bucket_id = 'advert-creatives'::text));
create policy advert_creatives_read on storage.objects as permissive for select to public using ((bucket_id = 'advert-creatives'::text));

-- ===== REFERENCE DATA =====
insert into public.currencies (code,name,symbol,is_active) values ('SLE','Sierra Leonean Leone','Le','t'),
('USD','US Dollar','$','t'),
('LRD','Liberian Dollar','L$','t') on conflict (code) do nothing;
insert into public.countries (id,code,name,currency_code,is_active,sort_order,created_at) values ('da1382eb-f5ec-4eea-92eb-587572be9364','SL','Sierra Leone','SLE','t','0','2026-07-21 15:41:20.95047+00'),
('180c5cd4-6be4-4b9e-8f45-385a8e342d64','LR','Liberia','LRD','t','1','2026-07-21 18:08:05.826971+00') on conflict (id) do nothing;
insert into public.districts (id,country_id,name,is_active,sort_order,created_at) values ('601c7a7a-84c3-4b89-ba63-8aeaf8721409','da1382eb-f5ec-4eea-92eb-587572be9364','Western Area Urban','t','1','2026-07-21 15:41:20.95047+00'),
('736f0b11-25fc-40c7-b71b-6b9ec305a602','da1382eb-f5ec-4eea-92eb-587572be9364','Western Area Rural','t','2','2026-07-21 15:41:20.95047+00'),
('db2b8c76-be74-43f6-9e41-eced0db11b4f','da1382eb-f5ec-4eea-92eb-587572be9364','Bo','t','3','2026-07-21 15:41:20.95047+00'),
('3d897f39-d477-4345-8be6-a320f346f727','da1382eb-f5ec-4eea-92eb-587572be9364','Bombali','t','4','2026-07-21 15:41:20.95047+00'),
('40771bb2-6b55-4139-a2f2-d0794d545bf6','da1382eb-f5ec-4eea-92eb-587572be9364','Bonthe','t','5','2026-07-21 15:41:20.95047+00'),
('b458de86-08e5-4707-89a7-3fde5474ac72','da1382eb-f5ec-4eea-92eb-587572be9364','Falaba','t','6','2026-07-21 15:41:20.95047+00'),
('adb80b86-8d3b-464b-903f-253d53f02596','da1382eb-f5ec-4eea-92eb-587572be9364','Kailahun','t','7','2026-07-21 15:41:20.95047+00'),
('41397d7f-7d5b-404b-97c2-c86a19fc19c7','da1382eb-f5ec-4eea-92eb-587572be9364','Kambia','t','8','2026-07-21 15:41:20.95047+00'),
('34511b86-f20c-4b08-9915-7c90af79f61a','da1382eb-f5ec-4eea-92eb-587572be9364','Karene','t','9','2026-07-21 15:41:20.95047+00'),
('85569773-5bad-4e65-86db-d4d2c9d1d231','da1382eb-f5ec-4eea-92eb-587572be9364','Kenema','t','10','2026-07-21 15:41:20.95047+00'),
('29be7e5d-b48d-49d3-9a8c-83759cce1b9e','da1382eb-f5ec-4eea-92eb-587572be9364','Koinadugu','t','11','2026-07-21 15:41:20.95047+00'),
('c11c0b44-ffbf-4d5f-8c5d-6a54638364c7','da1382eb-f5ec-4eea-92eb-587572be9364','Kono','t','12','2026-07-21 15:41:20.95047+00'),
('9d13181b-7212-4c9d-a7a7-6c01bc015dfa','da1382eb-f5ec-4eea-92eb-587572be9364','Moyamba','t','13','2026-07-21 15:41:20.95047+00'),
('7159ab72-9541-42cc-af4f-023f9a291ff0','da1382eb-f5ec-4eea-92eb-587572be9364','Port Loko','t','14','2026-07-21 15:41:20.95047+00'),
('93ed568b-5880-4601-aae9-cb1d0d83959a','da1382eb-f5ec-4eea-92eb-587572be9364','Pujehun','t','15','2026-07-21 15:41:20.95047+00'),
('8f5e68b0-81a8-4796-b26b-5808a6ec3682','da1382eb-f5ec-4eea-92eb-587572be9364','Tonkolili','t','16','2026-07-21 15:41:20.95047+00'),
('581e9018-4cfb-43bb-8879-c93023747a82','180c5cd4-6be4-4b9e-8f45-385a8e342d64','Bomi','t','1','2026-07-21 18:08:05.826971+00'),
('3bfd6dc2-5a69-46db-b392-603d2f6a6cd2','180c5cd4-6be4-4b9e-8f45-385a8e342d64','Bong','t','2','2026-07-21 18:08:05.826971+00'),
('fdb16500-428f-4ed4-abc2-20d5325c7bcd','180c5cd4-6be4-4b9e-8f45-385a8e342d64','Gbarpolu','t','3','2026-07-21 18:08:05.826971+00'),
('ee7fbadf-98c4-4b6c-a8c2-fe6279dbf10f','180c5cd4-6be4-4b9e-8f45-385a8e342d64','Grand Bassa','t','4','2026-07-21 18:08:05.826971+00'),
('8b1fdf23-b111-4752-8c10-a92ee97c5ed7','180c5cd4-6be4-4b9e-8f45-385a8e342d64','Grand Cape Mount','t','5','2026-07-21 18:08:05.826971+00'),
('3acdf193-c094-4d34-9327-9dce57189dc6','180c5cd4-6be4-4b9e-8f45-385a8e342d64','Grand Gedeh','t','6','2026-07-21 18:08:05.826971+00'),
('8fdbaacd-08aa-423b-a8e1-46da2d387eb5','180c5cd4-6be4-4b9e-8f45-385a8e342d64','Grand Kru','t','7','2026-07-21 18:08:05.826971+00'),
('a1572c61-9d87-4971-8ea8-99165ee0e5d4','180c5cd4-6be4-4b9e-8f45-385a8e342d64','Lofa','t','8','2026-07-21 18:08:05.826971+00'),
('1027f945-8026-4fb2-ac58-0df00dfe3ed5','180c5cd4-6be4-4b9e-8f45-385a8e342d64','Margibi','t','9','2026-07-21 18:08:05.826971+00'),
('35874be8-6142-4a2a-b34c-92866fbb61d9','180c5cd4-6be4-4b9e-8f45-385a8e342d64','Maryland','t','10','2026-07-21 18:08:05.826971+00'),
('ebc9ec1f-7cb5-410b-918a-5def22c22dcd','180c5cd4-6be4-4b9e-8f45-385a8e342d64','Montserrado','t','11','2026-07-21 18:08:05.826971+00'),
('9cd680d6-1205-4c18-a1ea-0624e9dc3170','180c5cd4-6be4-4b9e-8f45-385a8e342d64','Nimba','t','12','2026-07-21 18:08:05.826971+00'),
('20d97846-d6cb-48c9-8e93-4b298d81e6af','180c5cd4-6be4-4b9e-8f45-385a8e342d64','River Cess','t','13','2026-07-21 18:08:05.826971+00'),
('f9d82205-646a-4e6a-a7a0-fcc7c81643b1','180c5cd4-6be4-4b9e-8f45-385a8e342d64','River Gee','t','14','2026-07-21 18:08:05.826971+00'),
('d11c7669-7db6-435d-98fd-fba4c10ed693','180c5cd4-6be4-4b9e-8f45-385a8e342d64','Sinoe','t','15','2026-07-21 18:08:05.826971+00') on conflict (id) do nothing;
insert into public.sectors (id,name,slug,is_active,sort_order,created_at) values ('a04f37fa-5a29-459f-9154-b0d2d442e0be','Agriculture','agriculture','t','1','2026-07-21 15:41:20.95047+00'),
('180df1ea-924c-4ccb-8284-c066cab91191','Construction & Infrastructure','construction-infrastructure','t','2','2026-07-21 15:41:20.95047+00'),
('c20face0-ebba-4733-a431-9f7d9edc78d8','Mining & Extractives','mining-extractives','t','3','2026-07-21 15:41:20.95047+00'),
('ad8136ce-6f75-4489-a234-db81b23065c3','Telecommunications & ICT','telecommunications-ict','t','4','2026-07-21 15:41:20.95047+00'),
('93e0fa5e-b80e-40af-9126-95ac9684fd4b','Financial Services','financial-services','t','5','2026-07-21 15:41:20.95047+00'),
('fe28f1ad-d45a-4ccb-b62a-1f8f06080817','Health','health','t','6','2026-07-21 15:41:20.95047+00'),
('3a3a8629-e31d-4627-8a5f-4156c1a0d575','Education','education','t','7','2026-07-21 15:41:20.95047+00'),
('e18ab78c-d560-432b-a1ce-a54a831f0680','Tourism & Hospitality','tourism-hospitality','t','8','2026-07-21 15:41:20.95047+00'),
('e1c8dc03-317f-4e8c-a428-e2fec9946864','Energy & Utilities','energy-utilities','t','9','2026-07-21 15:41:20.95047+00'),
('f1c2f60a-ba05-4246-a86a-c2bebfa8169a','Transport & Logistics','transport-logistics','t','10','2026-07-21 15:41:20.95047+00'),
('163b18f7-49cc-4c46-a362-96286df59b8a','Consulting & Professional Services','consulting-professional-services','t','11','2026-07-21 15:41:20.95047+00'),
('f73aa0bb-eaeb-414f-8143-d70968c87162','NGO & Development','ngo-development','t','12','2026-07-21 15:41:20.95047+00') on conflict (id) do nothing;
insert into public.opportunity_types (id,code,label,is_active,sort_order) values ('7ccc323b-42d3-4cf9-88b6-88f1d6966096','itb','Invitation to Tender','t','1'),
('89b89c68-226e-4df5-8861-ae69b2a9353f','rfp','Request for Proposal','t','2'),
('435e0454-6aec-4f8b-a1ed-fd73406348c4','rfq','Request for Quotation','t','3'),
('fb30d872-c0be-4fde-859a-b73c4c2133bf','eoi','Expression of Interest','t','4'),
('5675485b-f702-4d22-81f4-417f9c94053e','prequalification','Prequalification','t','5'),
('af5c5a84-4dc7-4935-82c0-761c5d1afa82','rfi','Request for Information','t','6'),
('60b14545-21fb-43cc-ab89-257bf3b2a761','gpn','General Procurement Notice','t','7'),
('065f2b36-2c05-432c-a508-37c1981e3e61','procurement_plan','Procurement Plan','t','8'),
('e4780a1c-470b-4474-bbc2-d0c2443c81b7','grant','Grant','t','9'),
('12580ac6-9739-4a35-a327-ef9557a7b22b','call_for_proposal','Call for Proposal','t','10'),
('af6c4f5c-5544-475c-883e-c0ab55450286','consultancy','Consultancy','t','11'),
('c44f8594-5e31-48db-bd17-0654e7d64956','supplier_registration','Supplier Registration','t','12'),
('8d53dc7b-02f5-4e6b-be6d-c709c802421d','auction','Auction','t','13'),
('22f74288-8ec7-40d9-b9ef-3c702b885142','contract_award','Contract Award','t','14'),
('aa1702fd-554d-44be-9af3-5b883c89b25f','consultant_vacancy','Vacancy for Consultant','t','15'),
('01a4ca00-87d7-4a62-81d9-26d5502a7e18','private_sector','Private-Sector Opportunity','t','16') on conflict (id) do nothing;
insert into public.opportunity_statuses (id,code,label,is_terminal,sort_order) values ('5648b633-d14e-4272-8b10-f977af93dcfc','draft','Draft','f','1'),
('e2d3782b-83ae-419b-b9a3-52f238066c28','awaiting_review','Awaiting Review','f','2'),
('9014490d-5bfa-4135-9888-ce7916afa877','needs_correction','Needs Correction','f','3'),
('0fe93d3a-9cf4-4666-884b-02ddac4c2d75','approved','Approved','f','4'),
('3ccf2295-3a65-4757-9eed-1f4b9b104e46','scheduled','Scheduled','f','5'),
('588571ce-54e2-400a-8096-789fc17e0ca9','published','Published','f','6'),
('6370a4b6-7d95-416c-b8eb-da26f12ced0d','amended','Amended','f','7'),
('58585e56-a98e-4449-9650-99b729cdaee9','deadline_extended','Deadline Extended','f','8'),
('bddf8e21-4a63-4f60-ae26-141951da19a9','closed','Closed','t','9'),
('5015b18b-eecd-47d5-a833-761a4b4d7f7a','awarded','Awarded','t','10'),
('953022ca-9000-47f5-9847-9fe255134e64','cancelled','Cancelled','t','11'),
('3648c777-a565-4fef-ac6a-242af1f40b85','archived','Archived','t','12'),
('3de86a5f-589b-4584-8511-968128816f9e','rejected','Rejected','t','13') on conflict (id) do nothing;
insert into public.procurement_methods (id,code,label,is_active,sort_order) values ('121b5b22-80e0-4fda-b378-2c464302dc29','ncb','National Competitive Bidding','t','1'),
('7665cd7d-e63d-4431-af19-5eb656f813a2','icb','International Competitive Bidding','t','2'),
('8afda182-0e16-40fe-9612-f0d0eed5f74f','rfq','Request for Quotations','t','3'),
('1061a900-ab1b-41b4-867b-c3aaa39ea4dd','single_source','Single-Source / Direct Procurement','t','4'),
('fc0f5931-e91c-4114-9460-a72a1fd38e77','restricted','Restricted Bidding','t','5'),
('11633c53-7b2f-429e-aec6-41ed4bef86b1','framework','Framework Agreement','t','6') on conflict (id) do nothing;
insert into public.plans (id,code,name,description,monthly_price,annual_price,currency_code,is_active,sort_order,created_at) values ('3333755f-5f1f-4551-aa94-91288f820800','free','Free','Basic search, limited saved opportunities, free tender publication for buyers.',NULL,NULL,'SLE','t','1','2026-07-21 15:41:20.95047+00'),
('0046ca27-be44-4610-8d5c-68d317000644','professional','Professional','Full tender details, documents, advanced filters, daily alerts.',NULL,NULL,'SLE','t','2','2026-07-21 15:41:20.95047+00'),
('524b960c-ada2-4b0b-a43f-2b13ff3d165a','business','Business','Everything in Professional plus WhatsApp alerts, AI summaries, team members.',NULL,NULL,'SLE','t','3','2026-07-21 15:41:20.95047+00'),
('a93ee950-2283-4ee6-9109-61164ff7d75b','enterprise','Enterprise','Multiple users, API access, advanced analytics, dedicated support.',NULL,NULL,'SLE','t','4','2026-07-21 15:41:20.95047+00') on conflict (id) do nothing;
insert into public.plan_features (id,plan_id,feature_key,feature_label,limit_value,created_at) values ('59217603-7508-4d12-a0f1-573849f8aa8c','3333755f-5f1f-4551-aa94-91288f820800','max_team_members','Team Members','1','2026-07-21 16:31:22.214045+00'),
('1b5186eb-3d17-4335-adba-36eb2c2930ec','0046ca27-be44-4610-8d5c-68d317000644','max_team_members','Team Members','3','2026-07-21 16:31:22.214045+00'),
('52c337cf-933b-422d-8b11-cd31d954c4fa','524b960c-ada2-4b0b-a43f-2b13ff3d165a','max_team_members','Team Members','10','2026-07-21 16:31:22.214045+00'),
('76b74f52-4beb-437b-9c42-cae5a7eafe44','a93ee950-2283-4ee6-9109-61164ff7d75b','max_team_members','Team Members',NULL,'2026-07-21 16:31:22.214045+00'),
('b9e837c8-aab5-4090-986f-ee9d9732cf06','3333755f-5f1f-4551-aa94-91288f820800','max_saved_searches','Saved Searches','3','2026-07-21 16:31:22.214045+00'),
('49864a6c-4685-40ba-af1f-e2838036b578','0046ca27-be44-4610-8d5c-68d317000644','max_saved_searches','Saved Searches','10','2026-07-21 16:31:22.214045+00'),
('c4d83ef4-807c-47c4-a37e-78ed52a91f27','524b960c-ada2-4b0b-a43f-2b13ff3d165a','max_saved_searches','Saved Searches','25','2026-07-21 16:31:22.214045+00'),
('fadd737a-6a36-4803-b613-f8c50fd63da5','a93ee950-2283-4ee6-9109-61164ff7d75b','max_saved_searches','Saved Searches',NULL,'2026-07-21 16:31:22.214045+00'),
('8e190ba6-9439-4887-88fa-a4a5daf54b47','3333755f-5f1f-4551-aa94-91288f820800','data_export','Data Exports','0','2026-07-21 16:45:42.954328+00'),
('6e19c457-7fe0-42a7-adde-d6702d3d85f5','0046ca27-be44-4610-8d5c-68d317000644','data_export','Data Exports','0','2026-07-21 16:45:42.954328+00'),
('312f5c2e-a595-46a5-9769-103e2a0fedf7','524b960c-ada2-4b0b-a43f-2b13ff3d165a','data_export','Data Exports','1','2026-07-21 16:45:42.954328+00'),
('5e2c3b6f-04c7-46b4-8b17-f67f13b7d7ed','a93ee950-2283-4ee6-9109-61164ff7d75b','data_export','Data Exports','1','2026-07-21 16:45:42.954328+00'),
('2fa9e262-c15e-455c-8266-d59bdf2e6116','3333755f-5f1f-4551-aa94-91288f820800','tender_alerts_and_details','Tender Detail Access & Alerts','0','2026-07-21 23:52:47.119743+00'),
('46486f91-ca07-4285-a2ea-65c86dd1a1c6','3333755f-5f1f-4551-aa94-91288f820800','tender_publishing','Publish Tenders','0','2026-07-21 23:52:47.119743+00'),
('80e6380b-fa86-4fcf-95a9-0088feafa234','0046ca27-be44-4610-8d5c-68d317000644','tender_alerts_and_details','Tender Detail Access & Alerts','1','2026-07-21 23:52:47.119743+00'),
('c6071c56-9d7d-4496-b4ca-a189a30a2ff6','0046ca27-be44-4610-8d5c-68d317000644','tender_publishing','Publish Tenders','0','2026-07-21 23:52:47.119743+00'),
('1496887d-0ea1-4c02-9310-e26682279650','524b960c-ada2-4b0b-a43f-2b13ff3d165a','tender_alerts_and_details','Tender Detail Access & Alerts','1','2026-07-21 23:52:47.119743+00'),
('be8d735a-aa18-4510-9fdd-93feb04acd27','524b960c-ada2-4b0b-a43f-2b13ff3d165a','tender_publishing','Publish Tenders','1','2026-07-21 23:52:47.119743+00'),
('3e1492fd-69cb-47c2-82ca-a64b18c64e2f','a93ee950-2283-4ee6-9109-61164ff7d75b','tender_alerts_and_details','Tender Detail Access & Alerts','1','2026-07-21 23:52:47.119743+00'),
('d4dc7060-9ed9-40b0-9830-dbd8d39fcda7','a93ee950-2283-4ee6-9109-61164ff7d75b','tender_publishing','Publish Tenders','1','2026-07-21 23:52:47.119743+00'),
('9f8eaa3e-2c1c-41c7-a798-c5e9d9a51cae','3333755f-5f1f-4551-aa94-91288f820800','business_advertising','Business Advertising Requests','0','2026-07-22 06:54:21.690952+00'),
('d8c767cc-07ec-4247-b43c-e4fadadecda7','0046ca27-be44-4610-8d5c-68d317000644','business_advertising','Business Advertising Requests','0','2026-07-22 06:54:21.690952+00'),
('84556445-0b96-454f-affa-37795080d516','524b960c-ada2-4b0b-a43f-2b13ff3d165a','business_advertising','Business Advertising Requests','1','2026-07-22 06:54:21.690952+00'),
('5f10b7e2-03fb-44bf-a6b9-2077791e3958','a93ee950-2283-4ee6-9109-61164ff7d75b','business_advertising','Business Advertising Requests','1','2026-07-22 06:54:21.690952+00') on conflict (id) do nothing;

-- ===== AUTH TRIGGER (creates a profiles row on signup) =====
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
