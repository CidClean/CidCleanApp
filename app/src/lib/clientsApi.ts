import * as DocumentPicker from 'expo-document-picker';

import type { Client, DocKind, Frequency, Jobsite, JobsiteStatus, Pay, PayForm, ProfileAssignment, StaffRow } from './clientRules';
import { payParams } from './clientRules';
import { supabase } from './supabase';

/**
 * Clientes, Jobsites y pago por jobsite (migraciones 20261024000001 y 20261025000001). Los datos sin cifras se leen
 * con las reglas por fila; la tarifa, los pagos, el margen y el contrato solo por funciones que registran cada apertura.
 */

export type ClientsFailure = 'forbidden' | 'contractPending' | 'invalid' | 'minWage' | 'not_found' | 'network' | 'server';
export type ClientsResult<T> = { ok: true; data: T } | { ok: false; reason: ClientsFailure };

export function failureFrom(code: string | undefined, message?: string): ClientsFailure {
  if (code === '42501') return 'forbidden';
  if (code === '22023' && (message ?? '').startsWith('contract_pending')) return 'contractPending'; // D-283
  if (code === '23514' && /m[ií]nimo/i.test(message ?? '')) return 'minWage';
  if (code === '22023' || code === '23514' || code === '23505' || code === '22P02' || code === '22008') return 'invalid';
  if (code === 'P0002') return 'not_found';
  return 'server';
}

async function run<T>(fn: () => Promise<ClientsResult<T>>): Promise<ClientsResult<T>> {
  try {
    return await fn();
  } catch {
    return { ok: false, reason: 'network' };
  }
}

type ClientRow = { id: string; name: string; legacy: boolean; account_provider?: boolean; phone: string | null; email: string | null; address: string | null; notes: string | null };
type JobsiteRow = {
  id: string;
  client_id: string;
  name: string;
  address: string;
  plus_code: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  emergency_name: string | null;
  emergency_phone: string | null;
  emergency_relation: string | null;
  emergency_email: string | null;
  frequency: Frequency | null;
  est_hours_per_visit: number | string | null;
  visits_per_month: number | string | null;
  start_date: string | null;
  status: JobsiteStatus;
  walkthrough_version: number | null;
  clients: { name: string; legacy: boolean; account_provider?: boolean } | null;
};

const JOBSITE_COLUMNS =
  'id, client_id, name, address, plus_code, contact_name, contact_phone, contact_email, emergency_name, emergency_phone, ' +
  'emergency_relation, emergency_email, frequency, est_hours_per_visit, visits_per_month, start_date, status, walkthrough_version, ' +
  'clients(name, legacy, account_provider)';

const num = (v: number | string | null) => (v === null ? null : Number(v));

export function rowToClient(r: ClientRow): Client {
  return { id: r.id, name: r.name, legacy: r.legacy, accountProvider: r.account_provider ?? false, phone: r.phone, email: r.email, address: r.address, notes: r.notes };
}

export function rowToJobsite(r: JobsiteRow): Jobsite {
  return {
    id: r.id,
    clientId: r.client_id,
    clientName: r.clients?.name ?? '',
    clientLegacy: r.clients?.legacy ?? false,
    clientAccountProvider: r.clients?.account_provider ?? false,
    name: r.name,
    address: r.address,
    plusCode: r.plus_code,
    contactName: r.contact_name,
    contactPhone: r.contact_phone,
    contactEmail: r.contact_email,
    emergencyName: r.emergency_name,
    emergencyPhone: r.emergency_phone,
    emergencyRelation: r.emergency_relation,
    emergencyEmail: r.emergency_email,
    frequency: r.frequency ? { kind: r.frequency.kind, days: r.frequency.days ?? [], other: r.frequency.other } : null,
    estHoursPerVisit: num(r.est_hours_per_visit),
    visitsPerMonth: num(r.visits_per_month),
    startDate: r.start_date,
    status: r.status,
    walkthroughVersion: r.walkthrough_version,
  };
}

