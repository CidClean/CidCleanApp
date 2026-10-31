import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { accountingEs } from '@/i18n/accounting';
import { notificationsEs } from '@/i18n/notifications';
import { getQuoteStrings } from '@/i18n/quotes';

let mockAccess: { isSuperAdmin: boolean; permissions: Set<string> } = { isSuperAdmin: true, permissions: new Set() };
const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('@/lib/contractApi', () => ({ fetchContractInfo: async () => ({ ok: true, data: null }), fetchCleaningType: async () => null, saveCleaningType: async () => true, fetchUnsignedJobsites: async () => new Set(), fetchContractPreviewUrl: async () => ({ ok: false, reason: 'server' }), contractStep: () => 1, fieldsToShow: () => [] })); // D-289
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), push: mockPush, back: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (effect: () => void | (() => void)) => {
    // Como React Navigation: se vuelve a correr si cambia la función (cambiar de mes).
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
  useSession: () => ({ locale: 'es', profile: { id: 'yo' } }),
}));
const mockBack = jest.fn();
jest.mock('@/lib/navigation', () => ({ useGoBack: () => mockBack }));
jest.mock('@/i18n/useStrings', () => ({ useStrings: () => require('@/i18n').getStrings('es') }));
jest.mock('@/i18n/useQuoteStrings', () => ({ useQuoteStrings: () => require('@/i18n/quotes').getQuoteStrings('es') }));

const figures = {
  expected: 1150,
  received: 1100,
  pending: 50,
  staff: 635.29,
  expenses: 120,
  profit: 394.71,
  months: [{ month: '2026-10-01', expected: 1150, received: 1100, pending: 50, staff: 635.29, expenses: 120, profit: 394.71 }],
  atRisk: [{ jobsiteId: 'j9', name: 'Sede Riesgo' }],
};
const income = (o: Record<string, unknown> = {}) => ({
  id: 'i1',
  jobsiteId: 'j1',
  jobsite: 'Marco Island Offices',
  client: 'Marco',
  month: '2026-10-01',
  amount: 2400,
  adjustedAmount: null,
  adjustNote: null,
  adjustedBy: null,
  base: 2400,
  extrasTotal: 25,
  total: 2425,
  receivedAmount: 0,
  received: false,
  receivedOn: null,
  extras: [{ id: 'x1', label: 'Jueves extra', amount: 25, serviceDate: '2026-10-22', afterReceived: false }],
  ...o,
});
const mockApi = {
  dashboard: jest.fn(),
  income: jest.fn(),
  adjust: jest.fn(),
  received: jest.fn(),
  expenses: jest.fn(),
  saveExpense: jest.fn(),
  recurring: jest.fn(),
  saveRecurring: jest.fn(),
  staff: jest.fn(),
  report: jest.fn(),
};
jest.mock('@/lib/accountingApi', () => ({
  fetchDashboard: (...a: unknown[]) => mockApi.dashboard(...a),
  fetchIncome: (...a: unknown[]) => mockApi.income(...a),
  adjustIncome: (...a: unknown[]) => mockApi.adjust(...a),
  setIncomeReceived: (...a: unknown[]) => mockApi.received(...a),
  fetchExpenses: (...a: unknown[]) => mockApi.expenses(...a),
  saveExpense: (...a: unknown[]) => mockApi.saveExpense(...a),
  fetchRecurring: (...a: unknown[]) => mockApi.recurring(...a),
  saveRecurring: (...a: unknown[]) => mockApi.saveRecurring(...a),
  fetchStaffCost: (...a: unknown[]) => mockApi.staff(...a),
  fetchReport: (...a: unknown[]) => mockApi.report(...a),
  fetchAccountingJobsites: jest.fn(async () => ({ ok: true, data: [{ id: 'j1', name: 'Sede A', client: 'Cliente', status: 'active' }] })),
  fetchExpenseCategories: jest.fn(async () => ({
    ok: true,
    data: [
      { id: 'c1', labelEs: 'Suministros', labelEn: 'Supplies', active: true },
      { id: 'c2', labelEs: 'Seguro', labelEn: 'Insurance', active: true },
    ],
  })),
}));
const mockShareCsv = jest.fn();
const mockSharePdf = jest.fn();
jest.mock('@/lib/sharePdf', () => ({
  shareCsv: (...a: unknown[]) => mockShareCsv(...a),
  sharePdf: (...a: unknown[]) => mockSharePdf(...a),
  shareAvailable: () => true,
}));
const mockQuotes = { extras: jest.fn(), create: jest.fn(), extra: jest.fn(), save: jest.fn(), date: jest.fn() };
jest.mock('@/lib/quotesApi', () => ({
  fetchJobsiteExtras: (...a: unknown[]) => mockQuotes.extras(...a),
  createExtraQuote: (...a: unknown[]) => mockQuotes.create(...a),
  fetchExtraQuote: (...a: unknown[]) => mockQuotes.extra(...a),
  saveQuoteDraft: (...a: unknown[]) => mockQuotes.save(...a),
  setQuoteServiceDate: (...a: unknown[]) => mockQuotes.date(...a),
  fetchSuggestions: jest.fn(async () => ({ services: [], addons: [], discounts: [] })),
  fetchSiteQuote: jest.fn(),
  ensureQuote: jest.fn(),
  sendQuote: jest.fn(),
  newQuoteVersion: jest.fn(),
  uploadQuoteSow: jest.fn(),
}));
jest.mock('@/lib/leadsApi', () => ({ fetchLead: jest.fn() }));
jest.mock('@/lib/termsApi', () => ({ choosePdf: jest.fn() }));
const mockNotif = { list: jest.fn(), read: jest.fn(), settings: jest.fn(), save: jest.fn() };
jest.mock('@/lib/notificationsApi', () => ({
  fetchNotifications: (...a: unknown[]) => mockNotif.list(...a),
  markRead: (...a: unknown[]) => mockNotif.read(...a),
  fetchChannelSettings: (...a: unknown[]) => mockNotif.settings(...a),
  saveChannelSettings: (...a: unknown[]) => mockNotif.save(...a),
}));

