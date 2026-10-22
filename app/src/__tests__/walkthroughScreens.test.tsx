import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
// --- Simulaciones --------------------------------------------------------------------------------------------
const mockReplace = jest.fn();
const mockPush = jest.fn();
let mockAccess: { isSuperAdmin: boolean; permissions: Set<string> } = { isSuperAdmin: true, permissions: new Set() };
let mockParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush, back: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = require('react');
    useEffect(effect, []);
  },
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require('react-native');
    return <Text>REDIRECT {href}</Text>;
  },
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/lib/session', () => ({
  usePermissions: () => ({
    access: mockAccess,
    isSuperAdmin: mockAccess.isSuperAdmin,
    can: (k: string) => mockAccess.isSuperAdmin || mockAccess.permissions.has(k),
  }),
  useSession: () => ({ locale: 'es', profile: { id: 'yo' } }),
}));
jest.mock('@/i18n/useStrings', () => ({ useStrings: () => require('@/i18n').getStrings('es') }));
jest.mock('@/i18n/useWalkthroughStrings', () => ({ useWalkthroughStrings: () => require('@/i18n/walkthrough').walkthroughEs }));

// Sin red: el servidor no contesta (la cola queda pendiente).
const mockFetchServer = jest.fn();
jest.mock('@/lib/walkthroughApi', () => ({
  supabaseSyncDeps: { saveDraft: async () => 'offline', uploadPhoto: async () => 'offline' },
  fetchServerWalkthrough: (...a: unknown[]) => mockFetchServer(...a),
  keepPhotoOnDevice: (uri: string) => uri,
}));
const mockFetchLead = jest.fn();
jest.mock('@/lib/leadsApi', () => ({
  fetchLead: (...a: unknown[]) => mockFetchLead(...a),
  fetchSalesPending: async () => ({ ok: false, reason: 'network' }),
}));
// El Inicio también pide los pendientes de los quotes (hito 4).
jest.mock('@/lib/quotesApi', () => ({ fetchQuotePending: async () => [] }));
jest.mock('@/i18n/useSalesStrings', () => ({ useSalesStrings: () => require('@/i18n/sales').salesEs }));
jest.mock('@/lib/week', () => ({ ...jest.requireActual('@/lib/week'), fetchWeekVisits: () => Promise.resolve([]) }));
jest.mock('@/lib/documents', () => ({ takePhoto: jest.fn() }));

import HomeScreen from '@/app/(app)/(tabs)/index';
import WalkthroughAreaScreen from '@/app/(app)/walkthrough/[id]/area';
import WalkthroughScreen from '@/app/(app)/walkthrough/[id]/index';
import StartWalkthroughScreen from '@/app/(app)/walkthrough/new';
import { newArea, newDoc } from '@/lib/walkthroughRules';
import { listWalkthroughs, loadWalkthrough, saveWalkthrough, setWalkthroughStorage } from '@/lib/walkthroughStore';

function memoryKV() {
  const m = new Map<string, string>();
  return {
    getItem: async (k: string) => m.get(k) ?? null,
    setItem: async (k: string, v: string) => void m.set(k, v),
    removeItem: async (k: string) => void m.delete(k),
    getAllKeys: async () => [...m.keys()],
  };
}

const lead = {
  id: 'l1',
  company: 'Gulf Coast Dental',
  contactName: 'Ana Rivera',
  phone: '(239) 555-0142',
  email: 'ana@gulfcoastdental.com',
  sites: [
    { id: 's1', name: '5th Ave S', address: '123 5th Ave S, Naples', scheduled: { id: 'c1', startsAt: new Date(), status: 'scheduled' }, walkthroughDone: false },
    { id: 's2', name: null, address: '900 Marco Island Blvd', scheduled: null, walkthroughDone: false },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  setWalkthroughStorage(memoryKV());
  mockAccess = { isSuperAdmin: true, permissions: new Set() };
  mockParams = {};
  mockFetchLead.mockResolvedValue({ ok: true, data: lead });
  mockFetchServer.mockResolvedValue({ ok: false });
});