export const fetchClients = () =>
  run<Client[]>(async () => {
    const { data, error } = await supabase.from('clients').select('id, name, legacy, account_provider, phone, email, address, notes').order('name');
    if (error) return { ok: false, reason: failureFrom(error.code, error.message) };
    return { ok: true, data: (data as ClientRow[]).map(rowToClient) };
  });

export const fetchClient = (id: string) =>
  run<Client>(async () => {
    const { data, error } = await supabase.from('clients').select('id, name, legacy, account_provider, phone, email, address, notes').eq('id', id).maybeSingle();
    if (error) return { ok: false, reason: failureFrom(error.code, error.message) };
    if (!data) return { ok: false, reason: 'not_found' };
    return { ok: true, data: rowToClient(data as ClientRow) };
  });

export const fetchJobsites = (clientId?: string) =>
  run<Jobsite[]>(async () => {
    let q = supabase.from('jobsites').select(JOBSITE_COLUMNS).order('name');
    if (clientId) q = q.eq('client_id', clientId);
    const { data, error } = await q;
    if (error) return { ok: false, reason: failureFrom(error.code, error.message) };
    return { ok: true, data: (data as unknown as JobsiteRow[]).map(rowToJobsite) };
  });

/** D-241: ids de los jobsites de clientes "Previo a la app" (en ellos se pueden poner fechas pasadas). */
export const fetchLegacyJobsiteIds = () =>
  run<Set<string>>(async () => {
    const { data, error } = await supabase.from('jobsites').select('id, clients!inner(legacy)').eq('clients.legacy', true);
    if (error) return { ok: false, reason: failureFrom(error.code, error.message) };
    return { ok: true, data: new Set((data as { id: string }[]).map((r) => r.id)) };
  });

export const fetchJobsite = (id: string) =>
  run<Jobsite>(async () => {
    const { data, error } = await supabase.from('jobsites').select(JOBSITE_COLUMNS).eq('id', id).maybeSingle();
    if (error) return { ok: false, reason: failureFrom(error.code, error.message) };
    if (!data) return { ok: false, reason: 'not_found' };
    return { ok: true, data: rowToJobsite(data as unknown as JobsiteRow) };
  });

async function rpc<T>(fn: string, args: Record<string, unknown>, map: (d: unknown) => T): Promise<ClientsResult<T>> {
  return run(async () => {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) return { ok: false, reason: failureFrom(error.code, error.message) };
    return { ok: true, data: map(data) };
  });
}

/** Tarifas de la lista de Cuentas (un registro de apertura por lista). */
export const fetchRates = () =>
  rpc('list_jobsite_rates', {}, (d) => new Map((d as { jobsite_id: string; monthly_rate: string | number }[]).map((r) => [r.jobsite_id, Number(r.monthly_rate)])));

export const fetchRate = (jobsiteId: string) => rpc('get_jobsite_rate', { p_jobsite: jobsiteId }, (d) => (d === null ? null : Number(d)));

export const fetchAtRisk = () => rpc('jobsites_at_risk', {}, (d) => new Set((d as string[] | null) ?? []));

export type Margin = { atRisk: boolean; cost: number | null; rate: number | null; incomplete: boolean };
export const fetchMargin = (jobsiteId: string) =>
  rpc('jobsite_margin', { p_jobsite: jobsiteId }, (d) => {
    const m = d as { at_risk: boolean; cost?: number | string; rate?: number | string | null; incomplete: boolean };
    return { atRisk: m.at_risk, cost: m.cost === undefined ? null : Number(m.cost), rate: m.rate === undefined || m.rate === null ? null : Number(m.rate), incomplete: m.incomplete } as Margin;
  });

