import { FunctionsHttpError } from '@supabase/supabase-js';

import { bytesToBase64, type PickedFile } from './documents';
import { supabase } from './supabase';

/**
 * Fase D (D-285, opcional y sin bloqueo desde D-292; diseño surveys/ica-ofertas-aprobado.html): ICA del 1099 (ica_info;
 * preparar, ver PDF, enviar, contrafirmar, subir y abrir el firmado por la Edge Function ica-admin, solo el Super
 * Admin), ofertas de trabajo (RPC) y advertencias escritas (warnings-admin). El portal /ica/[token] usa ica-portal.
 */

export type IcaState = 'not_required' | 'none' | 'draft' | 'sent' | 'contractor_signed' | 'signed';
export type IcaInfo = {
  state: IcaState;
  w9Signed: boolean;
  canManage: boolean;
  agreement: {
    id: string; ica: string; status: string; source: 'electronic' | 'paper'; email: string | null; sentAt: string | null;
    expiresAt: string | null; contractorSignedAt: string | null; contractorSignerName: string | null; ccSignedAt: string | null;
    uploadedAt: string | null; uploadedBy: string | null;
  } | null;
};
export type IcaDraft = { id: string; ica: string; status: string; fields: Record<string, string>; missing: string[]; editable: string[] };

export type Failure = 'forbidden' | 'invalid' | 'missing_fields' | 'not_found' | 'network' | 'server';
export type Result<T> = { ok: true; data: T } | { ok: false; reason: Failure; fields?: string[] };

const isNet = (e: unknown) => /network|fetch|timeout|offline/i.test(String((e as { message?: string })?.message ?? e ?? ''));
const s = (v: unknown) => (typeof v === 'string' ? v : null);

function fromCode(code: string | undefined): Failure {
  if (code === '42501') return 'forbidden';
  if (code === 'P0002') return 'not_found';
  if (code === '22023' || code === '22P02' || code === '23505') return 'invalid';
  return 'server';
}

