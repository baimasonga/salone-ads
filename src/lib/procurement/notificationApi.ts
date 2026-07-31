import { supabase } from '../supabaseClient';

export interface AppNotification {
  id: string; category: string; title: string; body: string | null; linkUrl: string | null;
  status: 'pending' | 'sent' | 'failed' | 'read' | 'archived';
  priority: 'low' | 'normal' | 'high' | 'urgent'; actionLabel: string | null;
  workspaceTarget: string | null; createdAt: string; readAt: string | null;
}

export async function fetchMyNotifications(options: { includeArchived?: boolean; limit?: number } = {}): Promise<AppNotification[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  let query = supabase.from('notifications')
    .select('id, category, title, body, link_url, status, priority, action_label, workspace_target, created_at, read_at')
    .eq('user_id', user.id).order('created_at', { ascending: false })
    .limit(Math.min(Math.max(options.limit ?? 30, 1), 200));
  if (!options.includeArchived) query = query.neq('status', 'archived');
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row: any) => ({ id: row.id, category: row.category, title: row.title, body: row.body,
    linkUrl: row.link_url, status: row.status, priority: row.priority ?? 'normal', actionLabel: row.action_label,
    workspaceTarget: row.workspace_target, createdAt: row.created_at, readAt: row.read_at }));
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase.rpc('mark_notification_read', { p_notification_id: id }); if (error) throw error;
}
export async function markAllNotificationsRead(orgId?: string | null): Promise<number> {
  const { data, error } = await supabase.rpc('mark_all_notifications_read', { p_org_id: orgId ?? null });
  if (error) throw error; return Number(data ?? 0);
}
export async function archiveNotification(id: string): Promise<void> {
  const { error } = await supabase.rpc('archive_notification', { p_notification_id: id }); if (error) throw error;
}

export type NotificationFrequency = 'immediate' | 'daily_digest' | 'weekly_digest' | 'disabled';
export interface NotificationPreference { category: string; channel: 'in_app' | 'email'; frequency: NotificationFrequency }

export async function fetchNotificationPreferences(orgId: string): Promise<NotificationPreference[]> {
  const { data: { user } } = await supabase.auth.getUser(); if (!user) return [];
  const { data, error } = await supabase.from('notification_preferences').select('category, channel, frequency')
    .eq('user_id', user.id).eq('org_id', orgId);
  if (error) throw error; return (data ?? []) as NotificationPreference[];
}

export async function saveNotificationPreference(orgId: string, preference: NotificationPreference): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in to update notification preferences.');
  const { error } = await supabase.from('notification_preferences').upsert({ user_id: user.id, org_id: orgId,
    category: preference.category, channel: preference.channel, frequency: preference.frequency },
    { onConflict: 'user_id,org_id,category,channel' });
  if (error) throw error;
}
