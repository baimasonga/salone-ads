# Manohub Backup, Recovery and Incident Response

## Recovery policy

Manohub uses a target RPO of 24 hours and target RTO of 4 hours until Point-in-Time Recovery is enabled and a timed restore exercise proves a tighter objective. Supabase PITR can reduce the database RPO to approximately two minutes, but it is a paid platform capability and must not be marked active in Manohub merely because this runbook exists.

Database backups do not include Storage objects. Database recovery and Storage-object recovery are therefore separate controls. Storage buckets require an independent versioned export or S3-compatible replication process, with restore testing in a non-production bucket.

| Asset | Minimum control | Evidence |
| --- | --- | --- |
| PostgreSQL database | Supabase scheduled backup or PITR | Dashboard backup record and quarterly restore exercise |
| Supabase Storage | Versioned off-site copy or S3-compatible replication | Object inventory comparison and sampled restore |
| Cloudflare application configuration | Wrangler configuration and deployment workflow in Git | Successful deployment from a tagged commit |
| DNS configuration | Restricted registrar access and encrypted configuration export | Quarterly access review and recovery copy |
| Secrets and API keys | Named owner, expiry review and rotation procedure | Rotation ticket and post-rotation smoke test |

## Quarterly restore exercise

1. Select a recovery point before the exercise and record it.
2. Restore to staging or a dedicated recovery sandbox—never over production for a test.
3. Verify authentication, organization isolation, critical record counts, migrations, and representative Storage objects.
4. Run the application health check and critical smoke journeys.
5. Measure achieved RPO and RTO.
6. Store the evidence reference and findings in **Administration → Reliability & Recovery**.
7. Open follow-up actions for every failure or missed objective.

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
