import { supabase } from './supabaseClient';
import { executeBackendCommand } from './commandApi';

export type PlatformStaffRole = 'owner' | 'administrator' | 'finance' | 'editorial' | 'support' | 'auditor';
export type PlatformStaffStatus = 'invited' | 'active' | 'suspended' | 'revoked';

export interface PlatformStaffMember {
  userId: string; email: string; fullName: string | null; role: PlatformStaffRole;
  status: PlatformStaffStatus; invitedAt: string; acceptedAt: string | null;
  suspendedAt: string | null; suspensionReason: string | null; updatedAt: string;
}

export async function fetchPlatformStaff(): Promise<PlatformStaffMember[]> {
  const { data, error } = await supabase.rpc('admin_list_platform_staff');
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    userId: row.user_id, email: row.email, fullName: row.full_name, role: row.role,
    status: row.status, invitedAt: row.invited_at, acceptedAt: row.accepted_at,
    suspendedAt: row.suspended_at, suspensionReason: row.suspension_reason, updatedAt: row.updated_at,
  }));
}

export async function invitePlatformStaff(email: string, role: Exclude<PlatformStaffRole, 'owner'>): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Authentication required.');
  const response = await fetch('/api/platform-staff/invitations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ email, role }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message || 'The invitation could not be sent.');
}

export async function updatePlatformStaff(userId: string, action: 'change_role'|'suspend'|'reactivate'|'revoke', role?: Exclude<PlatformStaffRole,'owner'>, reason?: string): Promise<void> {
  await executeBackendCommand('platform_staff.update', { userId, action, role: role ?? '', reason: reason ?? '' });
}
