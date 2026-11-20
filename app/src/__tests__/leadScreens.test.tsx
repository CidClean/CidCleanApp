import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

// --- Simulaciones --------------------------------------------------------------------------------------------
const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockNavigate = jest.fn();
const mockBack = jest.fn();
let mockAccess: { isSuperAdmin: boolean; permissions: Set<string> } = { isSuperAdmin: true, permissions: new Set() };
let mockParams: Record<string, string> = { id: 'l1' };

// Hito 6: el Inicio y el Horario del jobsite leen el schedule; en estas pruebas no hay visitas.
// Hito 7: el Inicio, el Menú y el jobsite leen cifras de Accounting.
// D-292: las secciones de la fase D (ICA, ofertas y advertencias) sin red en las pruebas de pantallas.
jest.mock('@/lib/icaApi', () => ({
  fetchIcaInfo: async () => ({ ok: true, data: null }),
  fetchOffersFor: async () => ({ ok: true, data: [] }),
  fetchMyOffers: async () => ({ ok: true, data: [] }),
  fetchWarnings: async () => ({ ok: false, reason: 'forbidden' }),
  fetchOfferJobsites: async () => [],
  fetchOfferVisits: async () => [],
  fetchIcaPreviewUrl: jest.fn(),
  fetchIcaSignedUrl: jest.fn(),
  fetchWarningUrl: jest.fn(),
  hour12: (x: string | null) => x ?? '',
  windowEnd: () => null,
  ICA_FIELDS: [],
}));
jest.mock('@/lib/contractApi', () => ({ fetchContractInfo: async () => ({ ok: true, data: null }), fetchCleaningType: async () => null, saveCleaningType: async () => true, fetchUnsignedJobsites: async () => new Set(), fetchContractPreviewUrl: async () => ({ ok: false, reason: 'server' }), contractStep: () => 1, fieldsToShow: () => [] })); // D-289
jest.mock('@/lib/accountingApi', () => ({
  fetchDashboard: jest.fn(async () => ({ ok: false, reason: 'network' })),
  fetchRecurring: jest.fn(async () => ({ ok: true, data: [] })),
}));
// D-253: el Inicio del admin pide sus tarjetas a admin_home.
jest.mock('@/lib/statisticsApi', () => ({ fetchAdminHome: jest.fn(async () => ({ ok: false, reason: 'network' })) }));
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
jest.mock('@/lib/workQueue', () => ({ syncWorkQueue: jest.fn(async () => 'synced'), loadShift: jest.fn(async () => null), saveShift: jest.fn(), enqueue: jest.fn() }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush, navigate: mockNavigate, back: mockBack, canGoBack: () => true }),
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
jest.mock('@/i18n/useSalesStrings', () => ({ useSalesStrings: () => require('@/i18n/sales').salesEs }));
jest.mock('@/lib/week', () => ({
  ...jest.requireActual('@/lib/week'),
  fetchWeekVisits: () => Promise.resolve([]),
}));

const mockFetchLeads = jest.fn();
const mockResponded = jest.fn();
const mockDecide = jest.fn();
const mockFollowup = jest.fn();
const mockFetchLead = jest.fn();
const mockSetStatus = jest.fn();
const mockMarkLost = jest.fn();
const mockReasons = jest.fn();
const mockCreate = jest.fn();
const mockSchedule = jest.fn();
const mockDays = jest.fn();
const mockPending = jest.fn();
const mockAddSite = jest.fn();
const mockDeleteLead = jest.fn();
const mockDeleteSite = jest.fn();
const mockUpdateSite = jest.fn();
const mockCreateReason = jest.fn();
const mockUpdateReason = jest.fn();
const mockRemoveReason = jest.fn();
jest.mock('@/lib/quotesApi', () => ({
  fetchLeadQuotes: jest.fn().mockResolvedValue({ ok: true, data: [] }),
  fetchQuotePending: jest.fn().mockResolvedValue([]),
  fetchHomeActivity: jest.fn().mockResolvedValue(null),
}));
jest.mock('@/lib/employeesApi', () => ({ fetchEmployees: async () => ({ ok: true, data: [] }), failureFromCode: () => 'unknown' }));
jest.mock('@/lib/notificationsApi', () => ({ fetchUnreadCount: async () => 0 }));
jest.mock('@/lib/emailTemplatesApi', () => ({ fetchEmailLog: jest.fn().mockResolvedValue({ ok: true, data: [] }) }));
jest.mock('@/lib/leadsApi', () => ({
  fetchLeads: (...a: unknown[]) => mockFetchLeads(...a),
  fetchLead: (...a: unknown[]) => mockFetchLead(...a),
  setLeadStatus: (...a: unknown[]) => mockSetStatus(...a),
  markLeadLost: (...a: unknown[]) => mockMarkLost(...a),
  fetchLostReasons: (...a: unknown[]) => mockReasons(...a),
  createLead: (...a: unknown[]) => mockCreate(...a),
  updateLead: jest.fn(),
  addSite: (...a: unknown[]) => mockAddSite(...a),
  scheduleWalkthrough: (...a: unknown[]) => mockSchedule(...a),
  fetchAppointmentDays: (...a: unknown[]) => mockDays(...a),
  fetchSalesPending: (...a: unknown[]) => mockPending(...a),
  deleteLead: (...a: unknown[]) => mockDeleteLead(...a),
  deleteSite: (...a: unknown[]) => mockDeleteSite(...a),
  updateSite: (...a: unknown[]) => mockUpdateSite(...a),
  createLostReason: (...a: unknown[]) => mockCreateReason(...a),
  updateLostReason: (...a: unknown[]) => mockUpdateReason(...a),
  removeLostReason: (...a: unknown[]) => mockRemoveReason(...a),
  fetchSiteRequests: async () => ({ ok: true, data: [] }), // orden 101
  markLeadResponded: (...a: unknown[]) => mockResponded(...a), // orden 131
  decideNoResponse: (...a: unknown[]) => mockDecide(...a),
  fetchLeadsFollowup: (...a: unknown[]) => mockFollowup(...a),
}));