import AccountingScreen from '@/app/(app)/accounting';
import ExpenseFormScreen from '@/app/(app)/accounting/expense';
import ExportScreen from '@/app/(app)/accounting/export';
import IncomeScreen from '@/app/(app)/accounting/income';
import StaffCostScreen from '@/app/(app)/accounting/staff';
import NotificationsScreen from '@/app/(app)/notifications';
import NotificationSettingsScreen from '@/app/(app)/notifications/settings';
import { JobsiteExtras } from '@/components/quotes/JobsiteExtras';
import ExtraQuoteScreen from '@/app/(app)/jobsites/[id]/quote/[quoteId]';

const a = accountingEs;
const n = notificationsEs;
const q = getQuoteStrings('es');

beforeEach(() => {
  jest.clearAllMocks();
  mockAccess = { isSuperAdmin: true, permissions: new Set() };
  mockParams = { from: '2026-10', to: '2026-10' };
  mockApi.dashboard.mockResolvedValue({ ok: true, data: figures });
  mockApi.income.mockResolvedValue({ ok: true, data: [income()] });
  mockApi.adjust.mockResolvedValue({ ok: true, data: null });
  mockApi.received.mockResolvedValue({ ok: true, data: null });
  mockApi.expenses.mockResolvedValue({ ok: true, data: [] });
  mockApi.saveExpense.mockResolvedValue({ ok: true, data: 'e1' });
  mockApi.recurring.mockResolvedValue({ ok: true, data: [] });
  mockApi.staff.mockResolvedValue({
    ok: true,
    data: [{ profileId: 'p1', name: 'Ana R.', workerType: 'w2', minutes: 2550, amount: 765, jobsites: [{ jobsiteId: 'j1', jobsite: 'Sede A', month: '2026-10-01', minutes: 2550, amount: 765 }] }],
  });
  mockApi.report.mockResolvedValue({ ok: true, data: [{ month: '2026-10-01', employee: 'Ana R.', worker_type: 'w2', jobsite: 'Sede A', hours: 42.5, amount: 765 }] });
  mockShareCsv.mockResolvedValue('shared');
  mockSharePdf.mockResolvedValue('shared');
  mockQuotes.extras.mockResolvedValue({ ok: true, data: [] });
  mockQuotes.create.mockResolvedValue({ ok: true, data: 'q9' });
});

