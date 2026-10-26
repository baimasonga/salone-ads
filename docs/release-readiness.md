# Staging validation and production rollout

## Targets and current limits

Use the existing `manohub-staging-container` Cloudflare Worker configuration and
provision a separate Supabase project named `hyderra-staging`. These are the
recommended targets, not a claim that either has been provisioned. The current
production Supabase project is `rffjehmbrycztiekcyho`; never substitute it for the
staging project.

The full application runs through Express/Cloudflare Containers. Build and final
release identities are distinct, including their suffix and environment, so a
container started before secret configuration cannot be reused as the final
release. Staging also refuses the production Supabase project at runtime. The alternate
Pages AI handlers are retained for compatibility, but Pages does not provide
the protected upload and transactional command backend.

Local automated tests and isolated PostgreSQL fixtures verify the code paths.
They do not establish live Storage, database schema, ClamAV signatures, login,
MFA, payment workflows or email-provider readiness. The local Docker validation
used the Node 22 build stage with the managed proxy CA mounted temporarily;
that is not validation of the final ClamAV runtime image.

## Configure access securely

GitHub repository Settings → Secrets and variables → Actions:

| Setting | Kind | Purpose |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | Secret | Deploy Workers/Containers to the selected account |
| `CLOUDFLARE_ACCOUNT_ID` | Secret | Select that Cloudflare account |
| `MANOHUB_STAGING_URL` | Variable | Exact HTTPS origin of the staging Worker or its custom domain |
| `STAGING_SUPABASE_URL` | Variable | Dedicated staging project API URL |
| `STAGING_SUPABASE_ANON_KEY` | Variable | Staging public client key |
| `STAGING_SUPABASE_SERVICE_ROLE_KEY` | Secret | Staging-only server upload authorization |
| `STAGING_DATABASE_MIGRATIONS_COMMIT` | Variable | Candidate SHA whose staging migrations were verified |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | Production-only server upload authorization, used only during promotion |
| `PRODUCTION_DATABASE_MIGRATIONS_COMMIT` | Variable | Main-branch release SHA whose production migrations were verified |

Existing secrets may already be configured in GitHub or Cloudflare. Inspect
names and presence through those services before creating duplicate bindings.
Never copy secret values into files, chat, logs, PR descriptions or `VITE_`
variables. The current cloud machine does not have deployment credentials;
GitHub API access works, but the current integration receives HTTP 403 when
reading Actions secrets and variables. Their presence is therefore unverified;
this does not establish that they are missing from GitHub.

For email validation, configure staging Worker secrets `RESEND_API_KEY`,
`RESEND_FROM_EMAIL`, `RESEND_WEBHOOK_SECRET` and `EMAIL_DISPATCH_SECRET`. Use a
sandbox provider or an explicitly approved test recipient. Set an optional
staging `GEMINI_API_KEY` only if testing provider-backed generation. The workflow
sets staging `APP_URL` from `MANOHUB_STAGING_URL`; keys remain server-only.

Before production promotion, inspect existing production email/AI bindings as
well. Staging secrets must never be copied into production bindings.

## Back up and verify the schema

1. Record the currently healthy application's `/release.json` commit and
   `/api/health` release. Preserve the matching application artifact/config.
   The workflow's Git-parent rollback SHA is a candidate, not proof that the
   revision was the last healthy deployed release.
2. Obtain a restorable database backup/PITR point and record its timestamp.
   Back up affected Storage objects separately; a database backup alone does
   not back up object bytes. Verify restoration on the isolated staging project.
3. Check that the target already has the expected baseline schema through
   migration 95. Validate migrations with `npm run validate:migrations`.
4. Apply migrations 96 and 97 on staging using the project's normal migration
   process. Use either the numbered files or their matching timestamped copies,
   not both. No migration in this release deletes the retired feature data.
5. Check the new authorization table, restrictive storage policies, transactional
   command RPC, permissions and MFA behavior. Example metadata checks:

   ```sql
   select policyname, permissive, cmd, roles
   from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname in ('protected_storage_insert', 'protected_storage_update');

   select has_function_privilege(
     'authenticated', 'public.execute_backend_command(text,text,jsonb,text)', 'EXECUTE'
   ) as transactional_entry_point_allowed;
   ```