async function rpc<T>(fn: string, args: Record<string, unknown>, map: (d: unknown) => T): Promise<Result<T>> {
  try {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) return { ok: false, reason: isNet(error) ? 'network' : fromCode(error.code) };
    return { ok: true, data: map(data) };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

async function fn<T>(name: string, body: Record<string, unknown>): Promise<Result<T>> {
  try {
    const { data, error } = await supabase.functions.invoke(name, { body });
    if (error) {
      if (error instanceof FunctionsHttpError) {
        let j: { error?: string; fields?: string[] } | null = null;
        try {
          j = await error.context.json();
        } catch {
          j = null;
        }
        const e = j?.error;
        if (e === 'missing_fields') return { ok: false, reason: 'missing_fields', fields: j?.fields ?? [] };
        return { ok: false, reason: e === 'forbidden' ? 'forbidden' : e === 'invalid' ? 'invalid' : e === 'not_found' ? 'not_found' : 'server' };
      }
      return { ok: false, reason: 'network' };
    }
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

export function icaInfoFromRow(d: Record<string, unknown>): IcaInfo {
  const a = d.agreement as Record<string, unknown> | null;
  return {
    state: d.state as IcaState,
    w9Signed: d.w9_signed === true,
    canManage: d.can_manage === true,
    agreement: a
      ? {
          id: a.id as string, ica: a.ica as string, status: a.status as string, source: a.source === 'paper' ? 'paper' : 'electronic',
          email: s(a.email), sentAt: s(a.sent_at), expiresAt: s(a.expires_at), contractorSignedAt: s(a.contractor_signed_at),
          contractorSignerName: s(a.contractor_signer_name), ccSignedAt: s(a.cc_signed_at), uploadedAt: s(a.uploaded_at),
          uploadedBy: s(a.uploaded_by),
        }
      : null,
  };
}

export const fetchIcaInfo = (profileId: string) =>
  rpc('ica_info', { p_profile: profileId }, (d) => (d ? icaInfoFromRow(d as Record<string, unknown>) : null));

const draftOf = (d: Record<string, unknown>): IcaDraft => ({
  id: d.id as string, ica: d.ica as string, status: d.status as string,
  fields: (d.fields as Record<string, string>) ?? {}, missing: (d.missing as string[]) ?? [], editable: (d.editable as string[]) ?? [],
});

export const prepareIca = async (profileId: string): Promise<Result<IcaDraft>> => {
  const r = await fn<Record<string, unknown>>('ica-admin', { action: 'get', profile_id: profileId });
  return r.ok ? { ok: true, data: draftOf(r.data) } : r;
};
export const saveIcaFields = async (agreementId: string, fields: Record<string, string>): Promise<Result<IcaDraft>> => {
  const r = await fn<Record<string, unknown>>('ica-admin', { action: 'save', agreement_id: agreementId, fields });
  return r.ok ? { ok: true, data: draftOf(r.data) } : r;
};
export const sendIca = (agreementId: string) => fn<{ id: string; sent: boolean; expires_at: string }>('ica-admin', { action: 'send', agreement_id: agreementId });
export const countersignIca = (agreementId: string) => fn<{ id: string; status: string }>('ica-admin', { action: 'countersign', agreement_id: agreementId });
export const fetchIcaPreviewUrl = (profileId: string) => fn<{ url: string }>('ica-admin', { action: 'preview', profile_id: profileId });
export const fetchIcaSignedUrl = (agreementId: string) => fn<{ url: string }>('ica-admin', { action: 'open', agreement_id: agreementId });

export async function uploadSignedIca(profileId: string, file: PickedFile): Promise<Result<{ id: string }>> {
  try {
    const bytes = new Uint8Array(await (await fetch(file.uri)).arrayBuffer());
    return await fn('ica-admin', { action: 'upload', profile_id: profileId, mime_type: file.mimeType ?? 'application/pdf', file: bytesToBase64(bytes) });
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** Orden de los campos en "Preparar ICA" (llaves de ica_editable_keys). */
export const ICA_FIELDS = [
  'contractor_name', 'business_name', 'contractor_entity', 'contractor_address', 'contractor_email', 'contractor_phone',
  'effective_date', 'sched_site_1', 'sched_rate_1', 'sched_site_2', 'sched_rate_2', 'cc_title',
] as const;

// Ofertas -------------------------------------------------------------------------------------------------------------

export type OfferStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn';
export type JobOffer = {
  id: string; profileId: string; contractor: string; kind: 'jobsite' | 'visit'; jobsiteId: string; jobsite: string;
  visitDate: string | null; startDate: string | null; windowStart: string | null; windowEnd: string | null;
  frequency: { kind: string; days?: number[]; other?: string } | null; rate: number; note: string | null; status: OfferStatus;
  offeredAt: string; respondedAt: string | null; responseSource: 'app' | 'admin' | null;
};

export function offerFromRow(d: Record<string, unknown>): JobOffer {
  return {
    id: d.id as string, profileId: d.profile_id as string, contractor: (d.contractor as string) ?? '', kind: d.kind === 'visit' ? 'visit' : 'jobsite',
    jobsiteId: d.jobsite_id as string, jobsite: (d.jobsite as string) ?? '', visitDate: s(d.visit_date), startDate: s(d.start_date),
    windowStart: s(d.window_start), windowEnd: s(d.window_end), frequency: (d.frequency as JobOffer['frequency']) ?? null,
    rate: Number(d.rate ?? 0), note: s(d.note), status: d.status as OfferStatus, offeredAt: d.offered_at as string,
    respondedAt: s(d.responded_at), responseSource: d.response_source === 'admin' ? 'admin' : d.response_source === 'app' ? 'app' : null,
  };
}
const offers = (d: unknown) => ((d as Record<string, unknown>[] | null) ?? []).map(offerFromRow);

export const fetchMyOffers = () => rpc('my_job_offers', {}, offers);
export const fetchOffersFor = (profileId: string) => rpc('job_offers_for', { p_profile: profileId }, offers);
export const createOffer = (o: { profileId: string; jobsiteId: string; visitId: string | null; rate: number; start: string | null; note?: string }) =>
  rpc('create_job_offer', { p_profile: o.profileId, p_jobsite: o.jobsiteId, p_visit: o.visitId, p_rate: o.rate, p_start: o.start, p_note: o.note ?? null },
    (d) => offerFromRow(d as Record<string, unknown>));
export const respondOffer = (id: string, accept: boolean) =>
  rpc('respond_job_offer', { p_offer: id, p_accept: accept }, (d) => offerFromRow(d as Record<string, unknown>));
export const withdrawOffer = (id: string) => rpc('withdraw_job_offer', { p_offer: id }, (d) => offerFromRow(d as Record<string, unknown>));

export type OfferJobsite = { id: string; name: string; windowStart: string | null; windowMinutes: number | null; frequency: JobOffer['frequency'] };
export type OfferVisit = { id: string; day: string };

/** Jobsites activos con contrato firmado por ambas partes (los únicos que se pueden ofrecer). */
export async function fetchOfferJobsites(): Promise<OfferJobsite[]> {
  try {
    const { data } = await supabase.from('jobsites').select('id, name, visit_start_time, visit_minutes, frequency')
      .eq('status', 'active').eq('contract_status', 'both_signed').order('name');
    return ((data as Record<string, unknown>[] | null) ?? []).map((j) => ({
      id: j.id as string, name: j.name as string, windowStart: s(j.visit_start_time)?.slice(0, 5) ?? null,
      windowMinutes: typeof j.visit_minutes === 'number' ? j.visit_minutes : null, frequency: (j.frequency as JobOffer['frequency']) ?? null,
    }));
  } catch {
    return [];
  }
}

/** Próximas visitas sin aprobar de un jobsite (visita puntual). */
export async function fetchOfferVisits(jobsiteId: string, today: string): Promise<OfferVisit[]> {
  try {
    const { data } = await supabase.from('visits').select('id, local_date').eq('jobsite_id', jobsiteId).eq('removed', false)
      .is('approved_at', null).gte('local_date', today).order('local_date').limit(40);
    return ((data as { id: string; local_date: string }[] | null) ?? []).map((v) => ({ id: v.id, day: v.local_date }));
  } catch {
    return [];
  }
}

/** "11:00 pm" desde "23:00". */
export function hour12(hhmm: string | null): string {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

/** Fin de la franja: inicio + minutos ("03:00"). */
export function windowEnd(start: string | null, minutes: number | null): string | null {
  if (!start || minutes === null) return null;
  const [h, m] = start.split(':').map(Number);
  const t = (h * 60 + m + minutes) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

// Advertencias --------------------------------------------------------------------------------------------------------

export type Warning = {
  id: string; issuedOn: string; reason: string; hasDocument: boolean; status: 'active' | 'voided'; voidReason: string | null;
};
export type Warnings = { activeCount: number; canManage: boolean; items: Warning[] };

export function warningsFromRow(d: Record<string, unknown>): Warnings {
  return {
    activeCount: Number(d.active_count ?? 0),
    canManage: d.can_manage === true,
    items: ((d.items as Record<string, unknown>[] | null) ?? []).map((w) => ({
      id: w.id as string, issuedOn: w.issued_on as string, reason: (w.reason as string) ?? '', hasDocument: w.has_document === true,
      status: w.status === 'voided' ? 'voided' : 'active', voidReason: s(w.void_reason),
    })),
  };
}

export const fetchWarnings = async (profileId: string): Promise<Result<Warnings>> => {
  const r = await fn<Record<string, unknown>>('warnings-admin', { action: 'list', profile_id: profileId });
  return r.ok ? { ok: true, data: warningsFromRow(r.data) } : r;
};
export async function createWarning(profileId: string, issuedOn: string, reason: string, file: PickedFile | null): Promise<Result<unknown>> {
  try {
    const extra = file
      ? { mime_type: file.mimeType ?? 'application/pdf', file: bytesToBase64(new Uint8Array(await (await fetch(file.uri)).arrayBuffer())) }
      : {};
    return await fn('warnings-admin', { action: 'create', profile_id: profileId, issued_on: issuedOn, reason, ...extra });
  } catch {
    return { ok: false, reason: 'network' };
  }
}
export const voidWarning = (warningId: string, reason: string) => fn('warnings-admin', { action: 'void', warning_id: warningId, reason });
export const fetchWarningUrl = (warningId: string) => fn<{ url: string }>('warnings-admin', { action: 'open', warning_id: warningId });

// Portal --------------------------------------------------------------------------------------------------------------

export type IcaPortalState = 'open' | 'expired' | 'signed' | 'closed' | 'not_found';
export type IcaPortalFailure = 'invalid' | 'closed' | 'rate_limited' | 'wrong' | 'locked' | 'expired' | 'session' | 'network' | 'server';
export type IcaPortalResult<T> = { ok: true; data: T } | { ok: false; reason: IcaPortalFailure };
export type IcaPortalData = {
  status: string; ica: string; contractor: string; business_name: string | null; email: string; expires_at: string;
  consent_text: string; signed: { name: string; at: string } | null;
};

async function portal<T>(body: Record<string, unknown>): Promise<IcaPortalResult<T>> {
  try {
    const { data, error } = await supabase.functions.invoke('ica-portal', { body });
    if (error) {
      if (error instanceof FunctionsHttpError) {
        let code: string | undefined;
        try {
          code = (await error.context.json())?.error;
        } catch {
          code = undefined;
        }
        const known: IcaPortalFailure[] = ['invalid', 'closed', 'rate_limited', 'wrong', 'locked', 'expired', 'session'];
        return { ok: false, reason: known.includes(code as IcaPortalFailure) ? (code as IcaPortalFailure) : 'server' };
      }
      return { ok: false, reason: 'network' };
    }
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

export const icaPortalState = (token: string) => portal<{ state: IcaPortalState }>({ action: 'state', token });
export const icaRequestCode = (token: string, email: string) => portal<{ ok: true }>({ action: 'request', token, email });
export const icaVerifyCode = (token: string, email: string, code: string) => portal<{ session: string }>({ action: 'verify', token, email, code });
export const icaPortalData = (session: string) => portal<IcaPortalData>({ action: 'data', session });
export const icaFileUrl = (session: string) => portal<{ url: string }>({ action: 'file', session });
export const icaSign = (session: string, name: string) => portal<{ ok: true; signed_at: string }>({ action: 'sign', session, name, consent: true });

const KEY = (token: string) => `cidclean-ica-${token}`;
export function saveIcaSession(token: string, session: string | null) {
  try {
    if (typeof sessionStorage === 'undefined') return;
    if (session) sessionStorage.setItem(KEY(token), session);
    else sessionStorage.removeItem(KEY(token));
  } catch {
    // sin almacenamiento: se pedirá el código otra vez
  }
}
export function readIcaSession(token: string): string | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(KEY(token));
  } catch {
    return null;
  }
}
