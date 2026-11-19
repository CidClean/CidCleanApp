import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

let mockAccess: { isSuperAdmin: boolean; permissions: Set<string> } = { isSuperAdmin: true, permissions: new Set() };
const mockPush = jest.fn();
const mockBack = jest.fn();
let mockParams: Record<string, string> = { id: 'j1' };
// Hito 6: el Inicio y el Horario del jobsite leen el schedule; en estas pruebas no hay visitas.
// Hito 7: el Inicio, el Menú y el jobsite leen cifras de Accounting.
jest.mock('@/lib/contractApi', () => ({ fetchContractInfo: async () => ({ ok: true, data: null }), fetchCleaningType: async () => null, saveCleaningType: async () => true, fetchUnsignedJobsites: async () => new Set(), fetchContractPreviewUrl: async () => ({ ok: false, reason: 'server' }), contractStep: () => 1, fieldsToShow: () => [] })); // D-289
jest.mock('@/lib/accountingApi', () => ({
  fetchDashboard: jest.fn(async () => ({ ok: false, reason: 'network' })),
  fetchRecurring: jest.fn(async () => ({ ok: true, data: [] })),
}));
jest.mock('@/lib/quotesApi', () => ({
  fetchJobsiteExtras: jest.fn(async () => ({ ok: true, data: [] })),
  createExtraQuote: jest.fn(async () => ({ ok: true, data: 'q1' })),
}));
jest.mock('@/lib/scheduleApi', () => {
  const empty = { ok: true, data: null };
  return {
    fetchMySchedule: jest.fn(async () => ({ ok: true, data: [] })),
    fetchWorkPending: jest.fn(async () => ({ ok: true, data: { toApprove: 0, urgent: 0, gpsOut: 0, forgotClockIn: 0, openShifts: 0 } })),
    fetchJobsiteSchedule: jest.fn(async () => ({ ok: true, data: { startTime: null, minutes: null, visits: [] } })),
    setJobsiteLocation: jest.fn(async () => empty),
    setJobsiteVisitTime: jest.fn(async () => empty),
    clockIn: jest.fn(),
    clockOut: jest.fn(),
    checkDistance: jest.fn(),
  };
});
// D-340: el panel de horario se conserva sin cambios (sus pruebas están en workScreens); aquí solo se ve que sigue en el Resumen.
jest.mock('@/components/work/ScheduleWorkPanel', () => ({
  ...jest.requireActual('@/components/work/ScheduleWorkPanel'),
  ScheduleWorkPanel: () => {
    const { Text } = require('react-native');
    return <Text>PANEL DE HORARIO</Text>;
  },
}));
jest.mock('@/lib/workQueue', () => ({ syncWorkQueue: jest.fn(async () => 'synced'), loadShift: jest.fn(async () => null), saveShift: jest.fn(), enqueue: jest.fn() }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), push: mockPush, back: mockBack, canGoBack: () => true }),
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
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn(), from: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/lib/session', () => ({
  usePermissions: () => ({
    access: mockAccess,
    isSuperAdmin: mockAccess.isSuperAdmin,
    can: (k: string) => mockAccess.isSuperAdmin || mockAccess.permissions.has(k),
  }),
  useSession: () => ({ locale: 'es', profile: { id: 'yo' } }),
}));
jest.mock('@/lib/navigation', () => ({ useGoBack: () => mockBack }));
jest.mock('@/i18n/useStrings', () => ({ useStrings: () => require('@/i18n').getStrings('es') }));
jest.mock('@/i18n/useSalesStrings', () => ({ useSalesStrings: () => require('@/i18n/sales').salesEs }));