6. After verifying the candidate's migrations, set
   `STAGING_DATABASE_MIGRATIONS_COMMIT` to its full commit SHA. This is an
   operator attestation, not an automated database inspection. Verify it again
   for each changed candidate; the workflow refuses a stale acknowledgement.

Existing pre-upgrade idempotency keys use an older payload hash format and may
be rejected across the upgrade. Existing incomplete command outcomes require
reconciliation against the business record and audit trail. Never work around
an uncertain outcome by blindly retrying with a fresh key.

## Deploy staging only

After the review branch is available in GitHub, run:

```sh
gh workflow run deploy-containers.yml \
  --ref fix/reliability-and-feature-cleanup \
  -f dry_run=false -f staging_only=true
```

The workflow must exist on the repository's default branch before GitHub allows
dispatching it. If this workflow revision is not dispatchable from the candidate
branch, review and merge the workflow changes first, or use a protected staging
workflow from the default branch. Do not use the old dispatch form without the
`staging_only` input: the old workflow can also promote production.

The staging job checks project isolation and the migration acknowledgement,
builds a commit-identified release, configures the staging upload key, then runs
`node scripts/verify-staging-release.mjs`. Its seven unauthenticated checks verify
exact frontend/backend commit identity, the staging environment, blocked backend
artifacts, and authentication for command, upload and AI endpoints. These checks
do not send email, upload files or execute commands.

## Live staging acceptance

Use dedicated staging accounts, organizations, payment evidence and test files.
Record outcomes against the exact candidate commit:

- Sign in, complete MFA, switch organizations, and sign out during an in-flight
  workspace load. Check role isolation and the restricted support-staff view.
- Load billing and financial documents, request a staging subscription, submit
  staging payment evidence, and verify administrator review. Do not initiate
  real payments.
- Upload a clean image and PDF to representative public/private buckets. Check
  ownership rules and rejection of direct uploads without server authorization.
  Use the standard harmless EICAR antivirus test file to confirm a blocked
  upload creates no stored object. Confirm scanner signatures are current.
- Execute a staging command with a fixed idempotency key, repeat it, and verify
  one business effect and a cached result. Changed input must conflict. Verify
  the transaction rolls back a controlled failure and that void-returning
  operations produce a null result, including on cached retry.
- Test email acceptance/recovery only with the sandbox or approved recipient.
  Verify persistence failure does not mark an accepted send failed; recovery
  reuses the provider key. Old uncertain sends outside the safe window require
  reconciliation instead of replay. Check webhooks and worker authorization.
- Verify business-directory editing, public discovery, the remaining campaign
  builder and both support views. Confirm retired screens are absent.

## Promote and monitor

Review the PR and staging evidence before merging. Production promotion is
restricted to `main`, requires a successful staging job, and is disabled for a
manual run with `staging_only=true`. Missing staging configuration now blocks a
real release rather than taking a legacy production path.

Coordinate production migrations and application rollout in a maintenance
window: migration 96 restricts old browser uploads and migration 97 revokes old
command-envelope permissions. Apply and verify the production schema and
server-only upload key, then set `PRODUCTION_DATABASE_MIGRATIONS_COMMIT` to the
full main-branch release SHA before promotion. Do not merge expecting the old
application to continue writing unchanged against the new permissions.

After promotion, inspect exact release identity, health, error rates, protected
uploads, command conflicts, email worker outcomes and audit events. Keep the
backup, known healthy release identity and staging evidence with the release.

## Rollback and recovery

Do not automatically run reverse migrations or delete authorization, command,
event, tourism, creator or billing records. A code-only rollback to the old
application is incompatible with the new upload/command permissions and restores
known vulnerabilities.

If a release fails, pause affected writes and email dispatch using the supported
operational controls, preserve logs and idempotency records, and prefer a forward
fix. If rollback is required, use the verified pre-release application and the
DBA-approved database/PITR restoration plan as a coordinated operation; account
for writes since the restore point and separately restore Storage objects.
Rehearse that plan on staging before any production promotion. No rollback,
migration application or production deployment was executed by this task.
