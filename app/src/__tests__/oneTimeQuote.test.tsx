import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

// Quote one-time (orden 162, D-350 (4)): editor, vista del portal y Accounts.
let mockAccess: { isSuperAdmin: boolean; permissions: Set<string> } = { isSuperAdmin: true, permissions: new Set() };
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = require('react');
    useEffect(effect, []);
  },
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/lib/session', () => ({
  usePermissions: () => ({ access: mockAccess, isSuperAdmin: mockAccess.isSuperAdmin, can: (k: string) => mockAccess.isSuperAdmin || mockAccess.permissions.has(k) }),
  useSession: () => ({ locale: 'es', profile: { id: 'yo' } }),
}));
jest.mock('@/lib/navigation', () => ({ useGoBack: () => jest.fn() }));
jest.mock('@/i18n/useStrings', () => ({ useStrings: () => require('@/i18n').getStrings('es') }));
jest.mock('@/i18n/useQuoteStrings', () => ({ useQuoteStrings: () => require('@/i18n/quotes').getQuoteStrings('es') }));
jest.mock('@/i18n/useSalesStrings', () => ({ useSalesStrings: () => require('@/i18n/sales').salesEs }));

const mockFetch = jest.fn();
const mockEnsure = jest.fn();
const mockSave = jest.fn();
const mockSend = jest.fn();
jest.mock('@/lib/quotesApi', () => ({
  fetchOneTimeQuote: (...a: unknown[]) => mockFetch(...a),
  ensureOneTimeQuote: (...a: unknown[]) => mockEnsure(...a),
  saveOneTimeQuote: (...a: unknown[]) => mockSave(...a),
  sendQuote: (...a: unknown[]) => mockSend(...a),
  newQuoteVersion: jest.fn(),
}));

import { OneTimeQuoteEditor } from '@/components/quotes/OneTimeQuoteEditor';
import { QuoteView } from '@/components/quotes/QuoteView';
import { getPortalStrings } from '@/i18n/quotes';
import { isArchivedJobsite, splitAccounts, monthlyTotal, type Jobsite } from '@/lib/clientRules';
import { oneTimeFormFrom, toVersion, validateOneTime } from '@/lib/quoteRules';

const draft = toVersion({ id: 'v1', version: '1.0', minor: 0, status: 'draft', lines: { services: [], addons: [], discounts: [] }, contact_email: 'maria@x.com', recipients: [] });
const base = { quoteId: 'q1', quoteNumber: 'Q-0001', company: 'Maria Gonzalez', site: '10 Palm St', residential: true };

beforeEach(() => {
  jest.clearAllMocks();
  mockAccess = { isSuperAdmin: true, permissions: new Set() };
  mockFetch.mockResolvedValue({ ok: true, data: { ...base, versions: [draft] } });
  mockSave.mockResolvedValue({ ok: true, data: null });
  mockSend.mockResolvedValue({ ok: true, data: { sent: 1, failed: 0 } });
});

describe('Reglas del one-time', () => {
  it('para enviar: precio > 0, fecha, hora y alcance', () => {
    expect(validateOneTime({ price: '', date: null, time: null, scope: ' ', validDays: 30 })).toEqual({ price: true, date: true, time: true, scope: true });
    expect(validateOneTime({ price: '480', date: '2026-11-28', time: '09:00', scope: 'Move-out', validDays: 30 })).toEqual({});
  });
  it('el formulario sale de la versión', () => {
    const v = toVersion({ id: 'v', version: '1.0', minor: 0, status: 'draft', lines: { services: [{ label: 'One-time service', amount: 480, taxable: false }] }, service_date: '2026-11-28', service_time: '09:00', scope: 'Full clean' });
    expect(oneTimeFormFrom(v)).toEqual({ price: '480', date: '2026-11-28', time: '09:00', scope: 'Full clean', validDays: 30 });
  });
});

