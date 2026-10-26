import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { statisticsEs as s } from '@/i18n/statistics';

// --- Simulaciones --------------------------------------------------------------------------------------------
const mockPush = jest.fn();
const mockNavigate = jest.fn();
let mockAccess: { isSuperAdmin: boolean; permissions: Set<string> } = { isSuperAdmin: true, permissions: new Set() };
let mockParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), push: mockPush, navigate: mockNavigate, back: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = require('react');
    useEffect(effect, [effect]);
  },
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require('react-native');
    return <Text>REDIRECT {href}</Text>;
  },
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/lib/session', () => ({
  usePermissions: () => ({
    access: mockAccess,
    isSuperAdmin: mockAccess.isSuperAdmin,
    can: (k: string) => mockAccess.isSuperAdmin || mockAccess.permissions.has(k),
  }),
  useSession: () => ({ locale: 'es', profile: { id: 'yo', fullName: 'Humberto Vega' } }),
}));
jest.mock('@/lib/navigation', () => ({ useGoBack: () => jest.fn() }));
jest.mock('@/i18n/useStrings', () => ({ useStrings: () => require('@/i18n').getStrings('es') }));
jest.mock('@/i18n/useSalesStrings', () => ({ useSalesStrings: () => require('@/i18n/sales').salesEs }));
jest.mock('@/lib/scheduleApi', () => ({
  fetchMySchedule: jest.fn(async () => ({ ok: true, data: [] })),
  fetchWorkPending: jest.fn(async () => ({ ok: true, data: { toApprove: 0, urgent: 0, gpsOut: 0, forgotClockIn: 0, openShifts: 0 } })),
  clockIn: jest.fn(),
  clockOut: jest.fn(),
}));
jest.mock('@/lib/workQueue', () => ({ syncWorkQueue: jest.fn(async () => 'synced'), loadShift: jest.fn(async () => null), saveShift: jest.fn(), enqueue: jest.fn() }));
jest.mock('@/lib/quotesApi', () => ({ fetchQuotePending: jest.fn().mockResolvedValue([]) }));
jest.mock('@/lib/leadsApi', () => ({ fetchSalesPending: jest.fn(async () => ({ ok: false, reason: 'network' })) }));
const mockStats = { report: jest.fn(), home: jest.fn() };
jest.mock('@/lib/statisticsApi', () => ({
  fetchStatistics: (...a: unknown[]) => mockStats.report(...a),
  fetchAdminHome: (...a: unknown[]) => mockStats.home(...a),
}));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/lib/employeesApi', () => ({ fetchEmployees: async () => ({ ok: true, data: [] }), failureFromCode: () => 'unknown' }));
jest.mock('@/lib/notificationsApi', () => ({ fetchUnreadCount: async () => 0 }));
jest.mock('@/lib/accountingApi', () => ({ fetchDashboard: async () => ({ ok: false, reason: 'network' }) }));
const mockShareCsv = jest.fn();
const mockSharePdf = jest.fn();
jest.mock('@/lib/sharePdf', () => ({
  shareCsv: (...a: unknown[]) => mockShareCsv(...a),
  sharePdf: (...a: unknown[]) => mockSharePdf(...a),
  shareAvailable: () => true,
}));

import HomeScreen from '@/app/(app)/(tabs)/index';
import MenuScreen from '@/app/(app)/(tabs)/menu';
import StatisticsScreen from '@/app/(app)/statistics/index';
import { toReport } from '@/lib/statisticsRules';

// Datos con la forma de statistics_report (números de la muestra D-253, recortados).
const figures = (o: Record<string, unknown> = {}) => ({
  visits: 17, shifts: 51, worked_minutes: 12186, paid_minutes: 12240, unworked_minutes: 54, unworked_amount: 19,
  avg_minutes: 238.9, punctual_self: 1, punctual_on_time: 1, scheduled: 53, scheduled_worked: 51, absences: [], ...o,
});
const rawReport = {
  accounts: [
    {
      jobsite_id: 'j1', name: 'Naples Yacht Club', client: 'Wilson Franquicia', status: 'active', est_minutes: 240,
      expected: 7020, staff: 4080, expenses: 0, profit: 2940, margin: 41.9,
      ...figures({
        absences: [{ visit_id: 'v9', jobsite_id: 'j1', jobsite: 'Naples Yacht Club', profile_id: 'p2', name: 'Ida', day: '2026-10-25' }],
      }),
      employees: [{ profile_id: 'p1', name: 'Humbe', cost: 1360, ...figures({ paid_minutes: 4080, scheduled: 17, scheduled_worked: 17 }) }],
    },
  ],
  employees: [
    {
      profile_id: 'p2', name: 'Ida', worker_type: 'w2', cost: 1120,
      ...figures({ scheduled: 15, scheduled_worked: 14, absences: [{ visit_id: 'v9', jobsite_id: 'j1', jobsite: 'Naples Yacht Club', profile_id: 'p2', name: 'Ida', day: '2026-10-25' }] }),
    },
  ],
  trend: [
    { month: '2026-09-01', expected: 3217, staff: 2020, expenses: 974, profit: 223 },
    { month: '2026-10-01', expected: 7020, staff: 4080, expenses: 0, profit: 2940 },
  ],
};

