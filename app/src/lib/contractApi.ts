import { FunctionsHttpError } from '@supabase/supabase-js';

import { supabase } from './supabase';

/**
 * Contrato del cliente (D-283, diseño D-289). En la app: ficha y pasos (contract_info, lo ve quien ve quotes o
 * clientes); preparar, ver el PDF, enviar y contrafirmar solo el Super Admin (Edge Function contract-admin). En el
 * portal: contract-portal sin cuenta, con un código por correo. Tipo de limpieza del lead y del jobsite.
 */

export type ContractState = 'pending' | 'client_signed' | 'both_signed' | 'needs_update';
export type ContractDocStatus = 'draft' | 'sent' | 'client_signed' | 'signed' | 'void';
export type CleaningType = 'non_residential' | 'residential';

export type ContractInfo = {
  jobsiteId: string;
  jobsite: string;
  company: string;
  status: ContractState;
  acceptedAt: string | null;
  signUntil: string | null;
  acceptedBy: string | null;
  acceptedTitle: string | null;
  quoteNumber: string | null;
  quoteVersion: string | null;
  canManage: boolean;
  contract: {
    id: string;
    csa: string;
    status: ContractDocStatus;
    sentAt: string | null;
    email: string | null;
    clientSignedAt: string | null;
    clientSignerName: string | null;
    ccSignedAt: string | null;
    documentId: string | null;
  } | null;
};

export type ContractFailure = 'forbidden' | 'invalid' | 'missing_fields' | 'not_found' | 'network' | 'server';
export type ContractResult<T> = { ok: true; data: T } | { ok: false; reason: ContractFailure; fields?: string[] };

const isNet = (e: unknown) => /network|fetch|timeout|offline/i.test(String((e as { message?: string })?.message ?? e ?? ''));

function fromCode(code: string | undefined): ContractFailure {
  if (code === '42501') return 'forbidden';
  if (code === 'P0002') return 'not_found';
  if (code === '22023' || code === '22P02') return 'invalid';
  return 'server';
}

export function infoFromRow(d: Record<string, unknown>): ContractInfo {
  const c = d.contract as Record<string, unknown> | null;
  const s = (v: unknown) => (typeof v === 'string' ? v : null);
  return {
    jobsiteId: d.jobsite_id as string,
    jobsite: (d.jobsite as string) ?? '',
    company: (d.company as string) ?? '',
    status: d.status as ContractState,
    acceptedAt: s(d.accepted_at),
    signUntil: s(d.sign_until),
    acceptedBy: s(d.accepted_by),
    acceptedTitle: s(d.accepted_title),
    quoteNumber: s(d.quote_number),
    quoteVersion: s(d.quote_version),
    canManage: d.can_manage === true,
    contract: c
      ? {
          id: c.id as string,
          csa: c.csa as string,
          status: c.status as ContractDocStatus,
          sentAt: s(c.sent_at),
          email: s(c.email),
          clientSignedAt: s(c.client_signed_at),
          clientSignerName: s(c.client_signer_name),
          ccSignedAt: s(c.cc_signed_at),
          documentId: s(c.document_id),
        }
      : null,
  };
}

/** Paso de la línea (D-289): 1 Aceptado, 2 Contrato enviado, 3 Firmado por el cliente, 4 Firmado por ambas partes. */
export function contractStep(i: ContractInfo): 1 | 2 | 3 | 4 {
  if (i.status === 'both_signed') return 4;
  if (i.status === 'client_signed') return 3;
  if (i.status === 'pending' && i.contract?.status === 'sent') return 2;
  return 1;
}

