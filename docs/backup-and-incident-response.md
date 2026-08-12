# Manohub Backup, Recovery and Incident Response

## Recovery policy

Manohub uses a target RPO of 24 hours and target RTO of 4 hours until Point-in-Time Recovery is enabled and a timed restore exercise proves a tighter objective. The live Supabase organization is currently on the Free plan, so Manohub uses a daily logical export and must show PITR as unavailable. Supabase PITR can reduce the database RPO to approximately two minutes on an eligible paid plan, but it must not be marked active merely because this runbook exists.

Database backups do not include Storage objects. Database recovery and Storage-object recovery are therefore separate controls. Storage buckets require an independent versioned export or S3-compatible replication process, with restore testing in a non-production bucket.

| Asset | Minimum control | Evidence |
| --- | --- | --- |
| PostgreSQL database | Supabase scheduled backup or PITR | Dashboard backup record and quarterly restore exercise |
| Supabase Storage | Versioned off-site copy or S3-compatible replication | Object inventory comparison and sampled restore |
| Cloudflare application configuration | Wrangler configuration and deployment workflow in Git | Successful deployment from a tagged commit |
| DNS configuration | Restricted registrar access and encrypted configuration export | Quarterly access review and recovery copy |
| Secrets and API keys | Named owner, expiry review and rotation procedure | Rotation ticket and post-rotation smoke test |

## Automated backup workflow

`.github/workflows/backup-and-restore.yml` runs the full backup at 02:17 UTC every day. It deliberately fails closed until the protected `backup` environment contains all required credentials. It creates:

- Supabase-filtered role, schema and data SQL exports using the pinned CLI, each encrypted to the recovery custodian's age public key;
- a client-side encrypted, timestamped copy of every Supabase Storage bucket in an independent Cloudflare R2 bucket;
- an encrypted Git archive of deployment, migration, workflow and recovery configuration;
- a SHA-256 manifest containing only counts, sizes, timestamps and the release commit—never secret values;
- a private database evidence record visible only through the administrator recovery workspace.

The workflow uses timestamped copy operations and never synchronizes or deletes the off-site source of truth. GitHub artifacts are supporting evidence, not the backup destination. The R2 credential should be limited to the dedicated backup bucket and held separately from Supabase credentials.

Required protected secrets: `SUPABASE_BACKUP_DB_URL`, `SUPABASE_STORAGE_S3_ACCESS_KEY`, `SUPABASE_STORAGE_S3_SECRET_KEY`, `MANOHUB_BACKUP_R2_ACCESS_KEY`, `MANOHUB_BACKUP_R2_SECRET_KEY`, and `MANOHUB_BACKUP_CRYPT_PASSWORD`. Required non-secret environment variables: `MANOHUB_BACKUP_R2_ENDPOINT`, `MANOHUB_BACKUP_R2_BUCKET`, and `MANOHUB_BACKUP_AGE_RECIPIENT`.

Secret values are not backed up to Git or the database. Two named custodians must maintain an encrypted offline recovery pack containing the age identity, provider recovery codes, DNS/registrar access instructions, and a current secret inventory. Test access quarterly without copying secret values into exercise evidence.

## Quarterly restore exercise

The guarded recovery-sandbox job is scheduled for 03:43 UTC on the first day of every third month. It requires a dedicated recovery database and Storage endpoint, rejects the production project reference in both targets, restores the latest logical dump, replaces only the dedicated recovery Storage contents, and compares object counts and bytes. A manual run additionally requires the exact confirmation `RESTORE-TO-RECOVERY-SANDBOX`.

1. Select a recovery point before the exercise and record it.
2. Restore to staging or a dedicated recovery sandbox—never over production for a test.
3. Verify authentication, organization isolation, critical record counts, migrations, and representative Storage objects.
4. Run the application health check and critical smoke journeys.
5. Measure achieved RPO and RTO.
6. Store the evidence reference and findings in **Administration → Reliability & Recovery**.
7. Open follow-up actions for every failure or missed objective.

Required recovery-sandbox secrets: `MANOHUB_RECOVERY_DB_URL`, `MANOHUB_RECOVERY_S3_ACCESS_KEY`, `MANOHUB_RECOVERY_S3_SECRET_KEY`, and `MANOHUB_BACKUP_AGE_IDENTITY`. Required variables: `MANOHUB_RECOVERY_S3_ENDPOINT` and `MANOHUB_RECOVERY_S3_REGION`. The recovery target must contain no production workloads; the scheduled test replaces its database schema and Storage objects.

## Cloudflare, DNS and secret recovery

Application and Worker configuration is recoverable from the validated Git commit and encrypted configuration archive. After restoring, deploy the recorded release SHA, recreate protected secret values from the offline recovery pack, and run health, accessibility, RLS and critical-journey checks. DNS records and registrar recovery codes require a separate encrypted export because the Worker deployment token may not have DNS-read permission. Record the export date and checksum in the quarterly evidence; never store DNS credentials or secret values in Manohub.

## Incident severity

- **SEV1:** complete outage, confirmed data loss, active security compromise, or cross-tenant exposure.
- **SEV2:** major customer workflow unavailable or severe degradation without a safe workaround.
- **SEV3:** limited degradation with a workaround.
- **SEV4:** minor operational defect with little customer impact.

SEV1 and SEV2 incidents require an incident commander, a customer-impact statement, timed updates, and a postmortem. Incident records must move only through the states enforced by migration 50.

## Response sequence

1. Declare the incident and identify the affected service.
2. Contain risk; for suspected credential exposure, revoke or rotate before diagnosis continues.
3. Preserve logs, request IDs, deployment SHA, audit records, and database timestamps.
4. Mitigate service impact using the lowest-risk reversible action.
5. Monitor health and customer workflows before resolving.
6. Complete the postmortem with timeline, root cause, corrective actions, owners, and due dates.

## Emergency administrator access

Emergency access is for two named custodians, protected with phishing-resistant MFA where available. Use requires a linked incident, a reason, and immediate audit review. Credentials must not be shared in chat, tickets, source code, or browser storage. After any emergency use, rotate affected credentials, invalidate sessions where applicable, and verify normal administrator access.

## Key rotation

Rotate a key immediately after suspected exposure, staff departure, or unexplained privileged activity. Routine reviews occur quarterly. Update the secret at the provider, update the protected deployment secret, redeploy, run health and smoke checks, then revoke the previous key. Never expose a Supabase service-role key to the browser.

## Production restore authorization

A production restore is destructive and requires explicit approval from the designated platform owner after the intended restore point, expected data-loss window, downtime, and rollback limitations are documented. Supabase notes that the project is unavailable during restore. Storage objects require their own recovery action because restoring the database restores metadata, not deleted object bytes.