const home = {
  month: { month: '2026-10-01', expected: 7020, staff: 4080, expenses: 0, profit: 2940, margin: 41.9 },
  receivable: { month: '2026-10-01', pending: 7020, count: 1 },
  toApprove: { visits: 0, shifts: 0, urgent: 0 },
  today: [
    {
      id: 'vh', jobsite: 'Naples Yacht Club', startsAt: '2026-10-26T23:00:00', minutes: 240,
      staff: [
        { profileId: 'p1', name: 'Humbe', clockIn: null, clockOut: null },
        { profileId: 'p2', name: 'Ida', clockIn: '2026-10-26T23:02:00', clockOut: null },
      ],
    },
  ],
  weekHours: [{ profileId: 'p1', name: 'Humbe', programmedMinutes: 1440, workedMinutes: 480 }],
  pipeline: { open: 0, quoteSent: 0 },
  accounts: { active: 1, atRisk: 0 },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockAccess = { isSuperAdmin: true, permissions: new Set() };
  mockParams = { from: '2026-10', to: '2026-10' };
  mockStats.report.mockResolvedValue({ ok: true, data: toReport(rawReport) });
  mockStats.home.mockResolvedValue({ ok: true, data: home });
  mockShareCsv.mockResolvedValue('shared');
  mockSharePdf.mockResolvedValue('shared');
});

describe('Inicio del admin nuevo (D-253)', () => {
  test('profit del mes con ingreso, personal, gastos y margen; por cobrar; hoy con quién marcó; horas contra 32 h; Pipeline y Cuentas', async () => {
    await render(<HomeScreen />);
    expect(await screen.findByText(s.home.profitOf('octubre'))).toBeTruthy();
    expect(screen.getByText('$2,940.00')).toBeTruthy();
    expect(screen.getByText(s.home.profitLine('$7,020.00', '$4,080.00', '$0.00'))).toBeTruthy();
    expect(screen.getByText(s.home.margin('41.9'))).toBeTruthy();
    expect(screen.getByText(s.home.receivable)).toBeTruthy();
    expect(screen.getByText(s.home.receivableSub('octubre'))).toBeTruthy();
    expect(screen.getByText(s.home.toApprove)).toBeTruthy();
    expect(screen.getByText(s.home.today('11:00 PM'))).toBeTruthy();
    expect(screen.getByText(s.home.scheduledChip(2))).toBeTruthy();
    expect(screen.getByText(s.home.noClockIn)).toBeTruthy();
    expect(screen.getByText(s.home.clockedIn('11:02 PM'))).toBeTruthy();
    expect(screen.getByText(s.home.weekHours)).toBeTruthy();
    expect(screen.getByText(s.home.weekRow('8', '24'))).toBeTruthy();
    expect(screen.getByText(s.home.pipelineSub(0))).toBeTruthy();
    expect(screen.getByText(s.home.accountsSub(1, 0))).toBeTruthy();
  });

  test('cada tarjeta con su permiso: con solo Aprobar no hay profit, horas de la semana ni Pipeline aunque lleguen datos', async () => {
    mockAccess = { isSuperAdmin: false, permissions: new Set(['work_aprobar']) };
    await render(<HomeScreen />);
    expect(await screen.findByText(s.home.toApprove)).toBeTruthy();
    expect(screen.queryByText(s.home.weekHours)).toBeNull();
    expect(screen.queryByText(s.home.profitOf('octubre'))).toBeNull();
    expect(screen.queryByText(s.home.receivable)).toBeNull();
    expect(screen.queryByText(s.home.pipeline)).toBeNull();
    expect(screen.queryByText(s.home.today('11:00 PM'))).toBeNull();
  });

  test('D-223: el staff nunca ve sus horas contra 32 h; su Inicio no pide admin_home', async () => {
    mockAccess = { isSuperAdmin: false, permissions: new Set() };
    await render(<HomeScreen />);
    await waitFor(() => expect(screen.queryByText(s.home.weekHours)).toBeNull());
    expect(mockStats.home).not.toHaveBeenCalled();
  });

  test('Por aprobar lleva a la pestaña de aprobación del Schedule', async () => {
    await render(<HomeScreen />);
    await fireEvent.press(await screen.findByLabelText(`${s.home.toApprove}: 0 ${s.home.toApproveSub}`));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/schedule', params: { tab: 'approve' } });
  });
});