const jobsite = {
  id: 'j1', clientId: 'c1', clientName: 'Gulf Coast Dental', clientLegacy: true, name: '5th Ave S', address: '123 5th Ave S, Naples, FL 34102',
  plusCode: '66G8+4P Naples, Florida', contactName: 'Ana', contactPhone: '(239) 555-0142', contactEmail: null, emergencyName: 'Luis',
  emergencyPhone: '(239) 555-0100', emergencyRelation: 'Gerente', emergencyEmail: null, frequency: { kind: 'weekly', days: [0, 2, 4] },
  estHoursPerVisit: 3, visitsPerMonth: null, startDate: '2026-11-01', status: 'active', walkthroughVersion: null,
};
const mockSetStatus = jest.fn();
const mockSetPay = jest.fn();
const mockFetchPay = jest.fn();
jest.mock('@/lib/clientsApi', () => ({
  fetchJobsite: async () => ({ ok: true, data: jobsite }),
  fetchRate: async () => ({ ok: true, data: 1850 }),
  fetchMargin: async () => ({ ok: true, data: { atRisk: true, cost: 1910, rate: 1850, incomplete: false } }),
  setJobsiteStatus: (...a: unknown[]) => mockSetStatus(...a),
  setJobsiteRate: jest.fn(),
  fetchDocuments: async () => ({ ok: true, data: [{ id: 'd1', kind: 'contract', title: null, version: 2, uploadedAt: '2026-10-20T15:00:00Z' }] }),
  fetchJobsiteStaff: async () => ({ ok: true, data: [{ assignmentId: 'a1', profileId: 'p1', fullName: 'María López', workerType: 'w2', startDate: '2026-10-01', endDate: null }] }),
  fetchPay: (...a: unknown[]) => mockFetchPay(...a),
  fetchLegacyJobsiteIds: async () => ({ ok: true, data: new Set<string>() }),
  setAssignmentPay: (...a: unknown[]) => mockSetPay(...a),
  endAssignment: jest.fn(),
  choosePdf: jest.fn(),
  uploadJobsiteDocument: jest.fn(),
  // Orden 150: Documents y History del jobsite.
  fetchJobsiteLibrary: async () => ({
    ok: true,
    data: [{ kind: 'contract', id: 'd1', title: 'Contract v2', owner: 'Gulf Coast Dental · 5th Ave S', date: '2026-10-20T15:00:00Z', source: 'jobsite', openId: 'd1', path: null, version: null, superAdminOnly: false }],
  }),
  fetchJobsiteHistory: async () => ({
    ok: true,
    data: [
      { id: 2, at: '2026-11-18T15:00:00Z', action: 'correo_plantilla', actor: 'Humberto', info: { plantilla: 'Seguimiento' } },
      { id: 1, at: '2026-11-17T15:00:00Z', action: 'jobsite_estado_cambiado', actor: 'Humberto', info: { antes: 'active', despues: 'paused' } },
    ],
  }),
}));

import JobsiteScreen from '@/app/(app)/jobsites/[id]/index';
import PayScreen from '@/app/(app)/pay/[assignment]';

beforeEach(() => {
  mockAccess = { isSuperAdmin: true, permissions: new Set() };
  mockParams = { id: 'j1' };
  mockPush.mockReset();
  mockBack.mockReset();
  mockFetchPay.mockResolvedValue({
    ok: true,
    data: new Map([['a1', { kind: 'hourly', hourlyRate: 18, guaranteedHours: 3, fixedAmount: null, fixedPeriod: null, effectiveFrom: '2026-10-01', nextChange: null }]]),
  });
});