export const createLegacyClient = (c: { name: string; phone: string; email: string; address: string; notes: string }) =>
  rpc('create_legacy_client', { p_name: c.name, p_phone: c.phone, p_email: c.email, p_address: c.address, p_notes: c.notes }, (d) => d as string);

export const updateClient = (id: string, c: { name: string; phone: string; email: string; address: string; notes: string }) =>
  rpc('update_client', { p_client: id, p_name: c.name, p_phone: c.phone, p_email: c.email, p_address: c.address, p_notes: c.notes }, () => null);

/** D-291: marcar o desmarcar un cliente como proveedor de cuentas. */
export const setClientAccountProvider = (id: string, value: boolean) =>
  rpc('set_client_account_provider', { p_client: id, p_value: value }, () => null);

export const createLegacyJobsite = (clientId: string, data: unknown, rate: number) =>
  rpc('create_legacy_jobsite', { p_client: clientId, p_data: data, p_rate: rate }, (d) => d as string);

export const updateJobsite = (id: string, data: unknown) => rpc('update_jobsite', { p_jobsite: id, p_data: data }, () => null);

export const setJobsiteRate = (id: string, rate: number) => rpc('set_jobsite_rate', { p_jobsite: id, p_rate: rate }, () => null);

export const setJobsiteStatus = (id: string, status: JobsiteStatus) => rpc('set_jobsite_status', { p_jobsite: id, p_status: status }, () => null);

type StaffRowDb = { assignment_id: string; profile_id: string; full_name: string; worker_type: 'w2' | '1099' | null; start_date: string; end_date: string | null };
export const fetchJobsiteStaff = (jobsiteId: string) =>
  rpc('list_jobsite_staff', { p_jobsite: jobsiteId }, (d) =>
    (d as StaffRowDb[]).map<StaffRow>((r) => ({
      assignmentId: r.assignment_id,
      profileId: r.profile_id,
      fullName: r.full_name,
      workerType: r.worker_type,
      startDate: r.start_date,
      endDate: r.end_date,
    })),
  );

type ProfileAssignmentDb = { assignment_id: string; jobsite_id: string; jobsite_name: string; client_name: string; start_date: string; end_date: string | null };
export const fetchProfileAssignments = (profileId: string) =>
  rpc('list_profile_assignments', { p_profile: profileId }, (d) =>
    (d as ProfileAssignmentDb[]).map<ProfileAssignment>((r) => ({
      assignmentId: r.assignment_id,
      jobsiteId: r.jobsite_id,
      jobsiteName: r.jobsite_name,
      clientName: r.client_name,
      startDate: r.start_date,
      endDate: r.end_date,
    })),
  );

type PayDb = {
  assignment_id: string;
  kind: 'hourly' | 'fixed' | null;
  hourly_rate: string | number | null;
  guaranteed_hours: string | number | null;
  fixed_amount: string | number | null;
  fixed_period: 'visit' | 'week' | 'month' | null;
  effective_from: string | null;
  next_change: string | null;
};
/** Pago vigente de cada asignación (con empleados_ver_pagos; queda en el historial). */
export const fetchPay = (by: { jobsite?: string; profile?: string }) =>
  rpc('get_assignment_pay', { p_jobsite: by.jobsite ?? null, p_profile: by.profile ?? null }, (d) => {
    const map = new Map<string, Pay | null>();
    for (const r of d as PayDb[]) {
      map.set(
        r.assignment_id,
        r.kind
          ? {
              kind: r.kind,
              hourlyRate: num(r.hourly_rate),
              guaranteedHours: num(r.guaranteed_hours),
              fixedAmount: num(r.fixed_amount),
              fixedPeriod: r.fixed_period,
              effectiveFrom: r.effective_from as string,
              nextChange: r.next_change,
            }
          : null,
      );
    }
    return map;
  });