describe('Estadísticas (D-252, D-253)', () => {
  test('sin estadisticas_ver no se abre', async () => {
    mockAccess = { isSuperAdmin: false, permissions: new Set(['dashboard_global']) };
    await render(<StatisticsScreen />);
    expect(screen.getByText('REDIRECT /')).toBeTruthy();
    expect(mockStats.report).not.toHaveBeenCalled();
  });

  test('Cuentas: horas reales y pagadas, sin trabajar, por hora, duración, puntualidad, turnos y por empleado', async () => {
    mockAccess = { isSuperAdmin: false, permissions: new Set(['estadisticas_ver']) };
    await render(<StatisticsScreen />);
    expect(await screen.findByText('Naples Yacht Club')).toBeTruthy();
    expect(mockStats.report).toHaveBeenCalledWith({ from: '2026-10', to: '2026-10' });
    expect(screen.getByText(s.marginChip('41.9'))).toBeTruthy();
    expect(screen.getByText(s.accountLine('Wilson Franquicia', 51, 17))).toBeTruthy();
    expect(screen.getByText('203.1 h')).toBeTruthy();
    expect(screen.getByText('204 h')).toBeTruthy();
    expect(screen.getByText('0.9 h · $19.00')).toBeTruthy();
    expect(screen.getByText(s.usedChip('99.6'))).toBeTruthy();
    expect(screen.getByText('$34.56')).toBeTruthy(); // 7020 / 203.1 h
    expect(screen.getByText('$20.09')).toBeTruthy(); // 4080 / 203.1 h
    expect(screen.getByText(s.leftPerHour('$14.47'))).toBeTruthy();
    expect(screen.getByText('3.98 h')).toBeTruthy();
    expect(screen.getByText(s.vsEstimated('4 h'))).toBeTruthy();
    expect(screen.getByText('100%')).toBeTruthy();
    expect(screen.getByText(s.shiftsOf(51, 53))).toBeTruthy();
    expect(screen.getByText(s.missingChip(2))).toBeTruthy();
    expect(screen.getByText('Ida · dom 25 oct')).toBeTruthy();
    expect(screen.getByText(s.employeeRow(17, 17, '68 h', '$1,360.00'))).toBeTruthy();
  });

  test('tocar una falta lleva a esa visita (con el schedule)', async () => {
    await render(<StatisticsScreen />);
    await fireEvent.press(await screen.findByLabelText('Ida · dom 25 oct'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/schedule/visit/[id]', params: { id: 'v9' } });
  });

  test('sin puntualidad propia: ámbar con "—" y cuántas entradas marcaron ellos mismos', async () => {
    mockStats.report.mockResolvedValue({ ok: true, data: toReport({ ...rawReport, accounts: [{ ...rawReport.accounts[0], punctual_self: 0, punctual_on_time: 0 }] }) });
    await render(<StatisticsScreen />);
    expect(await screen.findByText(s.punctualityNone(0, 51))).toBeTruthy();
  });

  test('Empleados y Tendencia', async () => {
    await render(<StatisticsScreen />);
    await screen.findByText('Naples Yacht Club');
    await fireEvent.press(screen.getByText(s.tabs.employees));
    expect(await screen.findByText('Ida')).toBeTruthy();
    expect(screen.getByText(s.shiftsOf(14, 15))).toBeTruthy();
    expect(screen.getByText('Naples Yacht Club · dom 25 oct')).toBeTruthy();
    await fireEvent.press(screen.getByText(s.tabs.trend));
    expect(await screen.findByText(s.trendTitle)).toBeTruthy();
    expect(screen.getByText('Septiembre 2026')).toBeTruthy();
    expect(screen.getByText('$974.00')).toBeTruthy();
  });

  test('exportar: CSV de la pestaña y PDF con la marca', async () => {
    await render(<StatisticsScreen />);
    await screen.findByText('Naples Yacht Club');
    await fireEvent.press(screen.getByText(s.exportCsv));
    await waitFor(() => expect(mockShareCsv).toHaveBeenCalled());
    const [csv, name] = mockShareCsv.mock.calls[0];
    expect(name).toBe('cidclean-estadisticas-accounts-2026-10.csv');
    expect(csv).toContain('Naples Yacht Club,Wilson Franquicia,17,51,203.10,204.00');
    await fireEvent.press(screen.getByText(s.exportPdf));
    await waitFor(() => expect(mockSharePdf).toHaveBeenCalled());
    const [html, title] = mockSharePdf.mock.calls[0];
    expect(title).toBe(s.pdfTitle('Octubre 2026'));
    expect(html).toContain('Cid Clean LLC');
    expect(html).toContain('Naples Yacht Club');
  });

  test('error al cargar: lo dice', async () => {
    mockStats.report.mockResolvedValue({ ok: false, reason: 'network' });
    await render(<StatisticsScreen />);
    expect(await screen.findByText(s.errorLoad)).toBeTruthy();
  });
});

describe('Menú: tile de Estadísticas (D-252)', () => {
  test('sale con estadisticas_ver y abre la pantalla; sin el permiso no sale', async () => {
    mockAccess = { isSuperAdmin: false, permissions: new Set(['estadisticas_ver']) };
    const view = await render(<MenuScreen />);
    await fireEvent.press(screen.getByLabelText(s.title));
    expect(mockPush).toHaveBeenCalledWith('/statistics');
    view.unmount();
    mockAccess = { isSuperAdmin: false, permissions: new Set(['dashboard_global']) };
    await render(<MenuScreen />);
    expect(screen.queryByLabelText(s.title)).toBeNull();
  });
});
