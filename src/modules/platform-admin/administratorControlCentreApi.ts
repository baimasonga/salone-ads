import type { PlatformStaffRole } from '../../lib/platformStaffApi';
import { executeBackendCommand } from '../../lib/commandApi';

export type SnapshotFormat = 'number' | 'currency';
export type SignalSeverity = 'warning' | 'critical';

export interface ControlCentreMetric {
  label: string;
  value: number;
  format: SnapshotFormat;
  href: string;
}

export interface ControlCentreSignal {
  label: string;
  value: number;
  href: string;
  severity?: SignalSeverity;
}

export interface PlatformIntakeControl {
  key: 'subscriber_onboarding' | 'procurement_submissions' | 'advertising_orders' | 'service_requests';
  label: string;
  enabled: boolean;
  reason: string | null;
  updatedAt: string;
  updatedBy: string | null;
}

export interface AdministratorControlCentreSnapshot {
  role: PlatformStaffRole;
  generatedAt: string;
  metrics: ControlCentreMetric[];
  queues: ControlCentreSignal[];
  risks: ControlCentreSignal[];
  health: ControlCentreSignal[];
  controls: PlatformIntakeControl[];
  canManageControls: boolean;
}

export interface UploadSecurityEvent {
  id: number; file_name: string; file_kind: string; mime_type: string; file_size: number;
  verdict: 'clean' | 'blocked' | 'error'; threat_detail: string | null; request_id: string | null; created_at: string;
}

async function getSupabase() {
  return (await import('../../lib/supabaseClient')).supabase;
}

export async function fetchAdministratorControlCentre(): Promise<AdministratorControlCentreSnapshot> {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc('get_administrator_control_centre_snapshot');
  if (error) throw error;
  if (!data || typeof data !== 'object') throw new Error('The Control Centre returned no operational snapshot.');
  return data as unknown as AdministratorControlCentreSnapshot;
}

export async function updatePlatformIntakeControl(
  key: PlatformIntakeControl['key'],
  enabled: boolean,
  reason: string,
): Promise<void> {
  await executeBackendCommand('platform_intake_control.update', { controlKey: key, enabled, reason });
}

export async function fetchUploadSecurityEvents(): Promise<UploadSecurityEvent[]> {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc('admin_upload_security_events', { p_limit: 50 });
  if (error) throw error;
  return (data ?? []) as UploadSecurityEvent[];
}
