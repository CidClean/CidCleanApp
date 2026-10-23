import { walkthroughEn, walkthroughEs } from '@/i18n/walkthrough';
import {
  AREA_TYPES,
  areaDetail,
  canDoWalkthroughs,
  dataFromServer,
  defaultAreaName,
  emptyData,
  isUntouched,
  newArea,
  normalizeArea,
  normalizeSize,
  newDoc,
  newId,
  pendingCount,
  photoPath,
  serverData,
  stepProgress,
  syncBadge,
  timesPerWeek,
  toggleDay,
  upsertArea,
  withAreaType,
  withFrequencyKind,
  type Area,
} from './walkthroughRules';
import type { Access } from './visibility';

const access = (perms: string[], isSuperAdmin = false): Access => ({ isSuperAdmin, permissions: new Set(perms) });
const label = (t: Area['type']) => walkthroughEs.types[t];

describe('permisos (current/permisos.md)', () => {
  it('hacer walkthroughs pide walkthroughs_hacer y leads_ver; el Supervisor de partida los tiene', () => {
    expect(canDoWalkthroughs(access(['walkthroughs_hacer']))).toBe(false);
    expect(canDoWalkthroughs(access(['leads_ver']))).toBe(false);
    expect(canDoWalkthroughs(access(['leads_ver', 'walkthroughs_hacer']))).toBe(true);
    expect(canDoWalkthroughs(access([], true))).toBe(true);
  });
});

describe('áreas (D-037, D-074, D-106)', () => {
  it('los diez tipos de D-106, en su orden', () => {
    expect(AREA_TYPES.map((t) => walkthroughEs.types[t])).toEqual([
      'Baño',
      'Oficina',
      'Lobby',
      'Cocina',
      'Sala de juntas',
      'Pasillo',
      'Recepción',
      'Escaleras',
      'Almacén',
      'Otro',
    ]);
  });

  it('nombre por defecto "Type ##": cuenta solo las áreas de su tipo', () => {
    const a1 = newArea([], label);
    expect(a1.name).toBe('Baño 01');
    const office = newArea([a1], label, 'office');
    expect(office.name).toBe('Oficina 01');
    expect(newArea([a1, office], label).name).toBe('Baño 02');
    expect(defaultAreaName('bathroom', 'Bathroom', [a1, office])).toBe('Bathroom 02');
  });

  it('cambiar el tipo cambia el nombre si la persona no lo escribió', () => {
    const a1 = newArea([], label);
    const a2 = newArea([a1], label);
    expect(withAreaType(a2, 'kitchen', 'Cocina', [a1, a2]).name).toBe('Cocina 01');
    expect(withAreaType({ ...a2, name: 'Baño de visitas', nameEdited: true }, 'kitchen', 'Cocina', [a1]).name).toBe(
      'Baño de visitas',
    );
  });

  it('un área sin tocar no se guarda; con cualquier dato sí', () => {
    const a = newArea([], label);
    expect(isUntouched(a)).toBe(true);
    expect(isUntouched({ ...a, condition: 'fair' })).toBe(false);
    expect(isUntouched({ ...a, size: 'medium' })).toBe(false);
  });

  it('upsert: agrega al final o reemplaza la misma', () => {
    const a = newArea([], label);
    const list = upsertArea([], a);
    expect(upsertArea(list, { ...a, size: 'big' })).toEqual([{ ...a, size: 'big' }]);
  });

  it('línea de la fila: "Mediana · Regular" (tamaño cualitativo, D-217)', () => {
    const a = { ...newArea([], label), size: 'medium' as const, condition: 'fair' as const };
    expect(areaDetail(a, (c) => walkthroughEs.conditions[c], (z) => walkthroughEs.sizes[z])).toBe('Mediana · Regular');
    expect(areaDetail({ ...a, size: null }, (c) => walkthroughEn.conditions[c], (z) => walkthroughEn.sizes[z])).toBe('Fair');
    expect(walkthroughEn.sizes).toEqual({ small: 'Small', medium: 'Medium', big: 'Big' });
  });

  it('un tamaño en ft² guardado antes de D-217 se lee sin elegir', () => {
    expect(normalizeSize('120')).toBeNull();
    expect(normalizeSize('')).toBeNull();
    expect(normalizeSize('small')).toBe('small');
    const old = { ...newArea([], label), size: '340' } as unknown as Area;
    expect(normalizeArea(old).size).toBeNull();
    expect(dataFromServer({ areas: [{ ...old, photos: [] }] }, emptyData()).areas[0].size).toBeNull();
  });
});

