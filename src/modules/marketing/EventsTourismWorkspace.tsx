import { useEffect, useState } from 'react';
import { CalendarDays, ExternalLink, Loader2, MapPinned, Megaphone, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Organization } from '../../types';
import { createContentItem, createTrackingLink } from '../../lib/api';
import {
  deleteManagedEvent,
  deleteTourismExperience,
  fetchManagedEvents,
  fetchTourismExperiences,
  saveManagedEvent,
  saveTourismExperience,
  type ManagedEvent,
  type TourismExperience,
} from '../../lib/eventsTourismApi';

const emptyEvent = (): Omit<ManagedEvent, 'id'> => ({
  title: '', description: '', eventType: 'community', venue: '', city: 'Freetown', country: 'Sierra Leone',
  startsAt: '', endsAt: null, ticketUrl: null, capacity: null, status: 'draft',
});
const emptyTour = (): Omit<TourismExperience, 'id'> => ({
  title: '', description: '', destination: '', district: '', category: 'heritage', durationDays: 1,
  priceFrom: null, currencyCode: 'SLE', bookingUrl: null, status: 'draft',
});

export function EventsTourismWorkspace({ organization, mode }: { organization: Organization; mode: 'events' | 'tourism' }) {
  const [events, setEvents] = useState<ManagedEvent[]>([]);
  const [experiences, setExperiences] = useState<TourismExperience[]>([]);
  const [eventDraft, setEventDraft] = useState<Omit<ManagedEvent, 'id'>>(emptyEvent());
  const [tourDraft, setTourDraft] = useState<Omit<TourismExperience, 'id'>>(emptyTour());
  const [editingId, setEditingId] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');

  const load = async () => {
    if (mode === 'events') setEvents(await fetchManagedEvents(organization.id));
    else setExperiences(await fetchTourismExperiences(organization.id));
  };

  useEffect(() => { void load().catch((error) => setFeedback(error.message || 'Could not load inventory.')); }, [mode, organization.id]);

  const reset = () => {
    setEditingId(''); setShowForm(false); setEventDraft(emptyEvent()); setTourDraft(emptyTour());
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setFeedback('');
    try {
      if (mode === 'events') await saveManagedEvent(organization.id, eventDraft, editingId || undefined);
      else await saveTourismExperience(organization.id, tourDraft, editingId || undefined);
      await load(); reset(); setFeedback(editingId ? 'Record updated.' : 'Record created.');
    } catch (error: any) { setFeedback(error.message || 'Could not save record.'); }
    finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this record permanently?')) return;
    try { mode === 'events' ? await deleteManagedEvent(id) : await deleteTourismExperience(id); await load(); }
    catch (error: any) { setFeedback(error.message || 'Could not delete record.'); }
  };

  const promoteEvent = async (item: ManagedEvent) => {
    try {
      await createContentItem(organization.id, { title: `Promote: ${item.title}`, contentType: 'Social Post', platform: 'Facebook & WhatsApp',
        headline: item.title, bodyText: `${item.title} — ${new Date(item.startsAt).toLocaleString('en-GB')} at ${item.venue || item.city}.`,
        hashtags: ['#Hyderra', '#SierraLeoneEvents'], scheduledDate: item.startsAt.slice(0, 10) });
      setFeedback(`Content Studio draft created for “${item.title}”.`);
    } catch (error: any) { setFeedback(error.message || 'Could not create promotion draft.'); }
  };

  const trackExperience = async (item: TourismExperience) => {
    if (!item.bookingUrl) { setFeedback('Add a booking URL before creating a tracking link.'); return; }
    try { const link = await createTrackingLink(organization.id, item.title, item.bookingUrl); setFeedback(`Tracking link created: ${window.location.origin}/r/${link.shortCode}`); }
    catch (error: any) { setFeedback(error.message || 'Could not create tracking link.'); }
  };

  const startEventEdit = (item: ManagedEvent) => { setEditingId(item.id); setEventDraft({ ...item, startsAt: item.startsAt.slice(0, 16), endsAt: item.endsAt?.slice(0, 16) ?? null }); setShowForm(true); };
  const startTourEdit = (item: TourismExperience) => { setEditingId(item.id); setTourDraft({ ...item }); setShowForm(true); };
  const Icon = mode === 'events' ? CalendarDays : MapPinned;

  return <div className="space-y-6 text-left">
    <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-100 bg-white p-6 shadow-xs sm:flex-row sm:items-center">
      <div><h3 className="flex items-center gap-2 font-display text-lg font-bold text-slate-900"><Icon className="h-5 w-5 text-emerald-600" /> {mode === 'events' ? 'Events Management' : 'Tourism Management'}</h3>
        <p className="mt-1 text-xs text-slate-500">Manage real {mode === 'events' ? 'event schedules, ticket links and promotion drafts' : 'destinations, packages, pricing and booking campaigns'}.</p></div>
      <button onClick={() => { reset(); setShowForm(true); }} className="btn-geometric-primary inline-flex items-center justify-center gap-2 text-xs"><Plus className="h-4 w-4" /> New {mode === 'events' ? 'event' : 'experience'}</button>
    </div>
    {feedback && <div role="status" className="border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{feedback}</div>}
    {showForm && <form onSubmit={submit} className="grid gap-4 rounded-2xl border-2 border-emerald-500 bg-white p-6 md:grid-cols-2">
      <label className="text-xs font-bold md:col-span-2">Title<input required value={mode === 'events' ? eventDraft.title : tourDraft.title} onChange={e => mode === 'events' ? setEventDraft({ ...eventDraft, title: e.target.value }) : setTourDraft({ ...tourDraft, title: e.target.value })} className="mt-1 w-full" /></label>
      <label className="text-xs font-bold md:col-span-2">Description<textarea value={mode === 'events' ? eventDraft.description : tourDraft.description} onChange={e => mode === 'events' ? setEventDraft({ ...eventDraft, description: e.target.value }) : setTourDraft({ ...tourDraft, description: e.target.value })} className="mt-1 min-h-24 w-full" /></label>
      {mode === 'events' ? <>
        <label className="text-xs font-bold">Type<select value={eventDraft.eventType} onChange={e => setEventDraft({ ...eventDraft, eventType: e.target.value })} className="mt-1 w-full"><option value="conference">Conference</option><option value="festival">Festival</option><option value="concert">Concert</option><option value="community">Community</option><option value="sports">Sports</option><option value="other">Other</option></select></label>
        <label className="text-xs font-bold">Venue<input value={eventDraft.venue} onChange={e => setEventDraft({ ...eventDraft, venue: e.target.value })} className="mt-1 w-full" /></label>
        <label className="text-xs font-bold">Starts<input required type="datetime-local" value={eventDraft.startsAt} onChange={e => setEventDraft({ ...eventDraft, startsAt: e.target.value })} className="mt-1 w-full" /></label>
        <label className="text-xs font-bold">Ends<input type="datetime-local" value={eventDraft.endsAt ?? ''} onChange={e => setEventDraft({ ...eventDraft, endsAt: e.target.value || null })} className="mt-1 w-full" /></label>
        <label className="text-xs font-bold">City<input value={eventDraft.city} onChange={e => setEventDraft({ ...eventDraft, city: e.target.value })} className="mt-1 w-full" /></label>
        <label className="text-xs font-bold">Ticket URL<input type="url" value={eventDraft.ticketUrl ?? ''} onChange={e => setEventDraft({ ...eventDraft, ticketUrl: e.target.value || null })} className="mt-1 w-full" /></label>
        <label className="text-xs font-bold">Capacity<input type="number" min="0" value={eventDraft.capacity ?? ''} onChange={e => setEventDraft({ ...eventDraft, capacity: e.target.value ? Number(e.target.value) : null })} className="mt-1 w-full" /></label>
        <label className="text-xs font-bold">Status<select value={eventDraft.status} onChange={e => setEventDraft({ ...eventDraft, status: e.target.value as ManagedEvent['status'] })} className="mt-1 w-full"><option value="draft">Draft</option><option value="published">Published</option><option value="cancelled">Cancelled</option><option value="completed">Completed</option><option value="archived">Archived</option></select></label>
      </> : <>
        <label className="text-xs font-bold">Destination<input required value={tourDraft.destination} onChange={e => setTourDraft({ ...tourDraft, destination: e.target.value })} className="mt-1 w-full" /></label>
        <label className="text-xs font-bold">District<input value={tourDraft.district} onChange={e => setTourDraft({ ...tourDraft, district: e.target.value })} className="mt-1 w-full" /></label>
        <label className="text-xs font-bold">Category<select value={tourDraft.category} onChange={e => setTourDraft({ ...tourDraft, category: e.target.value })} className="mt-1 w-full"><option value="heritage">Heritage</option><option value="eco_tourism">Eco-tourism</option><option value="beach">Beach</option><option value="adventure">Adventure</option><option value="cultural">Cultural</option><option value="other">Other</option></select></label>
        <label className="text-xs font-bold">Duration (days)<input required type="number" min="1" max="365" value={tourDraft.durationDays} onChange={e => setTourDraft({ ...tourDraft, durationDays: Number(e.target.value) })} className="mt-1 w-full" /></label>
        <label className="text-xs font-bold">Price from<input type="number" min="0" value={tourDraft.priceFrom ?? ''} onChange={e => setTourDraft({ ...tourDraft, priceFrom: e.target.value ? Number(e.target.value) : null })} className="mt-1 w-full" /></label>
        <label className="text-xs font-bold">Currency<input maxLength={3} value={tourDraft.currencyCode} onChange={e => setTourDraft({ ...tourDraft, currencyCode: e.target.value.toUpperCase() })} className="mt-1 w-full" /></label>
        <label className="text-xs font-bold">Booking URL<input type="url" value={tourDraft.bookingUrl ?? ''} onChange={e => setTourDraft({ ...tourDraft, bookingUrl: e.target.value || null })} className="mt-1 w-full" /></label>
        <label className="text-xs font-bold">Status<select value={tourDraft.status} onChange={e => setTourDraft({ ...tourDraft, status: e.target.value as TourismExperience['status'] })} className="mt-1 w-full"><option value="draft">Draft</option><option value="published">Published</option><option value="paused">Paused</option><option value="archived">Archived</option></select></label>
      </>}
      <div className="flex gap-2 md:col-span-2"><button disabled={busy} className="btn-geometric-primary inline-flex items-center gap-2">{busy && <Loader2 className="h-4 w-4 animate-spin" />} Save</button><button type="button" onClick={reset} className="btn-geometric-secondary">Cancel</button></div>
    </form>}
    <div className="grid gap-4 lg:grid-cols-2">{(mode === 'events' ? events : experiences).map(item => <article key={item.id} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-xs">
      <div className="flex items-start justify-between gap-3"><div><span className="font-mono text-[10px] font-bold uppercase text-emerald-700">{item.status}</span><h4 className="mt-1 font-display font-bold text-slate-900">{item.title}</h4></div><div className="flex gap-1"><button aria-label="Edit" onClick={() => mode === 'events' ? startEventEdit(item as ManagedEvent) : startTourEdit(item as TourismExperience)} className="p-2 text-slate-500"><Pencil className="h-4 w-4" /></button><button aria-label="Delete" onClick={() => void remove(item.id)} className="p-2 text-red-600"><Trash2 className="h-4 w-4" /></button></div></div>
      <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-slate-500">{item.description || 'No description supplied.'}</p>
      {mode === 'events' ? <p className="mt-3 text-xs text-slate-700">{new Date((item as ManagedEvent).startsAt).toLocaleString('en-GB')} · {(item as ManagedEvent).venue || (item as ManagedEvent).city}</p> : <p className="mt-3 text-xs text-slate-700">{(item as TourismExperience).destination} · {(item as TourismExperience).durationDays} day(s){(item as TourismExperience).priceFrom != null ? ` · From ${(item as TourismExperience).currencyCode} ${(item as TourismExperience).priceFrom}` : ''}</p>}
      <div className="mt-4 flex flex-wrap gap-2"><button onClick={() => mode === 'events' ? void promoteEvent(item as ManagedEvent) : void trackExperience(item as TourismExperience)} className="inline-flex items-center gap-1 bg-emerald-600 px-3 py-2 text-xs font-bold text-white">{mode === 'events' ? <Megaphone className="h-3.5 w-3.5" /> : <ExternalLink className="h-3.5 w-3.5" />}{mode === 'events' ? 'Create promotion draft' : 'Create tracking link'}</button></div>
    </article>)}</div>
    {(mode === 'events' ? events : experiences).length === 0 && !showForm && <div className="border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">No records yet. Create the first {mode === 'events' ? 'event' : 'tourism experience'}.</div>}
  </div>;
}