import HomeScreen from '@/app/(app)/(tabs)/index';
import PipelineScreen from '@/app/(app)/(tabs)/pipeline';
import LeadDetailScreen from '@/app/(app)/leads/[id]/index';
import MarkLostScreen from '@/app/(app)/leads/[id]/lost';
import NewSiteScreen from '@/app/(app)/leads/[id]/new-site';
import ScheduleWalkthroughScreen from '@/app/(app)/leads/[id]/schedule';
import NewLeadScreen from '@/app/(app)/leads/new';
import LostReasonFormScreen from '@/app/(app)/settings/lost-reasons/edit';
import LostReasonsScreen from '@/app/(app)/settings/lost-reasons/index';
import type { Lead } from '@/lib/leadRules';

const lead: Lead = {
  id: 'l1',
  company: 'Gulf Coast Dental',
  contactName: 'Ana Rivera',
  phone: '(239) 555-0142',
  email: 'ana@gulfcoastdental.com',
  source: 'web',
  notes: null,
  status: 'waiting',
  lostReason: null,
  lostNote: null,
  createdAt: new Date(2026, 9, 20),
  followUpOn: null,
  language: 'en',
  sites: [
    { id: 's1', name: '5th Ave S', address: '123 5th Ave S, Naples', scheduled: null, walkthroughDone: false },
    { id: 's2', name: null, address: '900 Marco Island Blvd', scheduled: null, walkthroughDone: false },
  ],
};

const reasons = [
  { id: 'r1', labelEs: 'Precio', labelEn: 'Price', sort: 1, active: true },
  { id: 'r2', labelEs: 'Otro', labelEn: 'Other', sort: 8, active: true },
  { id: 'r3', labelEs: 'Viejo', labelEn: 'Old', sort: 9, active: false },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockAccess = { isSuperAdmin: true, permissions: new Set() };
  mockParams = { id: 'l1' };
  mockFetchLeads.mockResolvedValue({ ok: true, data: [] });
  mockFollowup.mockResolvedValue({ ok: false, reason: 'network' });
  mockFetchLead.mockResolvedValue({ ok: true, data: lead });
  mockReasons.mockResolvedValue({ ok: true, data: reasons });
  mockDays.mockResolvedValue({ ok: true, data: new Set() });
  mockPending.mockResolvedValue({ ok: true, data: { followUpsDue: 0, walkthroughsUpcoming: 0 } });
});