describe('frecuencia (D-075, D-080, D-105)', () => {
  const weekly = emptyData().frequency;

  it('parte en Semanal sin días', () => {
    expect(weekly).toEqual({ kind: 'weekly', days: [], other: '' });
    expect(timesPerWeek(weekly)).toBe(0);
  });

  it('dos días marcados = dos veces por semana', () => {
    const f = toggleDay(toggleDay(toggleDay(weekly, 4), 0), 2);
    expect(f.days).toEqual([0, 2, 4]);
    expect(timesPerWeek(f)).toBe(3);
    expect(walkthroughEs.frequency.times(3)).toBe('3 veces por semana');
    expect(toggleDay(f, 2).days).toEqual([0, 4]);
  });

  it('Diaria marca los siete días: "7 veces por semana", y no se desmarcan', () => {
    const daily = withFrequencyKind(weekly, 'daily');
    expect(daily.days).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(walkthroughEs.frequency.times(timesPerWeek(daily)!)).toBe('7 veces por semana');
    expect(toggleDay(daily, 1)).toBe(daily);
    expect(withFrequencyKind(daily, 'weekly').days).toEqual([]);
  });

  it('Otra no cuenta veces y lleva texto libre', () => {
    expect(timesPerWeek({ kind: 'other', days: [], other: 'Días 1 y 15' })).toBeNull();
  });
});

describe('pasos (D-073)', () => {
  it('barra: paso 2 de 5 = 40% (muestra ronda 8)', () => {
    expect(stepProgress(2)).toBeCloseTo(0.4);
    expect(stepProgress(9)).toBe(1);
    expect(walkthroughEs.stepLine(2, walkthroughEs.steps.areas)).toBe('Paso 2 de 5 · Áreas');
  });
});

describe('documento y cola (D-004, D-091, D-119)', () => {
  const base = {
    siteId: 's1',
    leadId: 'l1',
    appointmentId: 'c1',
    company: 'Gulf Coast Dental',
    siteLabel: '5th Ave S',
    contact: { address: '123 5th Ave S', contactName: 'Ana Rivera' },
  };

  it('ids UUID v4 que acepta el servidor', () => {
    expect(newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('un walkthrough nuevo parte en el paso 1 con los datos del sitio y algo por mandar', () => {
    const doc = newDoc(base);
    expect(doc.step).toBe(1);
    expect(doc.data.contact).toMatchObject({ address: '123 5th Ave S', contactName: 'Ana Rivera', general: '' });
    expect(pendingCount(doc)).toBe(1);
    expect(syncBadge(doc)).toEqual({ kind: 'pending', count: 1 });
  });

  it('pendientes: el documento más cada foto sin subir; "Sincronizado" solo tras sincronizar', () => {
    const doc = newDoc(base);
    const photo = { id: 'f1', path: `${doc.id}/f1.jpg`, uri: 'file:///f1.jpg', note: '', uploaded: false };
    const withPhotos = {
      ...doc,
      data: { ...doc.data, areas: [{ ...newArea([], label), photos: [photo, { ...photo, id: 'f2' }] }] },
    };
    expect(pendingCount(withPhotos)).toBe(3);
    const clean = { ...doc, syncedRev: doc.rev };
    expect(syncBadge(clean)).toEqual({ kind: 'none' });
    expect(syncBadge({ ...clean, everSynced: true })).toEqual({ kind: 'synced' });
    expect(walkthroughEs.pending(3)).toBe('3 pendientes');
  });

  it('al servidor van las rutas del bucket y no los archivos del teléfono', () => {
    const doc = newDoc(base);
    const area = {
      ...newArea([], label),
      photos: [{ id: 'f1', path: 'w/f1.jpg', uri: 'file:///x.jpg', note: 'Piso', uploaded: false }],
    };
    const sent = serverData({ ...doc.data, areas: [area] }) as { areas: { photos: unknown[] }[] };
    expect(sent.areas[0].photos).toEqual([{ id: 'f1', path: 'w/f1.jpg', note: 'Piso' }]);
  });

  it('un borrador del servidor se retoma con sus fotos ya subidas', () => {
    const data = dataFromServer(
      { areas: [{ id: 'a', type: 'office', name: 'Oficina 01', photos: [{ id: 'f', path: 'w/f.jpg', note: 'x' }] }] },
      emptyData({ address: 'X' }),
    );
    expect(data.contact.address).toBe('X');
    expect(data.areas[0].photos[0]).toEqual({ id: 'f', path: 'w/f.jpg', note: 'x', uri: null, uploaded: true });
    expect(dataFromServer(null, emptyData()).areas).toEqual([]);
  });

  it('ruta de la foto según el tipo de archivo', () => {
    expect(photoPath('w1', 'f1', 'image/jpeg')).toBe('w1/f1.jpg');
    expect(photoPath('w1', 'f1', 'image/png')).toBe('w1/f1.png');
    expect(photoPath('w1', 'f1', null)).toBe('w1/f1.jpg');
  });
});
