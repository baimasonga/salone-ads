-- Direct administrator invoice issuance for existing subscribed customers.
begin;

create or replace function public.admin_create_commercial_invoice(
  p_org_id uuid,
  p_currency_code text,
  p_due_at date,
  p_notes text default null,
  p_tax_amount numeric default 0,
  p_lines jsonb default '[]'::jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_number text; v_subtotal numeric(16,2);
begin
  if auth.uid() is null or not public.is_platform_admin() then raise exception 'Platform administrator access is required'; end if;
  if not exists (select 1 from public.subscriptions s join public.organizations o on o.id=s.org_id where s.org_id=p_org_id and o.status='active' and s.status in ('trialing','active','past_due','grace_period','suspended')) then raise exception 'Select an existing subscribed customer'; end if;
  if p_due_at < current_date then raise exception 'Invoice due date cannot be in the past'; end if;
  if upper(trim(p_currency_code)) not in (select code from public.currencies) then raise exception 'Unsupported currency'; end if;
  if p_tax_amount < 0 then raise exception 'Tax cannot be negative'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) not between 1 and 30 then raise exception 'Between 1 and 30 line items are required'; end if;
  select sum((line->>'quantity')::numeric*(line->>'unit_amount')::numeric) into v_subtotal from jsonb_array_elements(p_lines) line;
  if v_subtotal is null or v_subtotal < 0 then raise exception 'Invoice lines are invalid'; end if;
  v_number := 'INV-'||to_char(current_date,'YYYY')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  insert into public.commercial_invoices(org_id,invoice_number,source_type,currency_code,status,subtotal,tax_amount,due_at,created_by) values(p_org_id,v_number,'manual',upper(trim(p_currency_code)),'issued',v_subtotal,coalesce(p_tax_amount,0),p_due_at,auth.uid()) returning id into v_id;
  insert into public.commercial_invoice_lines(invoice_id,description,quantity,unit_amount) select v_id,trim(line->>'description'),(line->>'quantity')::numeric,(line->>'unit_amount')::numeric from jsonb_array_elements(p_lines) with ordinality as item(line,position);
  insert into public.commercial_ledger_entries(org_id,entry_type,direction,amount,currency_code,reference_type,reference_id,description,actor_id,metadata) values(p_org_id,'invoice','debit',v_subtotal+coalesce(p_tax_amount,0),upper(trim(p_currency_code)),'commercial_invoice',v_id,coalesce(nullif(trim(p_notes),''),'Direct invoice '||v_number),auth.uid(),jsonb_build_object('invoice_number',v_number));
  insert into public.audit_logs(actor_id,org_id,action,entity_type,entity_id,metadata) values(auth.uid(),p_org_id,'billing.invoice_issued','commercial_invoice',v_id::text,jsonb_build_object('invoice_number',v_number,'total',v_subtotal+coalesce(p_tax_amount,0)));
  return v_id;
end;
$$;
revoke all on function public.admin_create_commercial_invoice(uuid,text,date,text,numeric,jsonb) from public,anon;
grant execute on function public.admin_create_commercial_invoice(uuid,text,date,text,numeric,jsonb) to authenticated;
commit;
