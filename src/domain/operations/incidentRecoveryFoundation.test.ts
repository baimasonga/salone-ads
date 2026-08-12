import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration=readFileSync(resolve(process.cwd(),'migrations/manohub-new-project/50_incident_response_and_recovery.sql'),'utf8').toLowerCase();
const workspace=readFileSync(resolve(process.cwd(),'src/modules/platform-admin/AdminResilienceWorkspace.tsx'),'utf8');
const runbook=readFileSync(resolve(process.cwd(),'docs/backup-and-incident-response.md'),'utf8').toLowerCase();
const backupMigration=readFileSync(resolve(process.cwd(),'migrations/manohub-new-project/85_backup_verification_and_disaster_recovery.sql'),'utf8').toLowerCase();
const backupWorkflow=readFileSync(resolve(process.cwd(),'.github/workflows/backup-and-restore.yml'),'utf8').toLowerCase();
describe('incident response and recovery foundation',()=>{
  it('enforces controlled incident states and transitions',()=>{expect(migration).toContain("'declared', 'investigating', 'mitigated', 'monitoring', 'resolved', 'postmortem_complete'");expect(migration).toContain('private.validate_incident_transition')});
  it('keeps operational records admin-only and auditable',()=>{expect(migration).toContain('platform_incidents_admin_read');expect(migration).toContain("not public.is_platform_admin()");expect(migration).toContain("'incident.status_changed'");expect(migration).toContain("'recovery.exercise_recorded'")});
  it('records measurable restore evidence',()=>{for(const value of['restore_exercises','achieved_rpo_minutes','achieved_rto_minutes','evidence_reference'])expect(migration).toContain(value)});
  it('provides a visible incident and recovery workspace',()=>{expect(workspace).toContain('Reliability & Recovery');expect(workspace).toContain('Declare incident');expect(workspace).toContain('Record restore test')});
  it('documents storage and database recovery separately',()=>{expect(runbook).toContain('database backups do not include storage objects');expect(runbook).toContain('quarterly restore exercise');expect(runbook).toContain('key rotation')});
  it('keeps automated backup evidence private and admin-scoped',()=>{expect(backupMigration).toContain('alter table public.backup_runs enable row level security');expect(backupMigration).toContain('revoke all on public.backup_runs from public, anon, authenticated');expect(backupMigration).toContain('not public.is_platform_admin()')});
  it('backs up database, storage and configuration independently',()=>{for(const value of['supabase@2.113.0 db dump','rclone copy "supabase:$bucket"','configuration.tar.age','manifest_sha256'])expect(backupWorkflow).toContain(value)});
  it('rejects production as a restore-test target',()=>{expect(backupWorkflow).toContain('production database rejected as recovery target');expect(backupWorkflow).toContain('production storage rejected as recovery target');expect(backupWorkflow).toContain('restore-to-recovery-sandbox')});
});
