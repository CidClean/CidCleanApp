/**
 * Reglas puras del walkthrough (hito 3): documento que se arma en el teléfono sin conexión, pasos, áreas,
 * frecuencia y cola de sincronización. Sin red ni almacenamiento: se prueban solas.
 * Fuente: current/flujo.md ("Ventas 2: Walkthrough"), D-004, D-037, D-038, D-073 a D-075, D-080, D-091, D-105, D-106, D-119.
 */
import { can, type Access } from './visibility';
import { bySunday } from './weekOrder';

// --- Tipos ------------------------------------------------------------------------------------------

/** Tipos de área (D-106), en su orden. Las etiquetas viven en i18n/walkthrough.ts. */
export const AREA_TYPES = [
  'bathroom',
  'office',
  'lobby',
  'kitchen',
  'conference',
  'hallway',
  'reception',
  'stairs',
  'storage',
  'other',
] as const;
export type AreaType = (typeof AREA_TYPES)[number];

export const CONDITIONS = ['good', 'fair', 'poor'] as const; // Buena / Regular / Mala (D-037)
export type Condition = (typeof CONDITIONS)[number];

/** Tamaño cualitativo del área (D-217, reemplaza el tamaño en ft² de D-213): Small / Medium / Big. */
export const AREA_SIZES = ['small', 'medium', 'big'] as const;
export type AreaSize = (typeof AREA_SIZES)[number];

/** Un tamaño guardado antes de D-217 (texto en ft²) o desconocido no se usa: queda sin elegir. */
export function normalizeSize(raw: unknown): AreaSize | null {
  return typeof raw === 'string' && (AREA_SIZES as readonly string[]).includes(raw) ? (raw as AreaSize) : null;
}

export type Photo = {
  id: string;
  /** Ruta en el bucket: <walkthrough>/<foto>.jpg. */
  path: string;
  /** Archivo en el teléfono (null si la foto llegó del servidor y no está en este teléfono). */
  uri: string | null;
  note: string;
  uploaded: boolean;
};

export type Area = {
  id: string;
  type: AreaType;
  name: string;
  /** El nombre lo puso la persona: ya no se cambia solo al cambiar el tipo. */
  nameEdited: boolean;
  size: AreaSize | null;
  condition: Condition | null;
  specialRequest: string;
  notes: string;
  photos: Photo[];
};

/** Frecuencia (D-075, D-080, D-105): días 0 = lunes ... 6 = domingo. */
export type Frequency = { kind: 'daily' | 'weekly' | 'other'; days: number[]; other: string };

export type WalkthroughData = {
  contact: { address: string; contactName: string; phone: string; email: string; general: string };
  areas: Area[];
  frequency: Frequency;
  internal: { staff: string; time: string; supplies: string };
};

export type WalkthroughDoc = {
  id: string;
  siteId: string;
  leadId: string;
  appointmentId: string | null;
  /** Para mostrar sin conexión. */
  company: string;
  siteLabel: string;
  step: number; // 1..5
  data: WalkthroughData;
  /** Cada cambio sube rev; lo último que llegó al servidor es syncedRev. */
  rev: number;
  syncedRev: number;
  /** Ya hubo al menos una sincronización completa (para mostrar "Sincronizado", D-119). */
  everSynced: boolean;
  updatedAt: string;
  /** draft: en curso (o corrigiendo una versión cerrada); closed: la última versión está cerrada (D-212). */
  status: 'draft' | 'closed';
  /** Última versión cerrada (0 si nunca se cerró). */
  version: number;
  /** "Cerrar walkthrough" se tocó sin red: se cierra cuando la cola lo mande (D-004). */
  closeRequested: boolean;
};

// --- Permisos (current/permisos.md) -----------------------------------------------------------------

/** Hacer el walkthrough: `walkthroughs_hacer` (y ver leads, para llegar desde el sitio del lead). */
export function canDoWalkthroughs(access: Access): boolean {
  return can(access, 'walkthroughs_hacer') && can(access, 'leads_ver');
}

// --- Pasos (D-073) ------------------------------------------------------------------------------------

export const STEP_COUNT = 5;
export type StepKey = 'site' | 'areas' | 'frequency' | 'internal' | 'summary';
export const STEPS: readonly StepKey[] = ['site', 'areas', 'frequency', 'internal', 'summary'];

export function clampStep(step: number): number {
  return Math.min(STEP_COUNT, Math.max(1, Math.round(step)));
}

/** Avance de la barra de 4px: paso N de 5 (muestra ronda 8: paso 2 = 40%). */
export function stepProgress(step: number): number {
  return clampStep(step) / STEP_COUNT;
}

// --- Documento nuevo ------------------------------------------------------------------------------------

