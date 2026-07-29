import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  Bell,
  CheckCheck,
  ChevronRight,
  Clock3,
  LoaderCircle,
  Mail,
  Megaphone,
  RefreshCw,
  Settings2,
  ShieldCheck,
} from 'lucide-react';
import {
  AppNotification,
  NotificationFrequency,
  NotificationPreference,
  archiveNotification,
  fetchMyNotifications,
  fetchNotificationPreferences,
  markAllNotificationsRead,
  markNotificationRead,
  saveNotificationPreference,
} from '../../lib/procurementApi';

interface NotificationCentreProps {
  activeOrgId: string;
  onNavigate: (tab: string) => void;
}

const CATEGORIES = [
  { id: 'campaign_health', label: 'Campaign health' },
  { id: 'deadline_reminder', label: 'Tender deadlines' },
  { id: 'cms_workflow', label: 'Editorial workflow' },
  { id: 'verification', label: 'Verification' },
  { id: 'subscriptions', label: 'Subscriptions' },
  { id: 'service_requests', label: 'Service requests' },
  { id: 'audience_email', label: 'Audience email' },
  { id: 'background_jobs', label: 'Platform reliability' },
] as const;

const FREQUENCIES: Array<{ value: NotificationFrequency; label: string }> = [
  { value: 'immediate', label: 'Immediate' },
  { value: 'daily_digest', label: 'Daily digest' },
  { value: 'weekly_digest', label: 'Weekly digest' },
  { value: 'disabled', label: 'Off' },
];

