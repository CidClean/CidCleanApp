import {
  dayKey,
  isLeadSource,
  isLeadStatus,
  leadColumns,
  nextScheduled,
  parseUsDate,
  sortLeads,
  type Appointment,
  type Lead,
  type LeadForm,
  type LeadStatus,
  type LeadSummary,
  type LostReason,
  type SalesPendingCounts,
} from './leadRules';
import { supabase } from './supabase';

/**
 * Acceso a los leads (migraciones 20261022000001 y 20261022000002). Todo pasa por las reglas por fila:
 * la app nunca decide sola quién ve o cambia qué.
 */

export type LeadsFailure = 'forbidden' | 'invalid' | 'not_found' | 'network' | 'server';
export type LeadsResult<T> = { ok: true; data: T } | { ok: false; reason: LeadsFailure };

export function failureFrom(code: string | undefined): LeadsFailure {
  if (code === '42501') return 'forbidden';
  if (code === '22023' || code === '23514' || code === '23502') return 'invalid';
  if (code === 'P0002') return 'not_found';
  return 'server';
}

type AppointmentRow = { id: string; starts_at: string; status: Appointment['status'] };
type FollowUpRow = { due_on: string; done_at: string | null };
type SiteRow = {
  id: string;
  name: string | null;
  address: string;
  created_at: string;
  walkthrough_appointments: AppointmentRow[] | null;
  walkthroughs?: { current_version: number }[] | { current_version: number } | null;
};
type ReasonRow = { id: string; label_es: string; label_en: string; sort: number; active: boolean };

function toAppointment(r: AppointmentRow): Appointment {
  return { id: r.id, startsAt: new Date(r.starts_at), status: r.status };
}

function openFollowUp(rows: FollowUpRow[] | null | undefined): string | null {
  return rows?.find((f) => f.done_at === null)?.due_on ?? null;
}

function toReason(r: ReasonRow): LostReason {
  return { id: r.id, labelEs: r.label_es, labelEn: r.label_en, sort: r.sort, active: r.active };
}

type SummaryRow = {
  id: string;
  company: string;
  contact_name: string | null;
  status: string;
  created_at: string;
  lead_followups: FollowUpRow[] | null;
  lead_sites: { walkthrough_appointments: AppointmentRow[] | null }[] | null;
};

export function rowToSummary(r: SummaryRow, now: Date): LeadSummary {
  const appointments = (r.lead_sites ?? []).flatMap((s) => (s.walkthrough_appointments ?? []).map(toAppointment));
  return {
    id: r.id,
    company: r.company,
    contactName: r.contact_name,
    status: isLeadStatus(r.status) ? r.status : 'new',
    createdAt: new Date(r.created_at),
    followUpOn: openFollowUp(r.lead_followups),
    nextWalkthrough: nextScheduled(appointments, now),
  };
}

