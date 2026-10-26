import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { getPortalStrings, getQuoteStrings } from '@/i18n/quotes';

let mockAccess: { isSuperAdmin: boolean; permissions: Set<string> } = { isSuperAdmin: true, permissions: new Set() };
const mockPush = jest.fn();
let mockParams: Record<string, string> = { id: 'l1', siteId: 's1' };
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), push: mockPush, back: jest.fn(), canGoBack: () => true }),
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
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/lib/session', () => ({
  usePermissions: () => ({
    access: mockAccess,
    isSuperAdmin: mockAccess.isSuperAdmin,
    can: (k: string) => mockAccess.isSuperAdmin || mockAccess.permissions.has(k),
  }),
  useSession: () => ({ locale: 'es', profile: { id: 'yo' } }),
}));
jest.mock('@/i18n/useStrings', () => ({ useStrings: () => require('@/i18n').getStrings('es') }));
jest.mock('@/i18n/useQuoteStrings', () => ({ useQuoteStrings: () => require('@/i18n/quotes').getQuoteStrings('es') }));

const mockFetchSiteQuote = jest.fn();
const mockEnsure = jest.fn();
const mockSave = jest.fn();
const mockSend = jest.fn();
const mockNewVersion = jest.fn();
const mockUploadSow = jest.fn();
jest.mock('@/lib/quotesApi', () => ({
  fetchSiteQuote: (...a: unknown[]) => mockFetchSiteQuote(...a),
  ensureQuote: (...a: unknown[]) => mockEnsure(...a),
  saveQuoteDraft: (...a: unknown[]) => mockSave(...a),
  sendQuote: (...a: unknown[]) => mockSend(...a),
  newQuoteVersion: (...a: unknown[]) => mockNewVersion(...a),
  uploadQuoteSow: (...a: unknown[]) => mockUploadSow(...a),
  fetchSuggestions: jest.fn().mockResolvedValue({ services: ['Limpieza general'], addons: [], discounts: [] }),
}));
jest.mock('@/lib/leadsApi', () => ({
  fetchLead: jest.fn().mockResolvedValue({
    ok: true,
    data: { id: 'l1', company: 'Gulf Coast Dental', language: 'es', sites: [{ id: 's1', name: 'Sede norte', address: '100 Main St', scheduled: null }] },
  }),
}));
const mockChoosePdf = jest.fn();
jest.mock('@/lib/termsApi', () => ({ choosePdf: (...a: unknown[]) => mockChoosePdf(...a) }));

let mockSavedSession: string | null = null;
const mockPortal = {
  state: jest.fn(),
  request: jest.fn(),
  verify: jest.fn(),
  quote: jest.fn(),
  file: jest.fn(),
  decide: jest.fn(),
};
jest.mock('@/lib/portalApi', () => ({
  portalState: (...a: unknown[]) => mockPortal.state(...a),
  requestCode: (...a: unknown[]) => mockPortal.request(...a),
  verifyCode: (...a: unknown[]) => mockPortal.verify(...a),
  fetchPortalQuote: (...a: unknown[]) => mockPortal.quote(...a),
  portalFileUrl: (...a: unknown[]) => mockPortal.file(...a),
  decide: (...a: unknown[]) => mockPortal.decide(...a),
  readPortalSession: () => mockSavedSession,
  savePortalSession: jest.fn(),
}));

import SiteQuoteScreen from '@/app/(app)/leads/[id]/quote/[siteId]';
import PortalScreen from '@/app/q/[token]';

const q = getQuoteStrings('es');
const p = getPortalStrings('es');

const version = (o: Record<string, unknown> = {}) => ({
  id: 'v1', version: '1.0', minor: 0, status: 'draft', lines: { services: [], addons: [], discounts: [] }, taxRate: 6, validDays: 30,
  totals: { subtotal: 0, discount: 0, tax: 0, total: 0 }, contactEmail: 'ana@x.com', recipients: [], hasSow: false, sowPath: null,
  pdfPath: null, sentAt: null, sentBy: null, expiresAt: null, viewedAt: null, decidedAt: null, decision: null, ...o,
});
const siteQuote = (versions: unknown[]) => ({ ok: true, data: { quoteId: 'q1', walkthroughClosed: true, versions, frequency: null, address: '100 Main St' } });

