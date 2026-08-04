-- Dedicated payment evidence and atomic subscription approval/rejection.

begin;

create table if not exists public.subscription_payment_proofs (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null unique references public.subscriptions(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  payment_method text not null check (payment_method in ('bank_transfer', 'mobile_money')),
  payment_reference text not null check (length(trim(payment_reference)) between 3 and 120),
  amount numeric(14,2) check (amount is null or amount > 0),
  currency_code text not null default 'SLE' check (currency_code = 'SLE'),
  payer_name text check (payer_name is null or length(trim(payer_name)) <= 160),
  receipt_object_path text check (receipt_object_path is null or length(receipt_object_path) <= 500),
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  submitted_by uuid not null references auth.users(id) on delete restrict,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text check (review_note is null or length(review_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscription_payment_proofs_review_queue_idx
  on public.subscription_payment_proofs (status, created_at)
  where status = 'pending';
create index if not exists subscription_payment_proofs_org_idx
  on public.subscription_payment_proofs (org_id, created_at desc);
create index if not exists subscription_payment_proofs_submitted_by_idx
  on public.subscription_payment_proofs (submitted_by);
create index if not exists subscription_payment_proofs_reviewed_by_idx
  on public.subscription_payment_proofs (reviewed_by)
  where reviewed_by is not null;

alter table public.subscription_payment_proofs enable row level security;
revoke all on table public.subscription_payment_proofs from public, anon, authenticated;
grant select on table public.subscription_payment_proofs to authenticated;

drop policy if exists subscription_payment_proofs_org_or_admin_read on public.subscription_payment_proofs;
create policy subscription_payment_proofs_org_or_admin_read on public.subscription_payment_proofs
  for select to authenticated
  using ((select public.is_org_member(org_id)) or (select public.is_platform_admin()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'subscription-payment-proofs',
  'subscription-payment-proofs',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists subscription_payment_storage_member_insert on storage.objects;
create policy subscription_payment_storage_member_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'subscription-payment-proofs'
    and (select public.is_org_member(((storage.foldername(name))[1])::uuid))
    and exists (
      select 1 from public.subscriptions s
      where s.id = ((storage.foldername(name))[2])::uuid
        and s.org_id = ((storage.foldername(name))[1])::uuid
        and s.status = 'pending'
    )
  );

drop policy if exists subscription_payment_storage_authorized_read on storage.objects;
create policy subscription_payment_storage_authorized_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'subscription-payment-proofs'
    and exists (
      select 1 from public.subscription_payment_proofs proof
      where proof.receipt_object_path = name
        and ((select public.is_org_member(proof.org_id)) or (select public.is_platform_admin()))
    )
  );

create or replace function public.submit_subscription_payment_proof(
  p_subscription_id uuid,
  p_payment_method text,
  p_payment_reference text,
  p_amount numeric default null,
  p_payer_name text default null,
  p_receipt_object_path text default null
) returns public.subscription_payment_proofs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subscription public.subscriptions;
  v_proof public.subscription_payment_proofs;
  v_reference text := trim(coalesce(p_payment_reference, ''));
  v_path text := nullif(trim(coalesce(p_receipt_object_path, '')), '');
begin
  if (select auth.uid()) is null then raise exception 'Sign in to submit payment evidence'; end if;
  if p_payment_method not in ('bank_transfer', 'mobile_money') then raise exception 'Choose bank transfer or mobile money'; end if;
  if length(v_reference) not between 3 and 120 then raise exception 'Enter a valid payment reference'; end if;
  if p_amount is not null and p_amount <= 0 then raise exception 'Payment amount must be greater than zero'; end if;
  if length(trim(coalesce(p_payer_name, ''))) > 160 then raise exception 'Payer name must not exceed 160 characters'; end if;

  select * into v_subscription from public.subscriptions where id = p_subscription_id for update;
  if not found then raise exception 'Subscription request not found'; end if;
  if not public.is_org_member(v_subscription.org_id) then raise exception 'Organization membership is required'; end if;
  if v_subscription.status <> 'pending' then raise exception 'Only pending subscription requests accept payment evidence'; end if;
  if v_path is not null and (
    split_part(v_path, '/', 1) <> v_subscription.org_id::text
    or split_part(v_path, '/', 2) <> v_subscription.id::text
  ) then raise exception 'Receipt path does not match the subscription request'; end if;

  insert into public.subscription_payment_proofs (
    subscription_id, org_id, payment_method, payment_reference, amount,
    payer_name, receipt_object_path, submitted_by
  ) values (
    v_subscription.id, v_subscription.org_id, p_payment_method, v_reference, p_amount,
    nullif(trim(coalesce(p_payer_name, '')), ''), v_path, (select auth.uid())
  )
  on conflict (subscription_id) do update set
    payment_method = excluded.payment_method,
    payment_reference = excluded.payment_reference,
    amount = excluded.amount,
    payer_name = excluded.payer_name,
    receipt_object_path = excluded.receipt_object_path,
    status = 'pending',
    submitted_by = excluded.submitted_by,
    reviewed_by = null,
    reviewed_at = null,
    review_note = null,
    updated_at = now()
  where public.subscription_payment_proofs.status <> 'verified'
  returning * into v_proof;

  if v_proof.id is null then raise exception 'Verified payment evidence cannot be replaced'; end if;
  return v_proof;
end;
$$;

revoke all on function public.submit_subscription_payment_proof(uuid, text, text, numeric, text, text) from public, anon;
grant execute on function public.submit_subscription_payment_proof(uuid, text, text, numeric, text, text) to authenticated;

create or replace function public.review_subscription_payment(
  p_proof_id uuid,
  p_decision text,
  p_review_note text default null
) returns public.subscriptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_proof public.subscription_payment_proofs;
  v_subscription public.subscriptions;
  v_note text := nullif(trim(coalesce(p_review_note, '')), '');
begin
  if (select auth.uid()) is null or not public.is_platform_admin() then
    raise exception 'Platform administrator access is required';
  end if;
  if p_decision not in ('verified', 'rejected') then raise exception 'Decision must be verified or rejected'; end if;
  if p_decision = 'rejected' and v_note is null then raise exception 'A rejection reason is required'; end if;
  if length(coalesce(v_note, '')) > 1000 then raise exception 'Review note must not exceed 1000 characters'; end if;

  select * into v_proof from public.subscription_payment_proofs where id = p_proof_id for update;
  if not found then raise exception 'Payment evidence not found'; end if;
  if v_proof.status <> 'pending' then raise exception 'Payment evidence has already been reviewed'; end if;

  update public.subscription_payment_proofs set
    status = p_decision,
    reviewed_by = (select auth.uid()),
    reviewed_at = now(),
    review_note = v_note,
    updated_at = now()
  where id = v_proof.id;

  select * into v_subscription
  from public.transition_subscription(
    v_proof.subscription_id,
    case when p_decision = 'verified' then 'activate' else 'cancel' end,
    coalesce(v_note, 'Payment evidence verified'),
    current_date
  );

  return v_subscription;
end;
$$;

revoke all on function public.review_subscription_payment(uuid, text, text) from public, anon;
grant execute on function public.review_subscription_payment(uuid, text, text) to authenticated;

commit;