describe('Accounting: dashboard (D-068, D-069, D-215)', () => {
  test('Profit del mes sobre lo esperado, Recibido / Pendiente, mosaico y alerta de margen', async () => {
    await render(<AccountingScreen />);
    expect(await screen.findByText('$394.71')).toBeTruthy();
    expect(screen.getByText(a.profitMonth)).toBeTruthy();
    expect(screen.getByText(a.receivedPending('$1,100.00', '$50.00'))).toBeTruthy();
    expect(screen.getByText('Octubre 2026')).toBeTruthy();
    for (const t of [a.income, a.staff, a.expenses, a.recurring, a.export]) expect(screen.getAllByText(t).length).toBeGreaterThan(0);
    expect(screen.getByText(a.marginRisk)).toBeTruthy();
    expect(mockApi.dashboard).toHaveBeenCalledWith({ from: '2026-10', to: '2026-10' }, null);
  });

  test('la flecha cambia de mes', async () => {
    await render(<AccountingScreen />);
    await screen.findByText('$394.71');
    await fireEvent.press(screen.getByLabelText(a.nextMonth));
    await waitFor(() => expect(mockApi.dashboard).toHaveBeenLastCalledWith({ from: '2026-11', to: '2026-11' }, null));
  });

  test('sin dashboard ni tarifas solo se ven las tarjetas con permiso, sin cifras', async () => {
    mockAccess = { isSuperAdmin: false, permissions: new Set(['gastos_ver']) };
    await render(<AccountingScreen />);
    expect(screen.getByText(a.expenses)).toBeTruthy();
    expect(screen.queryByText(a.income)).toBeNull();
    expect(screen.queryByText(a.profitMonth)).toBeNull();
    expect(mockApi.dashboard).not.toHaveBeenCalled();
  });

  test('sin ningún permiso de Accounting vuelve al Inicio', async () => {
    mockAccess = { isSuperAdmin: false, permissions: new Set(['leads_ver']) };
    await render(<AccountingScreen />);
    expect(screen.getByText('REDIRECT /')).toBeTruthy();
  });
});

describe('Ingresos (D-063, D-064, D-238)', () => {
  test('Esperado, Recibido, la fila con su ficha y los extras debajo', async () => {
    await render(<IncomeScreen />);
    expect(await screen.findByText('Marco Island Offices')).toBeTruthy();
    expect(screen.getAllByText('$2,425.00').length).toBeGreaterThan(0);
    expect(screen.getByText(a.pending)).toBeTruthy();
    expect(screen.getByText(/Jueves extra/)).toBeTruthy();
  });

  test('el interruptor Recibido marca el ingreso con la fecha de hoy', async () => {
    await render(<IncomeScreen />);
    await fireEvent.press(await screen.findByLabelText(`${a.received} · Marco Island Offices`));
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    await waitFor(() => expect(mockApi.received).toHaveBeenCalledWith('i1', true, today));
  });

  test('Ajustar pide la nota y la guarda con el monto (D-238)', async () => {
    await render(<IncomeScreen />);
    await fireEvent.press(await screen.findByText(a.adjust));
    await fireEvent.changeText(screen.getByLabelText(a.adjustAmount), '2,500');
    await fireEvent.press(screen.getByText(a.save));
    expect(screen.getByText(a.adjustNoteRequired)).toBeTruthy();
    expect(mockApi.adjust).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText(a.adjustNote), 'Extra hablado');
    await fireEvent.press(screen.getByText(a.save));
    await waitFor(() => expect(mockApi.adjust).toHaveBeenCalledWith('i1', 2500, 'Extra hablado'));
  });

  test('recibido ya no se ajusta y muestra la Fecha de cobro', async () => {
    mockApi.income.mockResolvedValue({ ok: true, data: [income({ received: true, receivedOn: '2026-10-20', receivedAmount: 2425 })] });
    await render(<IncomeScreen />);
    expect(await screen.findByText(a.receivedDate)).toBeTruthy();
    expect(screen.queryByText(a.adjust)).toBeNull();
  });

  test('sin ver tarifa no se ven los ingresos', async () => {
    mockAccess = { isSuperAdmin: false, permissions: new Set(['ingresos_ver_registrar']) };
    await render(<IncomeScreen />);
    expect(screen.getByText('REDIRECT /')).toBeTruthy();
  });
});