describe('Jobsite (orden 150, D-339, D-340)', () => {
  it('encabezado con cliente, estado y botones rápidos; tarjeta del mes y filas del Resumen', async () => {
    await render(<JobsiteScreen />);
    expect(await screen.findByText('5th Ave S')).toBeTruthy();
    expect(screen.getByText('Cliente: Gulf Coast Dental')).toBeTruthy();
    expect(screen.getAllByText('Margen en riesgo').length).toBeGreaterThan(0);
    for (const l of ['Llamar', 'Correo', 'Maps', 'Schedule']) expect(screen.getAllByLabelText(l).length).toBeGreaterThan(0);
    // Tarjeta del mes: tarifa, personal y margen (con ver pagos), barra del personal sobre la tarifa.
    expect(await screen.findByText('$1,850')).toBeTruthy();
    expect(screen.getByText('$1,910')).toBeTruthy();
    expect(screen.getByText('-3%')).toBeTruthy();
    expect(screen.getByText('El personal es el 103% de la tarifa')).toBeTruthy();
    // Dirección con Plus Code plegado; dos contactos porque son personas distintas; frecuencia legible.
    expect(screen.getByText('123 5th Ave S, Naples, FL 34102')).toBeTruthy();
    expect(screen.queryByText(/66G8\+4P/)).toBeNull();
    await fireEvent.press(screen.getByText('Plus Code'));
    expect(screen.getByText('Plus Code: 66G8+4P Naples, Florida')).toBeTruthy();
    expect(screen.getByText('Ana · (239) 555-0142')).toBeTruthy();
    expect(screen.getByText('Luis · (239) 555-0100 · Gerente')).toBeTruthy();
    expect(screen.getByText('Lun, Mié y Vie')).toBeTruthy();
    expect(screen.getByText(/^3 h por visita · desde /)).toBeTruthy();
    // Sin walkthrough no sale la fila; ya no hay selector de estado ni tipo de limpieza en el Resumen.
    expect(screen.queryByText('Walkthrough')).toBeNull();
    expect(screen.queryByLabelText('Estado')).toBeNull();
    // El horario y el personal siguen en el Resumen (D-340).
    expect(screen.getByText('Horario y personal')).toBeTruthy();
    expect(await screen.findByText('María López')).toBeTruthy();
    expect(screen.getByText('PANEL DE HORARIO')).toBeTruthy();
  });

  it('Correo abre las plantillas del cliente', async () => {
    await render(<JobsiteScreen />);
    await screen.findByText('5th Ave S');
    await fireEvent.press(screen.getByLabelText('Correo'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/send-email', params: { kind: 'client', id: 'c1' } });
  });

  it('un solo contacto si principal y emergencia son la misma persona', async () => {
    Object.assign(jobsite, { emergencyName: 'ana', emergencyPhone: '2395550142', emergencyRelation: null });
    try {
      await render(<JobsiteScreen />);
      expect(await screen.findByText('Ana · (239) 555-0142')).toBeTruthy();
      expect(screen.getByText('Contacto principal y de emergencia')).toBeTruthy();
      expect(screen.queryByText('Contacto de emergencia')).toBeNull();
    } finally {
      Object.assign(jobsite, { emergencyName: 'Luis', emergencyPhone: '(239) 555-0100', emergencyRelation: 'Gerente' });
    }
  });

  it('dirección vieja sin separar: aviso ámbar "Completa la dirección." con Editar (D-301)', async () => {
    Object.assign(jobsite, { addressNeedsReview: true });
    try {
      await render(<JobsiteScreen />);
      expect(await screen.findByText(/Completa la dirección\./)).toBeTruthy();
      const edits = screen.getAllByText('Editar');
      await fireEvent.press(edits[edits.length - 1]);
      expect(mockPush).toHaveBeenCalledWith({ pathname: '/jobsites/[id]/edit', params: { id: 'j1' } });
    } finally {
      Object.assign(jobsite, { addressNeedsReview: false });
    }
  });

  it('pausar desde el menú ⋯ pide confirmación', async () => {
    mockSetStatus.mockResolvedValue({ ok: true, data: null });
    await render(<JobsiteScreen />);
    await screen.findByText('5th Ave S');
    await fireEvent.press(screen.getByLabelText('Más acciones'));
    expect(screen.getByText('Terminar')).toBeTruthy();
    await fireEvent.press(screen.getByText('Pausar'));
    expect(screen.getByText('¿Pausar 5th Ave S?')).toBeTruthy();
    const pause = screen.getAllByText('Pausar');
    await fireEvent.press(pause[pause.length - 1]);
    await waitFor(() => expect(mockSetStatus).toHaveBeenCalledWith('j1', 'paused'));
  });

  it('Documentos abre y descarga; Historial muestra cambios y correos; Personal abre el pago', async () => {
    await render(<JobsiteScreen />);
    await screen.findByText('5th Ave S');
    await fireEvent.press(screen.getByText('Documentos'));
    expect(await screen.findByText('Contrato firmado · v2')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Abrir Contrato firmado · v2'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/viewer', params: { source: 'jobsite', title: 'Contrato firmado · v2', download: '1', documentId: 'd1' } });
    expect(screen.getByLabelText('Descargar Contrato firmado · v2')).toBeTruthy();
    await fireEvent.press(screen.getByText('Historial'));
    expect(await screen.findByText('Correo enviado: Seguimiento')).toBeTruthy();
    expect(screen.getByText('Estado: Pausado')).toBeTruthy();
    await fireEvent.press(screen.getByText('Resumen'));
    expect(await screen.findByText(/\$18\.00\/h · 3 h garantizadas/)).toBeTruthy();
    await fireEvent.press(screen.getByText('María López'));
    expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/pay/[assignment]' }));
  });

  it('sin ver tarifa no hay cifras', async () => {
    mockAccess = { isSuperAdmin: false, permissions: new Set(['clientes_ver']) };
    await render(<JobsiteScreen />);
    expect(await screen.findByText('5th Ave S')).toBeTruthy();
    expect(screen.queryByText('$1,850')).toBeNull();
    expect(screen.queryByLabelText('Más acciones')).toBeNull();
  });
});

describe('Pago (D-061, D-096)', () => {
  it('un W-2 por hora no guarda con menos de $15.00; con $16 guarda', async () => {
    mockParams = { assignment: 'a1', jobsite: '5th Ave S', jobsiteId: 'j1', workerType: 'w2' };
    mockSetPay.mockResolvedValue({ ok: true, data: null });
    await render(<PayScreen />);
    expect(await screen.findByDisplayValue('18')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Tarifa por hora'), '14');
    await fireEvent.press(screen.getByText('Guardar'));
    expect(screen.getByText('El mínimo para W-2 es $15.00 por hora.')).toBeTruthy();
    expect(mockSetPay).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Tarifa por hora'), '16');
    await fireEvent.press(screen.getByText('Guardar'));
    await waitFor(() => expect(mockSetPay).toHaveBeenCalled());
    expect(mockBack).toHaveBeenCalled();
  });

  it('tarifa fija: Cobra y la línea de explicación', async () => {
    mockParams = { assignment: 'a1', jobsite: '5th Ave S', jobsiteId: 'j1', workerType: 'w2' };
    await render(<PayScreen />);
    await screen.findByDisplayValue('18');
    await fireEvent.press(screen.getByText('Tarifa fija'));
    await fireEvent.changeText(screen.getByLabelText('Monto'), '120');
    expect(screen.getByText('Se pagan $120.00 por cada visita trabajada.')).toBeTruthy();
  });

  it('D-276: a un 1099 no se le ofrece por hora, solo tarifa fija (visita, semana o mes)', async () => {
    mockParams = { assignment: 'a1', jobsite: '5th Ave S', jobsiteId: 'j1', workerType: '1099' };
    mockSetPay.mockResolvedValue({ ok: true, data: null });
    await render(<PayScreen />);
    expect(await screen.findByLabelText('Monto')).toBeTruthy();
    expect(screen.queryByText('Por hora')).toBeNull();
    expect(screen.queryByLabelText('Tarifa por hora')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Monto'), '80');
    await fireEvent.press(screen.getByText('Guardar'));
    await waitFor(() => expect(mockSetPay).toHaveBeenCalledWith('a1', expect.objectContaining({ kind: 'fixed' })));
  });
});
