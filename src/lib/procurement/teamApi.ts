import { supabase } from '../supabaseClient';
import { executeBackendCommand } from '../commandApi';

export interface TeamMember { userId: string; role: string; fullName: string; email: string }

export async function fetchTeamMembers(orgId: string): Promise<TeamMember[]> {
  const { data: members, error: membersError } = await supabase.from('organization_members')
    .select('user_id, role, created_at').eq('org_id', orgId).order('created_at', { ascending: true });
  if (membersError) throw membersError; if (!members?.length) return [];
  const { data: profiles, error: profilesError } = await supabase.from('profiles').select('id, full_name, email')
    .in('id', members.map((member: any) => member.user_id));
  if (profilesError) throw profilesError;
  const profileById = new Map((profiles ?? []).map((profile: any) => [profile.id, profile]));
  return members.map((member: any) => { const profile = profileById.get(member.user_id); return {
    userId: member.user_id, role: member.role, fullName: profile?.full_name ?? '', email: profile?.email ?? '' }; });
}

export async function fetchTeamMemberLimit(orgId: string): Promise<number | null> {
  const { data, error } = await supabase.rpc('get_org_feature_limit', { p_org_id: orgId, p_feature_key: 'max_team_members' });
  if (error) throw error; return data ?? null;
}
export async function inviteTeamMember(orgId: string, email: string, role: 'owner'|'admin'|'member'): Promise<void> {
  await executeBackendCommand('organization.invite', { orgId, email, role });
}
export async function removeTeamMember(orgId: string, userId: string): Promise<void> {
  const { error } = await supabase.from('organization_members').delete().eq('org_id', orgId).eq('user_id', userId);
  if (error) throw error;
}