export type Option = { id: string; label: string; detail?: string; workerType?: 'w2' | '1099' | null };
export const fetchAssignableEmployees = () =>
  rpc('assignable_employees', {}, (d) =>
    (d as { profile_id: string; full_name: string; worker_type: 'w2' | '1099' | null }[]).map<Option>((r) => ({
      id: r.profile_id,
      label: r.full_name,
      workerType: r.worker_type,
    })),
  );
export const fetchAssignableJobsites = () =>
  rpc('assignable_jobsites', {}, (d) =>
    (d as { jobsite_id: string; jobsite_name: string; client_name: string }[]).map<Option>((r) => ({
      id: r.jobsite_id,
      label: `${r.client_name} · ${r.jobsite_name}`,
    })),
  );

export const assignEmployee = (jobsiteId: string, profileId: string, start: string) =>
  rpc('assign_employee', { p_jobsite: jobsiteId, p_profile: profileId, p_start: start }, (d) => d as string);

export const endAssignment = (assignmentId: string, end: string) =>
  rpc('end_assignment', { p_assignment: assignmentId, p_end: end }, () => null);

export const setAssignmentPay = (assignmentId: string, form: PayForm) =>
  rpc('set_assignment_pay', { p_assignment: assignmentId, ...payParams(form) }, () => null);

// --- Documentos (D-055, D-210) ------------------------------------------------------------------------------

export type JobsiteDocument = { id: string; kind: DocKind; title: string | null; version: number; uploadedAt: string };

export const fetchDocuments = (jobsiteId: string) =>
  run<JobsiteDocument[]>(async () => {
    const { data, error } = await supabase
      .from('jobsite_documents')
      .select('id, kind, title, version, uploaded_at')
      .eq('jobsite_id', jobsiteId)
      .is('replaced_at', null)
      .order('uploaded_at', { ascending: false });
    if (error) return { ok: false, reason: failureFrom(error.code, error.message) };
    return {
      ok: true,
      data: (data as { id: string; kind: DocKind; title: string | null; version: number; uploaded_at: string }[]).map((d) => ({
        id: d.id,
        kind: d.kind,
        title: d.title,
        version: d.version,
        uploadedAt: d.uploaded_at,
      })),
    };
  });

export type PickedPdf = { uri: string; name: string | null };

/** Escoger el PDF del teléfono (los documentos del jobsite son PDF, como el bucket jobsite-docs). */
export async function choosePdf(): Promise<PickedPdf | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf'], copyToCacheDirectory: true });
  if (result.canceled || !result.assets[0]) return null;
  return { uri: result.assets[0].uri, name: result.assets[0].name };
}

function uniqueName(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** Sube el PDF a jobsite-docs/<jobsite>/<tipo>/<nombre>.pdf y lo registra como la versión siguiente. */
export const uploadJobsiteDocument = (jobsiteId: string, kind: DocKind, file: PickedPdf, title: string | null) =>
  run<string>(async () => {
    const path = `${jobsiteId}/${kind}/${uniqueName()}.pdf`;
    const bytes = await (await fetch(file.uri)).arrayBuffer();
    const up = await supabase.storage.from('jobsite-docs').upload(path, bytes, { contentType: 'application/pdf' });
    if (up.error) return { ok: false, reason: 'server' };
    const { data, error } = await supabase.rpc('register_jobsite_document', { p_jobsite: jobsiteId, p_kind: kind, p_path: path, p_title: title });
    if (error) return { ok: false, reason: failureFrom(error.code, error.message) };
    return { ok: true, data: data as string };
  });

/** URL firmada de 60 s (Edge Function open-jobsite-document: registra cada apertura). */
export const fetchJobsiteDocumentUrl = (documentId: string) =>
  run<{ url: string }>(async () => {
    const { data, error } = await supabase.functions.invoke('open-jobsite-document', { body: { document_id: documentId } });
    if (error) return { ok: false, reason: 'server' };
    const url: unknown = data?.url;
    if (typeof url !== 'string') return { ok: false, reason: 'server' };
    return { ok: true, data: { url } };
  });