function categoryLabel(category: string): string {
  return CATEGORIES.find((item) => item.id === category)?.label
    ?? category.replaceAll('_', ' ');
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function priorityClasses(priority: AppNotification['priority']): string {
  if (priority === 'urgent') return 'border-red-700 bg-red-50 text-red-800';
  if (priority === 'high') return 'border-amber-700 bg-amber-50 text-amber-800';
  if (priority === 'low') return 'border-slate-400 bg-slate-50 text-slate-600';
  return 'border-violet-500 bg-violet-50 text-violet-800';
}

function categoryIcon(category: string) {
  if (category === 'campaign_health') return Megaphone;
  if (category === 'deadline_reminder') return Clock3;
  if (category === 'cms_workflow') return Mail;
  if (category === 'verification') return ShieldCheck;
  if (category === 'background_jobs') return AlertTriangle;
  return Bell;
}

function preferenceKey(category: string, channel: NotificationPreference['channel']) {
  return `${category}:${channel}`;
}

export function NotificationCentre({ activeOrgId, onNavigate }: NotificationCentreProps) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
  const [view, setView] = useState<'inbox' | 'archived' | 'preferences'>('inbox');
  const [category, setCategory] = useState('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState('');
  const [feedback, setFeedback] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setFeedback('');
    try {
      const [nextNotifications, nextPreferences] = await Promise.all([
        fetchMyNotifications({ includeArchived: true, limit: 100 }),
        fetchNotificationPreferences(activeOrgId),
      ]);
      setNotifications(nextNotifications);
      setPreferences(nextPreferences);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Could not load notifications.');
    } finally {
      setLoading(false);
    }
  }, [activeOrgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const unreadCount = notifications.filter((item) => item.status !== 'read' && item.status !== 'archived').length;
  const highPriorityCount = notifications.filter(
    (item) => item.status !== 'archived' && (item.priority === 'high' || item.priority === 'urgent'),
  ).length;

  const visibleNotifications = useMemo(() => {
    return notifications.filter((item) => {
      if (view === 'archived' ? item.status !== 'archived' : item.status === 'archived') return false;
      if (category !== 'all' && item.category !== category) return false;
      if (unreadOnly && item.status === 'read') return false;
      return true;
    });
  }, [category, notifications, unreadOnly, view]);

  const handleMarkAllRead = async () => {
    setFeedback('');
    try {
      await markAllNotificationsRead(null);
      setNotifications((current) => current.map((item) => (
        item.status === 'archived' ? item : { ...item, status: 'read', readAt: item.readAt ?? new Date().toISOString() }
      )));
      setFeedback('All notifications marked as read.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Could not mark notifications as read.');
    }
  };

  const handleOpen = async (notification: AppNotification) => {
    if (notification.status !== 'read' && notification.status !== 'archived') {
      setNotifications((current) => current.map((item) => (
        item.id === notification.id ? { ...item, status: 'read', readAt: new Date().toISOString() } : item
      )));
      try {
        await markNotificationRead(notification.id);
      } catch {
        void load();
      }
    }
    if (notification.workspaceTarget) {
      onNavigate(notification.workspaceTarget);
    } else if (notification.linkUrl) {
      window.location.assign(notification.linkUrl);
    }
  };

  const handleArchive = async (notification: AppNotification) => {
    setNotifications((current) => current.map((item) => (
      item.id === notification.id ? { ...item, status: 'archived' } : item
    )));
    try {
      await archiveNotification(notification.id);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Could not archive the notification.');
      void load();
    }
  };

  const getFrequency = (categoryId: string, channel: NotificationPreference['channel']): NotificationFrequency => (
    preferences.find((item) => item.category === categoryId && item.channel === channel)?.frequency
    ?? (channel === 'in_app' ? 'immediate' : 'disabled')
  );

  const handlePreference = async (
    categoryId: string,
    channel: NotificationPreference['channel'],
    frequency: NotificationFrequency,
  ) => {
    const key = preferenceKey(categoryId, channel);
    setSavingKey(key);
    setFeedback('');
    const next = { category: categoryId, channel, frequency };
    setPreferences((current) => [
      ...current.filter((item) => preferenceKey(item.category, item.channel) !== key),
      next,
    ]);
    try {
      await saveNotificationPreference(activeOrgId, next);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Could not save notification preference.');
      void load();
    } finally {
      setSavingKey('');
    }
  };

  return (
    <div className="space-y-6 text-left">
      <section className="border-2 border-slate-950 bg-slate-950 p-6 text-white md:p-8">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-start">
          <div>
            <p className="font-mono text-[9px] font-bold uppercase tracking-[.24em] text-emerald-300">Action inbox</p>
            <h2 className="mt-2 font-display text-3xl font-extrabold !text-white md:text-4xl">Notification Centre</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              Deadlines, approvals, delivery issues and operational actions in one place.
            </p>
          </div>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 border-2 border-white bg-white px-4 py-2 font-mono text-[9px] font-bold uppercase text-slate-950 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Unread', value: unreadCount, accent: 'bg-emerald-400' },
          { label: 'High priority', value: highPriorityCount, accent: 'bg-amber-300' },
          { label: 'Inbox total', value: notifications.filter((item) => item.status !== 'archived').length, accent: 'bg-violet-400' },
          { label: 'Archived', value: notifications.filter((item) => item.status === 'archived').length, accent: 'bg-sky-400' },
        ].map((stat) => (
          <div key={stat.label} className="relative overflow-hidden border-2 border-slate-950 bg-white p-5">
            <span className={`absolute inset-x-0 top-0 h-1.5 ${stat.accent}`} />
            <span className="font-mono text-[9px] font-bold uppercase tracking-[.14em] text-slate-500">{stat.label}</span>
            <span className="mt-3 block font-display text-3xl font-extrabold text-slate-950">{stat.value}</span>
          </div>
        ))}
      </section>

      <section className="border-2 border-slate-950 bg-white">
        <div className="flex flex-col gap-3 border-b-2 border-slate-950 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'inbox', label: 'Inbox', icon: Bell },
              { id: 'archived', label: 'Archived', icon: Archive },
              { id: 'preferences', label: 'Preferences', icon: Settings2 },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setView(item.id as typeof view)}
                  className={`inline-flex items-center gap-2 border-2 px-3 py-2 font-mono text-[9px] font-bold uppercase ${
                    view === item.id ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-300 text-slate-600'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" /> {item.label}
                </button>
              );
            })}
          </div>
          {view !== 'preferences' && unreadCount > 0 && (
            <button onClick={() => void handleMarkAllRead()} className="inline-flex items-center gap-2 font-mono text-[9px] font-bold uppercase text-emerald-700">
              <CheckCheck className="h-4 w-4" /> Mark all read
            </button>
          )}
        </div>

        {feedback && (
          <div className="border-b-2 border-slate-950 bg-sky-50 px-4 py-3 text-xs text-sky-900">{feedback}</div>
        )}

        {view === 'preferences' ? (
          <div className="divide-y-2 divide-slate-200">
            <div className="grid grid-cols-[minmax(0,1fr)_150px_150px] gap-3 bg-slate-100 px-4 py-3 font-mono text-[9px] font-bold uppercase text-slate-500">
              <span>Notification type</span><span>In-app</span><span>Email</span>
            </div>
            {CATEGORIES.map((item) => (
              <div key={item.id} className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_150px_150px] sm:items-center">
                <div>
                  <h3 className="font-display text-sm font-extrabold text-slate-950">{item.label}</h3>
                  <p className="mt-1 text-[10px] text-slate-500">Choose how frequently Manohub should deliver this category.</p>
                </div>
                {(['in_app', 'email'] as const).map((channel) => (
                  <select
                    key={channel}
                    value={getFrequency(item.id, channel)}
                    disabled={savingKey === preferenceKey(item.id, channel)}
                    onChange={(event) => void handlePreference(item.id, channel, event.target.value as NotificationFrequency)}
                    aria-label={`${item.label} ${channel} frequency`}
                    className="border-2 border-slate-950 bg-white px-2 py-2 text-xs disabled:opacity-50"
                  >
                    {FREQUENCIES.map((frequency) => (
                      <option key={frequency.value} value={frequency.value}>{frequency.label}</option>
                    ))}
                  </select>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3 border-b-2 border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center">
              <select value={category} onChange={(event) => setCategory(event.target.value)} className="border-2 border-slate-950 bg-white px-3 py-2 text-xs">
                <option value="all">All categories</option>
                {CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
              <label className="inline-flex items-center gap-2 font-mono text-[9px] font-bold uppercase text-slate-600">
                <input type="checkbox" checked={unreadOnly} onChange={(event) => setUnreadOnly(event.target.checked)} />
                Unread only
              </label>
            </div>

            {loading ? (
              <div className="grid min-h-56 place-items-center"><LoaderCircle className="h-6 w-6 animate-spin text-slate-500" /></div>
            ) : visibleNotifications.length === 0 ? (
              <div className="grid min-h-56 place-items-center p-8 text-center">
                <div>
                  <Bell className="mx-auto h-8 w-8 text-emerald-600" />
                  <p className="mt-3 font-display font-extrabold text-slate-950">Nothing needs attention</p>
                  <p className="mt-1 text-xs text-slate-500">This notification view is clear.</p>
                </div>
              </div>
            ) : (
              <div className="divide-y-2 divide-slate-200">
                {visibleNotifications.map((notification) => {
                  const Icon = categoryIcon(notification.category);
                  const unread = notification.status !== 'read' && notification.status !== 'archived';
                  return (
                    <article key={notification.id} className={`grid gap-4 p-4 lg:grid-cols-[44px_minmax(0,1fr)_150px] ${unread ? 'bg-emerald-50/40' : 'bg-white'}`}>
                      <span className="grid h-10 w-10 place-items-center border-2 border-slate-950 bg-white">
                        <Icon className="h-5 w-5 text-emerald-700" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`border px-2 py-0.5 font-mono text-[8px] font-bold uppercase ${priorityClasses(notification.priority)}`}>
                            {notification.priority}
                          </span>
                          <span className="font-mono text-[8px] font-bold uppercase text-slate-400">{categoryLabel(notification.category)}</span>
                          {unread && <span className="h-2 w-2 bg-emerald-500" aria-label="Unread" />}
                        </div>
                        <h3 className="mt-2 font-display text-sm font-extrabold text-slate-950">{notification.title}</h3>
                        {notification.body && <p className="mt-1 text-xs leading-5 text-slate-600">{notification.body}</p>}
                        <p className="mt-2 font-mono text-[9px] text-slate-400">{formatDate(notification.createdAt)}</p>
                      </div>
                      <div className="flex items-start justify-end gap-3">
                        {view !== 'archived' && (
                          <button onClick={() => void handleArchive(notification)} className="p-2 text-slate-400 hover:text-slate-950" aria-label="Archive notification">
                            <Archive className="h-4 w-4" />
                          </button>
                        )}
                        {(notification.workspaceTarget || notification.linkUrl) && (
                          <button
                            onClick={() => void handleOpen(notification)}
                            className="inline-flex items-center gap-1 border-2 border-slate-950 bg-slate-950 px-3 py-2 font-mono text-[8px] font-bold uppercase text-white"
                          >
                            {notification.actionLabel ?? 'Open'} <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
