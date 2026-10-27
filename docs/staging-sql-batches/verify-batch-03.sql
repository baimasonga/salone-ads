-- READ ONLY: batch 3 audit against release 921b29a.
-- Run the WHOLE query in hyderra-staging. No data or schema is modified.
-- Function checks use the final definition after later migrations 75-97.
-- This checks function body/security mode, table RLS, index validity,
-- policy existence, and enabled trigger existence. It does not verify
-- policy expressions, every column/constraint, reference data or behavior.
with checks as (
select 'Function definitions'::text as category, 'private.auto_enable_public_rls'::text as item, exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='auto_enable_public_rls' and md5(btrim(replace(p.prosrc,E'\r\n',E'\n'),E' \t\r\n'))='9a9fe1a10cefa55eac56d79cc8959d39' and p.prosecdef=true) as passed
union all
select 'Function definitions'::text as category, 'private.capture_advert_order_central_audit_and_usage'::text as item, exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='capture_advert_order_central_audit_and_usage' and md5(btrim(replace(p.prosrc,E'\r\n',E'\n'),E' \t\r\n'))='5ccac9e4b340e91bcfbecf734830125d' and p.prosecdef=true) as passed
union all
select 'Function definitions'::text as category, 'private.capture_agency_central_audit_and_usage'::text as item, exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='capture_agency_central_audit_and_usage' and md5(btrim(replace(p.prosrc,E'\r\n',E'\n'),E' \t\r\n'))='2d8640617cbaf14ad0da7a2cca1ac3d5' and p.prosecdef=true) as passed
union all
select 'Function definitions'::text as category, 'private.capture_campaign_central_audit_and_usage'::text as item, exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='capture_campaign_central_audit_and_usage' and md5(btrim(replace(p.prosrc,E'\r\n',E'\n'),E' \t\r\n'))='1f30e557e2814b1aa258157973546d04' and p.prosecdef=true) as passed
union all
select 'Function definitions'::text as category, 'private.capture_cms_central_audit'::text as item, exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='capture_cms_central_audit' and md5(btrim(replace(p.prosrc,E'\r\n',E'\n'),E' \t\r\n'))='79919aef55b50ac6691382ab23d78f24' and p.prosecdef=true) as passed
union all
select 'Function definitions'::text as category, 'private.capture_membership_central_audit'::text as item, exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='capture_membership_central_audit' and md5(btrim(replace(p.prosrc,E'\r\n',E'\n'),E' \t\r\n'))='a1d0d8102ac52c6f5a77fb907bb46824' and p.prosecdef=true) as passed
union all
select 'Function definitions'::text as category, 'private.capture_subscription_central_audit'::text as item, exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='capture_subscription_central_audit' and md5(btrim(replace(p.prosrc,E'\r\n',E'\n'),E' \t\r\n'))='bb0acaefb901d50381fd07944a1dd8d1' and p.prosecdef=true) as passed
union all
select 'Function definitions'::text as category, 'private.org_role_permissions'::text as item, exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='org_role_permissions' and md5(btrim(replace(p.prosrc,E'\r\n',E'\n'),E' \t\r\n'))='89e199e8b54c71bf1cd2fbb1a7c93315' and p.prosecdef=false) as passed
union all
select 'Function definitions'::text as category, 'private.prevent_blocked_subscriber_registration'::text as item, exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='prevent_blocked_subscriber_registration' and md5(btrim(replace(p.prosrc,E'\r\n',E'\n'),E' \t\r\n'))='43c1c2c10096114b9cb34384c1128af7' and p.prosecdef=true) as passed
union all
select 'Function definitions'::text as category, 'private.process_commercial_invoice_overdue'::text as item, exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='process_commercial_invoice_overdue' and md5(btrim(replace(p.prosrc,E'\r\n',E'\n'),E' \t\r\n'))='550c5c501369dd2bbd92928d68e3116f' and p.prosecdef=true) as passed
union all
select 'Function definitions'::text as category, 'private.record_authorization_denial'::text as item, exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='record_authorization_denial' and md5(btrim(replace(p.prosrc,E'\r\n',E'\n'),E' \t\r\n'))='1f2ead6257b13ebd97502d72411a7227' and p.prosecdef=true) as passed
union all
select 'Function definitions'::text as category, 'private.record_org_usage_event'::text as item, exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='record_org_usage_event' and md5(btrim(replace(p.prosrc,E'\r\n',E'\n'),E' \t\r\n'))='a1dd7fa219837c7bbf26e4fb5b30e112' and p.prosecdef=true) as passed
union all
select 'Function definitions'::text as category, 'private.revoke_restricted_organization_sessions'::text as item, exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='revoke_restricted_organization_sessions' and md5(btrim(replace(p.prosrc,E'\r\n',E'\n'),E' \t\r\n'))='31da1b4dd781b8c8096f637cce22d278' and p.prosecdef=true) as passed
union all
select 'Function definitions'::text as category, 'public.admin_approve_organization_verification'::text as item, exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='admin_approve_organization_verification' and md5(btrim(replace(p.prosrc,E'\r\n',E'\n'),E' \t\r\n'))='e10f673d16edf50bb7a349af23cc8d80' and p.prosecdef=true) as passed
union all
select 'Function definitions'::text as category, 'public.admin_get_authorization_assurance'::text as item, exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='admin_get_authorization_assurance' and md5(btrim(replace(p.prosrc,E'\r\n',E'\n'),E' \t\r\n'))='7031c22cbc5b386145be709f7247ef1c' and p.prosecdef=true) as passed
union all
select 'Function definitions'::text as category, 'public.admin_get_backend_command_summary'::text as item, exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='admin_get_backend_command_summary' and md5(btrim(replace(p.prosrc,E'\r\n',E'\n'),E' \t\r\n'))='1ff035cef35dcfc39509997aa76bb884' and p.prosecdef=true) as passed
union all
select 'Function definitions'::text as category, 'public.admin_get_procurement_search_insights'::text as item, exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='admin_get_procurement_search_insights' and md5(btrim(replace(p.prosrc,E'\r\n',E'\n'),E' \t\r\n'))='907b1b2c4bf09669ce907e929d3d3d4e' and p.prosecdef=true) as passed
union all
select 'Function definitions'::text as category, 'public.admin_get_usage_metering_summary'::text as item, exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='admin_get_usage_metering_summary' and md5(btrim(replace(p.prosrc,E'\r\n',E'\n'),E' \t\r\n'))='9f57913d20aac2c7978e27428eaf3bcc' and p.prosecdef=true) as passed
union all
select 'Function definitions'::text as category, 'public.admin_list_subscribers'::text as item, exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='admin_list_subscribers' and md5(btrim(replace(p.prosrc,E'\r\n',E'\n'),E' \t\r\n'))='350e232a35cb060806312d2b2ba68bc2' and p.prosecdef=true) as passed
union all
select 'Function definitions'::text as category, 'public.admin_process_commercial_invoice_overdue'::text as item, exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='admin_process_commercial_invoice_overdue' and md5(btrim(replace(p.prosrc,E'\r\n',E'\n'),E' \t\r\n'))='1fc0e1bc070fa55a7b80b2e86415fd24' and p.prosecdef=true) as passed
union all
select 'Function definitions'::text as category, 'public.admin_purge_subscriber'::text as item, exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='admin_purge_subscriber' and md5(btrim(replace(p.prosrc,E'\r\n',E'\n'),E' \t\r\n'))='f9e97c7d2d8aeda7168d93900108b2da' and p.prosecdef=true) as passed
union all
select 'Function definitions'::text as category, 'public.assign_opportunity_sourcing_task'::text as item, exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='assign_opportunity_sourcing_task' and md5(btrim(replace(p.prosrc,E'\r\n',E'\n'),E' \t\r\n'))='c4d0139e906ea99fe44d89b98ec049ff' and p.prosecdef=true) as passed
union all
select 'Function definitions'::text as category, 'public.check_org_permission'::text as item, exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='check_org_permission' and md5(btrim(replace(p.prosrc,E'\r\n',E'\n'),E' \t\r\n'))='6796c4baf214aa1d613e18a94bca0bc9' and p.prosecdef=true) as passed
union all
select 'Function definitions'::text as category, 'public.claim_backend_command'::text as item, exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='claim_backend_command' and md5(btrim(replace(p.prosrc,E'\r\n',E'\n'),E' \t\r\n'))='d45f24b09d6ccbf45b4ec910dc84f1ec' and p.prosecdef=true) as passed
union all
select 'Function definitions'::text as category, 'public.complete_backend_command'::text as item, exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='complete_backend_command' and md5(btrim(replace(p.prosrc,E'\r\n',E'\n'),E' \t\r\n'))='4d56cecc4770234822c5839754af7b6f' and p.prosecdef=true) as passed
union all
select 'Function definitions'::text as category, 'public.complete_sourcing_tasks_on_publish'::text as item, exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='complete_sourcing_tasks_on_publish' and md5(btrim(replace(p.prosrc,E'\r\n',E'\n'),E' \t\r\n'))='02bef2cd5a05be43b227731e4c0595a9' and p.prosecdef=true) as passed
union all
select 'Function definitions'::text as category, 'public.create_sourcing_task_from_gap'::text as item, exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='create_sourcing_task_from_gap' and md5(btrim(replace(p.prosrc,E'\r\n',E'\n'),E' \t\r\n'))='1b96ddaa4aa77d90a39f8b3b38a62617' and p.prosecdef=true) as passed
union all
select 'Function definitions'::text as category, 'public.create_subscriber_organization'::text as item, exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='create_subscriber_organization' and md5(btrim(replace(p.prosrc,E'\r\n',E'\n'),E' \t\r\n'))='7381e31b20c4e1d583afd066b5393fb0' and p.prosecdef=true) as passed
union all
select 'Function definitions'::text as category, 'public.fail_backend_command'::text as item, exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='fail_backend_command' and md5(btrim(replace(p.prosrc,E'\r\n',E'\n'),E' \t\r\n'))='e39bdd6bf141631c2d9b98c9f82c6af4' and p.prosecdef=true) as passed
union all
select 'Function definitions'::text as category, 'public.get_org_permissions'::text as item, exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='get_org_permissions' and md5(btrim(replace(p.prosrc,E'\r\n',E'\n'),E' \t\r\n'))='e0066f34fef0cedb6926bb78768c071b' and p.prosecdef=true) as passed
union all
select 'Function definitions'::text as category, 'public.guard_bid_submission_transition'::text as item, exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='guard_bid_submission_transition' and md5(btrim(replace(p.prosrc,E'\r\n',E'\n'),E' \t\r\n'))='6ee23d2b60aea930190d1e19732a858f' and p.prosecdef=false) as passed
union all
select 'Function definitions'::text as category, 'public.issue_commercial_credit'::text as item, exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='issue_commercial_credit' and md5(btrim(replace(p.prosrc,E'\r\n',E'\n'),E' \t\r\n'))='d038dc99571c12be7b0eaaeaab77da06' and p.prosecdef=true) as passed
union all
select 'Function definitions'::text as category, 'public.list_opportunity_researchers'::text as item, exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='list_opportunity_researchers' and md5(btrim(replace(p.prosrc,E'\r\n',E'\n'),E' \t\r\n'))='500d95b3ca473428387a6029395bbe71' and p.prosecdef=true) as passed
union all
select 'Function definitions'::text as category, 'public.record_commercial_payment'::text as item, exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='record_commercial_payment' and md5(btrim(replace(p.prosrc,E'\r\n',E'\n'),E' \t\r\n'))='27a0a9315b7f953865db0f091dec5f88' and p.prosecdef=true) as passed
union all
select 'Function definitions'::text as category, 'public.record_commercial_refund'::text as item, exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='record_commercial_refund' and md5(btrim(replace(p.prosrc,E'\r\n',E'\n'),E' \t\r\n'))='93865e625951e1dc368f79d801957134' and p.prosecdef=true) as passed
union all
select 'Function definitions'::text as category, 'public.record_opportunity_sourcing_task_event'::text as item, exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='record_opportunity_sourcing_task_event' and md5(btrim(replace(p.prosrc,E'\r\n',E'\n'),E' \t\r\n'))='8c70d33bbc6fbf58dba1d9dfb64d1b49' and p.prosecdef=true) as passed
union all
select 'Function definitions'::text as category, 'public.review_subscription_payment'::text as item, exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='review_subscription_payment' and md5(btrim(replace(p.prosrc,E'\r\n',E'\n'),E' \t\r\n'))='4ab20ee94e0c5e0fca10be29c403c8c7' and p.prosecdef=true) as passed
union all
select 'Function definitions'::text as category, 'public.submit_subscription_payment_proof'::text as item, exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='submit_subscription_payment_proof' and md5(btrim(replace(p.prosrc,E'\r\n',E'\n'),E' \t\r\n'))='b45970b6015b105bfaabe383f8d82aaf' and p.prosecdef=true) as passed
union all
select 'Function definitions'::text as category, 'public.sync_sourcing_task_from_ingestion'::text as item, exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='sync_sourcing_task_from_ingestion' and md5(btrim(replace(p.prosrc,E'\r\n',E'\n'),E' \t\r\n'))='554b3c3dce8d23b9ee7c8b5bdbeec54c' and p.prosecdef=true) as passed
union all
select 'Function definitions'::text as category, 'public.update_opportunity_sourcing_task'::text as item, exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='update_opportunity_sourcing_task' and md5(btrim(replace(p.prosrc,E'\r\n',E'\n'),E' \t\r\n'))='9745ceacc9daf0ecbe9bfba08e62ac58' and p.prosecdef=true) as passed
union all
select 'Function definitions'::text as category, 'public.update_subscriber_organization_profile'::text as item, exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='update_subscriber_organization_profile' and md5(btrim(replace(p.prosrc,E'\r\n',E'\n'),E' \t\r\n'))='41f738971b35311384d3544a5bece8a7' and p.prosecdef=true) as passed
union all
select 'Tables and RLS', 'private.blocked_subscriber_users', exists(select 1 from pg_class c where c.oid=to_regclass('private.blocked_subscriber_users') and (c.relnamespace=(select oid from pg_namespace where nspname='private') or c.relrowsecurity))
union all
select 'Tables and RLS', 'public.authorization_denials', exists(select 1 from pg_class c where c.oid=to_regclass('public.authorization_denials') and (c.relnamespace=(select oid from pg_namespace where nspname='private') or c.relrowsecurity))
union all
select 'Tables and RLS', 'public.authorization_resource_registry', exists(select 1 from pg_class c where c.oid=to_regclass('public.authorization_resource_registry') and (c.relnamespace=(select oid from pg_namespace where nspname='private') or c.relrowsecurity))
union all
select 'Tables and RLS', 'public.backend_command_requests', exists(select 1 from pg_class c where c.oid=to_regclass('public.backend_command_requests') and (c.relnamespace=(select oid from pg_namespace where nspname='private') or c.relrowsecurity))
union all
select 'Tables and RLS', 'public.bid_submission_documents', exists(select 1 from pg_class c where c.oid=to_regclass('public.bid_submission_documents') and (c.relnamespace=(select oid from pg_namespace where nspname='private') or c.relrowsecurity))
union all
select 'Tables and RLS', 'public.bid_submissions', exists(select 1 from pg_class c where c.oid=to_regclass('public.bid_submissions') and (c.relnamespace=(select oid from pg_namespace where nspname='private') or c.relrowsecurity))
union all
select 'Tables and RLS', 'public.commercial_credit_notes', exists(select 1 from pg_class c where c.oid=to_regclass('public.commercial_credit_notes') and (c.relnamespace=(select oid from pg_namespace where nspname='private') or c.relrowsecurity))
union all
select 'Tables and RLS', 'public.commercial_refunds', exists(select 1 from pg_class c where c.oid=to_regclass('public.commercial_refunds') and (c.relnamespace=(select oid from pg_namespace where nspname='private') or c.relrowsecurity))
union all
select 'Tables and RLS', 'public.opportunity_sourcing_task_events', exists(select 1 from pg_class c where c.oid=to_regclass('public.opportunity_sourcing_task_events') and (c.relnamespace=(select oid from pg_namespace where nspname='private') or c.relrowsecurity))
union all
select 'Tables and RLS', 'public.opportunity_sourcing_tasks', exists(select 1 from pg_class c where c.oid=to_regclass('public.opportunity_sourcing_tasks') and (c.relnamespace=(select oid from pg_namespace where nspname='private') or c.relrowsecurity))
union all
select 'Tables and RLS', 'public.subscription_payment_proofs', exists(select 1 from pg_class c where c.oid=to_regclass('public.subscription_payment_proofs') and (c.relnamespace=(select oid from pg_namespace where nspname='private') or c.relrowsecurity))
union all
select 'Valid indexes', 'public.authorization_denials_actor_occurred_idx', exists(select 1 from pg_index i where i.indexrelid=to_regclass('public.authorization_denials_actor_occurred_idx') and i.indisvalid)
union all
select 'Valid indexes', 'public.authorization_denials_occurred_idx', exists(select 1 from pg_index i where i.indexrelid=to_regclass('public.authorization_denials_occurred_idx') and i.indisvalid)
union all
select 'Valid indexes', 'public.authorization_denials_org_occurred_idx', exists(select 1 from pg_index i where i.indexrelid=to_regclass('public.authorization_denials_org_occurred_idx') and i.indisvalid)
union all
select 'Valid indexes', 'public.backend_command_actor_started_idx', exists(select 1 from pg_index i where i.indexrelid=to_regclass('public.backend_command_actor_started_idx') and i.indisvalid)
union all
select 'Valid indexes', 'public.backend_command_status_updated_idx', exists(select 1 from pg_index i where i.indexrelid=to_regclass('public.backend_command_status_updated_idx') and i.indisvalid)
union all
select 'Valid indexes', 'public.bid_submission_documents_submission_idx', exists(select 1 from pg_index i where i.indexrelid=to_regclass('public.bid_submission_documents_submission_idx') and i.indisvalid)
union all
select 'Valid indexes', 'public.bid_submissions_opportunity_idx', exists(select 1 from pg_index i where i.indexrelid=to_regclass('public.bid_submissions_opportunity_idx') and i.indisvalid)
union all
select 'Valid indexes', 'public.bid_submissions_org_idx', exists(select 1 from pg_index i where i.indexrelid=to_regclass('public.bid_submissions_org_idx') and i.indisvalid)
union all
select 'Valid indexes', 'public.commercial_credit_notes_invoice_idx', exists(select 1 from pg_index i where i.indexrelid=to_regclass('public.commercial_credit_notes_invoice_idx') and i.indisvalid)
union all
select 'Valid indexes', 'public.commercial_refunds_payment_idx', exists(select 1 from pg_index i where i.indexrelid=to_regclass('public.commercial_refunds_payment_idx') and i.indisvalid)
union all
select 'Valid indexes', 'public.opportunity_ingestion_sourcing_task_unique_idx', exists(select 1 from pg_index i where i.indexrelid=to_regclass('public.opportunity_ingestion_sourcing_task_unique_idx') and i.indisvalid)
union all
select 'Valid indexes', 'public.opportunity_sourcing_task_events_task_created_idx', exists(select 1 from pg_index i where i.indexrelid=to_regclass('public.opportunity_sourcing_task_events_task_created_idx') and i.indisvalid)
union all
select 'Valid indexes', 'public.opportunity_sourcing_tasks_active_gap_idx', exists(select 1 from pg_index i where i.indexrelid=to_regclass('public.opportunity_sourcing_tasks_active_gap_idx') and i.indisvalid)
union all
select 'Valid indexes', 'public.opportunity_sourcing_tasks_assignee_idx', exists(select 1 from pg_index i where i.indexrelid=to_regclass('public.opportunity_sourcing_tasks_assignee_idx') and i.indisvalid)
union all
select 'Valid indexes', 'public.opportunity_sourcing_tasks_queue_idx', exists(select 1 from pg_index i where i.indexrelid=to_regclass('public.opportunity_sourcing_tasks_queue_idx') and i.indisvalid)
union all
select 'Valid indexes', 'public.organization_usage_events_meter_created_idx', exists(select 1 from pg_index i where i.indexrelid=to_regclass('public.organization_usage_events_meter_created_idx') and i.indisvalid)
union all
select 'Valid indexes', 'public.organization_usage_events_org_created_idx', exists(select 1 from pg_index i where i.indexrelid=to_regclass('public.organization_usage_events_org_created_idx') and i.indisvalid)
union all
select 'Valid indexes', 'public.organizations_subscriber_admin_idx', exists(select 1 from pg_index i where i.indexrelid=to_regclass('public.organizations_subscriber_admin_idx') and i.indisvalid)
union all
select 'Valid indexes', 'public.subscription_payment_proofs_org_idx', exists(select 1 from pg_index i where i.indexrelid=to_regclass('public.subscription_payment_proofs_org_idx') and i.indisvalid)
union all
select 'Valid indexes', 'public.subscription_payment_proofs_review_queue_idx', exists(select 1 from pg_index i where i.indexrelid=to_regclass('public.subscription_payment_proofs_review_queue_idx') and i.indisvalid)
union all
select 'Valid indexes', 'public.subscription_payment_proofs_reviewed_by_idx', exists(select 1 from pg_index i where i.indexrelid=to_regclass('public.subscription_payment_proofs_reviewed_by_idx') and i.indisvalid)
union all
select 'Valid indexes', 'public.subscription_payment_proofs_submitted_by_idx', exists(select 1 from pg_index i where i.indexrelid=to_regclass('public.subscription_payment_proofs_submitted_by_idx') and i.indisvalid)
union all
select 'Policy presence', 'private.background_jobs.API clients cannot access background jobs', exists(select 1 from pg_policies where schemaname='private' and tablename='background_jobs' and policyname='API clients cannot access background jobs')
union all
select 'Policy presence', 'public.authorization_denials.authorization_denials_admin_read', exists(select 1 from pg_policies where schemaname='public' and tablename='authorization_denials' and policyname='authorization_denials_admin_read')
union all
select 'Policy presence', 'public.authorization_resource_registry.authorization_registry_admin_read', exists(select 1 from pg_policies where schemaname='public' and tablename='authorization_resource_registry' and policyname='authorization_registry_admin_read')
union all
select 'Policy presence', 'public.backend_command_requests.backend_commands_actor_read', exists(select 1 from pg_policies where schemaname='public' and tablename='backend_command_requests' and policyname='backend_commands_actor_read')
union all
select 'Policy presence', 'public.bid_submission_documents.bid_documents_supplier_delete', exists(select 1 from pg_policies where schemaname='public' and tablename='bid_submission_documents' and policyname='bid_documents_supplier_delete')
union all
select 'Policy presence', 'public.bid_submission_documents.bid_documents_supplier_insert', exists(select 1 from pg_policies where schemaname='public' and tablename='bid_submission_documents' and policyname='bid_documents_supplier_insert')
union all
select 'Policy presence', 'public.bid_submission_documents.bid_documents_visible_with_submission', exists(select 1 from pg_policies where schemaname='public' and tablename='bid_submission_documents' and policyname='bid_documents_visible_with_submission')
union all
select 'Policy presence', 'public.bid_submissions.bid_submissions_admin_select', exists(select 1 from pg_policies where schemaname='public' and tablename='bid_submissions' and policyname='bid_submissions_admin_select')
union all
select 'Policy presence', 'public.bid_submissions.bid_submissions_buyer_select', exists(select 1 from pg_policies where schemaname='public' and tablename='bid_submissions' and policyname='bid_submissions_buyer_select')
union all
select 'Policy presence', 'public.bid_submissions.bid_submissions_supplier_insert', exists(select 1 from pg_policies where schemaname='public' and tablename='bid_submissions' and policyname='bid_submissions_supplier_insert')
union all
select 'Policy presence', 'public.bid_submissions.bid_submissions_supplier_select', exists(select 1 from pg_policies where schemaname='public' and tablename='bid_submissions' and policyname='bid_submissions_supplier_select')
union all
select 'Policy presence', 'public.bid_submissions.bid_submissions_supplier_update', exists(select 1 from pg_policies where schemaname='public' and tablename='bid_submissions' and policyname='bid_submissions_supplier_update')
union all
select 'Policy presence', 'public.commercial_credit_notes.commercial_credit_notes_read', exists(select 1 from pg_policies where schemaname='public' and tablename='commercial_credit_notes' and policyname='commercial_credit_notes_read')
union all
select 'Policy presence', 'public.commercial_refunds.commercial_refunds_read', exists(select 1 from pg_policies where schemaname='public' and tablename='commercial_refunds' and policyname='commercial_refunds_read')
union all
select 'Policy presence', 'public.opportunity_sourcing_task_events.opportunity_sourcing_task_events_staff_read', exists(select 1 from pg_policies where schemaname='public' and tablename='opportunity_sourcing_task_events' and policyname='opportunity_sourcing_task_events_staff_read')
union all
select 'Policy presence', 'public.opportunity_sourcing_tasks.opportunity_sourcing_tasks_staff_read', exists(select 1 from pg_policies where schemaname='public' and tablename='opportunity_sourcing_tasks' and policyname='opportunity_sourcing_tasks_staff_read')
union all
select 'Policy presence', 'public.organization_usage_events.usage_events_read', exists(select 1 from pg_policies where schemaname='public' and tablename='organization_usage_events' and policyname='usage_events_read')
union all
select 'Policy presence', 'public.procurement_search_events.API clients cannot access procurement search events', exists(select 1 from pg_policies where schemaname='public' and tablename='procurement_search_events' and policyname='API clients cannot access procurement search events')
union all
select 'Policy presence', 'public.subscription_payment_proofs.subscription_payment_proofs_org_or_admin_read', exists(select 1 from pg_policies where schemaname='public' and tablename='subscription_payment_proofs' and policyname='subscription_payment_proofs_org_or_admin_read')
union all
select 'Policy presence', 'public.tender_alert_deliveries.API clients cannot access tender alert deliveries', exists(select 1 from pg_policies where schemaname='public' and tablename='tender_alert_deliveries' and policyname='API clients cannot access tender alert deliveries')
union all
select 'Policy presence', 'public.tender_alert_email_events.API clients cannot access tender alert email events', exists(select 1 from pg_policies where schemaname='public' and tablename='tender_alert_email_events' and policyname='API clients cannot access tender alert email events')
union all
select 'Policy presence', 'public.tender_alert_email_suppressions.API clients cannot access tender alert email suppressions', exists(select 1 from pg_policies where schemaname='public' and tablename='tender_alert_email_suppressions' and policyname='API clients cannot access tender alert email suppressions')
union all
select 'Policy presence', 'storage.objects.bid_storage_authorized_read', exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='bid_storage_authorized_read')
union all
select 'Policy presence', 'storage.objects.bid_storage_supplier_delete', exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='bid_storage_supplier_delete')
union all
select 'Policy presence', 'storage.objects.bid_storage_supplier_insert', exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='bid_storage_supplier_insert')
union all
select 'Policy presence', 'storage.objects.subscription_payment_storage_authorized_read', exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='subscription_payment_storage_authorized_read')
union all
select 'Policy presence', 'storage.objects.subscription_payment_storage_member_insert', exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='subscription_payment_storage_member_insert')
union all
select 'Enabled triggers', 'public.ad_campaigns.ad_campaigns_central_audit_usage', exists(select 1 from pg_trigger where tgrelid=to_regclass('public.ad_campaigns') and tgname='ad_campaigns_central_audit_usage' and tgenabled in ('O','A'))
union all
select 'Enabled triggers', 'public.advert_orders.advert_orders_central_audit_usage', exists(select 1 from pg_trigger where tgrelid=to_regclass('public.advert_orders') and tgname='advert_orders_central_audit_usage' and tgenabled in ('O','A'))
union all
select 'Enabled triggers', 'public.agency_clients.agency_clients_central_audit_usage', exists(select 1 from pg_trigger where tgrelid=to_regclass('public.agency_clients') and tgname='agency_clients_central_audit_usage' and tgenabled in ('O','A'))
union all
select 'Enabled triggers', 'public.bid_submissions.guard_bid_submission_transition', exists(select 1 from pg_trigger where tgrelid=to_regclass('public.bid_submissions') and tgname='guard_bid_submission_transition' and tgenabled in ('O','A'))
union all
select 'Enabled triggers', 'public.cms_content.cms_content_central_audit', exists(select 1 from pg_trigger where tgrelid=to_regclass('public.cms_content') and tgname='cms_content_central_audit' and tgenabled in ('O','A'))
union all
select 'Enabled triggers', 'public.opportunities.opportunities_complete_sourcing_tasks', exists(select 1 from pg_trigger where tgrelid=to_regclass('public.opportunities') and tgname='opportunities_complete_sourcing_tasks' and tgenabled in ('O','A'))
union all
select 'Enabled triggers', 'public.opportunity_ingestion_items.opportunity_ingestion_sync_sourcing_task', exists(select 1 from pg_trigger where tgrelid=to_regclass('public.opportunity_ingestion_items') and tgname='opportunity_ingestion_sync_sourcing_task' and tgenabled in ('O','A'))
union all
select 'Enabled triggers', 'public.opportunity_sourcing_tasks.opportunity_sourcing_task_event_capture', exists(select 1 from pg_trigger where tgrelid=to_regclass('public.opportunity_sourcing_tasks') and tgname='opportunity_sourcing_task_event_capture' and tgenabled in ('O','A'))
union all
select 'Enabled triggers', 'public.organization_members.organization_members_central_audit', exists(select 1 from pg_trigger where tgrelid=to_regclass('public.organization_members') and tgname='organization_members_central_audit' and tgenabled in ('O','A'))
union all
select 'Enabled triggers', 'public.organizations.prevent_blocked_subscriber_registration', exists(select 1 from pg_trigger where tgrelid=to_regclass('public.organizations') and tgname='prevent_blocked_subscriber_registration' and tgenabled in ('O','A'))
union all
select 'Enabled triggers', 'public.organizations.revoke_restricted_organization_sessions', exists(select 1 from pg_trigger where tgrelid=to_regclass('public.organizations') and tgname='revoke_restricted_organization_sessions' and tgenabled in ('O','A'))
union all
select 'Enabled triggers', 'public.subscription_events.subscription_events_central_audit', exists(select 1 from pg_trigger where tgrelid=to_regclass('public.subscription_events') and tgname='subscription_events_central_audit' and tgenabled in ('O','A'))
)
select category, count(*) as checked,
  count(*) filter (where passed) as passed,
  count(*) filter (where not passed) as failed,
  coalesce(string_agg(item, '; ' order by item) filter (where not passed), 'none') as problems
from checks
group by category
order by category;
