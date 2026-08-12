select private.record_backup_run(
  :'run_reference', :'backup_kind', :'trigger_source', :'status',
  :'backup_point_at'::timestamptz, :'started_at'::timestamptz,
  nullif(:'completed_at','')::timestamptz,
  nullif(:'object_count','')::bigint, nullif(:'byte_count','')::bigint,
  nullif(:'manifest_sha256',''), nullif(:'offsite_reference',''),
  nullif(:'workflow_run_url',''), nullif(:'failure_summary','')
);