export async function fetchContractInfo(target: { jobsiteId?: string; siteId?: string }): Promise<ContractResult<ContractInfo | null>> {
  try {
    const { data, error } = await supabase.rpc('contract_info', { p_jobsite: target.jobsiteId ?? null, p_site: target.siteId ?? null });
    if (error) return { ok: false, reason: isNet(error) ? 'network' : fromCode(error.code) };
    return { ok: true, data: data ? infoFromRow(data as Record<string, unknown>) : null };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

export type ContractDraft = { id: string; csa: string; status: ContractDocStatus; fields: Record<string, string>; missing: string[] };

async function admin<T>(body: Record<string, unknown>): Promise<ContractResult<T>> {
  try {
    const { data, error } = await supabase.functions.invoke('contract-admin', { body });
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

const draftOf = (d: Record<string, unknown>): ContractDraft => ({
  id: d.id as string,
  csa: d.csa as string,
  status: d.status as ContractDocStatus,
  fields: (d.fields as Record<string, string>) ?? {},
  missing: (d.missing as string[]) ?? [],
});

export const prepareContract = async (jobsiteId: string) => {
  const r = await admin<Record<string, unknown>>({ action: 'get', jobsite_id: jobsiteId });
  return r.ok ? { ok: true as const, data: draftOf(r.data) } : r;
};
export const saveContractFields = async (contractId: string, fields: Record<string, string>) => {
  const r = await admin<Record<string, unknown>>({ action: 'save', contract_id: contractId, fields });
  return r.ok ? { ok: true as const, data: draftOf(r.data) } : r;
};
export const sendContract = (contractId: string) =>
  admin<{ id: string; sent: boolean; expires_at: string }>({ action: 'send', contract_id: contractId });
export const countersignContract = (contractId: string) =>
  admin<{ id: string; status: string; signed_at: string; copies: Record<string, boolean> }>({ action: 'countersign', contract_id: contractId });
/** URL de 60 s del PDF del contrato para el visor (sin firmar, o con la firma del cliente). */
export const fetchContractPreviewUrl = async (jobsiteId: string): Promise<{ ok: true; data: { url: string } } | { ok: false; reason: string }> => {
  const r = await admin<{ url: string }>({ action: 'preview', jobsite_id: jobsiteId });
  return r.ok && typeof r.data.url === 'string' ? { ok: true, data: { url: r.data.url } } : { ok: false, reason: 'server' };
};

/** Campos que se muestran en "Preparar contrato" (D-289): fecha de inicio, área, franja de acceso y los demás vacíos. */
export const ALWAYS_SHOWN = ['start_date', 'area_sqft', 'service_window'] as const;
export function fieldsToShow(d: Pick<ContractDraft, 'missing'>): string[] {
  return [...ALWAYS_SHOWN, ...d.missing.filter((k) => !(ALWAYS_SHOWN as readonly string[]).includes(k))];
}

// Tipo de limpieza ---------------------------------------------------------------------------------------------------

export async function fetchCleaningType(kind: 'lead' | 'jobsite', id: string): Promise<CleaningType | null> {
  try {
    const { data } = await supabase.from(kind === 'lead' ? 'leads' : 'jobsites').select('cleaning_type').eq('id', id).maybeSingle();
    const v = (data as { cleaning_type?: string } | null)?.cleaning_type;
    return v === 'residential' || v === 'non_residential' ? v : null;
  } catch {
    return null;
  }
}

export async function saveCleaningType(kind: 'lead' | 'jobsite', id: string, value: CleaningType): Promise<boolean> {
  try {
    const { error } = kind === 'lead'
      ? await supabase.rpc('set_lead_cleaning_type', { p_lead: id, p_type: value })
      : await supabase.rpc('set_jobsite_cleaning_type', { p_jobsite: id, p_type: value });
    return !error;
  } catch {
    return false;
  }
}

/** Jobsites activos sin contrato firmado por ambas partes (aviso ámbar del Schedule, D-289). */
export async function fetchUnsignedJobsites(): Promise<Set<string>> {
  try {
    const { data, error } = await supabase.rpc('schedule_unsigned_jobsites');
    if (error || !Array.isArray(data)) return new Set();
    return new Set((data as unknown[]).map((x) => (typeof x === 'string' ? x : (x as { schedule_unsigned_jobsites: string }).schedule_unsigned_jobsites)));
  } catch {
    return new Set();
  }
}

// Portal ---------------------------------------------------------------------------------------------------------

export type ContractPortalState = 'open' | 'expired' | 'signed' | 'closed' | 'not_found';
export type ContractPortalFailure = 'invalid' | 'closed' | 'rate_limited' | 'wrong' | 'locked' | 'expired' | 'session' | 'network' | 'server';
export type ContractPortalResult<T> = { ok: true; data: T } | { ok: false; reason: ContractPortalFailure };
export type ContractPortalData = {
  status: ContractDocStatus;
  csa: string;
  sow: string;
  company: string;
  site: string;
  email: string;
  expires_at: string;
  consent_text: string;
  signed: { name: string; title: string; at: string } | null;
};

async function portal<T>(body: Record<string, unknown>): Promise<ContractPortalResult<T>> {
  try {
    const { data, error } = await supabase.functions.invoke('contract-portal', { body });
    if (error) {
      if (error instanceof FunctionsHttpError) {
        let code: string | undefined;
        try {
          code = (await error.context.json())?.error;
        } catch {
          code = undefined;
        }
        const known: ContractPortalFailure[] = ['invalid', 'closed', 'rate_limited', 'wrong', 'locked', 'expired', 'session'];
        return { ok: false, reason: known.includes(code as ContractPortalFailure) ? (code as ContractPortalFailure) : 'server' };
      }
      return { ok: false, reason: 'network' };
    }
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

export const contractPortalState = (token: string) => portal<{ state: ContractPortalState }>({ action: 'state', token });
export const contractRequestCode = (token: string, email: string) => portal<{ ok: true }>({ action: 'request', token, email });
export const contractVerifyCode = (token: string, email: string, code: string) =>
  portal<{ session: string }>({ action: 'verify', token, email, code });
export const contractPortalData = (session: string) => portal<ContractPortalData>({ action: 'data', session });
export const contractFileUrl = (session: string) => portal<{ url: string }>({ action: 'file', session });
export const contractSign = (session: string, name: string, title: string) =>
  portal<{ ok: true; signed_at: string }>({ action: 'sign', session, name, title, consent: true });

const KEY = (token: string) => `cidclean-contract-${token}`;

/** Solo la sesión se guarda en esta pestaña, como en el W-9 y el quote. */
export function saveContractSession(token: string, session: string | null) {
  try {
    if (typeof sessionStorage === 'undefined') return;
    if (session) sessionStorage.setItem(KEY(token), session);
    else sessionStorage.removeItem(KEY(token));
  } catch {
    // sin almacenamiento: se pedirá el código otra vez
  }
}

export function readContractSession(token: string): string | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(KEY(token));
  } catch {
    return null;
  }
}