export function newId(random: () => number = Math.random): string {
  // UUID v4: el servidor acepta el id que genera el teléfono (save_walkthrough).
  const hex = Array.from({ length: 32 }, () => Math.floor(random() * 16).toString(16));
  hex[12] = '4';
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const h = hex.join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function emptyData(prefill: Partial<WalkthroughData['contact']> = {}): WalkthroughData {
  return {
    contact: { address: '', contactName: '', phone: '', email: '', general: '', ...prefill },
    areas: [],
    // D-200: parte en Semanal sin días marcados.
    frequency: { kind: 'weekly', days: [], other: '' },
    internal: { staff: '', time: '', supplies: '' },
  };
}

export function newDoc(input: {
  id?: string;
  siteId: string;
  leadId: string;
  appointmentId: string | null;
  company: string;
  siteLabel: string;
  contact: Partial<WalkthroughData['contact']>;
  now?: Date;
}): WalkthroughDoc {
  return {
    id: input.id ?? newId(),
    siteId: input.siteId,
    leadId: input.leadId,
    appointmentId: input.appointmentId,
    company: input.company,
    siteLabel: input.siteLabel,
    step: 1,
    data: emptyData(input.contact),
    rev: 1, // un walkthrough nuevo ya tiene algo que mandar
    syncedRev: 0,
    everSynced: false,
    updatedAt: (input.now ?? new Date()).toISOString(),
    status: 'draft',
    version: 0,
    closeRequested: false,
  };
}

// --- Áreas (D-037, D-074, D-106) --------------------------------------------------------------------

/** Nombre por defecto "Type ##" (flujo): el tipo y el número de esa área entre las de su tipo, con dos cifras. */
export function defaultAreaName(type: AreaType, typeLabel: string, areas: readonly Area[], excludeId?: string): string {
  const same = areas.filter((a) => a.type === type && a.id !== excludeId).length;
  return `${typeLabel} ${String(same + 1).padStart(2, '0')}`;
}

/** Área nueva: Baño por defecto (D-200, como la muestra de la ronda 3). */
export function newArea(areas: readonly Area[], typeLabel: (t: AreaType) => string, type: AreaType = 'bathroom'): Area {
  return {
    id: newId(),
    type,
    name: defaultAreaName(type, typeLabel(type), areas),
    nameEdited: false,
    size: null,
    condition: null,
    specialRequest: '',
    notes: '',
    photos: [],
  };
}

/** Cambiar el tipo cambia el nombre por defecto mientras la persona no lo haya escrito. */
export function withAreaType(area: Area, type: AreaType, typeLabel: string, areas: readonly Area[]): Area {
  return {
    ...area,
    type,
    name: area.nameEdited ? area.name : defaultAreaName(type, typeLabel, areas, area.id),
  };
}

/** Un área recién abierta y sin tocar no se guarda al volver (D-200). */
export function isUntouched(area: Area): boolean {
  return (
    !area.nameEdited &&
    area.size === null &&
    area.condition === null &&
    area.specialRequest.trim() === '' &&
    area.notes.trim() === '' &&
    area.photos.length === 0
  );
}

/** Área leída del teléfono o del servidor: tamaño de D-217 y fotos siempre como lista. */
export function normalizeArea(a: Area): Area {
  return { ...a, size: normalizeSize(a.size), photos: Array.isArray(a.photos) ? a.photos : [] };
}

/** Documento guardado en el teléfono antes de D-217: se lee con el tamaño nuevo. */
export function normalizeDoc(doc: WalkthroughDoc): WalkthroughDoc {
  return { ...doc, data: { ...doc.data, areas: (doc.data.areas ?? []).map(normalizeArea) } };
}

export function upsertArea(areas: readonly Area[], area: Area): Area[] {
  const i = areas.findIndex((a) => a.id === area.id);
  if (i < 0) return [...areas, area];
  const next = [...areas];
  next[i] = area;
  return next;
}

/** Línea gris de la fila del área: "Mediana · Regular" (muestra ronda 8, con el tamaño de D-217). */
export function areaDetail(area: Area, conditionLabel: (c: Condition) => string, sizeLabel: (s: AreaSize) => string): string {
  const parts: string[] = [];
  if (area.size) parts.push(sizeLabel(area.size));
  if (area.condition) parts.push(conditionLabel(area.condition));
  return parts.join(' · ');
}

// --- Frecuencia (D-075, D-080, D-105) --------------------------------------------------------------------

export function withFrequencyKind(f: Frequency, kind: Frequency['kind']): Frequency {
  // Diaria marca los siete días (D-105); al volver a Semanal se parte sin días.
  if (kind === 'daily') return { ...f, kind, days: [0, 1, 2, 3, 4, 5, 6] };
  if (kind === 'weekly' && f.kind === 'daily') return { ...f, kind, days: [] };
  return { ...f, kind };
}

export function toggleDay(f: Frequency, day: number): Frequency {
  if (f.kind !== 'weekly') return f;
  const days = f.days.includes(day) ? f.days.filter((d) => d !== day) : [...f.days, day].sort((a, b) => a - b);
  return { ...f, days };
}

/** Veces por semana (D-075: dos días marcados = dos veces por semana). */
export function timesPerWeek(f: Frequency): number | null {
  if (f.kind === 'other') return null;
  return f.kind === 'daily' ? 7 : f.days.length;
}

// --- Fotos --------------------------------------------------------------------------------------------

export function photoPath(walkthroughId: string, photoId: string, mimeType: string | null): string {
  const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/heic' ? 'heic' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  return `${walkthroughId}/${photoId}.${ext}`;
}

// --- Cola de sincronización (D-004, D-091, D-119) ------------------------------------------------------

/** Pendientes del aviso "N pendientes": el documento si tiene cambios sin mandar, más cada foto sin subir. */
export function pendingCount(doc: WalkthroughDoc): number {
  const photos = doc.data.areas.reduce((n, a) => n + a.photos.filter((p) => !p.uploaded).length, 0);
  return (doc.rev > doc.syncedRev ? 1 : 0) + photos + (doc.closeRequested ? 1 : 0);
}

/** Walkthroughs en curso en este teléfono (fila del Inicio, D-212): sin cerrar o con el cierre aún por mandar. */
export function inProgress(docs: readonly WalkthroughDoc[]): WalkthroughDoc[] {
  return docs
    .filter((d) => d.status === 'draft' || d.closeRequested)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Se puede editar mientras está en curso; cerrado, solo después de tocar Editar (versión nueva, D-212). */
export function isEditable(doc: WalkthroughDoc): boolean {
  return doc.status === 'draft' && !doc.closeRequested;
}

export function removeArea(areas: readonly Area[], areaId: string): Area[] {
  return areas.filter((a) => a.id !== areaId);
}

export function removePhoto(areas: readonly Area[], areaId: string, photoId: string): Area[] {
  return areas.map((a) => (a.id === areaId ? { ...a, photos: a.photos.filter((p) => p.id !== photoId) } : a));
}

/** Línea de la frecuencia en el Resumen: "Semanal: Lun, Mié, Vie · 3 veces por semana". */
export function frequencySummary(
  f: Frequency,
  s: { daily: string; weekly: string; other: string; days: readonly string[]; times: (n: number) => string },
): string {
  if (f.kind === 'daily') return `${s.daily} · ${s.times(7)}`;
  if (f.kind === 'other') return f.other.trim() ? `${s.other}: ${f.other.trim()}` : s.other;
  const days = [...f.days].sort(bySunday).map((d) => s.days[d]);
  return days.length ? `${s.weekly}: ${days.join(', ')} · ${s.times(days.length)}` : s.weekly;
}

export type SyncBadge = { kind: 'pending'; count: number } | { kind: 'synced' } | { kind: 'none' };

/** Aviso del encabezado: nube con "N pendientes" (D-091) o nube con marca y "Sincronizado", que se queda (D-119). */
export function syncBadge(doc: WalkthroughDoc): SyncBadge {
  const count = pendingCount(doc);
  if (count > 0) return { kind: 'pending', count };
  return doc.everSynced ? { kind: 'synced' } : { kind: 'none' };
}

/** Lo que va al servidor: sin las rutas locales de los archivos del teléfono. */
export function serverData(data: WalkthroughData): unknown {
  return {
    ...data,
    areas: data.areas.map((a) => ({
      ...a,
      photos: a.photos.map((p) => ({ id: p.id, path: p.path, note: p.note })),
    })),
  };
}

/** Documento local desde un borrador del servidor (otro teléfono, o este después de reinstalar). */
export function dataFromServer(raw: unknown, fallback: WalkthroughData): WalkthroughData {
  if (!raw || typeof raw !== 'object') return fallback;
  const r = raw as Partial<WalkthroughData>;
  return {
    contact: { ...fallback.contact, ...(r.contact ?? {}) },
    frequency: { ...fallback.frequency, ...(r.frequency ?? {}) },
    internal: { ...fallback.internal, ...(r.internal ?? {}) },
    areas: Array.isArray(r.areas)
      ? r.areas.map((a) => ({
          ...a,
          size: normalizeSize(a.size),
          photos: (a.photos ?? []).map((p) => ({ id: p.id, path: p.path, note: p.note ?? '', uri: null, uploaded: true })),
        }))
      : [],
  };
}
