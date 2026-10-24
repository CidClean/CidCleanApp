import { FunctionsHttpError } from '@supabase/supabase-js';

import type { ApiResult } from './employeesApi';
import { failureFromCode, functionFailure } from './employeesApi';
import { linesForSave, toVersion, type QuoteLines, type QuoteStatus, type SiteQuote } from './quoteRules';
import { supabase } from './supabase';
import type { PickedPdf } from './termsApi';

/** Quote del hito 4 (migración 20261024000001): todo por funciones de la base y la Edge Function send-quote. */

export async function fetchSiteQuote(siteId: string): Promise<ApiResult<SiteQuote>> {
  try {
    const { data, error } = await supabase.rpc('get_site_quote', { p_site: siteId });
    if (error) return { ok: false, reason: failureFromCode(error.code) };
    const d = (data ?? {}) as {
      quote_id: string | null;
      walkthrough_closed: boolean;
      versions: Record<string, unknown>[];
      frequency?: SiteQuote['frequency'];
      address?: string | null;
    };
    return {
      ok: true,
      data: {
        quoteId: d.quote_id,
        walkthroughClosed: d.walkthrough_closed === true,
        versions: (d.versions ?? []).map(toVersion),
        frequency: d.frequency ?? null,
        address: d.address ?? null,
      },
    };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** Crea el quote del sitio con su borrador 1.0 (si ya existe, lo devuelve). */
export async function ensureQuote(siteId: string): Promise<ApiResult<string>> {
  try {
    const { data, error } = await supabase.rpc('ensure_quote', { p_site: siteId });
    if (error) return { ok: false, reason: failureFromCode(error.code) };
    return { ok: true, data: String(data) };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

export async function saveQuoteDraft(
  versionId: string,
  draft: { lines: QuoteLines; taxRate: number; validDays: number; recipients: string[] },
): Promise<ApiResult<null>> {
  try {
    const { error } = await supabase.rpc('save_quote_draft', {
      p_version: versionId,
      p_lines: linesForSave(draft.lines),
      p_tax_rate: draft.taxRate,
      p_valid_days: draft.validDays,
      p_recipients: draft.recipients,
    });
    if (error) return { ok: false, reason: failureFromCode(error.code) };
    return { ok: true, data: null };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** Sube el SOW al bucket `quote-files` en `<quote>/<versión>/sow-<único>.pdf` y lo registra en la versión. */
export async function uploadQuoteSow(quoteId: string, versionId: string, file: PickedPdf): Promise<ApiResult<null>> {
  try {
    const path = `${quoteId}/${versionId}/sow-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.pdf`;
    const bytes = await (await fetch(file.uri)).arrayBuffer();
    const up = await supabase.storage.from('quote-files').upload(path, bytes, { contentType: 'application/pdf' });
    if (up.error) return { ok: false, reason: 'server' };
    const { error } = await supabase.rpc('set_quote_sow', { p_version: versionId, p_path: path });
    if (error) return { ok: false, reason: failureFromCode(error.code) };
    return { ok: true, data: null };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** Envía (o reenvía el correo de) una versión. Devuelve cuántos correos salieron. */
export async function sendQuote(versionId: string, resend = false): Promise<ApiResult<{ sent: number; failed: number }>> {
  try {
    const { data, error } = await supabase.functions.invoke('send-quote', { body: { version_id: versionId, resend } });
    if (error) return { ok: false, reason: error instanceof FunctionsHttpError ? await functionFailure(error) : 'network' };
    return { ok: true, data: { sent: Number(data?.sent ?? 0), failed: Number(data?.failed ?? 0) } };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

export async function newQuoteVersion(quoteId: string): Promise<ApiResult<string>> {
  try {
    const { data, error } = await supabase.rpc('new_quote_version', { p_quote: quoteId });
    if (error) return { ok: false, reason: failureFromCode(error.code) };
    return { ok: true, data: String(data) };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

export type SiteQuoteRow = { siteId: string; walkthroughClosed: boolean; status: QuoteStatus | null; version: string | null };

export async function fetchLeadQuotes(leadId: string): Promise<ApiResult<SiteQuoteRow[]>> {
  try {
    const { data, error } = await supabase.rpc('lead_quotes', { p_lead: leadId });
    if (error) return { ok: false, reason: failureFromCode(error.code) };
    return {
      ok: true,
      data: ((data ?? []) as { site_id: string; walkthrough_closed: boolean; status: QuoteStatus | null; version: string | null }[]).map(
        (r) => ({ siteId: r.site_id, walkthroughClosed: r.walkthrough_closed, status: r.status, version: r.status ? r.version : null }),
      ),
    };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

export type Suggestions = { services: string[]; addons: string[]; discounts: string[] };

export async function fetchSuggestions(): Promise<Suggestions> {
  const out: Suggestions = { services: [], addons: [], discounts: [] };
  try {
    const { data } = await supabase.rpc('quote_label_suggestions');
    for (const r of (data ?? []) as { section: keyof Suggestions; label: string }[]) out[r.section]?.push(r.label);
  } catch {
    // sin sugerencias
  }
  return out;
}

export type QuotePending = {
  kind: 'accepted' | 'rejected' | 'changes_requested' | 'expiring';
  versionId: string;
  /** null en un quote de extra (va al jobsite, D-238). */
  leadId: string | null;
  jobsiteId: string | null;
  company: string;
  site: string;
};

export async function fetchQuotePending(): Promise<QuotePending[]> {
  try {
    const { data, error } = await supabase.rpc('home_quote_pending');
    if (error) return [];
    return ((data ?? []) as { kind: QuotePending['kind']; version_id: string; lead_id: string | null; jobsite_id: string | null; company: string; site: string }[]).map((r) => ({
      kind: r.kind,
      versionId: r.version_id,
      leadId: r.lead_id ?? null,
      jobsiteId: r.jobsite_id ?? null,
      company: r.company,
      site: r.site,
    }));
  } catch {
    return [];
  }
}

/** URL firmada de 60 s del SOW o del PDF del quote (las reglas del bucket deciden quién puede). */
export async function fetchQuoteFileUrl(path: string): Promise<ApiResult<{ url: string }>> {
  try {
    const signed = await supabase.storage.from('quote-files').createSignedUrl(path, 60);
    if (signed.error || !signed.data) return { ok: false, reason: 'forbidden' };
    return { ok: true, data: { url: signed.data.signedUrl } };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

// --- Quote de extra desde el jobsite (hito 7, D-238; migración 20261027000002) --------------------------------

export type ExtraQuote = SiteQuote & { jobsiteId: string; jobsite: string; company: string; language: 'es' | 'en' };

/** "Nuevo quote" del jobsite: el borrador sin enviar que ya exista o uno nuevo. Devuelve el id del quote. */
export async function createExtraQuote(jobsiteId: string): Promise<ApiResult<string>> {
  try {
    const { data, error } = await supabase.rpc('create_extra_quote', { p_jobsite: jobsiteId });
    if (error) return { ok: false, reason: failureFromCode(error.code) };
    return { ok: true, data: String(data) };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

export async function fetchExtraQuote(quoteId: string): Promise<ApiResult<ExtraQuote>> {
  try {
    const { data, error } = await supabase.rpc('get_extra_quote', { p_quote: quoteId });
    if (error) return { ok: false, reason: failureFromCode(error.code) };
    const d = (data ?? {}) as Record<string, unknown>;
    return {
      ok: true,
      data: {
        quoteId: String(d.quote_id),
        walkthroughClosed: true,
        versions: ((d.versions ?? []) as Record<string, unknown>[]).map(toVersion),
        frequency: null,
        address: (d.address as string | null) ?? null,
        jobsiteId: String(d.jobsite_id),
        jobsite: String(d.jobsite ?? ''),
        company: String(d.company ?? ''),
        language: d.language === 'es' ? 'es' : 'en',
      },
    };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

export async function setQuoteServiceDate(versionId: string, date: string | null): Promise<ApiResult<null>> {
  try {
    const { error } = await supabase.rpc('set_quote_service_date', { p_version: versionId, p_date: date });
    if (error) return { ok: false, reason: failureFromCode(error.code) };
    return { ok: true, data: null };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

export type ExtraQuoteRow = {
  quoteId: string;
  version: string;
  status: QuoteStatus;
  total: number | null;
  serviceDate: string | null;
  sentAt: string | null;
  createdAt: string;
};

/** Quotes de extra del jobsite con el estado de su última versión. */
export async function fetchJobsiteExtras(jobsiteId: string): Promise<ApiResult<ExtraQuoteRow[]>> {
  try {
    const { data, error } = await supabase.rpc('jobsite_extra_quotes', { p_jobsite: jobsiteId });
    if (error) return { ok: false, reason: failureFromCode(error.code) };
    return {
      ok: true,
      data: ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        quoteId: String(r.quote_id),
        version: String(r.version),
        status: r.status as QuoteStatus,
        total: r.total === null || r.total === undefined ? null : Number(r.total),
        serviceDate: (r.service_date as string | null) ?? null,
        sentAt: (r.sent_at as string | null) ?? null,
        createdAt: String(r.created_at),
      })),
    };
  } catch {
    return { ok: false, reason: 'network' };
  }
}
