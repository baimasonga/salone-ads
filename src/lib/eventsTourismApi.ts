import { supabase } from './supabaseClient';

export type ManagedEventStatus = 'draft' | 'published' | 'cancelled' | 'completed' | 'archived';
export type TourismStatus = 'draft' | 'published' | 'paused' | 'archived';

export interface ManagedEvent {
  id: string; title: string; description: string; eventType: string; venue: string; city: string; country: string;
  startsAt: string; endsAt: string | null; ticketUrl: string | null; capacity: number | null; status: ManagedEventStatus;
}

export interface TourismExperience {
  id: string; title: string; description: string; destination: string; district: string; category: string;
  durationDays: number; priceFrom: number | null; currencyCode: string; bookingUrl: string | null; status: TourismStatus;
}

const mapEvent = (row: any): ManagedEvent => ({
  id: row.id, title: row.title, description: row.description, eventType: row.event_type, venue: row.venue,
  city: row.city, country: row.country, startsAt: row.starts_at, endsAt: row.ends_at,
  ticketUrl: row.ticket_url, capacity: row.capacity, status: row.status,
});

const mapExperience = (row: any): TourismExperience => ({
  id: row.id, title: row.title, description: row.description, destination: row.destination, district: row.district,
  category: row.category, durationDays: row.duration_days, priceFrom: row.price_from == null ? null : Number(row.price_from),
  currencyCode: row.currency_code, bookingUrl: row.booking_url, status: row.status,
});

export async function fetchManagedEvents(orgId: string): Promise<ManagedEvent[]> {
  const { data, error } = await supabase.from('managed_events').select('*').eq('org_id', orgId).order('starts_at');
  if (error) throw error;
  return (data ?? []).map(mapEvent);
}

export async function saveManagedEvent(orgId: string, input: Omit<ManagedEvent, 'id'>, id?: string): Promise<ManagedEvent> {
  const payload = { org_id: orgId, title: input.title.trim(), description: input.description.trim(), event_type: input.eventType,
    venue: input.venue.trim(), city: input.city.trim(), country: input.country.trim(), starts_at: input.startsAt,
    ends_at: input.endsAt || null, ticket_url: input.ticketUrl || null, capacity: input.capacity, status: input.status };
  const query = id ? supabase.from('managed_events').update(payload).eq('id', id) : supabase.from('managed_events').insert(payload);
  const { data, error } = await query.select('*').single();
  if (error) throw error;
  return mapEvent(data);
}

export async function deleteManagedEvent(id: string): Promise<void> {
  const { error } = await supabase.from('managed_events').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchTourismExperiences(orgId: string): Promise<TourismExperience[]> {
  const { data, error } = await supabase.from('tourism_experiences').select('*').eq('org_id', orgId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapExperience);
}

export async function saveTourismExperience(orgId: string, input: Omit<TourismExperience, 'id'>, id?: string): Promise<TourismExperience> {
  const payload = { org_id: orgId, title: input.title.trim(), description: input.description.trim(), destination: input.destination.trim(),
    district: input.district.trim(), category: input.category, duration_days: input.durationDays, price_from: input.priceFrom,
    currency_code: input.currencyCode.toUpperCase(), booking_url: input.bookingUrl || null, status: input.status };
  const query = id ? supabase.from('tourism_experiences').update(payload).eq('id', id) : supabase.from('tourism_experiences').insert(payload);
  const { data, error } = await query.select('*').single();
  if (error) throw error;
  return mapExperience(data);
}

export async function deleteTourismExperience(id: string): Promise<void> {
  const { error } = await supabase.from('tourism_experiences').delete().eq('id', id);
  if (error) throw error;
}
