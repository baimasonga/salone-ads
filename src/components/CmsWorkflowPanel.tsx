import { useEffect, useMemo, useState } from 'react';
import { Check, Clock, Send, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react';
import {
  assignCmsContent,
  CmsActivity,
  CmsContent,
  CmsProfileOption,
  CmsTeamMember,
  CmsTeamRole,
  fetchCmsActivity,
  fetchCmsCurrentRole,
  fetchCmsTeam,
  removeCmsTeamMember,
  saveCmsTeamMember,
  transitionCmsContent,
} from '../lib/cmsApi';

const ROLE_COPY: Record<CmsTeamRole, string> = {
  writer: 'Creates drafts and submits assigned work for review.',
  editor: 'Reviews, requests changes and approves other people’s work.',
  publisher: 'Schedules and publishes approved content.',
  administrator: 'Manages the editorial team and all content.',
};

interface Props {
  items: CmsContent[];
  selected: CmsContent | null;
  fallbackRole?: CmsTeamRole | null;
  onReload: () => Promise<void>;
  onSelect: (id: string) => void;
  onFeedback: (message: string) => void;
}

export function CmsWorkflowPanel({ items, selected, fallbackRole = null, onReload, onSelect, onFeedback }: Props) {
  const [role, setRole] = useState<CmsTeamRole | null>(fallbackRole);
  const [members, setMembers] = useState<CmsTeamMember[]>([]);
  const [profiles, setProfiles] = useState<CmsProfileOption[]>([]);
  const [activity, setActivity] = useState<CmsActivity[]>([]);
  const [memberId, setMemberId] = useState('');
  const [memberRole, setMemberRole] = useState<CmsTeamRole>('writer');
  const [publishAt, setPublishAt] = useState('');
  const [busy, setBusy] = useState('');

  const loadTeam = async (currentRole: CmsTeamRole | null) => {
    if (!currentRole) return;
    const team = await fetchCmsTeam();
    setMembers(team.members);
    setProfiles(team.profiles);
  };

  useEffect(() => {
    fetchCmsCurrentRole()
      .then(async currentRole => {
        const effectiveRole = currentRole || fallbackRole;
        setRole(effectiveRole);
        await Promise.all([loadTeam(effectiveRole), fetchCmsActivity().then(setActivity)]);
      })
      .catch(error => {
        if (!fallbackRole) onFeedback(error instanceof Error ? error.message : 'Editorial workflow could not be loaded.');
      });
  }, [fallbackRole]);

  useEffect(() => {
    setPublishAt(selected?.publishedAt?.slice(0, 16) || '');
  }, [selected?.id, selected?.publishedAt]);

  const counts = useMemo(() => ({
    myDrafts: items.filter(item => item.status === 'draft').length,
    inReview: items.filter(item => item.status === 'review').length,
    approved: items.filter(item => item.status === 'approved').length,
    scheduled: items.filter(item => item.status === 'published' && item.publishedAt && new Date(item.publishedAt) > new Date()).length,
  }), [items]);

  const changeStatus = async (status: CmsContent['status'], label: string) => {
    if (!selected) return;
    setBusy(`status-${status}`);
    try {
      const scheduledAt = status === 'published' && publishAt ? new Date(publishAt).toISOString() : undefined;
      await transitionCmsContent(selected.id, status, selected.reviewNote, scheduledAt);
      await onReload();
      setActivity(await fetchCmsActivity());
      onFeedback(`${selected.title} ${label}.`);
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : 'The workflow action could not be completed.');
    } finally {
      setBusy('');
    }
  };

  const assign = async (userId: string) => {
    if (!selected) return;
    setBusy('assign');
    try {
      await assignCmsContent(selected.id, userId || null);
      await onReload();
      setActivity(await fetchCmsActivity());
      onFeedback(userId ? 'Content assignment updated.' : 'Content is now unassigned.');
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : 'Assignment could not be updated.');
    } finally {
      setBusy('');
    }
  };

  const addMember = async () => {
    if (!memberId) return;
    setBusy('team');
    try {
      await saveCmsTeamMember(memberId, memberRole);
      await loadTeam(role);
      setMemberId('');
      onFeedback('Editorial team role saved.');
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : 'Team role could not be saved.');
    } finally {
      setBusy('');
    }
  };

  const removeMember = async (userId: string) => {
    if (!window.confirm('Remove this person from the editorial team?')) return;
    setBusy(`remove-${userId}`);
    try {
      await removeCmsTeamMember(userId);
      await loadTeam(role);
      onFeedback('Editorial team member removed.');
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : 'Team member could not be removed.');
    } finally {
      setBusy('');
    }
  };

  if (!role) return null;
  const canAssign = role === 'editor' || role === 'publisher' || role === 'administrator';
  const availableProfiles = profiles.filter(profile => !members.some(member => member.userId === profile.id));

  return <div className="space-y-5">
    <section className="border-2 border-slate-950 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="font-mono text-[9px] font-bold uppercase tracking-widest text-violet-600">Editorial operations</p><h3 className="font-display text-xl font-extrabold">Workflow desk</h3><p className="mt-1 text-xs text-slate-500">Signed in as {role}. {ROLE_COPY[role]}</p></div>
        <span className="border border-violet-300 bg-violet-50 px-3 py-2 font-mono text-[9px] font-bold uppercase text-violet-800">{role}</span>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        {[['Drafts', counts.myDrafts, 'bg-blue-50 text-blue-800'], ['In review', counts.inReview, 'bg-amber-50 text-amber-800'], ['Approved', counts.approved, 'bg-emerald-50 text-emerald-800'], ['Scheduled', counts.scheduled, 'bg-violet-50 text-violet-800']].map(([label, value, color]) =>
          <div key={String(label)} className={`border border-slate-200 p-4 ${color}`}><p className="font-display text-2xl font-extrabold">{value}</p><p className="font-mono text-[8px] font-bold uppercase">{label}</p></div>)}
      </div>
    </section>

    {selected && <section className="border border-slate-200 bg-slate-950 p-5 text-white">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="font-mono text-[9px] font-bold uppercase tracking-widest text-violet-300">Current stage</p><h3 className="mt-1 font-display text-xl font-extrabold !text-white">{selected.status}</h3><p className="mt-1 text-xs text-slate-300">{selected.title}</p></div>
        <div className="flex flex-wrap gap-2">
          {(role === 'writer' || role === 'administrator') && selected.status === 'draft' && <button onClick={() => void changeStatus('review', 'submitted for review')} disabled={Boolean(busy)} className="inline-flex items-center gap-2 bg-amber-400 px-4 py-2.5 text-[10px] font-bold uppercase text-slate-950"><Send className="h-3.5 w-3.5" />Submit for review</button>}
          {(role === 'editor' || role === 'administrator') && selected.status === 'review' && <><button onClick={() => void changeStatus('draft', 'returned for changes')} disabled={Boolean(busy)} className="border border-white/40 px-4 py-2.5 text-[10px] font-bold uppercase">Request changes</button><button onClick={() => void changeStatus('approved', 'approved')} disabled={Boolean(busy)} className="inline-flex items-center gap-2 bg-emerald-500 px-4 py-2.5 text-[10px] font-bold uppercase text-white"><Check className="h-3.5 w-3.5" />Approve</button></>}
        </div>
      </div>
      {(role === 'publisher' || role === 'administrator') && selected.status === 'approved' && <div className="mt-5 flex flex-wrap items-end gap-3 border-t border-white/20 pt-4"><label className="text-[10px] font-bold uppercase text-slate-300">Publish now or schedule<input type="datetime-local" value={publishAt} onChange={event => setPublishAt(event.target.value)} className="mt-1 block !border-white/30 !bg-white !text-slate-950" /></label><button onClick={() => void changeStatus('published', publishAt ? 'scheduled for publication' : 'published')} disabled={Boolean(busy)} className="inline-flex items-center gap-2 bg-violet-500 px-4 py-3 text-[10px] font-bold uppercase text-white"><Clock className="h-3.5 w-3.5" />{publishAt ? 'Schedule' : 'Publish now'}</button></div>}
      {canAssign && <label className="mt-4 block text-[10px] font-bold uppercase text-slate-300">Assigned writer<select value={selected.assignedTo || ''} onChange={event => void assign(event.target.value)} disabled={busy === 'assign'} className="mt-1 block w-full max-w-md !border-white/30 !bg-white !text-slate-950"><option value="">Unassigned</option>{members.filter(member => member.role === 'writer').map(member => <option key={member.userId} value={member.userId}>{member.fullName || member.email || member.userId}</option>)}</select></label>}
    </section>}

    {role === 'administrator' && <section className="border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-2"><Users className="h-4 w-4 text-violet-600" /><div><p className="font-mono text-[9px] font-bold uppercase tracking-widest text-violet-600">Governance</p><h3 className="font-display text-lg font-extrabold">Editorial team</h3></div></div>
      <div className="mt-4 grid gap-2 md:grid-cols-[1fr_180px_auto]"><select value={memberId} onChange={event => setMemberId(event.target.value)}><option value="">Choose a registered user</option>{availableProfiles.map(profile => <option key={profile.id} value={profile.id}>{profile.fullName || profile.email || profile.id}</option>)}</select><select value={memberRole} onChange={event => setMemberRole(event.target.value as CmsTeamRole)}>{Object.keys(ROLE_COPY).map(item => <option key={item} value={item}>{item}</option>)}</select><button onClick={() => void addMember()} disabled={!memberId || busy === 'team'} className="inline-flex items-center justify-center gap-2 bg-slate-950 px-4 py-3 text-[10px] font-bold uppercase text-white"><UserPlus className="h-3.5 w-3.5" />Add member</button></div>
      <div className="mt-4 grid gap-2 md:grid-cols-2">{members.map(member => <div key={member.userId} className="flex items-center justify-between gap-3 border border-slate-200 p-3"><div><p className="text-sm font-bold">{member.fullName || member.email || member.userId}</p><p className="font-mono text-[8px] uppercase text-violet-700">{member.role}</p></div><button aria-label="Remove team member" onClick={() => void removeMember(member.userId)} disabled={busy === `remove-${member.userId}`} className="text-red-600"><Trash2 className="h-4 w-4" /></button></div>)}</div>
    </section>}

    <section className="border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600" /><h3 className="font-display text-lg font-extrabold">Recent editorial activity</h3></div>
      <div className="mt-4 grid gap-2">{activity.slice(0, 12).map(event => <button key={event.id} onClick={() => event.contentId && onSelect(event.contentId)} className="flex items-center justify-between gap-4 border-b border-slate-100 py-2 text-left"><div><p className="text-xs font-bold capitalize">{event.action.replaceAll('_', ' ')}</p><p className="text-[10px] text-slate-500">{String(event.details.title || 'Content')}</p></div><span className="font-mono text-[8px] uppercase text-slate-400">{new Date(event.createdAt).toLocaleString('en-GB')}</span></button>)}</div>
    </section>
  </div>;
}