describe('Pipeline', () => {
  const day = (n: number) => new Date(Date.now() - n * 86_400_000);
  const rows = [
    { id: 'l1', company: 'Gulf Coast Dental', contactName: 'Ana', status: 'walkthrough_scheduled', createdAt: day(40), followUpOn: null, nextWalkthrough: null },
    { id: 'l2', company: 'Perez LLC', contactName: 'Pedro', status: 'follow_up', createdAt: day(30), followUpOn: null, nextWalkthrough: null, firstContactAt: day(8), followupsSent: 0, nextStepOn: '2026-01-02' },
    { id: 'l3', company: 'Gulf Offices', contactName: 'Lia', status: 'follow_up_2', createdAt: day(60), followUpOn: null, nextWalkthrough: null, followupSentAt: day(22), followupsSent: 1, nextStepOn: '2026-01-01' },
    { id: 'l4', company: 'Bay Offices', contactName: null, status: 'new', createdAt: day(1), followUpOn: null, nextWalkthrough: null },
    { id: 'l5', company: 'Sin Resp', contactName: null, status: 'no_response', createdAt: day(90), followUpOn: null, nextWalkthrough: null, nextStepOn: '2026-01-03' },
  ];

  it('pestañas con contador; Hoy por defecto, lo más atrasado primero, con el paso y la fecha', async () => {
    mockFetchLeads.mockResolvedValue({ ok: true, data: rows });
    await render(<PipelineScreen />);
    expect(await screen.findByText('Perez LLC')).toBeTruthy();
    expect(screen.getByLabelText('Hoy 3')).toBeTruthy();
    expect(screen.getByLabelText('Por contactar 1')).toBeTruthy();
    expect(screen.getByLabelText('En venta 1')).toBeTruthy();
    const names = screen.getAllByText(/^(Perez LLC|Gulf Offices|Sin Resp)$/).map((n) => String(n.props.children));
    expect(names).toEqual(['Gulf Offices', 'Perez LLC', 'Sin Resp']);
    expect(screen.getByText('Pedro · 1er contacto hace 8 días')).toBeTruthy();
    expect(screen.getByText('Lia · follow up hace 22 días')).toBeTruthy();
    expect(screen.getByText('2nd follow up')).toBeTruthy();
    expect(screen.getByText('Reintentar')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Por contactar 1'));
    expect(screen.getByText('Sin contacto todavía')).toBeTruthy();
    expect(screen.getByText('Nuevo')).toBeTruthy();
  });

  it('la pestaña de la ruta (Inicio → Ver) y tocar la fila abre el detalle', async () => {
    mockParams = { tab: 'sale' };
    mockFetchLeads.mockResolvedValue({ ok: true, data: rows });
    await render(<PipelineScreen />);
    expect(await screen.findByText('Gulf Coast Dental')).toBeTruthy();
    expect(screen.getByText('Walkthrough agendado')).toBeTruthy();
    expect(screen.queryByText('Escribir')).toBeNull();
    await fireEvent.press(screen.getByText('Gulf Coast Dental'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/leads/[id]', params: { id: 'l1' } });
  });

  it('Escribir abre la vista previa con la plantilla del paso', async () => {
    mockFetchLeads.mockResolvedValue({ ok: true, data: rows });
    await render(<PipelineScreen />);
    await screen.findByText('Perez LLC');
    await fireEvent.press(screen.getAllByText('Escribir')[1]);
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/send-email', params: { kind: 'lead', id: 'l2', step: 'follow_up' } });
  });

  it('Respondió pide confirmación en la pantalla y llama lead_mark_responded', async () => {
    mockFetchLeads.mockResolvedValue({ ok: true, data: rows });
    mockResponded.mockResolvedValue({ ok: true, data: 'interested' });
    await render(<PipelineScreen />);
    await screen.findByText('Perez LLC');
    await fireEvent.press(screen.getAllByText('Respondió')[1]);
    expect(screen.getByText('¿Perez LLC respondió?')).toBeTruthy();
    expect(mockResponded).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Sí, respondió'));
    await waitFor(() => expect(mockResponded).toHaveBeenCalledWith('l2'));
  });

  it('quien solo ve escribe pero no marca Respondió', async () => {
    mockAccess = { isSuperAdmin: false, permissions: new Set(['leads_ver']) };
    mockFetchLeads.mockResolvedValue({ ok: true, data: rows });
    await render(<PipelineScreen />);
    await screen.findByText('Perez LLC');
    expect(screen.getAllByText('Escribir').length).toBe(2);
    expect(screen.queryByText('Respondió')).toBeNull();
    expect(screen.queryByText('Reintentar')).toBeNull();
  });

  it('el + solo con leads_ver y leads_editar', async () => {
    mockAccess = { isSuperAdmin: false, permissions: new Set(['leads_ver']) };
    await render(<PipelineScreen />);
    await screen.findByText('Todavía no hay leads.');
    expect(screen.queryByLabelText('Nuevo lead')).toBeNull();
  });

  it('con otro permiso de Ventas pero sin leads_ver: aviso y no consulta', async () => {
    mockAccess = { isSuperAdmin: false, permissions: new Set(['quotes_ver']) };
    await render(<PipelineScreen />);
    expect(screen.getByText('No tienes permiso para ver leads.')).toBeTruthy();
    expect(mockFetchLeads).not.toHaveBeenCalled();
  });

  it('sin permisos de Ventas no se entra', async () => {
    mockAccess = { isSuperAdmin: false, permissions: new Set(['clientes_ver']) };
    await render(<PipelineScreen />);
    expect(screen.getByText('REDIRECT /')).toBeTruthy();
  });
});

describe('Nuevo lead', () => {
  it('pide la empresa y, al crear, abre el lead', async () => {
    mockCreate.mockResolvedValue({ ok: true, data: 'nuevo' });
    await render(<NewLeadScreen />);
    await fireEvent.press(screen.getByText('Crear lead'));
    expect(screen.getByText('Escribe el nombre de la empresa.')).toBeTruthy();
    expect(mockCreate).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Empresa'), 'Gulf Coast Dental');
    await fireEvent.press(screen.getByText('Crear lead'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({ pathname: '/leads/[id]', params: { id: 'nuevo' } }));
    expect(mockCreate.mock.calls[0][0]).toMatchObject({ company: 'Gulf Coast Dental', source: 'manual' });
  });

  it('sin leads_editar no se entra', async () => {
    mockAccess = { isSuperAdmin: false, permissions: new Set(['leads_ver']) };
    await render(<NewLeadScreen />);
    expect(screen.getByText('REDIRECT /')).toBeTruthy();
  });
});

describe('Detalle del lead (D-070, D-071)', () => {
  it('encabezado con empresa, fuente y ficha; filas de Datos', async () => {
    await render(<LeadDetailScreen />);
    expect(await screen.findByText('Gulf Coast Dental')).toBeTruthy();
    expect(screen.getByText('Lead · Fuente: web')).toBeTruthy();
    expect(screen.getAllByText('Esperando respuesta').length).toBeGreaterThan(0);
    expect(screen.getByText('Ana Rivera')).toBeTruthy();
    expect(screen.getByText('ana@gulfcoastdental.com')).toBeTruthy();
  });

  it('tarjeta principal (D-226, D-333): Llamar abre tel:, Correo abre las plantillas y no hay "Enviar correo"', async () => {
    const { Linking } = require('react-native');
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    mockFetchLead.mockResolvedValue({ ok: true, data: { ...lead, status: 'follow_up' } });
    await render(<LeadDetailScreen />);
    await screen.findByText('Gulf Coast Dental');
    await fireEvent.press(screen.getByText('Llamar'));
    expect(open).toHaveBeenCalledWith('tel:2395550142');
    await fireEvent.press(screen.getByText('Correo'));
    expect(open).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/send-email', params: { kind: 'lead', id: 'l1', step: 'follow_up' } });
    expect(screen.queryByText('Enviar correo')).toBeNull();
    open.mockRestore();
  });

  it('Seguimiento: línea de tiempo con el siguiente paso; Respondió confirma en la pantalla', async () => {
    mockResponded.mockResolvedValue({ ok: true, data: 'interested' });
    mockFetchLead.mockResolvedValue({
      ok: true,
      data: { ...lead, status: 'waiting', followupsSent: 1, firstContactAt: new Date(2026, 10, 10, 9), followupSentAt: new Date(2026, 10, 18, 9), nextStepOn: '2026-12-10' },
    });
    await render(<LeadDetailScreen />);
    expect((await screen.findAllByText('Seguimiento')).length).toBeGreaterThan(0);
    expect(screen.getByText('10 nov · Primer contacto (correo)')).toBeTruthy();
    expect(screen.getByText('18 nov · Follow up (correo)')).toBeTruthy();
    expect(screen.getByText('10 dic · Toca 2nd follow up')).toBeTruthy();
    await fireEvent.press(screen.getByText('Respondió'));
    await fireEvent.press(screen.getByText('Sí, respondió'));
    await waitFor(() => expect(mockResponded).toHaveBeenCalledWith('l1'));
  });

  it('Sin respuesta: Reintentar o Marcar perdido desde el detalle', async () => {
    mockDecide.mockResolvedValue({ ok: true, data: 'lost' });
    mockFetchLead.mockResolvedValue({ ok: true, data: { ...lead, status: 'no_response', nextStepOn: '2026-12-02' } });
    await render(<LeadDetailScreen />);
    await screen.findAllByText('Seguimiento');
    expect(screen.getByText('Reintentar')).toBeTruthy();
    await fireEvent.press(screen.getAllByText('Marcar perdido (Sin respuesta)')[0]);
    await fireEvent.press(screen.getAllByText('Marcar perdido (Sin respuesta)').slice(-1)[0]);
    await waitFor(() => expect(mockDecide).toHaveBeenCalledWith('l1', 'lost'));
  });

  it('elegir Perdido abre Marcar como perdido sin guardar', async () => {
    await render(<LeadDetailScreen />);
    await screen.findByText('Gulf Coast Dental');
    // D-333 (3): "Cambiar estado" queda en el menú del lead, solo para corregir.
    await fireEvent.press(screen.getByText('Cambiar estado'));
    await fireEvent.press(screen.getByText('Perdido'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/leads/[id]/lost', params: { id: 'l1' } });
    expect(mockSetStatus).not.toHaveBeenCalled();
  });

  it('elegir otro estado lo guarda', async () => {
    mockSetStatus.mockResolvedValue({ ok: true, data: null });
    await render(<LeadDetailScreen />);
    await screen.findByText('Gulf Coast Dental');
    await fireEvent.press(screen.getByText('Cambiar estado'));
    await fireEvent.press(screen.getByText('Negociación'));
    await waitFor(() => expect(mockSetStatus).toHaveBeenCalledWith('l1', 'negotiation'));
  });

  it('quien solo ve no tiene Estado, Editar ni botones de sitios', async () => {
    mockAccess = { isSuperAdmin: false, permissions: new Set(['leads_ver']) };
    await render(<LeadDetailScreen />);
    await screen.findByText('Gulf Coast Dental');
    expect(screen.queryByText('Cambiar estado')).toBeNull();
    expect(screen.queryByText('Respondió')).toBeNull();
    expect(screen.queryByText('Editar')).toBeNull();
    await fireEvent.press(screen.getByText('Sitios'));
    expect(screen.getByText('5th Ave S')).toBeTruthy();
    expect(screen.queryByText('Agendar walkthrough')).toBeNull();
    expect(screen.queryByText('Agregar sitio')).toBeNull();
  });

  it('Mosaico (D-226): Sitios y Walkthrough abren su sección; el walkthrough con su cita y Agendar walkthrough', async () => {
    mockFetchLead.mockResolvedValue({
      ok: true,
      data: { ...lead, sites: [{ ...lead.sites[0], scheduled: { id: 'a', startsAt: new Date(2026, 9, 22, 10, 0), status: 'scheduled' } }] },
    });
    await render(<LeadDetailScreen />);
    await screen.findByText('Gulf Coast Dental');
    expect(screen.getByText('Quote')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Sitios'));
    expect(screen.queryByText('Agendar walkthrough')).toBeNull();
    expect(screen.getByText('Agregar sitio')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Volver'));
    await fireEvent.press(screen.getByLabelText('Walkthrough'));
    expect(screen.getByText('Walkthrough: Jue 22 oct · 10:00 AM')).toBeTruthy();
    await fireEvent.press(screen.getByText('Agendar walkthrough'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/leads/[id]/schedule', params: { id: 'l1' } });
  });

  it('Perdido muestra el motivo y la nota', async () => {
    mockFetchLead.mockResolvedValue({ ok: true, data: { ...lead, status: 'lost', lostReason: reasons[0], lostNote: 'Caro' } });
    await render(<LeadDetailScreen />);
    expect(await screen.findByText('Precio')).toBeTruthy();
    expect(screen.getByText('Caro')).toBeTruthy();
  });

  it('sin leads_ver no se entra', async () => {
    mockAccess = { isSuperAdmin: false, permissions: new Set(['walkthroughs_hacer']) };
    await render(<LeadDetailScreen />);
    expect(screen.getByText('REDIRECT /')).toBeTruthy();
  });
});

describe('Marcar como perdido (D-079, D-107)', () => {
  it('parte con el primer motivo y guarda motivo y nota', async () => {
    mockMarkLost.mockResolvedValue({ ok: true, data: null });
    await render(<MarkLostScreen />);
    expect(await screen.findByText('Precio')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Nota (opcional)'), 'Prefirió a su proveedor');
    await fireEvent.press(screen.getAllByText('Marcar como perdido')[1]);
    await waitFor(() => expect(mockMarkLost).toHaveBeenCalledWith('l1', 'r1', 'Prefirió a su proveedor'));
    expect(mockBack).toHaveBeenCalled();
  });
});

describe('Nuevo sitio', () => {
  it('pide la dirección', async () => {
    mockAddSite.mockResolvedValue({ ok: true, data: 's3' });
    await render(<NewSiteScreen />);
    await fireEvent.press(screen.getByText('Agregar sitio'));
    expect(screen.getByText('Escribe la dirección.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Dirección'), '500 Main St');
    await fireEvent.press(screen.getByText('Agregar sitio'));
    // D-301: la dirección va completa (City, State y ZIP code); State parte en FL.
    expect(screen.getByText('Escribe la ciudad.')).toBeTruthy();
    expect(mockAddSite).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('City'), 'Naples');
    await fireEvent.changeText(screen.getByLabelText('ZIP code'), '3410');
    await fireEvent.press(screen.getByText('Agregar sitio'));
    expect(screen.getByText('Escribe un ZIP code de 5 dígitos, por ejemplo 34105.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('ZIP code'), '34102');
    await fireEvent.press(screen.getByText('Agregar sitio'));
    await waitFor(() =>
      expect(mockAddSite).toHaveBeenCalledWith('l1', '', { addressLine1: '500 Main St', addressLine2: '', city: 'Naples', state: 'FL', zip: '34102' }),
    );
  });

  it('un sitio con la dirección vieja sin separar muestra "Completa la dirección." con Editar (D-301)', async () => {
    mockFetchLead.mockResolvedValue({
      ok: true,
      data: { ...lead, sites: [{ ...lead.sites[0], addressNeedsReview: true }] },
    });
    await render(<LeadDetailScreen />);
    await screen.findByText('Gulf Coast Dental');
    await fireEvent.press(screen.getByText('Sitios'));
    expect(screen.getByText(/Completa la dirección\./)).toBeTruthy();
    const edits = screen.getAllByText('Editar');
    await fireEvent.press(edits[edits.length - 1]);
    expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ params: expect.objectContaining({ site: 's1' }) }));
  });
});

describe('Agendar walkthrough (D-072, D-078, D-104)', () => {
  it('primero el sitio y Continuar; después el calendario, la hora y Agendar', async () => {
    mockSchedule.mockResolvedValue({ ok: true, data: 'a1' });
    await render(<ScheduleWalkthroughScreen />);
    expect(await screen.findByText('Después, el calendario y la hora')).toBeTruthy();
    await fireEvent.press(screen.getByText('Continuar'));
    expect(screen.getByText('Hora')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Mes siguiente'));
    const nextMonth = new Date();
    nextMonth.setDate(1);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const key = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-10`;
    await fireEvent.press(screen.getByLabelText(key));
    await fireEvent.press(screen.getByText('Agendar'));
    expect(screen.getByText('Elige la hora.')).toBeTruthy();
    // D-216: la hora se elige en la hoja; abre en 10:00 AM.
    await fireEvent.press(screen.getByLabelText('Hora'));
    await fireEvent.press(screen.getByText('Listo'));
    expect(screen.getByText('10:00 AM')).toBeTruthy();
    await fireEvent.press(screen.getByText('Agendar'));
    await waitFor(() => expect(mockSchedule).toHaveBeenCalled());
    const [site, startsAt] = mockSchedule.mock.calls[0];
    expect(site).toBe('s1');
    expect((startsAt as Date).getDate()).toBe(10);
    expect((startsAt as Date).getHours()).toBe(10);
    expect(mockBack).toHaveBeenCalled();
  });

  it('entrando desde un sitio va directo al calendario con puntos en los días con citas', async () => {
    mockParams = { id: 'l1', site: 's2' };
    const t = new Date();
    t.setDate(t.getDate() + 1);
    const key = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    mockDays.mockResolvedValue({ ok: true, data: new Set([key]) });
    await render(<ScheduleWalkthroughScreen />);
    expect(await screen.findByText('900 Marco Island Blvd')).toBeTruthy();
    expect(screen.queryByText('Continuar')).toBeNull();
    if (t.getDate() !== 1) expect(await screen.findByTestId(`dot-${key}`)).toBeTruthy();
  });
});

describe('Inicio unido: pendientes de Ventas (D-333 (4), D-337)', () => {
  it('leads por escribir hoy en la fila de cifras y abre Leads en Hoy; Sin respuesta · decide con su número', async () => {
    mockFollowup.mockResolvedValue({ ok: true, data: { toWrite: 6, waiting: 12, noResponse: 2 } });
    await render(<HomeScreen />);
    expect(await screen.findByText('leads por escribir hoy')).toBeTruthy();
    expect(screen.getByText('6')).toBeTruthy();
    expect(screen.getByText('Sin respuesta · decide: 2')).toBeTruthy();
    // D-337: Esperando respuesta, Seguimientos, Walkthroughs y Pipeline ya no se repiten en Inicio (viven en Leads).
    expect(screen.queryByText('Esperando respuesta')).toBeNull();
    expect(screen.queryByText('Seguimientos')).toBeNull();
    await fireEvent.press(screen.getByLabelText('6 leads por escribir hoy'));
    expect(mockNavigate).toHaveBeenCalledWith({ pathname: '/pipeline', params: { tab: 'today' } });
  });

  it('sin pendientes: Todo al día', async () => {
    await render(<HomeScreen />);
    await waitFor(() => expect(mockFollowup).toHaveBeenCalled());
    expect(screen.getByText('Todo al día')).toBeTruthy();
  });

  it('sin leads_ver no se consultan los pendientes de Ventas ni sale la cifra', async () => {
    mockAccess = { isSuperAdmin: false, permissions: new Set(['empleados_ver']) };
    await render(<HomeScreen />);
    expect(mockFollowup).not.toHaveBeenCalled();
    expect(screen.queryByText(/por escribir hoy/)).toBeNull();
    expect(screen.getByText('Todo al día')).toBeTruthy();
  });
});

describe('Eliminar lead (D-201)', () => {
  it('solo con leads_eliminar; la hoja confirma y vuelve a la pantalla anterior', async () => {
    mockDeleteLead.mockResolvedValue({ ok: true, data: null });
    mockAccess = { isSuperAdmin: false, permissions: new Set(['leads_ver', 'leads_eliminar']) };
    await render(<LeadDetailScreen />);
    await screen.findByText('Gulf Coast Dental');
    await fireEvent.press(screen.getByText('Eliminar lead'));
    expect(screen.getByText('¿Eliminar Gulf Coast Dental?')).toBeTruthy();
    await fireEvent.press(screen.getByText('Eliminar'));
    await waitFor(() => expect(mockDeleteLead).toHaveBeenCalledWith('l1'));
    expect(mockBack).toHaveBeenCalled(); // D-346: vuelve a la pantalla anterior
  });

  it('sin leads_eliminar no aparece', async () => {
    mockAccess = { isSuperAdmin: false, permissions: new Set(['leads_ver', 'leads_editar']) };
    await render(<LeadDetailScreen />);
    await screen.findByText('Gulf Coast Dental');
    expect(screen.queryByText('Eliminar lead')).toBeNull();
  });
});

describe('Sitios: lápiz y papelera (D-202)', () => {
  it('el lápiz abre el formulario del sitio', async () => {
    await render(<LeadDetailScreen />);
    await screen.findByText('Gulf Coast Dental');
    await fireEvent.press(screen.getByText('Sitios'));
    await fireEvent.press(screen.getByLabelText('Editar 5th Ave S'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/leads/[id]/new-site', params: { id: 'l1', site: 's1' } });
  });

  it('la papelera pide confirmación y avisa si el sitio tiene walkthrough hecho', async () => {
    mockDeleteSite.mockResolvedValue({ ok: false, reason: 'invalid' });
    await render(<LeadDetailScreen />);
    await screen.findByText('Gulf Coast Dental');
    await fireEvent.press(screen.getByText('Sitios'));
    await fireEvent.press(screen.getByLabelText('Eliminar 5th Ave S'));
    expect(screen.getByText('¿Eliminar 5th Ave S?')).toBeTruthy();
    await fireEvent.press(screen.getByText('Eliminar'));
    await waitFor(() => expect(mockDeleteSite).toHaveBeenCalledWith('s1'));
    expect(await screen.findByText('Este sitio ya tiene un walkthrough hecho y no se puede eliminar.')).toBeTruthy();
  });

  it('quien solo ve no tiene lápiz ni papelera', async () => {
    mockAccess = { isSuperAdmin: false, permissions: new Set(['leads_ver']) };
    await render(<LeadDetailScreen />);
    await screen.findByText('Gulf Coast Dental');
    await fireEvent.press(screen.getByText('Sitios'));
    expect(screen.queryByLabelText('Editar 5th Ave S')).toBeNull();
    expect(screen.queryByLabelText('Eliminar 5th Ave S')).toBeNull();
  });

  it('editar un sitio carga sus datos y guarda', async () => {
    mockParams = { id: 'l1', site: 's1' };
    mockUpdateSite.mockResolvedValue({ ok: true, data: null });
    await render(<NewSiteScreen />);
    expect(await screen.findByDisplayValue('123 5th Ave S, Naples')).toBeTruthy();
    expect(screen.getByText('Editar sitio')).toBeTruthy();
    // D-301: el texto viejo sin separar queda en Dirección; se completa con City y ZIP code.
    await fireEvent.changeText(screen.getByLabelText('Dirección'), '125 5th Ave S');
    await fireEvent.changeText(screen.getByLabelText('City'), 'Naples');
    await fireEvent.changeText(screen.getByLabelText('ZIP code'), '34102');
    await fireEvent.press(screen.getByText('Guardar'));
    await waitFor(() =>
      expect(mockUpdateSite).toHaveBeenCalledWith('s1', '5th Ave S', {
        addressLine1: '125 5th Ave S', addressLine2: '', city: 'Naples', state: 'FL', zip: '34102',
      }),
    );
    expect(mockBack).toHaveBeenCalled();
  });
});

describe('Marcar como perdido: solo motivos activos (D-203)', () => {
  it('no ofrece los motivos desactivados', async () => {
    await render(<MarkLostScreen />);
    await screen.findByText('Precio');
    await fireEvent.press(screen.getByLabelText('Motivo'));
    expect(screen.getByText('Otro')).toBeTruthy();
    expect(screen.queryByText('Viejo')).toBeNull();
  });
});

describe('Ajustes: motivos de lead perdido (D-113, D-203)', () => {
  it('solo el Super Admin', async () => {
    mockAccess = { isSuperAdmin: false, permissions: new Set(['leads_ver', 'leads_editar']) };
    await render(<LostReasonsScreen />);
    expect(screen.getByText('REDIRECT /')).toBeTruthy();
  });

  it('lista los activos en su idioma con el otro en gris; la papelera de uno usado lo desactiva y avisa', async () => {
    mockRemoveReason.mockResolvedValue({ ok: true, data: 'deactivated' });
    await render(<LostReasonsScreen />);
    expect(await screen.findByText('Precio')).toBeTruthy();
    expect(screen.getByText('Price')).toBeTruthy();
    expect(screen.queryByText('Viejo')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Eliminar Precio'));
    expect(screen.getByText('¿Eliminar Precio?')).toBeTruthy();
    await fireEvent.press(screen.getByText('Eliminar'));
    await waitFor(() => expect(mockRemoveReason).toHaveBeenCalledWith('r1'));
    expect(await screen.findByText('Algún lead ya usa este motivo: se quitó de la lista y esos leads lo conservan.')).toBeTruthy();
  });

  it('Agregar abre el formulario; pide los dos idiomas y lo pone al final', async () => {
    mockCreateReason.mockResolvedValue({ ok: true, data: 'r9' });
    await render(<LostReasonsScreen />);
    await screen.findByText('Precio');
    await fireEvent.press(screen.getByText('Agregar'));
    expect(mockPush).toHaveBeenCalledWith('/settings/lost-reasons/edit');

    mockParams = {};
    await render(<LostReasonFormScreen />);
    await waitFor(() => expect(mockReasons).toHaveBeenCalled());
    await fireEvent.changeText(screen.getByLabelText('En español'), 'Mal momento');
    await fireEvent.press(screen.getByText('Guardar'));
    expect(screen.getByText('Escribe el motivo en inglés.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('En inglés'), 'Bad timing');
    await fireEvent.press(screen.getByText('Guardar'));
    await waitFor(() => expect(mockCreateReason).toHaveBeenCalledWith('Mal momento', 'Bad timing', 10));
  });

  it('el lápiz edita el motivo existente', async () => {
    mockParams = { id: 'r1' };
    mockUpdateReason.mockResolvedValue({ ok: true, data: null });
    await render(<LostReasonFormScreen />);
    expect(await screen.findByDisplayValue('Precio')).toBeTruthy();
    expect(screen.getByText('Editar motivo')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('En inglés'), 'Pricing');
    await fireEvent.press(screen.getByText('Guardar'));
    await waitFor(() => expect(mockUpdateReason).toHaveBeenCalledWith('r1', 'Precio', 'Pricing'));
  });
});

describe('Leads por origen (D-350)', () => {
  const day = (n: number) => new Date(Date.now() - n * 86_400_000);
  const rows = [
    { id: 'c1', company: 'Estero Fitness Club', contactName: 'Front desk', status: 'follow_up', createdAt: day(20), followUpOn: null, nextWalkthrough: null, temperature: 'cold', sourceLabel: 'Muse', source: 'agent', service: 'recurring', nextStepOn: '2026-01-01' },
    { id: 'p1', company: 'Maria Gonzalez', contactName: 'Maria', status: 'interested', createdAt: day(0), followUpOn: null, nextWalkthrough: null, temperature: 'potential', sourceLabel: 'Instagram ad', source: 'ads', service: 'one_time', cleaningType: 'residential', phone: '(239) 555-0142' },
    { id: 'p2', company: 'Gulf Coast Dental', contactName: 'Dr. Patel', status: 'interested', createdAt: day(1), followUpOn: null, nextWalkthrough: null, temperature: 'potential', sourceLabel: null, source: 'web', service: 'recurring' },
  ];

  it('potenciales primero en Hoy con etiqueta, chips de fuente y tipo, y Call como acción principal', async () => {
    mockFetchLeads.mockResolvedValue({ ok: true, data: rows });
    await render(<PipelineScreen />);
    expect(await screen.findByText('Maria Gonzalez')).toBeTruthy();
    const names = screen.getAllByText(/^(Maria Gonzalez|Gulf Coast Dental|Estero Fitness Club)$/).map((n) => String(n.props.children));
    expect(names).toEqual(['Maria Gonzalez', 'Gulf Coast Dental', 'Estero Fitness Club']);
    expect(screen.getAllByText('Potencial').length).toBe(2);
    expect(screen.getByText('En frío')).toBeTruthy();
    expect(screen.getByText('Instagram ad')).toBeTruthy();
    expect(screen.getByText('Website')).toBeTruthy();
    expect(screen.getByText('Muse')).toBeTruthy();
    expect(screen.getByText('One-time · Residencial')).toBeTruthy();
    expect(screen.getAllByText('Recurrente').length).toBe(2);
    expect(screen.getAllByText('Llamar').length).toBe(1); // sin teléfono no hay Llamar
    expect(screen.getByLabelText('Potencial · 2')).toBeTruthy();
    expect(screen.getByLabelText('En frío · 1')).toBeTruthy();
  });

  it('filtro Potential / Cold y el filtro de la ruta (Inicio → Potential)', async () => {
    mockFetchLeads.mockResolvedValue({ ok: true, data: rows });
    await render(<PipelineScreen />);
    await screen.findByText('Maria Gonzalez');
    await fireEvent.press(screen.getByLabelText('En frío · 1'));
    expect(screen.queryByText('Maria Gonzalez')).toBeNull();
    expect(screen.getByText('Estero Fitness Club')).toBeTruthy();
    mockParams = { tab: 'today', filter: 'potential' };
    await render(<PipelineScreen />);
    expect(await screen.findAllByText('Gulf Coast Dental')).toBeTruthy();
  });

  it('Inicio: cifra de potenciales nuevos que abre Leads en Potential', async () => {
    mockFollowup.mockResolvedValue({ ok: true, data: { toWrite: 3, waiting: 0, noResponse: 0, potential: 2 } });
    await render(<HomeScreen />);
    expect(await screen.findByText('leads potenciales nuevos · llama hoy')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('2 leads potenciales nuevos · llama hoy'));
    expect(mockNavigate).toHaveBeenCalledWith({ pathname: '/pipeline', params: { tab: 'today', filter: 'potential' } });
  });

  it('Nuevo lead: Property solo con One-time; con Residential la empresa es opcional', async () => {
    mockCreate.mockResolvedValue({ ok: true, data: 'nuevo' });
    await render(<NewLeadScreen />);
    expect(screen.queryByText('Propiedad')).toBeNull();
    await fireEvent.press(screen.getByText('One-time'));
    expect(screen.getByText('Propiedad')).toBeTruthy();
    await fireEvent.press(screen.getByText('Residencial'));
    expect(screen.getByLabelText('Empresa (opcional)')).toBeTruthy();
    await fireEvent.press(screen.getByText('Crear lead'));
    expect(screen.getByText('Escribe el nombre de la persona.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Persona de contacto'), 'Maria Gonzalez');
    await fireEvent.press(screen.getByText('Crear lead'));
    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate.mock.calls[0][0]).toMatchObject({ company: '', contactName: 'Maria Gonzalez', service: 'one_time', cleaningType: 'residential' });
    // Volver a Recurring quita Residential.
    await fireEvent.press(screen.getByText('Recurrente'));
    expect(screen.queryByText('Propiedad')).toBeNull();
  });
});