describe('Gastos (D-065, D-098)', () => {
  test('Global / Jobsite, categoría, fecha y monto; sin categoría no guarda', async () => {
    mockParams = {};
    await render(<ExpenseFormScreen />);
    await fireEvent.changeText(screen.getByLabelText(a.amount), '86.40');
    await fireEvent.press(screen.getByText(a.save));
    expect(screen.getAllByText(a.categoryRequired).length).toBeGreaterThan(1);
    expect(mockApi.saveExpense).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText(a.category));
    await fireEvent.press(await screen.findByText('Suministros'));
    await fireEvent.press(screen.getByText(a.save));
    await waitFor(() =>
      expect(mockApi.saveExpense).toHaveBeenCalledWith(expect.objectContaining({ id: null, categoryId: 'c1', amount: 86.4, jobsiteId: null })),
    );
    expect(mockBack).toHaveBeenCalled();
  });

  test('de un jobsite pide el jobsite', async () => {
    mockParams = {};
    await render(<ExpenseFormScreen />);
    await fireEvent.press(screen.getByText(a.jobsite));
    await fireEvent.changeText(screen.getByLabelText(a.amount), '10');
    await fireEvent.press(screen.getByText(a.save));
    expect(screen.getByText(a.jobsiteRequired)).toBeTruthy();
  });
});

