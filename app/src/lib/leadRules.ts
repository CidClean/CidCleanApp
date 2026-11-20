/**
 * Reglas puras de Ventas A (hito 2): quién ve y edita leads, estados, formularios, fechas y horas,
 * calendario del mes (D-104) y pendientes del Inicio (D-111). Sin red: se prueban solas.
 */
import type { AddressParts } from './address';
import { formatPhone, isValidPhone, normalizePhone } from './phone';
import type { SalesStrings } from '@/i18n/sales';
import { can, type Access } from './visibility';

// --- Tipos ------------------------------------------------------------------------------------------

/**
 * Estados del flujo, en su orden (current/flujo.md, D-071, D-333): en frío (automáticos) y de venta. 'contacted'
 * ya no se usa: la orden 130 lo pasó a 'waiting' en la base.
 */
export const LEAD_STATUSES = [
  'new',
  'waiting',
  'follow_up',
  'follow_up_2',
  'no_response',
  'interested',
  'walkthrough_scheduled',
  'walkthrough_done',
  'quote_sent',
  'negotiation',
  'won',
  'lost',
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** Fuentes (flujo): web, campañas de marketing y registro manual. */
export const LEAD_SOURCES = ['web', 'campaign', 'manual', 'ads', 'agent'] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export type Appointment = { id: string; startsAt: Date; status: 'scheduled' | 'done' | 'canceled' };

export type LeadSite = {
  id: string;
  name: string | null;
  /** Una línea "calle, dirección 2, City, ST ZIP" (D-301); vacía si el sitio web no trajo ciudad ni ZIP. */
  address: string;
  /** Datos del estimador del sitio web (D-319): clave del tipo de lugar, sq ft y clave de la frecuencia. */
  facilityType?: string | null;
  sqft?: number | null;
  webFrequency?: string | null;
  /** Las partes de la dirección (D-301); opcionales para los datos de prueba anteriores. */
  addressParts?: AddressParts;
  /** Dirección vieja sin separar: aviso "Completa la dirección" (D-301). */
  addressNeedsReview?: boolean;
  /** La cita agendada (una a la vez por sitio), si hay. */
  scheduled: Appointment | null;
  /** El walkthrough del sitio ya se cerró (hito 3). */
  walkthroughDone: boolean;
};

export type LostReason = { id: string; labelEs: string; labelEn: string; sort: number; active: boolean };

export type Lead = {
  id: string;
  /** Empresa, o el contacto si el lead web llegó sin empresa (D-319); ver `companyMissing`. */
  company: string;
  /** El sitio web no trajo empresa: "Completa la empresa" (D-319). */
  companyMissing?: boolean;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  source: LeadSource;
  notes: string | null;
  status: LeadStatus;
  lostReason: LostReason | null;
  lostNote: string | null;
  /** Idioma del correo y del portal del quote (D-209). */
  language: 'en' | 'es';
  /** Origen, servicio y propiedad (D-348 a D-350); opcionales para los datos de prueba anteriores. */
  temperature?: LeadTemperature;
  service?: LeadService;
  cleaningType?: CleaningType;
  sourceLabel?: string | null;
  createdAt: Date;
  /** Fecha del seguimiento abierto (AAAA-MM-DD), si hay. */
  followUpOn: string | null;
  sites: LeadSite[];
} & FollowupData;

/** Datos del seguimiento automático (D-333, orden 130). */
export type FollowupData = {
  firstContactAt?: Date | null;
  lastContactAt?: Date | null;
  /** Seguimientos enviados: 0, 1 o 2. */
  followupsSent?: number;
  /** Cuándo salió el Follow up (el primero). */
  followupSentAt?: Date | null;
  respondedAt?: Date | null;
  /** Día (AAAA-MM-DD) del siguiente paso automático, o del paso vencido (Follow up, 2nd follow up, Sin respuesta). */
  nextStepOn?: string | null;
};

/** Origen del lead (D-348, D-350): potencial (anuncios y website) o en frío (agentes y registro manual). */
export type LeadTemperature = 'potential' | 'cold';
/** Servicio (D-349): recurrente o one-time. */
export type LeadService = 'recurring' | 'one_time';
export type CleaningType = 'non_residential' | 'residential';

/** Fila de la lista del Pipeline. */
export type LeadSummary = {
  /** Origen (D-350); sin dato se trata como en frío. */
  temperature?: LeadTemperature;
  service?: LeadService;
  cleaningType?: CleaningType;
  /** Chip de la fuente: detalle ("Instagram ad") o nombre de la fuente (Meta, Muse); null en website y manual. */
  sourceLabel?: string | null;
  phone?: string | null;
  id: string;
  company: string;
  companyMissing?: boolean;
  contactName: string | null;
  status: LeadStatus;
  createdAt: Date;
  followUpOn: string | null;
  /** La próxima cita agendada entre todos sus sitios. */
  nextWalkthrough: Date | null;
  /** Fuente (D-226: línea "contacto · fuente" de la tarjeta del Pipeline). */
  source?: LeadSource;
  email?: string | null;
} & FollowupData;

// --- Pipeline en mosaico (D-226) -------------------------------------------------------------------------

export type PipelineFilter = 'all' | 'followUpToday' | 'walkthrough';

const isOpen = (l: LeadSummary) => l.status !== 'won' && l.status !== 'lost';

/** Las tres cifras de arriba: abiertos (ni Ganado ni Perdido), con quote enviado y ganados. */
export function pipelineCounts(leads: readonly LeadSummary[]): { open: number; quoteSent: number; won: number } {
  return {
    open: leads.filter(isOpen).length,
    quoteSent: leads.filter((l) => l.status === 'quote_sent').length,
    won: leads.filter((l) => l.status === 'won').length,
  };
}

/** Filtros rápidos: seguimiento de hoy o vencido (abiertos) y con walkthrough agendado. */
export function filterPipeline(leads: readonly LeadSummary[], filter: PipelineFilter, today: string): LeadSummary[] {
  if (filter === 'followUpToday') return leads.filter((l) => isOpen(l) && l.followUpOn !== null && l.followUpOn <= today);
  if (filter === 'walkthrough') return leads.filter((l) => isOpen(l) && l.nextWalkthrough !== null);
  return [...leads];
}

/**
 * Tono de la ficha según el estado (survey flujo-leads-aprobado): ámbar lo que toca hacer (Follow up, 2nd follow up,
 * quote o negociación), rojo Sin respuesta, marca Esperando, Interesado y walkthrough, verde-marca Ganado, neutro el resto.
 */
export function leadTone(status: LeadStatus): 'brand' | 'attention' | 'alert' | 'neutral' | 'won' {
  if (status === 'won') return 'won';
  if (status === 'no_response') return 'alert';
  if (status === 'follow_up' || status === 'follow_up_2' || status === 'quote_sent' || status === 'negotiation') return 'attention';
  if (status === 'waiting' || status === 'interested' || status === 'walkthrough_scheduled' || status === 'walkthrough_done') return 'brand';
  return 'neutral';
}

/** Etapa en frío (D-333): Nuevo, Esperando, Follow up, 2nd follow up y Sin respuesta. Ahí sirven "Escribir" y "Respondió". */
export function isColdStatus(status: LeadStatus): boolean {
  return status === 'new' || status === 'waiting' || status === 'follow_up' || status === 'follow_up_2' || status === 'no_response';
}

// --- Leads en pestañas (D-333 (5), orden 131) -----------------------------------------------------------

export const LEAD_TABS = ['today', 'toContact', 'waiting', 'sale', 'closed'] as const;
export type LeadTab = (typeof LEAD_TABS)[number];

/** Pestaña de cada estado: Hoy (Follow up, 2nd follow up y Sin respuesta), Por contactar, Esperando, En venta y Cerrados. */
export function tabOf(status: LeadStatus, temperature?: LeadTemperature): LeadTab {
  // D-200 (D-350: "call today"): el potencial nuevo (Interesado sin cita) va en Hoy hasta que se agenda el walkthrough.
  if (temperature === 'potential' && status === 'interested') return 'today';
  if (status === 'follow_up' || status === 'follow_up_2' || status === 'no_response') return 'today';
  if (status === 'new') return 'toContact';
  if (status === 'waiting') return 'waiting';
  if (status === 'won' || status === 'lost') return 'closed';
  return 'sale';
}

/** Contador de cada pestaña. */
export function tabCounts(leads: readonly LeadSummary[]): Record<LeadTab, number> {
  const c: Record<LeadTab, number> = { today: 0, toContact: 0, waiting: 0, sale: 0, closed: 0 };
  for (const l of leads) c[tabOf(l.status, l.temperature)] += 1;
  return c;
}

/**
 * Leads de una pestaña, lo más atrasado primero (D-200): por el día del paso (vencido o siguiente) y, sin él, por
 * antigüedad; en Cerrados, el más reciente arriba.
 */
export function leadsInTab(leads: readonly LeadSummary[], tab: LeadTab): LeadSummary[] {
  const list = leads.filter((l) => tabOf(l.status, l.temperature) === tab);
  if (tab === 'closed') return list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return list.sort((a, b) => {
    // D-350: los potenciales van primero; entre ellos, el más reciente arriba (D-200).
    const pa = isPotential(a);
    const pb = isPotential(b);
    if (pa !== pb) return pa ? -1 : 1;
    if (pa && pb) return b.createdAt.getTime() - a.createdAt.getTime();
    const x = a.nextStepOn ?? '';
    const y = b.nextStepOn ?? '';
    if (x !== y) return x === '' ? 1 : y === '' ? -1 : x.localeCompare(y);
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}

// --- Origen: potencial / en frío (D-348, D-350) -----------------------------------------------------------

/** Colores exactos de D-350 (survey leads-fuentes-aprobado). */
export const ORIGIN_COLORS = {
  potentialStripe: '#E08A1E',
  potentialBg: '#FBE3C7',
  potentialText: '#8A4B0F',
  coldBg: '#E3ECEF',
  coldText: '#2F5563',
  chipBg: '#F1EBE2',
  chipText: '#6B5F52',
} as const;

export const ORIGIN_FILTERS = ['all', 'potential', 'cold'] as const;
export type OriginFilter = (typeof ORIGIN_FILTERS)[number];

/** Potencial abierto (D-350: franja y etiqueta ámbar, acción principal "Call"). */
export function isPotential(l: Pick<LeadSummary, 'temperature'>): boolean {
  return l.temperature === 'potential';
}

/** Cuántos potenciales y fríos hay en una lista (filtro "All / Potential · N / Cold · N"). */
export function originCounts(leads: readonly LeadSummary[]): { potential: number; cold: number } {
  let potential = 0;
  for (const l of leads) if (isPotential(l)) potential += 1;
  return { potential, cold: leads.length - potential };
}

export function filterByOrigin(leads: readonly LeadSummary[], filter: OriginFilter): LeadSummary[] {
  if (filter === 'all') return [...leads];
  return leads.filter((l) => (filter === 'potential') === isPotential(l));
}

/** Texto del chip de la fuente: el que trae la entrada o el de website / manual / campaña. */
export function sourceChip(l: Pick<LeadSummary, 'sourceLabel' | 'source'>, s: SalesStrings): string | null {
  if (l.sourceLabel && l.sourceLabel.trim()) return l.sourceLabel.trim();
  if (l.source === 'web') return s.origin.website;
  if (l.source && l.source in s.source) return s.source[l.source as keyof SalesStrings['source']];
  return null;
}

/** Chip del tipo (D-350): "One-time · Residential", "One-time" o "Recurring". */
export function serviceChip(l: Pick<LeadSummary, 'service' | 'cleaningType'>, s: SalesStrings): string {
  if (l.service === 'one_time') return l.cleaningType === 'residential' ? s.origin.oneTimeResidential : s.origin.oneTime;
  return s.origin.recurring;
}

/** Días enteros entre dos fechas locales. */
export function daysBetween(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** Paso de seguimiento que toca escribir según el estado (plantilla del paso, D-333 (6)); null si no toca ninguno. */
export function writeStep(status: LeadStatus): 'first' | 'follow_up' | 'follow_up_2' | null {
  if (status === 'new') return 'first';
  if (status === 'follow_up') return 'follow_up';
  if (status === 'follow_up_2') return 'follow_up_2';
  return null;
}

/**
 * Línea gris de la fila (survey flujo-leads-aprobado): "Pedro · 1er contacto hace 8 días", "follow up hace 22 días",
 * "Sin contacto todavía"; en venta, la cita del walkthrough o el contacto.
 */
export function leadStepLine(lead: LeadSummary, now: Date, s: SalesStrings): string {
  const parts: string[] = [];
  if (lead.contactName) parts.push(lead.contactName);
  if (isColdStatus(lead.status)) {
    const sent = lead.followupsSent ?? 0;
    if (sent >= 2 && lead.lastContactAt) parts.push(s.flow.followUp2Ago(daysBetween(lead.lastContactAt, now)));
    else if (sent === 1 && (lead.followupSentAt ?? lead.lastContactAt)) parts.push(s.flow.followUpAgo(daysBetween((lead.followupSentAt ?? lead.lastContactAt)!, now)));
    else if (lead.firstContactAt) parts.push(s.flow.firstContactAgo(daysBetween(lead.firstContactAt, now)));
    else parts.push(s.flow.noContact);
  } else if (lead.status !== 'won' && lead.status !== 'lost' && lead.nextWalkthrough) {
    parts.push(s.list.walkthroughOn(formatDateTime(lead.nextWalkthrough, s)));
  }
  return parts.join(' · ');
}

/** "10 nov" / "Nov 10" de un día. */
export function dayMonth(d: Date, s: SalesStrings): string {
  return s.flow.dayMonth(d.getDate(), s.monthShort[d.getMonth()]);
}

export type TimelineItem = { key: string; day: Date; label: string; pending: boolean };

/**
 * Línea de tiempo del seguimiento (D-333 (7)): primer contacto, follow up y 2nd follow up con su fecha, y el siguiente
 * paso en gris con su fecha.
 */
export function followupTimeline(lead: Lead | LeadSummary, s: SalesStrings): TimelineItem[] {
  const items: TimelineItem[] = [];
  const sent = lead.followupsSent ?? 0;
  if (lead.firstContactAt) items.push({ key: 'first', day: lead.firstContactAt, label: s.flow.tlFirst, pending: false });
  if (sent >= 1 && lead.followupSentAt) items.push({ key: 'fu', day: lead.followupSentAt, label: s.flow.tlFollowUp, pending: false });
  if (sent >= 2 && lead.lastContactAt) items.push({ key: 'fu2', day: lead.lastContactAt, label: s.flow.tlFollowUp2, pending: false });
  if (lead.respondedAt) items.push({ key: 'resp', day: lead.respondedAt, label: s.flow.tlResponded, pending: false });
  const next = lead.nextStepOn ? dateFromKey(lead.nextStepOn) : null;
  if (next) {
    const label =
      lead.status === 'new'
        ? null
        : lead.status === 'no_response'
          ? s.flow.tlNoResponse
          : lead.status === 'follow_up' || (lead.status === 'waiting' && sent === 0)
            ? s.flow.tlNextFollowUp
            : lead.status === 'follow_up_2' || (lead.status === 'waiting' && sent === 1)
              ? s.flow.tlNextFollowUp2
              : s.flow.tlNextNoResponse;
    if (label) items.push({ key: 'next', day: next, label, pending: true });
  }
  return items;
}

/** Iniciales de la empresa: "Gulf Coast Dental" -> "GC". */
export function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export function isLeadStatus(v: unknown): v is LeadStatus {
  return typeof v === 'string' && (LEAD_STATUSES as readonly string[]).includes(v);
}

/** Estado leído de la base: 'contacted' (anterior a la orden 130) se muestra como Esperando; desconocido, Nuevo. */
export function toLeadStatus(v: unknown): LeadStatus {
  if (v === 'contacted') return 'waiting';
  return isLeadStatus(v) ? v : 'new';
}

export function isLeadSource(v: unknown): v is LeadSource {
  return typeof v === 'string' && (LEAD_SOURCES as readonly string[]).includes(v);
}

// --- Permisos (current/permisos.md, D-169) ----------------------------------------------------------

/** La lista y el detalle de leads piden `leads_ver`. */
export function canSeeLeads(access: Access): boolean {
  return can(access, 'leads_ver');
}

/** Crear, editar, cambiar estado, sitios, citas y seguimientos: `leads_editar` (y ver, para poder abrirlos). */
export function canEditLeads(access: Access): boolean {
  return can(access, 'leads_ver') && can(access, 'leads_editar');
}

/** Eliminar un lead (D-201): `leads_eliminar` (y ver, para poder abrirlo). */
export function canDeleteLeads(access: Access): boolean {
  return can(access, 'leads_ver') && can(access, 'leads_eliminar');
}

/** Los pendientes de Ventas del Inicio salen solo con `leads_ver` (D-111: solo las áreas con permiso). */
export function showsSalesPending(access: Access): boolean {
  return canSeeLeads(access);
}

// --- Estado ----------------------------------------------------------------------------------------

/** Tono de la ficha de estado (D-031): de marca mientras el lead está abierto (muestra ronda 8), verde Ganado, gris Perdido. */
export function statusTone(status: LeadStatus): 'brand' | 'success' | 'neutral' {
  if (status === 'won') return 'success';
  if (status === 'lost') return 'neutral';
  return 'brand';
}

/** Elegir Perdido en el campo de estado no guarda: abre "Marcar como perdido" para pedir el motivo (D-079). */
export function statusChangeAction(current: LeadStatus, next: LeadStatus): 'none' | 'askLostReason' | 'save' {
  if (current === next) return 'none';
  if (next === 'lost') return 'askLostReason';
  return 'save';
}

// --- Fechas y horas ---------------------------------------------------------------------------------

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** AAAA-MM-DD de un día local. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Día local (00:00) de una clave AAAA-MM-DD. */
export function dateFromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Lee "MM/DD/AAAA" (también M/D/AAAA). Vacío = sin fecha. Devuelve AAAA-MM-DD, null si vacío o 'invalid'. */
export function parseUsDate(text: string): string | null | 'invalid' {
  const t = text.trim();
  if (t === '') return null;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (!m) return 'invalid';
  const month = Number(m[1]);
  const day = Number(m[2]);
  const year = Number(m[3]);
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return 'invalid';
  return dayKey(d);
}

/** AAAA-MM-DD a "MM/DD/AAAA" para el campo. */
export function formatUsDate(key: string | null): string {
  if (!key) return '';
  const [y, m, d] = key.split('-');
  return `${m}/${d}/${y}`;
}

/**
 * Lee la hora del campo Hora: "10:00 AM", "10 am", "2:30pm", "2:30 p. m.", "14:30".
 * Devuelve horas (0-23) y minutos, o null si no es válida.
 */
export function parseTime(text: string): { hours: number; minutes: number } | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, ' ');
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(a\.?\s?m\.?|p\.?\s?m\.?)?$/.exec(t);
  if (!m) return null;
  let hours = Number(m[1]);
  const minutes = m[2] === undefined ? 0 : Number(m[2]);
  if (minutes > 59) return null;
  const suffix = m[3]?.replace(/[.\s]/g, '');
  if (suffix) {
    if (hours < 1 || hours > 12) return null;
    if (suffix === 'am') hours = hours === 12 ? 0 : hours;
    else hours = hours === 12 ? 12 : hours + 12;
  } else if (hours > 23) {
    return null;
  }
  return { hours, minutes };
}

/** "10:00 AM", igual en los dos idiomas (muestras ronda 8 y 12, como formatTime del Inicio). */
export function formatClock(hours: number, minutes: number): string {
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${h12}:${pad2(minutes)} ${hours < 12 ? 'AM' : 'PM'}`;
}

export function formatTimeOf(d: Date): string {
  return formatClock(d.getHours(), d.getMinutes());
}

/** "Mar 22 oct" / "Tue, Oct 22" (muestra ronda 1). */
export function formatShortDate(d: Date, s: SalesStrings): string {
  return s.shortDate(s.dayNames[d.getDay()], d.getDate(), s.monthShort[d.getMonth()]);
}

/** "Mar 22 oct · 10:00 AM" (muestra ronda 1). */
export function formatDateTime(d: Date, s: SalesStrings): string {
  return `${formatShortDate(d, s)} · ${formatTimeOf(d)}`;
}

/** Fecha y hora locales de la cita. */
export function combineDayAndTime(key: string, hours: number, minutes: number): Date {
  const d = dateFromKey(key);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

// --- Formulario del lead ----------------------------------------------------------------------------

export type LeadForm = {
  company: string;
  contactName: string;
  phone: string;
  email: string;
  source: LeadSource;
  followUp: string; // MM/DD/AAAA (lo pone el selector de fecha, D-216)
  notes: string;
  /** Idioma del correo y del portal del quote (D-209): inglés por defecto. */
  language: 'en' | 'es';
  /** Servicio (D-349, D-350 (3)): Recurring por defecto (D-200). */
  service: LeadService;
  /** Propiedad: Residential solo con One-time (D-349). */
  cleaningType: CleaningType;
};

/** Un lead registrado a mano parte con fuente Manual (D-200). */
export const emptyLeadForm: LeadForm = {
  company: '',
  contactName: '',
  phone: '',
  email: '',
  source: 'manual',
  followUp: '',
  notes: '',
  language: 'en',
  service: 'recurring',
  cleaningType: 'non_residential',
};

/** Residencial solo con One-time (D-349): al volver a Recurring, la propiedad vuelve a Commercial. */
export function withService(f: LeadForm, service: LeadService): LeadForm {
  return { ...f, service, cleaningType: service === 'recurring' ? 'non_residential' : f.cleaningType };
}

/** Con Residential la empresa es opcional y el lead se nombra por la persona (D-350 (3)). */
export function isResidentialForm(f: Pick<LeadForm, 'service' | 'cleaningType'>): boolean {
  return f.service === 'one_time' && f.cleaningType === 'residential';
}

export type LeadFormErrors = { company?: true; contactName?: true; email?: true; followUp?: true; phone?: true };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateLeadForm(f: LeadForm): LeadFormErrors {
  const errors: LeadFormErrors = {};
  if (isResidentialForm(f)) {
    // Sin empresa, el lead se nombra por la persona: hace falta su nombre (D-200).
    if (f.company.trim() === '' && f.contactName.trim() === '') errors.contactName = true;
  } else if (f.company.trim() === '') errors.company = true;
  if (f.email.trim() !== '' && !EMAIL.test(f.email.trim())) errors.email = true;
  if (parseUsDate(f.followUp) === 'invalid') errors.followUp = true;
  if (!isValidPhone(f.phone)) errors.phone = true;
  return errors;
}

export function hasLeadErrors(e: LeadFormErrors): boolean {
  return Boolean(e.company || e.contactName || e.email || e.followUp || e.phone);
}

export function leadFormFrom(lead: Lead): LeadForm {
  return {
    company: lead.companyMissing ? '' : lead.company,
    contactName: lead.contactName ?? '',
    phone: formatPhone(lead.phone),
    email: lead.email ?? '',
    source: lead.source,
    followUp: formatUsDate(lead.followUpOn),
    notes: lead.notes ?? '',
    language: lead.language,
    service: lead.service ?? 'recurring',
    cleaningType: lead.cleaningType ?? 'non_residential',
  };
}

/** Columnas de la tabla `leads` desde el formulario: textos sin espacios de más y vacío = null. */
export function leadColumns(f: LeadForm) {
  const clean = (v: string) => (v.trim() === '' ? null : v.trim());
  const residential = isResidentialForm(f);
  return {
    // Residencial sin empresa: null (la base nombra el lead por la persona); comercial siempre con empresa.
    company: residential ? clean(f.company) : f.company.trim(),
    contact_name: clean(f.contactName),
    phone: clean(normalizePhone(f.phone)),
    email: clean(f.email)?.toLowerCase() ?? null,
    source: f.source,
    notes: clean(f.notes),
    language: f.language,
    service: f.service,
    cleaning_type: residential ? 'residential' : 'non_residential',
  };
}

// --- Lista del Pipeline (D-027) ----------------------------------------------------------------------

/** Orden de la lista: el más reciente arriba (D-200). */
export function sortLeads<T extends { createdAt: Date }>(leads: readonly T[]): T[] {
  return [...leads].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/**
 * Línea gris bajo la empresa (D-200): la próxima cita si hay y el lead sigue abierto,
 * si no la fecha de seguimiento, si no la persona de contacto.
 */
export function leadListDetail(lead: LeadSummary, s: SalesStrings): string {
  const open = lead.status !== 'won' && lead.status !== 'lost';
  if (open && lead.nextWalkthrough) return s.list.walkthroughOn(formatDateTime(lead.nextWalkthrough, s));
  if (open && lead.followUpOn) return s.list.followUpOn(formatShortDate(dateFromKey(lead.followUpOn), s));
  return lead.contactName ?? '';
}

/** Próxima cita agendada desde ahora entre varias. */
export function nextScheduled(appointments: readonly Appointment[], now: Date): Date | null {
  const upcoming = appointments
    .filter((a) => a.status === 'scheduled' && a.startsAt.getTime() >= now.getTime())
    .map((a) => a.startsAt)
    .sort((a, b) => a.getTime() - b.getTime());
  return upcoming[0] ?? null;
}

/** Nombre visible de un sitio: su nombre, su dirección o "Naples, FL" (D-319: el sitio del lead web no tiene nombre). */
export function siteLabel(site: Pick<LeadSite, 'name' | 'address'>): string {
  if (site.name && site.name.trim() !== '') return site.name;
  return site.address && site.address.trim() !== '' ? site.address : DEFAULT_SITE_LABEL;
}

/** D-319: un sitio sin nombre ni dirección se muestra así. */
export const DEFAULT_SITE_LABEL = 'Naples, FL';

/** Nombre visible de un lead: la empresa o, si el sitio web no la trajo, el contacto (D-319). */
export function leadDisplayName(company: string | null | undefined, contactName: string | null | undefined): string {
  const c = (company ?? '').trim();
  if (c) return c;
  return (contactName ?? '').trim() || 'Lead';
}

// --- Calendario del mes (D-104) -----------------------------------------------------------------------

export type CalendarCell = {
  key: string;
  day: number;
  /** Del mes que se muestra; los de los meses vecinos van atenuados y no se eligen. */
  inMonth: boolean;
  /** Antes de hoy: no se puede agendar. */
  past: boolean;
  /** Ya tiene citas (punto de 4px). */
  hasAppointment: boolean;
  selected: boolean;
};

/** Semanas de domingo a sábado (D-231) que cubren el mes (5 o 6 filas), como la muestra de la ronda 12. */
export function monthGrid(
  year: number,
  month: number,
  today: Date,
  appointmentDays: ReadonlySet<string>,
  selectedKey: string | null,
): CalendarCell[][] {
  const first = new Date(year, month, 1);
  const offset = first.getDay(); // domingo = 0 (D-231)
  const start = new Date(year, month, 1 - offset);
  const last = new Date(year, month + 1, 0);
  const total = Math.ceil((offset + last.getDate()) / 7) * 7;
  const todayKey = dayKey(today);
  const weeks: CalendarCell[][] = [];
  for (let i = 0; i < total; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const key = dayKey(d);
    if (i % 7 === 0) weeks.push([]);
    weeks[weeks.length - 1].push({
      key,
      day: d.getDate(),
      inMonth: d.getMonth() === month,
      past: key < todayKey,
      hasAppointment: appointmentDays.has(key),
      selected: key === selectedKey,
    });
  }
  return weeks;
}

/** Mes anterior o siguiente. */
export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const d = new Date(year, month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

/** No se vuelve a meses ya pasados (D-200): el primero que se muestra es el de hoy. */
export function canGoToPreviousMonth(year: number, month: number, today: Date): boolean {
  return year > today.getFullYear() || (year === today.getFullYear() && month > today.getMonth());
}

/** Días (AAAA-MM-DD) que tienen citas agendadas. */
export function appointmentDayKeys(starts: readonly Date[]): Set<string> {
  return new Set(starts.map(dayKey));
}

export type ScheduleCheck =
  | { ok: true; startsAt: Date }
  | { ok: false; error: 'time' | 'past' };

/** Valida el día elegido y la hora escrita antes de agendar. */
export function checkSchedule(dayKeyValue: string, timeText: string, now: Date): ScheduleCheck {
  const time = parseTime(timeText);
  if (!time) return { ok: false, error: 'time' };
  const startsAt = combineDayAndTime(dayKeyValue, time.hours, time.minutes);
  if (startsAt.getTime() <= now.getTime()) return { ok: false, error: 'past' };
  return { ok: true, startsAt };
}

// --- Pendientes del Inicio (D-111, D-131) -------------------------------------------------------------

export type SalesPendingCounts = { followUpsDue: number; walkthroughsUpcoming: number };

export type PendingRow = {
  key: 'followUps' | 'walkthroughs';
  title: string;
  detail: string;
  /** D-131: ningún pendiente de Ventas A es Urgente (solo quotes por vencer, hito 4); va con flecha. */
  urgent: boolean;
};

/**
 * Filas de Ventas para la lista de pendientes del Inicio: solo con permiso y con algo pendiente.
 * Orden (D-200): seguimientos y después walkthroughs.
 */
export function salesPendingRows(access: Access, counts: SalesPendingCounts | null, s: SalesStrings): PendingRow[] {
  if (!counts || !showsSalesPending(access)) return [];
  const rows: PendingRow[] = [];
  if (counts.followUpsDue > 0) {
    rows.push({ key: 'followUps', title: s.home.followUps, detail: s.home.followUpsDetail(counts.followUpsDue), urgent: false });
  }
  if (counts.walkthroughsUpcoming > 0) {
    rows.push({
      key: 'walkthroughs',
      title: s.home.walkthroughs,
      detail: s.home.walkthroughsDetail(counts.walkthroughsUpcoming),
      urgent: false,
    });
  }
  return rows;
}

/** Lista única por urgencia (D-111): primero las Urgentes; entre iguales se respeta el orden de llegada. */
export function sortPending<T extends { urgent: boolean }>(rows: readonly T[]): T[] {
  return rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => Number(b.row.urgent) - Number(a.row.urgent) || a.i - b.i)
    .map((x) => x.row);
}

/** Etiqueta del motivo según el idioma. */
export function reasonLabel(r: Pick<LostReason, 'labelEs' | 'labelEn'>, locale: 'es' | 'en'): string {
  return locale === 'es' ? r.labelEs : r.labelEn;
}

// --- Motivos de lead perdido en Ajustes (D-107, D-113, D-114, D-203) ----------------------------------

/** Motivos que se ofrecen y se cuentan: los activos, en su orden. Los desactivados solo siguen en los leads que los usan. */
export function activeReasons(reasons: readonly LostReason[]): LostReason[] {
  return reasons.filter((r) => r.active).sort((a, b) => a.sort - b.sort);
}

/** Lugar de un motivo nuevo: al final de la lista (D-200). */
export function nextReasonSort(reasons: readonly LostReason[]): number {
  return reasons.reduce((max, r) => Math.max(max, r.sort), 0) + 1;
}

export type ReasonForm = { labelEs: string; labelEn: string };
export type ReasonFormErrors = { labelEs?: true; labelEn?: true };

/** Cada motivo lleva texto en español y en inglés (D-203). */
export function validateReasonForm(f: ReasonForm): ReasonFormErrors {
  const errors: ReasonFormErrors = {};
  if (f.labelEs.trim() === '') errors.labelEs = true;
  if (f.labelEn.trim() === '') errors.labelEn = true;
  return errors;
}