describe('Editor del quote one-time', () => {
  it('sin quote todavía lo crea (sin walkthrough) y muestra precio, fecha, hora y alcance', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, data: { ...base, quoteId: null, versions: [] } });
    mockEnsure.mockResolvedValue({ ok: true, data: 'q1' });
    await render(<OneTimeQuoteEditor siteId="s1" />);
    expect(await screen.findByLabelText('Precio (total)')).toBeTruthy();
    expect(mockEnsure).toHaveBeenCalledWith('s1');
    expect(screen.getByText('Fecha del servicio')).toBeTruthy();
    expect(screen.getByText('Hora del servicio')).toBeTruthy();
    expect(screen.getByLabelText('Alcance')).toBeTruthy();
    expect(screen.getByText('Sin tarifa mensual ni contrato mensual.')).toBeTruthy();
    expect(screen.getByText('Residencial: sin impuesto de Florida.')).toBeTruthy();
  });

  it('Enviar quote pide los datos; con ellos guarda y envía', async () => {
    await render(<OneTimeQuoteEditor siteId="s1" />);
    await fireEvent.press(await screen.findByText('Enviar quote'));
    expect(screen.getByText('Escribe el precio total.')).toBeTruthy();
    expect(screen.getByText('Elige la fecha del servicio.')).toBeTruthy();
    expect(mockSend).not.toHaveBeenCalled();
    mockFetch.mockResolvedValue({
      ok: true,
      data: { ...base, versions: [{ ...draft, serviceDate: '2026-11-28', serviceTime: '09:00', scope: 'Move-out', lines: { services: [{ label: 'x', amount: 480, taxable: true }], addons: [], discounts: [] } }] },
    });
    await render(<OneTimeQuoteEditor siteId="s1" />);
    await fireEvent.press((await screen.findAllByText('Enviar quote'))[0]);
    await waitFor(() => expect(mockSend).toHaveBeenCalledWith('v1'));
    expect(mockSave.mock.calls[0][1]).toMatchObject({ price: 480, date: '2026-11-28', time: '09:00', scope: 'Move-out' });
  });

  it('quien solo ve no edita ni envía', async () => {
    mockAccess = { isSuperAdmin: false, permissions: new Set(['quotes_ver']) };
    await render(<OneTimeQuoteEditor siteId="s1" />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    expect(screen.queryByText('Enviar quote')).toBeNull();
    expect(screen.queryByLabelText('Precio (total)')).toBeNull();
    expect(mockEnsure).not.toHaveBeenCalled();
  });
});

describe('Portal: vista del one-time', () => {
  it('total del servicio, fecha con hora y alcance', async () => {
    const t = getPortalStrings('es');
    await render(
      <QuoteView
        t={t}
        language="es"
        data={{
          company: 'Maria Gonzalez', site: '10 Palm St', address: '10 Palm St', frequency: null,
          lines: { services: [{ label: 'One-time service', amount: 480 }], addons: [], discounts: [] },
          taxRate: 6, subtotal: 480, discount: 0, tax: 0, total: 480, expiresAt: '2026-12-01T12:00:00Z', validDays: 30,
          extra: { serviceDate: '2026-11-28', serviceTime: '09:00', scope: 'Full move-out clean' },
        }}
      />,
    );
    expect(screen.getByText('Total del servicio')).toBeTruthy();
    expect(screen.getByText(/Fecha del servicio: .* · 9:00 AM/)).toBeTruthy();
    expect(screen.getByText('Alcance')).toBeTruthy();
    expect(screen.getByText('Full move-out clean')).toBeTruthy();
  });
});

describe('Accounts: one-time hasta la fecha, luego Archived (D-200)', () => {
  const j = (over: Partial<Jobsite>): Jobsite => ({
    id: 'j', clientId: 'c', clientName: 'Maria', clientLegacy: false, name: 'Casa', address: '', plusCode: null, contactName: null, contactPhone: null,
    contactEmail: null, emergencyName: null, emergencyPhone: null, emergencyRelation: null, emergencyEmail: null, frequency: null,
    estHoursPerVisit: null, visitsPerMonth: null, startDate: null, status: 'active', walkthroughVersion: null, ...over,
  });
  it('archivado después de su fecha; no suma tarifa mensual', () => {
    expect(isArchivedJobsite(j({ oneTime: true, oneTimeOn: '2026-11-28' }), '2026-11-28')).toBe(false);
    expect(isArchivedJobsite(j({ oneTime: true, oneTimeOn: '2026-11-28' }), '2026-11-29')).toBe(true);
    const groups = [{ clientId: 'c', clientName: 'Maria', legacy: false, accountProvider: false, jobsites: [j({ id: 'a', oneTime: true, oneTimeOn: '2026-11-01' }), j({ id: 'b' })] }];
    const r = splitAccounts(groups, '2026-11-20');
    expect(r.active[0].jobsites.map((x) => x.id)).toEqual(['b']);
    expect(r.archived[0].jobsites.map((x) => x.id)).toEqual(['a']);
    expect(monthlyTotal([j({ id: 'a', oneTime: true })], new Map([['a', 480]]))).toBe(0);
  });
});