describe('Personal y Exportar (D-067, D-215)', () => {
  test('lo que se debe por empleado con horas y monto, y el detalle por jobsite', async () => {
    await render(<StaffCostScreen />);
    expect(await screen.findByText('Ana R.')).toBeTruthy();
    expect(screen.getAllByText(a.hours('42.5')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('$765.00').length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByText(a.byJobsite));
    expect(screen.getByText('Sede A')).toBeTruthy();
  });

  test('CSV con la hoja de compartir y PDF del dashboard', async () => {
    await render(<ExportScreen />);
    const buttons = screen.getAllByText(a.shareCsv);
    expect(buttons).toHaveLength(4);
    await fireEvent.press(buttons[1]);
    await waitFor(() => expect(mockShareCsv).toHaveBeenCalledWith(expect.stringContaining('Ana R.,W-2,Sede A,42.5,765.00'), 'cidclean-staff-2026-10.csv', a.reportStaff));
    expect(mockApi.report).toHaveBeenCalledWith('staff', { from: '2026-10', to: '2026-10' });
    await fireEvent.press(screen.getByText(a.sharePdf));
    await waitFor(() => expect(mockSharePdf).toHaveBeenCalledWith(expect.stringContaining('$394.71'), a.pdfTitle('Octubre 2026')));
  });

  test('solo los reportes con permiso', async () => {
    mockAccess = { isSuperAdmin: false, permissions: new Set(['reportes_exportar', 'gastos_ver']) };
    await render(<ExportScreen />);
    expect(screen.getAllByText(a.shareCsv)).toHaveLength(1);
    expect(screen.queryByText(a.sharePdf)).toBeNull();
  });
});

describe('Quote de extra en el jobsite (D-238)', () => {
  test('Nuevo quote con permiso de armar quotes abre el borrador', async () => {
    await render(<JobsiteExtras jobsiteId="j1" terminated={false} />);
    await fireEvent.press(await screen.findByText(q.newExtra));
    await waitFor(() => expect(mockQuotes.create).toHaveBeenCalledWith('j1'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/jobsites/[id]/quote/[quoteId]', params: { id: 'j1', quoteId: 'q9' } });
  });

  test('la lista muestra cada extra con su estado; sin armar quotes no hay botón', async () => {
    mockAccess = { isSuperAdmin: false, permissions: new Set(['quotes_ver']) };
    mockQuotes.extras.mockResolvedValue({
      ok: true,
      data: [{ quoteId: 'q1', version: '1.0', status: 'accepted', total: null, serviceDate: '2026-11-05', sentAt: null, createdAt: '2026-10-24' }],
    });
    await render(<JobsiteExtras jobsiteId="j1" terminated={false} />);
    expect(await screen.findByText(q.extraRow('1.0'))).toBeTruthy();
    expect(screen.getByText(q.status.accepted)).toBeTruthy();
    expect(screen.queryByText(q.newExtra)).toBeNull();
  });

  test('el armado del extra: mismas líneas, Total (no mensual) y fecha del servicio; guardar la guarda', async () => {
    mockParams = { id: 'j1', quoteId: 'q1' };
    mockQuotes.extra.mockResolvedValue({
      ok: true,
      data: {
        quoteId: 'q1', walkthroughClosed: true, frequency: null, address: '9 Bay St', jobsiteId: 'j1', jobsite: 'Sede Extra', company: 'Cliente', language: 'es',
        versions: [{
          id: 'v1', version: '1.0', minor: 0, status: 'draft', lines: { services: [{ label: 'Jueves extra', amount: 25, taxable: false }], addons: [], discounts: [] },
          taxRate: 6, validDays: 30, totals: { subtotal: 25, discount: 0, tax: 0, total: 25 }, contactEmail: 'c@x.com', recipients: [], hasSow: false,
          sowPath: null, pdfPath: null, sentAt: null, sentBy: null, expiresAt: null, viewedAt: null, decidedAt: null, decision: null, serviceDate: '2026-11-05',
        }],
      },
    });
    mockQuotes.save.mockResolvedValue({ ok: true, data: null });
    await render(<ExtraQuoteScreen />);
    expect(await screen.findByText(q.extraTitle('Sede Extra'))).toBeTruthy();
    expect(screen.getByText(q.totalOnce)).toBeTruthy();
    expect(screen.queryByText(q.total)).toBeNull();
    expect(screen.getByLabelText(q.serviceDate)).toBeTruthy();
    expect(screen.getByLabelText(q.taxRate).props.value).toBe('6');
    await fireEvent.press(screen.getByText(q.saveDraft));
    await waitFor(() => expect(mockQuotes.save).toHaveBeenCalledWith('v1', expect.objectContaining({ taxRate: 6 })));
    expect(mockQuotes.date).not.toHaveBeenCalled();
  });

  test('sin ver quotes no aparece', async () => {
    mockAccess = { isSuperAdmin: false, permissions: new Set(['clientes_ver']) };
    await render(<JobsiteExtras jobsiteId="j1" terminated={false} />);
    expect(screen.queryByText(q.extrasTitle)).toBeNull();
  });
});

describe('Notificaciones (D-084, D-085, D-117, D-118)', () => {
  test('sin leer en negrita con punto; tocar marca leída y abre su pantalla', async () => {
    mockNotif.list.mockResolvedValue({
      ok: true,
      data: [
        { id: 'n1', kind: 'quote_accepted', title: 'Quote aceptado', detail: 'Marco Island Offices', link: { pathname: '/leads/[id]', params: { id: 'l1' } }, createdAt: new Date().toISOString(), read: false },
        { id: 'n2', kind: 'work_approved', title: 'Trabajo aprobado', detail: null, link: null, createdAt: new Date().toISOString(), read: true },
      ],
    });
    mockNotif.read.mockResolvedValue(true);
    await render(<NotificationsScreen />);
    const row = await screen.findByLabelText(`${n.unreadLabel}, Quote aceptado, Marco Island Offices`);
    await fireEvent.press(row);
    expect(mockNotif.read).toHaveBeenCalledWith('n1');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/leads/[id]', params: { id: 'l1' } });
    expect(screen.getByLabelText('Trabajo aprobado')).toBeTruthy();
  });

  test('Mis notificaciones: tres interruptores; Push queda en Pronto', async () => {
    mockNotif.settings.mockResolvedValue({ ok: true, data: { push: true, email: true, inApp: true } });
    mockNotif.save.mockResolvedValue({ ok: true, data: null });
    await render(<NotificationSettingsScreen />);
    expect(await screen.findByText(`${n.pushHint} · ${n.pushSoon}`)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(n.push));
    expect(mockNotif.save).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText(n.email));
    await waitFor(() => expect(mockNotif.save).toHaveBeenCalledWith({ push: true, email: false, inApp: true }));
  });
});