export async function fetchLeads(now = new Date()): Promise<LeadsResult<LeadSummary[]>> {
  try {
    const { data, error } = await supabase
      .from('leads')
      .select(
        'id, company, contact_name, status, created_at, lead_followups(due_on, done_at), lead_sites(walkthrough_appointments(id, starts_at, status))',
      )
      .order('created_at', { ascending: false });
    if (error) return { ok: false, reason: failureFrom(error.code) };
    return { ok: true, data: sortLeads((data as unknown as SummaryRow[]).map((r) => rowToSummary(r, now))) };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

type LeadRow = {
  id: string;
  company: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  source: string;
  notes: string | null;
  status: string;
  lost_note: string | null;
  created_at: string;
  lost_reasons: ReasonRow | null;
  lead_followups: FollowUpRow[] | null;
  lead_sites: SiteRow[] | null;
};

export function rowToLead(r: LeadRow): Lead {
  const sites = [...(r.lead_sites ?? [])]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((s) => {
      const scheduled = (s.walkthrough_appointments ?? []).map(toAppointment).find((a) => a.status === 'scheduled') ?? null;
      const wt = Array.isArray(s.walkthroughs) ? s.walkthroughs[0] : s.walkthroughs;
      return { id: s.id, name: s.name, address: s.address, scheduled, walkthroughDone: (wt?.current_version ?? 0) > 0 };
    });
  return {
    id: r.id,
    company: r.company,
    contactName: r.contact_name,
    phone: r.phone,
    email: r.email,
    source: isLeadSource(r.source) ? r.source : 'manual',
    notes: r.notes,
    status: isLeadStatus(r.status) ? r.status : 'new',
    lostReason: r.lost_reasons ? toReason(r.lost_reasons) : null,
    lostNote: r.lost_note,
    createdAt: new Date(r.created_at),
    followUpOn: openFollowUp(r.lead_followups),
    sites,
  };
}

export async function fetchLead(id: string): Promise<LeadsResult<Lead>> {
  try {
    const { data, error } = await supabase
      .from('leads')
      .select(
        'id, company, contact_name, phone, email, source, notes, status, lost_note, created_at, ' +
          'lost_reasons(id, label_es, label_en, sort, active), lead_followups(due_on, done_at), ' +
          'lead_sites(id, name, address, created_at, walkthrough_appointments(id, starts_at, status), walkthroughs(current_version))',
      )
      .eq('id', id)
      .maybeSingle();
    if (error) return { ok: false, reason: failureFrom(error.code) };
    if (!data) return { ok: false, reason: 'not_found' };
    return { ok: true, data: rowToLead(data as unknown as LeadRow) };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** Pone, cambia o quita la fecha de seguimiento (RPC set_lead_followup). */
async function saveFollowUp(leadId: string, followUp: string): Promise<LeadsResult<null>> {
  const due = parseUsDate(followUp);
  if (due === 'invalid') return { ok: false, reason: 'invalid' };
  const { error } = await supabase.rpc('set_lead_followup', { p_lead: leadId, p_due: due });
  if (error) return { ok: false, reason: failureFrom(error.code) };
  return { ok: true, data: null };
}

/** Crea el lead (registro manual) y, si hay fecha, su seguimiento. Devuelve el id. */
export async function createLead(form: LeadForm): Promise<LeadsResult<string>> {
  try {
    const { data, error } = await supabase.from('leads').insert(leadColumns(form)).select('id').single();
    if (error || !data) return { ok: false, reason: failureFrom(error?.code) };
    const id = (data as { id: string }).id;
    if (form.followUp.trim() !== '') {
      const saved = await saveFollowUp(id, form.followUp);
      if (!saved.ok) return saved;
    }
    return { ok: true, data: id };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** Guarda los datos del lead y la fecha de seguimiento si cambió. */
export async function updateLead(lead: Lead, form: LeadForm): Promise<LeadsResult<null>> {
  try {
    const { error } = await supabase.from('leads').update(leadColumns(form)).eq('id', lead.id);
    if (error) return { ok: false, reason: failureFrom(error.code) };
    const due = parseUsDate(form.followUp);
    if (due !== lead.followUpOn) return await saveFollowUp(lead.id, form.followUp);
    return { ok: true, data: null };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** Cambia el estado (D-071). Perdido no pasa por aquí: lo hace markLeadLost con su motivo (D-079). */
export async function setLeadStatus(id: string, status: Exclude<LeadStatus, 'lost'>): Promise<LeadsResult<null>> {
  try {
    const { data, error } = await supabase.from('leads').update({ status }).eq('id', id).select('id');
    if (error) return { ok: false, reason: failureFrom(error.code) };
    if (!data || data.length === 0) return { ok: false, reason: 'forbidden' };
    return { ok: true, data: null };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

export async function markLeadLost(id: string, reasonId: string, note: string): Promise<LeadsResult<null>> {
  try {
    const { data, error } = await supabase
      .from('leads')
      .update({ status: 'lost', lost_reason_id: reasonId, lost_note: note.trim() === '' ? null : note.trim() })
      .eq('id', id)
      .select('id');
    if (error) return { ok: false, reason: failureFrom(error.code) };
    if (!data || data.length === 0) return { ok: false, reason: 'forbidden' };
    return { ok: true, data: null };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** Motivos de lead perdido (D-107), en su orden, activos y desactivados (D-203). */
export async function fetchLostReasons(): Promise<LeadsResult<LostReason[]>> {
  try {
    const { data, error } = await supabase.from('lost_reasons').select('id, label_es, label_en, sort, active').order('sort');
    if (error) return { ok: false, reason: failureFrom(error.code) };
    return { ok: true, data: (data as ReasonRow[]).map(toReason) };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

export async function addSite(leadId: string, name: string, address: string): Promise<LeadsResult<string>> {
  try {
    const { data, error } = await supabase
      .from('lead_sites')
      .insert({ lead_id: leadId, name: name.trim() === '' ? null : name.trim(), address: address.trim() })
      .select('id')
      .single();
    if (error || !data) return { ok: false, reason: failureFrom(error?.code) };
    return { ok: true, data: (data as { id: string }).id };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** Agenda (o mueve) el walkthrough del sitio (RPC schedule_walkthrough, D-072, D-078). */
export async function scheduleWalkthrough(siteId: string, startsAt: Date): Promise<LeadsResult<string>> {
  try {
    const { data, error } = await supabase.rpc('schedule_walkthrough', {
      p_site: siteId,
      p_starts_at: startsAt.toISOString(),
    });
    if (error) return { ok: false, reason: failureFrom(error.code) };
    return { ok: true, data: data as string };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** Días con citas agendadas entre dos fechas, para los puntos del calendario (D-104). */
export async function fetchAppointmentDays(from: Date, to: Date): Promise<LeadsResult<Set<string>>> {
  try {
    const { data, error } = await supabase
      .from('walkthrough_appointments')
      .select('starts_at')
      .eq('status', 'scheduled')
      .gte('starts_at', from.toISOString())
      .lt('starts_at', to.toISOString());
    if (error) return { ok: false, reason: failureFrom(error.code) };
    return { ok: true, data: new Set((data as { starts_at: string }[]).map((r) => dayKey(new Date(r.starts_at)))) };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** Pendientes de Ventas del Inicio (RPC home_sales_pending, D-111). */
export async function fetchSalesPending(): Promise<LeadsResult<SalesPendingCounts>> {
  try {
    const { data, error } = await supabase.rpc('home_sales_pending');
    if (error) return { ok: false, reason: failureFrom(error.code) };
    const row = (data as { followups_due: number; walkthroughs_upcoming: number }[] | null)?.[0];
    return {
      ok: true,
      data: { followUpsDue: row?.followups_due ?? 0, walkthroughsUpcoming: row?.walkthroughs_upcoming ?? 0 },
    };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** Elimina el lead (D-201, `leads_eliminar`); sus sitios, citas y seguimientos se van con él. */
export async function deleteLead(id: string): Promise<LeadsResult<null>> {
  try {
    const { data, error } = await supabase.from('leads').delete().eq('id', id).select('id');
    if (error) return { ok: false, reason: failureFrom(error.code) };
    if (!data || data.length === 0) return { ok: false, reason: 'forbidden' };
    return { ok: true, data: null };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** Edita el nombre y la dirección de un sitio (D-202). */
export async function updateSite(siteId: string, name: string, address: string): Promise<LeadsResult<null>> {
  try {
    const { data, error } = await supabase
      .from('lead_sites')
      .update({ name: name.trim() === '' ? null : name.trim(), address: address.trim() })
      .eq('id', siteId)
      .select('id');
    if (error) return { ok: false, reason: failureFrom(error.code) };
    if (!data || data.length === 0) return { ok: false, reason: 'forbidden' };
    return { ok: true, data: null };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** Borra un sitio (D-202). 'invalid' = tiene un walkthrough hecho y el servidor no lo deja. */
export async function deleteSite(siteId: string): Promise<LeadsResult<null>> {
  try {
    const { data, error } = await supabase.from('lead_sites').delete().eq('id', siteId).select('id');
    if (error) return { ok: false, reason: failureFrom(error.code) };
    if (!data || data.length === 0) return { ok: false, reason: 'forbidden' };
    return { ok: true, data: null };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** Crea un motivo con su texto en español y en inglés (D-203, solo el Super Admin). */
export async function createLostReason(labelEs: string, labelEn: string, sort: number): Promise<LeadsResult<string>> {
  try {
    const { data, error } = await supabase
      .from('lost_reasons')
      .insert({ label_es: labelEs.trim(), label_en: labelEn.trim(), sort })
      .select('id')
      .single();
    if (error || !data) return { ok: false, reason: failureFrom(error?.code) };
    return { ok: true, data: (data as { id: string }).id };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

export async function updateLostReason(id: string, labelEs: string, labelEn: string): Promise<LeadsResult<null>> {
  try {
    const { data, error } = await supabase
      .from('lost_reasons')
      .update({ label_es: labelEs.trim(), label_en: labelEn.trim() })
      .eq('id', id)
      .select('id');
    if (error) return { ok: false, reason: failureFrom(error.code) };
    if (!data || data.length === 0) return { ok: false, reason: 'forbidden' };
    return { ok: true, data: null };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** Papelera de Ajustes: borra el motivo, o lo desactiva si algún lead lo usa (RPC remove_lost_reason). */
export async function removeLostReason(id: string): Promise<LeadsResult<'deleted' | 'deactivated'>> {
  try {
    const { data, error } = await supabase.rpc('remove_lost_reason', { p_id: id });
    if (error) return { ok: false, reason: failureFrom(error.code) };
    return { ok: true, data: data === 'deactivated' ? 'deactivated' : 'deleted' };
  } catch {
    return { ok: false, reason: 'network' };
  }
}