beforeEach(() => {
  jest.clearAllMocks();
  mockAccess = { isSuperAdmin: true, permissions: new Set() };
  mockParams = { id: 'l1', siteId: 's1' };
  mockFetchSiteQuote.mockResolvedValue(siteQuote([version()]));
  mockSave.mockResolvedValue({ ok: true, data: null });
  mockSend.mockResolvedValue({ ok: true, data: { sent: 2, failed: 0 } });
});

describe('Quote en la app (D-077, D-208, D-209)', () => {
  test('sin quote y con el walkthrough cerrado, quien arma lo crea al entrar (borrador 1.0)', async () => {
    mockFetchSiteQuote
      .mockResolvedValueOnce({ ok: true, data: { quoteId: null, walkthroughClosed: true, versions: [], frequency: null, address: null } })
      .mockResolvedValue(siteQuote([version()]));
    mockEnsure.mockResolvedValue({ ok: true, data: 'q1' });
    await render(<SiteQuoteScreen />);
    await waitFor(() => expect(mockEnsure).toHaveBeenCalledWith('s1'));
    expect(await screen.findByText(q.version('1.0'))).toBeTruthy();
    expect(screen.getByText(q.status.draft)).toBeTruthy();
  });

  test('armado: agregar un servicio (también desde Usados antes), Gravable y totales en vivo', async () => {
    await render(<SiteQuoteScreen />);
    await fireEvent.press(await screen.findByText('Limpieza general'));
    await fireEvent.changeText(screen.getAllByLabelText(q.amount)[0], '1,000');
    expect(screen.getByText('$1,060.00')).toBeTruthy(); // 6% gravable
    await fireEvent.press(screen.getByLabelText(`${q.taxable} · Limpieza general`));
    expect(screen.getAllByText('$1,000.00').length).toBeGreaterThan(0);
  });

  test('D-251: cada servicio tiene Descripción opcional de hasta 200 caracteres', async () => {
    await render(<SiteQuoteScreen />);
    await fireEvent.press(await screen.findByText('Limpieza general'));
    const field = screen.getByLabelText(q.lineDescription);
    expect(field.props.maxLength).toBe(200);
    await fireEvent.changeText(field, 'Pisos, baños y cocina');
    expect(screen.getByDisplayValue('Pisos, baños y cocina')).toBeTruthy();
  });

  test('Enviar sin SOW no llama al servidor y lo dice', async () => {
    mockFetchSiteQuote.mockResolvedValue(siteQuote([version({ lines: { services: [{ label: 'A', amount: 10, taxable: true }], addons: [], discounts: [] } })]));
    await render(<SiteQuoteScreen />);
    await fireEvent.press(await screen.findByText(q.send));
    expect(screen.getByText(q.sowRequired)).toBeTruthy();
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('Enviar guarda el borrador y lo envía; avisa a cuántos correos', async () => {
    mockFetchSiteQuote.mockResolvedValue(
      siteQuote([version({ hasSow: true, sowPath: 'q1/v1/sow-a.pdf', recipients: ['b@x.com'], lines: { services: [{ label: 'A', amount: 10, taxable: true }], addons: [], discounts: [] } })]),
    );
    await render(<SiteQuoteScreen />);
    await fireEvent.press(await screen.findByText(q.send));
    await waitFor(() => expect(mockSend).toHaveBeenCalledWith('v1'));
    expect(mockSave).toHaveBeenCalledWith('v1', expect.objectContaining({ taxRate: 6, validDays: 30, recipients: ['b@x.com'] }));
    expect(await screen.findByText(q.sentOk(2))).toBeTruthy();
  });

  test('un correo opcional inválido no se agrega', async () => {
    await render(<SiteQuoteScreen />);
    await fireEvent.changeText(await screen.findByLabelText(q.extraEmail), 'no-es-correo');
    await fireEvent.press(screen.getByText(q.add));
    expect(screen.getByText(q.emailError)).toBeTruthy();
  });

  test('enviado: estado, decisión del cliente, PDF y versión nueva; sin borrador no hay Guardar ni Enviar', async () => {
    mockFetchSiteQuote.mockResolvedValue(
      siteQuote([
        version({
          status: 'changes_requested', sentAt: '2026-10-22T15:00:00Z', expiresAt: '2026-11-21T15:00:00Z', pdfPath: 'q1/v1/quote-1.0.pdf',
          decision: { kind: 'changes_requested', name: null, title: null, reasonEs: 'Precio', reasonEn: 'Price', note: 'Menos días', at: '2026-10-23T15:00:00Z', email: 'ana@x.com' },
        }),
      ]),
    );
    await render(<SiteQuoteScreen />);
    expect((await screen.findAllByText(q.status.changes_requested)).length).toBe(2); // ficha y decisión
    expect(screen.getByText(q.rejectedReason('Precio'))).toBeTruthy();
    expect(screen.getByText(q.note('Menos días'))).toBeTruthy();
    expect(screen.queryByText(q.send)).toBeNull();
    await fireEvent.press(screen.getByText(q.viewPdf));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/viewer', params: { source: 'quote-file', path: 'q1/v1/quote-1.0.pdf', title: q.version('1.0') } });
    mockNewVersion.mockResolvedValue({ ok: true, data: 'v2' });
    await fireEvent.press(screen.getByText(q.newVersion));
    await waitFor(() => expect(mockNewVersion).toHaveBeenCalledWith('q1'));
  });

  test('solo con quotes_ver: sin montos, sin armado y sin crear el quote', async () => {
    mockAccess = { isSuperAdmin: false, permissions: new Set(['quotes_ver']) };
    mockFetchSiteQuote.mockResolvedValue(siteQuote([version({ status: 'sent', totals: null })]));
    await render(<SiteQuoteScreen />);
    expect(await screen.findByText(q.noPrices)).toBeTruthy();
    expect(screen.queryByText(q.saveDraft)).toBeNull();
    expect(mockEnsure).not.toHaveBeenCalled();
  });

  test('sin permisos de quotes no se muestra', async () => {
    mockAccess = { isSuperAdmin: false, permissions: new Set(['leads_ver']) };
    await render(<SiteQuoteScreen />);
    expect(screen.getByText('REDIRECT /')).toBeTruthy();
  });
});

const portalQuote = (o: Record<string, unknown> = {}) => ({
  status: 'viewed', version: '1.0', language: 'es', company: 'Gulf Coast Dental', site: 'Sede norte', address: '100 Main St',
  frequency: { kind: 'weekly', days: [0, 2, 4], other: '' },
  lines: { services: [{ label: 'Limpieza regular', amount: 1850, taxable: true }], addons: [], discounts: [] },
  tax_rate: 6, subtotal: 1850, discount: 0, tax: 111, total: 1961, sent_at: '2026-10-20T15:00:00Z', expires_at: '2026-11-19T15:00:00Z',
  sow_opened: false, terms_version: null, reasons: [{ id: 'r1', label: 'Precio' }, { id: 'r2', label: 'Otro' }], decision: null, ...o,
});

describe('Portal del cliente (D-041 a D-047, D-094, D-095, D-209)', () => {
  beforeEach(() => {
    mockParams = { token: 'tok_abcdefghijklmnopqrstuvwxyz' };
    mockPortal.state.mockResolvedValue({ ok: true, data: { state: 'open', language: 'es' } });
    mockPortal.request.mockResolvedValue({ ok: true, data: { ok: true } });
    mockPortal.verify.mockResolvedValue({ ok: true, data: { session: 'ses' } });
    mockPortal.quote.mockResolvedValue({ ok: true, data: portalQuote() });
    mockPortal.file.mockResolvedValue({ ok: true, data: { url: 'https://x/sow.pdf' } });
    mockPortal.decide.mockResolvedValue({ ok: true, data: { kind: 'accepted' } });
  });

  async function enter() {
    await render(<PortalScreen />);
    await fireEvent.changeText(await screen.findByLabelText(p.email), 'ana@x.com');
    await fireEvent.press(screen.getByText(p.sendCode));
    await fireEvent.changeText(await screen.findByTestId('code-input'), '123456');
    await screen.findByText(p.yourQuote);
  }

  test('en el idioma del lead: correo, código de 6 dígitos y la cotización con la cuota grande y el desglose', async () => {
    await enter();
    expect(mockPortal.request).toHaveBeenCalledWith('tok_abcdefghijklmnopqrstuvwxyz', 'ana@x.com');
    expect(mockPortal.verify).toHaveBeenCalledWith('tok_abcdefghijklmnopqrstuvwxyz', 'ana@x.com', '123456');
    expect(screen.getByText(p.monthly)).toBeTruthy();
    expect(screen.getAllByText('$1,850.00').length).toBeGreaterThan(0);
    expect(screen.getByText(p.tax('6'))).toBeTruthy();
    expect(screen.getByText('$1,961.00')).toBeTruthy();
    expect(screen.getByText('Semanal: Lun, Mié, Vie · 3 veces por semana')).toBeTruthy();
  });

  test('D-251: la descripción de la línea sale debajo del nombre en el portal', async () => {
    mockPortal.quote.mockResolvedValue({
      ok: true,
      data: portalQuote({ lines: { services: [{ label: 'Limpieza regular', description: 'Oficinas y baños', amount: 1850, taxable: true }], addons: [], discounts: [] } }),
    });
    await enter();
    expect(screen.getByText('Oficinas y baños')).toBeTruthy();
  });

  test('correo inválido: no pide código', async () => {
    await render(<PortalScreen />);
    await fireEvent.changeText(await screen.findByLabelText(p.email), 'no');
    await fireEvent.press(screen.getByText(p.sendCode));
    expect(screen.getByText(p.invalidEmail)).toBeTruthy();
    expect(mockPortal.request).not.toHaveBeenCalled();
  });

  test('código bloqueado tras los intentos: lo dice', async () => {
    mockPortal.verify.mockResolvedValue({ ok: false, reason: 'locked' });
    await render(<PortalScreen />);
    await fireEvent.changeText(await screen.findByLabelText(p.email), 'ana@x.com');
    await fireEvent.press(screen.getByText(p.sendCode));
    await fireEvent.changeText(await screen.findByTestId('code-input'), '000000');
    expect(await screen.findByText(p.locked)).toBeTruthy();
  });

  test('Aceptar y Más opciones bloqueados hasta abrir el SOW (D-042, D-220 b)', async () => {
    await enter();
    expect(screen.getByText(p.sowLocked)).toBeTruthy();
    expect(screen.getByLabelText(p.moreOptions, { includeHiddenElements: true }).props.accessibilityState).toEqual({ disabled: true });
    // El botón Aceptar va deshabilitado con candado (sin onPress) hasta abrir el SOW.
    expect(screen.getByText(p.accept).parent?.props.accessibilityState).toEqual({ disabled: true });
    expect(screen.queryByText(p.negotiateHint)).toBeNull();
    mockPortal.quote.mockResolvedValue({ ok: true, data: portalQuote({ sow_opened: true }) });
    await fireEvent.press(screen.getByText(p.readSow));
    await waitFor(() => expect(mockPortal.file).toHaveBeenCalledWith('ses', 'sow'));
    await waitFor(() => expect(screen.queryByText(p.sowLocked)).toBeNull());
  });

  test('aceptar: nombre, cargo y casilla de lectura (D-045, D-095); pantalla final con resumen (D-047)', async () => {
    mockPortal.quote.mockResolvedValue({ ok: true, data: portalQuote({ sow_opened: true }) });
    await enter();
    // D-220 b: Aceptar va en la misma pantalla del quote, sin Continuar.
    expect(screen.queryByText(p.continue)).toBeNull();
    await fireEvent.press(screen.getByText(p.accept));
    await fireEvent.press(screen.getAllByText(p.accept).slice(-1)[0]);
    expect(screen.getByText(p.needNameTitle)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText(p.fullName), 'Ana Rivera');
    await fireEvent.changeText(screen.getByLabelText(p.jobTitle), 'Gerente de oficina');
    // Sin términos publicados, la casilla menciona solo el SOW (D-209).
    await fireEvent.press(screen.getByText(p.confirmReadSowOnly));
    mockPortal.quote.mockResolvedValue({ ok: true, data: portalQuote({ sow_opened: true, status: 'accepted', decision: { kind: 'accepted', name: 'Ana Rivera', at: '2026-10-20T20:30:00Z' } }) });
    await fireEvent.press(screen.getAllByText(p.accept).slice(-1)[0]);
    await waitFor(() => expect(mockPortal.decide).toHaveBeenCalledWith('ses', { kind: 'accepted', name: 'Ana Rivera', title: 'Gerente de oficina', read_confirmed: true }));
    expect(await screen.findByText(p.acceptedTitle)).toBeTruthy();
    expect(screen.getByText('Ana Rivera')).toBeTruthy();
  });

  test('Más opciones: Negociar y Rechazar con su explicación (D-094); rechazar pide motivo', async () => {
    mockPortal.quote.mockResolvedValue({ ok: true, data: portalQuote({ sow_opened: true }) });
    mockPortal.decide.mockResolvedValue({ ok: true, data: { kind: 'rejected' } });
    await enter();
    await fireEvent.press(screen.getByLabelText(p.moreOptions));
    expect(screen.getByText(p.negotiateHint)).toBeTruthy();
    expect(screen.getByText(p.rejectHint)).toBeTruthy();
    await fireEvent.press(screen.getByText(p.reject));
    await fireEvent.press(screen.getByText(p.submit));
    expect(screen.getByText(p.needReason)).toBeTruthy();
    await fireEvent.press(screen.getByText('Precio'));
    await fireEvent.changeText(screen.getByLabelText(p.noteOptional), 'Muy caro');
    await fireEvent.press(screen.getByText(p.submit));
    await waitFor(() => expect(mockPortal.decide).toHaveBeenCalledWith('ses', { kind: 'rejected', reason_id: 'r1', note: 'Muy caro' }));
    expect(await screen.findByText(p.rejectedTitle)).toBeTruthy();
  });

  test('D-220 d: si la respuesta de aceptar se pierde pero quedó aceptado, igual muestra la pantalla final', async () => {
    mockPortal.quote.mockResolvedValue({ ok: true, data: portalQuote({ sow_opened: true }) });
    await enter();
    await fireEvent.press(screen.getByText(p.accept));
    await fireEvent.changeText(screen.getByLabelText(p.fullName), 'Ana Rivera');
    await fireEvent.changeText(screen.getByLabelText(p.jobTitle), 'Gerente');
    await fireEvent.press(screen.getByText(p.confirmReadSowOnly));
    mockPortal.decide.mockResolvedValue({ ok: false, reason: 'network' });
    mockPortal.quote.mockResolvedValue({ ok: true, data: portalQuote({ sow_opened: true, status: 'accepted', decision: { kind: 'accepted', name: 'Ana Rivera', at: '2026-10-20T20:30:00Z' } }) });
    await fireEvent.press(screen.getAllByText(p.accept).slice(-1)[0]);
    expect(await screen.findByText(p.acceptedTitle)).toBeTruthy();
    expect(screen.queryByText(p.network)).toBeNull();
  });

  test('D-220 d: al volver a abrir el enlace ya aceptado en el mismo navegador, la pantalla final (D-047)', async () => {
    mockSavedSession = 'ses';
    mockPortal.state.mockResolvedValue({ ok: true, data: { state: 'decided', language: 'es' } });
    mockPortal.quote.mockResolvedValue({ ok: true, data: portalQuote({ sow_opened: true, status: 'accepted', decision: { kind: 'accepted', name: 'Ana Rivera', at: '2026-10-20T20:30:00Z' } }) });
    await render(<PortalScreen />);
    expect(await screen.findByText(p.acceptedTitle)).toBeTruthy();
    expect(screen.queryByText(p.decidedTitle)).toBeNull();
    mockSavedSession = null;
  });

  test('estados cerrados: vencido, reemplazado, cambios pedidos y enlace no válido', async () => {
    for (const [state, title] of [
      ['expired', p.expiredTitle],
      ['superseded', p.supersededTitle],
      ['changes_requested', p.changesTitle],
      ['decided', p.decidedTitle],
      ['not_found', p.notFoundTitle],
    ] as const) {
      mockPortal.state.mockResolvedValue({ ok: true, data: { state, language: 'es' } });
      const { unmount } = await render(<PortalScreen />);
      expect(await screen.findByText(title)).toBeTruthy();
      expect(screen.queryByLabelText(p.email)).toBeNull();
      await unmount();
    }
  });

  test('en inglés si el lead está en inglés', async () => {
    mockPortal.state.mockResolvedValue({ ok: true, data: { state: 'open', language: 'en' } });
    await render(<PortalScreen />);
    expect(await screen.findByText(getPortalStrings('en').emailTitle)).toBeTruthy();
  });
});
