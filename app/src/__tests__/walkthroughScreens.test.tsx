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
jest.mock('@/lib/leadsApi', () => ({ fetchLead: (...a: unknown[]) => mockFetchLead(...a) }));
jest.mock('@/lib/documents', () => ({ takePhoto: jest.fn() }));

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

  it('un sitio con walkthrough cerrado en el servidor no abre otro', async () => {
    mockFetchServer.mockResolvedValue({ ok: true, data: { id: 'w9', status: 'closed', draft: {}, currentVersion: 1 } });
    mockParams = { lead: 'l1', site: 's1' };
    await render(<StartWalkthroughScreen />);
    expect(await screen.findByText('Este sitio ya tiene un walkthrough cerrado.')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
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

  it('Notas internas dicen que no salen al cliente; el Resumen está pendiente', async () => {
    const doc = newDoc({ siteId: 's1', leadId: 'l1', appointmentId: null, company: 'G', siteLabel: 'S', contact: {} });
    await saveWalkthrough({ ...doc, step: 4 });
    mockParams = { id: doc.id };
    await render(<WalkthroughScreen />);
    expect(await screen.findByText('No salen al cliente.')).toBeTruthy();
    expect(screen.getByLabelText('Personal necesario')).toBeTruthy();
    await fireEvent.press(screen.getByText('Siguiente'));
    expect(await screen.findByText('Paso 5 de 5 · Resumen')).toBeTruthy();
    expect(screen.getByText('Pendiente')).toBeTruthy();
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
