HYDERRA STAGING DATABASE: REMAINING MIGRATIONS
Target project: gknewzlxndmummwynuoa (hyderra-staging).
Prerequisite: full_setup.sql, 03, and 06-32 already completed.
Optional demo seeds 04-05 are excluded. Migration 38 does not exist.

Run batch-01, batch-02, batch-03, batch-04, batch-05 IN THAT ORDER.
For each: open the SQL file in a text editor, copy ALL contents, open a NEW
Supabase SQL Editor query in hyderra-staging, paste, and Run the whole query
with no text selected. Wait for completion before starting the next batch.
The final result should say Batch N/5 complete.

These files preserve source SQL and transaction boundaries exactly.
They are not a single atomic transaction. If a query fails, earlier migrations
may already be committed. STOP and share the error text; do not blindly rerun
an entire batch or proceed to the next one. Progress messages alone do not
replace checking for SQL errors. No migrations have been run by generating
these files. Do not run them on production.

Historical feature tables in 89-90 are intentionally retained: the approved
cleanup removes application code while preserving the database schema/data.

After batch 5: verify schema, permissions, staging-only credentials, and the
candidate release before setting STAGING_DATABASE_MIGRATIONS_COMMIT.
Source commit: 921b29a9fffb01acc73819f8761087080ddacfc9.
manifest.json records source SHA-256 hashes for all 64 migrations.