describe('Iniciar walkthrough', () => {
  it('elige el sitio y crea el walkthrough en el teléfono aunque no haya red, con los datos del sitio y la cita', async () => {
    mockParams = { lead: 'l1' };
    await render(<StartWalkthroughScreen />);
    await screen.findByText('Continuar');
    await fireEvent.press(screen.getByText('Continuar'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    const [doc] = await listWalkthroughs();
    expect(doc).toMatchObject({ siteId: 's1', appointmentId: 'c1', company: 'Gulf Coast Dental', step: 1 });
    expect(doc.data.contact).toMatchObject({ address: '123 5th Ave S, Naples', contactName: 'Ana Rivera' });
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/walkthrough/[id]', params: { id: doc.id } });
  });

  it('si el sitio ya tiene walkthrough en este teléfono, lo abre', async () => {
    const existing = newDoc({ siteId: 's2', leadId: 'l1', appointmentId: null, company: 'x', siteLabel: 'y', contact: {} });
    await saveWalkthrough(existing);
    mockParams = { lead: 'l1', site: 's2' };
    await render(<StartWalkthroughScreen />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({ pathname: '/walkthrough/[id]', params: { id: existing.id } }));
    expect(await listWalkthroughs()).toHaveLength(1);
  });

  it('un sitio con walkthrough cerrado en el servidor abre su Resumen cerrado (D-212)', async () => {
    mockFetchServer.mockResolvedValue({
      ok: true,
      data: { id: 'w9', status: 'closed', draft: { areas: [{ id: 'a', type: 'office', name: 'Oficina 01', photos: [] }] }, currentVersion: 2 },
    });
    mockParams = { lead: 'l1', site: 's1' };
    await render(<StartWalkthroughScreen />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({ pathname: '/walkthrough/[id]', params: { id: 'w9' } }));
    expect(await loadWalkthrough('w9')).toMatchObject({ status: 'closed', version: 2, step: 5, rev: 0 });
  });

  it('sin walkthroughs_hacer no se entra', async () => {
    mockAccess = { isSuperAdmin: false, permissions: new Set(['leads_ver']) };
    mockParams = { lead: 'l1' };
    await render(<StartWalkthroughScreen />);
    expect(screen.getByText('REDIRECT /')).toBeTruthy();
  });
});

describe('Pasos del walkthrough (D-073)', () => {
  async function openDoc() {
    const doc = newDoc({ siteId: 's1', leadId: 'l1', appointmentId: 'c1', company: 'Gulf Coast Dental', siteLabel: '5th Ave S', contact: { address: '123 5th Ave S' } });
    await saveWalkthrough(doc);
    mockParams = { id: doc.id };
    await render(<WalkthroughScreen />);
    await screen.findByText('Paso 1 de 5 · Sitio y contacto');
    return doc;
  }

  it('paso 1 con los datos del sitio; sin red el aviso dice "1 pendiente" (D-091)', async () => {
    await openDoc();
    expect(screen.getByDisplayValue('123 5th Ave S')).toBeTruthy();
    expect(screen.getByText('1 pendiente')).toBeTruthy();
  });

  it('lo escrito se guarda en el teléfono al momento', async () => {
    const doc = await openDoc();
    await fireEvent.changeText(screen.getByLabelText('Datos generales del lugar'), 'Dos pisos, elevador');
    await waitFor(async () => expect((await loadWalkthrough(doc.id))!.data.contact.general).toBe('Dos pisos, elevador'));
  });

  it('Siguiente y Atrás recorren los pasos; Frecuencia Diaria marca los siete días (D-105)', async () => {
    const doc = await openDoc();
    await fireEvent.press(screen.getByText('Siguiente'));
    expect(await screen.findByText('Paso 2 de 5 · Áreas')).toBeTruthy();
    expect(screen.getByText('Todavía no hay áreas.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Siguiente'));
    expect(await screen.findByText('Paso 3 de 5 · Frecuencia')).toBeTruthy();
    expect(screen.getByText('Marca los días del servicio.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Lun'));
    await fireEvent.press(screen.getByLabelText('Vie'));
    expect(screen.getByText('2 veces por semana')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Tipo'));
    await fireEvent.press(screen.getByText('Diaria'));
    expect(screen.getByText('7 veces por semana')).toBeTruthy();
    await waitFor(async () => expect((await loadWalkthrough(doc.id))!.data.frequency.kind).toBe('daily'));
    await fireEvent.press(screen.getByLabelText('Tipo'));
    await fireEvent.press(screen.getByText('Otra'));
    expect(screen.getByLabelText('Describe la frecuencia')).toBeTruthy();
    await fireEvent.press(screen.getByText('Atrás'));
    expect(await screen.findByText('Paso 2 de 5 · Áreas')).toBeTruthy();
  });

  it('Áreas lista cada área con su tamaño y condición y Agregar área abre el formulario', async () => {
    const doc = newDoc({ siteId: 's1', leadId: 'l1', appointmentId: null, company: 'G', siteLabel: 'S', contact: {} });
    const area = { ...newArea([], () => 'Baño'), size: '120', condition: 'fair' as const };
    await saveWalkthrough({ ...doc, step: 2, data: { ...doc.data, areas: [area] } });
    mockParams = { id: doc.id };
    await render(<WalkthroughScreen />);
    expect(await screen.findByText('Baño 01')).toBeTruthy();
    expect(screen.getByText('120 ft² · Regular')).toBeTruthy();
    await fireEvent.press(screen.getByText('Agregar área'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/walkthrough/[id]/area', params: { id: doc.id } });
  });

  it('Notas internas dicen que no salen al cliente; Siguiente lleva al Resumen', async () => {
    const doc = newDoc({ siteId: 's1', leadId: 'l1', appointmentId: null, company: 'G', siteLabel: 'S', contact: {} });
    await saveWalkthrough({ ...doc, step: 4 });
    mockParams = { id: doc.id };
    await render(<WalkthroughScreen />);
    expect(await screen.findByText('No salen al cliente.')).toBeTruthy();
    expect(screen.getByLabelText('Personal necesario')).toBeTruthy();
    await fireEvent.press(screen.getByText('Siguiente'));
    expect(await screen.findByText('Paso 5 de 5 · Resumen')).toBeTruthy();
    expect(screen.getByText('Cerrar walkthrough')).toBeTruthy();
  });
});

describe('Resumen (D-212)', () => {
  async function openSummary(extra: Record<string, unknown> = {}) {
    const base = newDoc({ siteId: 's1', leadId: 'l1', appointmentId: 'c1', company: 'Gulf Coast Dental', siteLabel: '5th Ave S', contact: { address: '123 5th Ave S', contactName: 'Ana Rivera' } });
    const area = { ...newArea([], () => 'Baño'), size: '120', condition: 'fair' as const };
    const doc = {
      ...base,
      step: 5,
      data: { ...base.data, areas: [area], frequency: { kind: 'weekly' as const, days: [0, 2, 4], other: '' }, internal: { staff: '2 personas', time: '3 h', supplies: '' } },
      ...extra,
    };
    await saveWalkthrough(doc);
    mockParams = { id: doc.id };
    await render(<WalkthroughScreen />);
    await screen.findByText('Paso 5 de 5 · Resumen');
    return doc;
  }

  it('lista las secciones con sus datos y un lápiz que vuelve a cada paso', async () => {
    const doc = await openSummary();
    expect(screen.getByText('123 5th Ave S')).toBeTruthy();
    expect(screen.getByText('Baño 01')).toBeTruthy();
    expect(screen.getByText('120 ft² · Regular')).toBeTruthy();
    expect(screen.getByText('Semanal: Lun, Mié, Vie · 3 veces por semana')).toBeTruthy();
    expect(screen.getByText('2 personas')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Editar Frecuencia'));
    await waitFor(async () => expect((await loadWalkthrough(doc.id))!.step).toBe(3));
  });

  it('Cerrar walkthrough sin red queda en la cola y lo dice', async () => {
    const doc = await openSummary();
    await fireEvent.press(screen.getByText('Cerrar walkthrough'));
    expect(await screen.findByText('Se cerrará cuando haya conexión.')).toBeTruthy();
    expect((await loadWalkthrough(doc.id))!.closeRequested).toBe(true);
    expect(screen.queryByLabelText('Editar Frecuencia')).toBeNull();
  });

  it('cerrado: solo lectura, Ver PDF abre el visor y Editar abre una corrección', async () => {
    const doc = await openSummary({ status: 'closed', version: 1, syncedRev: 99, everSynced: true });
    expect(screen.getByText('Versión 1 cerrada.')).toBeTruthy();
    expect(screen.getByText('Sincronizado')).toBeTruthy();
    expect(screen.queryByText('Cerrar walkthrough')).toBeNull();
    expect(screen.queryByLabelText('Editar Áreas')).toBeNull();
    await fireEvent.press(screen.getByText('Ver PDF'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/viewer',
      params: { source: 'walkthrough', documentId: doc.id, version: '1', language: 'es', title: 'Walkthrough · Gulf Coast Dental' },
    });
    await fireEvent.press(screen.getByText('Editar'));
    expect(await screen.findByText('Corrigiendo la versión 1: al cerrar se guarda la versión 2.')).toBeTruthy();
    expect(screen.getByText('Cerrar walkthrough')).toBeTruthy();
  });

  it('papelera del área con confirmación (D-212)', async () => {
    const base = newDoc({ siteId: 's1', leadId: 'l1', appointmentId: null, company: 'G', siteLabel: 'S', contact: {} });
    const area = newArea([], () => 'Baño');
    await saveWalkthrough({ ...base, step: 2, data: { ...base.data, areas: [area] } });
    mockParams = { id: base.id };
    await render(<WalkthroughScreen />);
    await fireEvent.press(await screen.findByLabelText('Eliminar Baño 01'));
    expect(screen.getByText('¿Eliminar Baño 01?')).toBeTruthy();
    await fireEvent.press(screen.getByText('Eliminar'));
    await waitFor(async () => expect((await loadWalkthrough(base.id))!.data.areas).toHaveLength(0));
  });
});

describe('Área (D-037, D-074, D-106)', () => {
  it('nombre por defecto "Baño 01"; cambia con el tipo; Guardar y otra guarda y abre "Baño 02"', async () => {
    const doc = newDoc({ siteId: 's1', leadId: 'l1', appointmentId: null, company: 'G', siteLabel: 'S', contact: {} });
    await saveWalkthrough(doc);
    mockParams = { id: doc.id };
    await render(<WalkthroughAreaScreen />);
    expect(await screen.findByDisplayValue('Baño 01')).toBeTruthy();
    expect(screen.getByText('Nueva área')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Tipo'));
    await fireEvent.press(screen.getByText('Cocina'));
    expect(screen.getByDisplayValue('Cocina 01')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Tamaño (ft²)'), '340');
    await fireEvent.press(screen.getByText('Buena'));
    await fireEvent.press(screen.getByText('Guardar y otra'));
    expect(await screen.findByDisplayValue('Cocina 02')).toBeTruthy();
    const saved = (await loadWalkthrough(doc.id))!.data.areas;
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ type: 'kitchen', name: 'Cocina 01', size: '340', condition: 'good' });
  });

  it('un área nueva sin tocar no se guarda', async () => {
    const doc = newDoc({ siteId: 's1', leadId: 'l1', appointmentId: null, company: 'G', siteLabel: 'S', contact: {} });
    await saveWalkthrough(doc);
    mockParams = { id: doc.id };
    await render(<WalkthroughAreaScreen />);
    await screen.findByDisplayValue('Baño 01');
    expect((await loadWalkthrough(doc.id))!.data.areas).toHaveLength(0);
  });
});

describe('Inicio: Walkthroughs en curso (D-212)', () => {
  it('sin red muestra la fila armada con lo guardado en el teléfono y abre el walkthrough', async () => {
    const doc = newDoc({ siteId: 's1', leadId: 'l1', appointmentId: null, company: 'Gulf Coast Dental', siteLabel: '5th Ave S', contact: {} });
    await saveWalkthrough(doc);
    await render(<HomeScreen />);
    expect(await screen.findByText('Walkthroughs en curso')).toBeTruthy();
    expect(screen.getByText('Gulf Coast Dental · 5th Ave S')).toBeTruthy();
    await fireEvent.press(screen.getByText('Walkthroughs en curso'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/walkthrough/[id]', params: { id: doc.id } });
  });

  it('con varios abre la lista; los cerrados no cuentan; sin walkthroughs_hacer no aparece', async () => {
    const mk = (site: string) => newDoc({ siteId: site, leadId: 'l1', appointmentId: null, company: 'G', siteLabel: site, contact: {} });
    await saveWalkthrough(mk('a'));
    await saveWalkthrough(mk('b'));
    await saveWalkthrough({ ...mk('c'), status: 'closed', version: 1 });
    await render(<HomeScreen />);
    expect(await screen.findByText('2 en curso')).toBeTruthy();
    await fireEvent.press(screen.getByText('Walkthroughs en curso'));
    expect(mockPush).toHaveBeenCalledWith('/walkthrough');
  });

  it('sin walkthroughs_hacer no aparece', async () => {
    mockAccess = { isSuperAdmin: false, permissions: new Set(['leads_ver']) };
    await saveWalkthrough(newDoc({ siteId: 's', leadId: 'l', appointmentId: null, company: 'G', siteLabel: 'S', contact: {} }));
    await render(<HomeScreen />);
    expect(await screen.findByText('Todo al día')).toBeTruthy();
    expect(screen.queryByText('Walkthroughs en curso')).toBeNull();
  });
});
