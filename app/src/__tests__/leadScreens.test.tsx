import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

// --- Simulaciones --------------------------------------------------------------------------------------------
const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockNavigate = jest.fn();
const mockBack = jest.fn();
let mockAccess: { isSuperAdmin: boolean; permissions: Set<string> } = { isSuperAdmin: true, permissions: new Set() };
let mockParams: Record<string, string> = { id: 'l1' };

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
const mockFetchLead = jest.fn();
const mockSetStatus = jest.fn();
const mockMarkLost = jest.fn();
const mockReasons = jest.fn();
const mockCreate = jest.fn();
const mockSchedule = jest.fn();
const mockDays = jest.fn();
const mockPending = jest.fn();
const mockAddSite = jest.fn();
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
}));

import HomeScreen from '@/app/(app)/(tabs)/index';
import PipelineScreen from '@/app/(app)/(tabs)/pipeline';
import LeadDetailScreen from '@/app/(app)/leads/[id]/index';
import MarkLostScreen from '@/app/(app)/leads/[id]/lost';
import NewSiteScreen from '@/app/(app)/leads/[id]/new-site';
import ScheduleWalkthroughScreen from '@/app/(app)/leads/[id]/schedule';
import NewLeadScreen from '@/app/(app)/leads/new';
import type { Lead } from '@/lib/leadRules';

const lead: Lead = {
  id: 'l1',
  company: 'Gulf Coast Dental',
  contactName: 'Ana Rivera',
  phone: '(239) 555-0142',
  email: 'ana@gulfcoastdental.com',
  source: 'web',
  notes: null,
  status: 'contacted',
  lostReason: null,
  lostNote: null,
  createdAt: new Date(2026, 9, 20),
  followUpOn: null,
  sites: [
    { id: 's1', name: '5th Ave S', address: '123 5th Ave S, Naples', scheduled: null },
    { id: 's2', name: null, address: '900 Marco Island Blvd', scheduled: null },
  ],
};

const reasons = [
  { id: 'r1', labelEs: 'Precio', labelEn: 'Price', sort: 1 },
  { id: 'r2', labelEs: 'Otro', labelEn: 'Other', sort: 8 },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockAccess = { isSuperAdmin: true, permissions: new Set() };
  mockParams = { id: 'l1' };
  mockFetchLeads.mockResolvedValue({ ok: true, data: [] });
  mockFetchLead.mockResolvedValue({ ok: true, data: lead });
  mockReasons.mockResolvedValue({ ok: true, data: reasons });
  mockDays.mockResolvedValue({ ok: true, data: new Set() });
  mockPending.mockResolvedValue({ ok: true, data: { followUpsDue: 0, walkthroughsUpcoming: 0 } });
});

describe('Pipeline', () => {
  it('lista los leads con su ficha y abre el detalle', async () => {
    mockFetchLeads.mockResolvedValue({
      ok: true,
      data: [{ id: 'l1', company: 'Gulf Coast Dental', contactName: 'Ana Rivera', status: 'walkthrough_scheduled', createdAt: new Date(), followUpOn: null, nextWalkthrough: null }],
    });
    await render(<PipelineScreen />);
    expect(await screen.findByText('Gulf Coast Dental')).toBeTruthy();
    expect(screen.getByText('Walkthrough agendado')).toBeTruthy();
    await fireEvent.press(screen.getByText('Gulf Coast Dental'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/leads/[id]', params: { id: 'l1' } });
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
    expect(screen.getAllByText('Contactado').length).toBeGreaterThan(0);
    expect(screen.getByText('Ana Rivera')).toBeTruthy();
    expect(screen.getByText('ana@gulfcoastdental.com')).toBeTruthy();
  });

  it('elegir Perdido abre Marcar como perdido sin guardar', async () => {
    await render(<LeadDetailScreen />);
    await screen.findByText('Gulf Coast Dental');
    await fireEvent.press(screen.getByLabelText('Estado'));
    await fireEvent.press(screen.getByText('Perdido'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/leads/[id]/lost', params: { id: 'l1' } });
    expect(mockSetStatus).not.toHaveBeenCalled();
  });

  it('elegir otro estado lo guarda', async () => {
    mockSetStatus.mockResolvedValue({ ok: true, data: null });
    await render(<LeadDetailScreen />);
    await screen.findByText('Gulf Coast Dental');
    await fireEvent.press(screen.getByLabelText('Estado'));
    await fireEvent.press(screen.getByText('Negociación'));
    await waitFor(() => expect(mockSetStatus).toHaveBeenCalledWith('l1', 'negotiation'));
  });

  it('quien solo ve no tiene Estado, Editar ni botones de sitios', async () => {
    mockAccess = { isSuperAdmin: false, permissions: new Set(['leads_ver']) };
    await render(<LeadDetailScreen />);
    await screen.findByText('Gulf Coast Dental');
    expect(screen.queryByLabelText('Estado')).toBeNull();
    expect(screen.queryByText('Editar')).toBeNull();
    await fireEvent.press(screen.getByText('Sitios'));
    expect(screen.getByText('5th Ave S')).toBeTruthy();
    expect(screen.queryByText('Agendar walkthrough')).toBeNull();
    expect(screen.queryByText('Agregar sitio')).toBeNull();
  });

  it('Sitios: cada sitio con su walkthrough y el botón Agendar walkthrough', async () => {
    mockFetchLead.mockResolvedValue({
      ok: true,
      data: { ...lead, sites: [{ ...lead.sites[0], scheduled: { id: 'a', startsAt: new Date(2026, 9, 22, 10, 0), status: 'scheduled' } }] },
    });
    await render(<LeadDetailScreen />);
    await screen.findByText('Gulf Coast Dental');
    await fireEvent.press(screen.getByText('Sitios'));
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
    await waitFor(() => expect(mockAddSite).toHaveBeenCalledWith('l1', '', '500 Main St'));
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
    expect(screen.getByText('Escribe una hora válida, por ejemplo 10:00 AM.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Hora'), '10:00 AM');
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

describe('Inicio del admin: pendientes de Ventas (D-111)', () => {
  it('muestra seguimientos y walkthroughs con flecha y abre Pipeline', async () => {
    mockPending.mockResolvedValue({ ok: true, data: { followUpsDue: 3, walkthroughsUpcoming: 2 } });
    await render(<HomeScreen />);
    expect(await screen.findByText('Seguimientos de leads')).toBeTruthy();
    expect(screen.getByText('3 pendientes')).toBeTruthy();
    expect(screen.getByText('Walkthroughs agendados')).toBeTruthy();
    expect(screen.getByText('2 agendados')).toBeTruthy();
    expect(screen.queryByText('Todo al día')).toBeNull();
    await fireEvent.press(screen.getByText('Seguimientos de leads'));
    expect(mockNavigate).toHaveBeenCalledWith('/pipeline');
  });

  it('sin pendientes: Todo al día', async () => {
    await render(<HomeScreen />);
    await waitFor(() => expect(mockPending).toHaveBeenCalled());
    expect(screen.getByText('Todo al día')).toBeTruthy();
  });

  it('sin leads_ver no se consultan los pendientes de Ventas', async () => {
    mockAccess = { isSuperAdmin: false, permissions: new Set(['empleados_ver']) };
    await render(<HomeScreen />);
    expect(mockPending).not.toHaveBeenCalled();
    expect(screen.getByText('Todo al día')).toBeTruthy();
  });
});
