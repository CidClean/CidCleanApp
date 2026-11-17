import { failureFrom, type LeadsResult } from './leadsApi';
import type { EmailTemplate, TemplateAudience, TemplateContext, TemplateEntity, TemplateForm } from './emailTemplates';
import { supabase } from './supabase';

/**
 * Plantillas de correo (migración 20261118000001). Las reglas por fila deciden quién lee (las activas, con leads_ver
 * o clientes_ver) y quién escribe (solo el Super Admin).
 */

type Row = { id: string; name: string; audience: TemplateAudience; subject: string; body: string; active: boolean; sort: number };
const toTemplate = (r: Row): EmailTemplate => ({ ...r });

/** Plantillas de una lista. `onlyActive` para el lead o el cliente (el Super Admin ve también las inactivas). */
export async function fetchTemplates(audience: TemplateAudience, onlyActive: boolean): Promise<LeadsResult<EmailTemplate[]>> {
  try {
    let q = supabase.from('email_templates').select('id, name, audience, subject, body, active, sort').eq('audience', audience);
    if (onlyActive) q = q.eq('active', true);
    const { data, error } = await q.order('sort').order('created_at');
    if (error) return { ok: false, reason: failureFrom(error.code) };
    return { ok: true, data: ((data ?? []) as Row[]).map(toTemplate) };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

export async function fetchTemplate(id: string): Promise<LeadsResult<EmailTemplate>> {
  try {
    const { data, error } = await supabase.from('email_templates').select('id, name, audience, subject, body, active, sort').eq('id', id).maybeSingle();
    if (error) return { ok: false, reason: failureFrom(error.code) };
    if (!data) return { ok: false, reason: 'not_found' };
    return { ok: true, data: toTemplate(data as Row) };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** Crea (sin `id`, al final de su lista) o guarda una plantilla. */
export async function saveTemplate(id: string | null, f: TemplateForm, sort: number): Promise<LeadsResult<null>> {
  try {
    const row = { name: f.name.trim(), audience: f.audience, subject: f.subject.trim(), body: f.body.replace(/\s+$/, ''), active: f.active };
    const { error } = id
      ? await supabase.from('email_templates').update(row).eq('id', id)
      : await supabase.from('email_templates').insert({ ...row, sort });
    if (error) return { ok: false, reason: failureFrom(error.code) };
    return { ok: true, data: null };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

export async function deleteTemplate(id: string): Promise<LeadsResult<null>> {
  try {
    const { error } = await supabase.from('email_templates').delete().eq('id', id);
    if (error) return { ok: false, reason: failureFrom(error.code) };
    return { ok: true, data: null };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** Empresa, contactos, dirección y firma para llenar la plantilla (template_email_context). */
export async function fetchTemplateContext(kind: TemplateEntity, id: string): Promise<LeadsResult<TemplateContext>> {
  try {
    const { data, error } = await supabase.rpc('template_email_context', { p_kind: kind, p_id: id });
    if (error) return { ok: false, reason: failureFrom(error.code) };
    const d = (data ?? {}) as Partial<TemplateContext>;
    return {
      ok: true,
      data: {
        company: d.company ?? null,
        address: d.address ?? null,
        contacts: (d.contacts ?? []).map((c) => ({ name: c.name ?? null, email: c.email ?? null, address: c.address ?? null })),
        sender: { name: d.sender?.name ?? null, phone: d.sender?.phone ?? null },
      },
    };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** Deja la fila del envío en el historial del lead o del cliente (log_template_email). */
export async function logTemplateEmail(templateId: string, kind: TemplateEntity, id: string, via: 'open' | 'copy'): Promise<LeadsResult<null>> {
  try {
    const { error } = await supabase.rpc('log_template_email', { p_template: templateId, p_kind: kind, p_id: id, p_via: via });
    if (error) return { ok: false, reason: failureFrom(error.code) };
    return { ok: true, data: null };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

export type EmailLogEntry = { at: string; action: 'correo_plantilla' | 'quote_recordatorio'; template: string | null; actor: string | null };

/** Correos del lead o del cliente (plantillas y recordatorios del quote), más recientes primero. */
export async function fetchEmailLog(kind: TemplateEntity, id: string): Promise<LeadsResult<EmailLogEntry[]>> {
  try {
    const { data, error } = await supabase.rpc('entity_email_log', { p_kind: kind, p_id: id });
    if (error) return { ok: false, reason: failureFrom(error.code) };
    return { ok: true, data: (data ?? []) as EmailLogEntry[] };
  } catch {
    return { ok: false, reason: 'network' };
  }
}
