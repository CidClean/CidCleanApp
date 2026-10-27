import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { CERTIFICATION_EN, CERTIFICATION_ES_HELP, getW9AdminStrings, getW9PortalStrings } from '@/i18n/w9';

let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const mockApi = {
  status: jest.fn(),
  send: jest.fn(),
  resend: jest.fn(),
  state: jest.fn(),
  request: jest.fn(),
  verify: jest.fn(),
  data: jest.fn(),
  preview: jest.fn(),
  sign: jest.fn(),
  saveSession: jest.fn(),
};
jest.mock('@/lib/w9Api', () => ({
  fetchW9Status: (...a: unknown[]) => mockApi.status(...a),
  sendW9: (...a: unknown[]) => mockApi.send(...a),
  resendW9: (...a: unknown[]) => mockApi.resend(...a),
  w9State: (...a: unknown[]) => mockApi.state(...a),
  w9RequestCode: (...a: unknown[]) => mockApi.request(...a),
  w9VerifyCode: (...a: unknown[]) => mockApi.verify(...a),
  w9Data: (...a: unknown[]) => mockApi.data(...a),
  w9Preview: (...a: unknown[]) => mockApi.preview(...a),
  w9Sign: (...a: unknown[]) => mockApi.sign(...a),
  readW9Session: () => null,
  saveW9Session: (...a: unknown[]) => mockApi.saveSession(...a),
}));
const mockShowDone = jest.fn();
jest.mock('@/components/brand/DoneOverlay', () => ({ showDone: () => mockShowDone() }));

import { W9ProfileSection } from '@/components/w9/W9ProfileSection';
import W9PortalScreen from '@/app/w9/[token]';

const a = getW9AdminStrings('es');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Perfil 1099 → Documentos: W-9 por llenar (D-256)', () => {
  const section = (over: Record<string, unknown> = {}) => (
    <W9ProfileSection profileId="e1" fullName="Ana Ruiz" email="ana@correo.com" locale="es" currentW9DocumentId={null} {...over} />
  );

  test('botón "Enviar W-9 para llenar" abre la ventana con nombre y correo del perfil y Más opciones (D-258)', async () => {
    mockApi.status.mockResolvedValue({ ok: true, data: null });
    await render(section());
    await fireEvent.press(await screen.findByText(a.sendToFill));
    expect(screen.getByText(a.dialogTitle('Ana'))).toBeTruthy();
    expect(screen.getByLabelText(a.line1).props.value).toBe('Ana Ruiz');
    expect(screen.getByLabelText(a.sendTo).props.value).toBe('ana@correo.com');
    expect(screen.getByText('Individual/sole proprietor')).toBeTruthy();
    expect(screen.getByText(a.moreOptions)).toBeTruthy();
    await fireEvent.press(screen.getByText(a.moreOptions));
    expect(screen.getByText(a.line3b)).toBeTruthy();
    expect(screen.getByLabelText(a.exemptPayee)).toBeTruthy();
    expect(screen.getByLabelText(a.fatca)).toBeTruthy();
    expect(screen.getByLabelText(a.accounts)).toBeTruthy();
  });

  test('sin dirección no se envía; con los datos llama a send-w9 y dice a quién se envió', async () => {
    mockApi.status.mockResolvedValue({ ok: true, data: null });
    mockApi.send.mockResolvedValue({ ok: true, data: { id: 'r1', sent: true, expiresAt: '2026-11-03T12:00:00Z' } });
    await render(section());
    await fireEvent.press(await screen.findByText(a.sendToFill));
    await fireEvent.press(screen.getByText(a.send));
    expect(screen.getByText(a.needAddress)).toBeTruthy();
    expect(screen.getByText(a.needCity)).toBeTruthy();
    expect(mockApi.send).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText(a.line5), '1520 Golden Gate Pkwy');
    await fireEvent.changeText(screen.getByLabelText(a.line6), 'Naples, FL 34105');
    await fireEvent.press(screen.getByText(a.send));
    await waitFor(() => expect(mockApi.send).toHaveBeenCalled());
    expect(mockApi.send).toHaveBeenCalledWith(
      'e1',
      expect.objectContaining({ name: 'Ana Ruiz', classification: 'individual', address: '1520 Golden Gate Pkwy', city: 'Naples, FL 34105' }),
      'ana@correo.com',
    );
    expect(await screen.findByText(a.sentTo('ana@correo.com'))).toBeTruthy();
  });

  test('Enviado · vence {fecha} con Reenviar', async () => {
    mockApi.status.mockResolvedValue({
      ok: true,
      data: { id: 'r1', status: 'sent', email: 'ana@correo.com', sentAt: '2026-10-27T12:00:00Z', expiresAt: '2026-11-03T16:00:00Z', signedAt: null, documentId: null, changes: [] },
    });
    mockApi.resend.mockResolvedValue({ ok: true, data: { id: 'r1', sent: true, expiresAt: '2026-11-04T16:00:00Z' } });
    await render(section());
    expect(await screen.findByText(a.sentStatus('3 nov 2026'))).toBeTruthy();
    await fireEvent.press(screen.getByText(a.resend));
    await waitFor(() => expect(mockApi.resend).toHaveBeenCalledWith('r1'));
    expect(await screen.findByText(a.resent)).toBeTruthy();
  });

  test('firmado: "Cambió: …" si el empleado corrigió datos y es el W-9 vigente', async () => {
    mockApi.status.mockResolvedValue({
      ok: true,
      data: {
        id: 'r1', status: 'signed', email: 'ana@correo.com', sentAt: '2026-10-27T12:00:00Z', expiresAt: '2026-11-03T16:00:00Z',
        signedAt: '2026-10-28T12:00:00Z', documentId: 'd9',
        changes: [{ field: 'name', before: 'Ana Ruiz', after: 'Ana M. Ruiz' }, { field: 'address', before: 'a', after: 'b' }],
      },
    });
    const { rerender } = await render(section({ currentW9DocumentId: 'd9' }));
    expect(await screen.findByText(a.changed('nombre, dirección'))).toBeTruthy();
    expect(screen.queryByText(a.resend)).toBeNull();
    // Si después se subió otro W-9, la nota ya no aplica.
    await rerender(section({ currentW9DocumentId: 'otro' }));
    await waitFor(() => expect(screen.queryByText(a.changed('nombre, dirección'))).toBeNull());
  });
});

describe('Portal del W-9 (D-255, D-256, D-258)', () => {
  const p = getW9PortalStrings('es');
  const prefill = {
    name: 'Karina López', business: '', classification: 'individual', llc: '', other: '', foreign_partners: false,
    exempt_payee: '', fatca: '', address: '1520 Golden Gate Pkwy', city: 'Naples, FL 34105', accounts: '',
  };
  beforeEach(() => {
    mockParams = { token: 'tok_abcdefghijklmnopqrstuvwxyz' };
    mockApi.state.mockResolvedValue({ ok: true, data: { state: 'open', language: 'es' } });
    mockApi.request.mockResolvedValue({ ok: true, data: { ok: true } });
    mockApi.verify.mockResolvedValue({ ok: true, data: { session: 'ses_abcdefghijklmnopqrstuvwxyz' } });
    mockApi.data.mockResolvedValue({
      ok: true,
      data: { status: 'open', language: 'es', data: prefill, expires_at: '2026-11-03T16:00:00Z', signed_at: null, signer_name: null,
        requester: ['Cid Clean LLC'], form_version: 'Form W-9 (Rev. March 2024)' },
    });
    mockApi.sign.mockResolvedValue({ ok: true, data: { ok: true, signed_at: '2026-10-27T16:00:00Z' } });
  });

  async function enter() {
    await render(<W9PortalScreen />);
    await fireEvent.changeText(await screen.findByLabelText(p.email), 'karina@email.com');
    await fireEvent.press(screen.getByText(p.sendCode));
    await fireEvent.changeText(await screen.findByTestId('code-input'), '123456');
    await screen.findByText(p.yourW9);
  }

  test('en el idioma del perfil: correo, código y los datos prellenados con Editar, Más opciones y SSN/ITIN/EIN', async () => {
    await enter();
    expect(mockApi.request).toHaveBeenCalledWith('tok_abcdefghijklmnopqrstuvwxyz', 'karina@email.com');
    expect(mockApi.verify).toHaveBeenCalledWith('tok_abcdefghijklmnopqrstuvwxyz', 'karina@email.com', '123456');
    expect(screen.getByText('Karina López')).toBeTruthy();
    expect(screen.getByText('Individual/sole proprietor')).toBeTruthy();
    expect(screen.getByText('1520 Golden Gate Pkwy, Naples, FL 34105')).toBeTruthy();
    expect(screen.getAllByText(p.edit).length).toBe(4);
    expect(screen.getByText(getW9AdminStrings('es').moreOptions)).toBeTruthy();
    for (const s of [p.tinSsn, p.tinItin, p.tinEin]) expect(screen.getByText(s)).toBeTruthy();
    expect(screen.getByText(p.tinLock)).toBeTruthy();
  });

  test('corregir un dato en la ventana al centro', async () => {
    await enter();
    await fireEvent.press(screen.getByLabelText(`${p.edit} ${p.name}`));
    await fireEvent.changeText(screen.getByLabelText(getW9AdminStrings('es').line1), 'Karina M. López');
    await fireEvent.press(screen.getByText(p.save));
    expect(await screen.findByText('Karina M. López')).toBeTruthy();
  });

  test('número oculto mientras se escribe, el ojo lo muestra (D-259); uno no válido no deja seguir', async () => {
    await enter();
    const field = screen.getByLabelText(p.tinLabel.ssn);
    await fireEvent.changeText(field, '923456789');
    expect(screen.getByLabelText(p.tinLabel.ssn).props.secureTextEntry).toBe(true);
    await fireEvent.press(screen.getByLabelText(p.tinShow));
    expect(screen.getByLabelText(p.tinLabel.ssn).props.secureTextEntry).toBe(false);
    expect(screen.getByLabelText(p.tinLabel.ssn).props.value).toBe('923-45-6789');
    await fireEvent.press(screen.getByLabelText(p.tinHide));
    expect(screen.getByLabelText(p.tinLabel.ssn).props.secureTextEntry).toBe(true);
    await fireEvent.press(screen.getByText(p.continue));
    expect(screen.getByText(p.badTin.ssn)).toBeTruthy();
    expect(screen.queryByText(p.signTitle)).toBeNull();
  });

  test('firma: certificación en inglés con traducción de ayuda, nombre, casilla y "Firmar y enviar" con Listo', async () => {
    await enter();
    const field = screen.getByLabelText(p.tinLabel.ssn);
    await fireEvent(field, 'focus');
    await fireEvent.changeText(field, '123-45-6789');
    await fireEvent.press(screen.getByText(p.continue));
    expect(await screen.findByText(p.signTitle)).toBeTruthy();
    expect(screen.getByText(CERTIFICATION_EN[0])).toBeTruthy();
    await fireEvent.press(screen.getByText(p.readAll));
    expect(screen.getByText(CERTIFICATION_EN[5])).toBeTruthy();
    expect(screen.getByText(CERTIFICATION_ES_HELP[0])).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText(p.typeName), 'Karina López');
    await fireEvent.press(screen.getByText(p.signSubmit));
    expect(screen.getByText(p.needAgree)).toBeTruthy();
    expect(mockApi.sign).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText(p.agree));
    await fireEvent.press(screen.getByText(p.signSubmit));
    await waitFor(() => expect(mockApi.sign).toHaveBeenCalled());
    expect(mockApi.sign).toHaveBeenCalledWith('ses_abcdefghijklmnopqrstuvwxyz', expect.objectContaining({
      tinType: 'ssn', tin: '123456789', signerName: 'Karina López', agreed: true,
      data: expect.objectContaining({ name: 'Karina López' }),
    }));
    expect(await screen.findByText(p.doneTitle)).toBeTruthy();
    expect(mockShowDone).toHaveBeenCalled();
    // Lo único que se guarda en el navegador es la sesión, nunca el número.
    for (const call of mockApi.saveSession.mock.calls) expect(JSON.stringify(call)).not.toContain('123456789');
  });

  test.each([
    ['expired', p.expiredTitle],
    ['signed', p.signedTitle],
    ['replaced', p.replacedTitle],
    ['not_found', p.notFoundTitle],
  ] as const)('link %s', async (state, title) => {
    mockApi.state.mockResolvedValue({ ok: true, data: { state, language: 'es' } });
    await render(<W9PortalScreen />);
    expect(await screen.findByText(title)).toBeTruthy();
  });

  test('en inglés si el perfil está en inglés (textos de la muestra)', async () => {
    const en = getW9PortalStrings('en');
    mockApi.state.mockResolvedValue({ ok: true, data: { state: 'open', language: 'en' } });
    mockApi.data.mockResolvedValue({
      ok: true,
      data: { status: 'open', language: 'en', data: prefill, expires_at: '2026-11-03T16:00:00Z', signed_at: null, signer_name: null,
        requester: ['Cid Clean LLC'], form_version: 'Form W-9 (Rev. March 2024)' },
    });
    await render(<W9PortalScreen />);
    await fireEvent.changeText(await screen.findByLabelText(en.email), 'karina@email.com');
    await fireEvent.press(screen.getByText(en.sendCode));
    await fireEvent.changeText(await screen.findByTestId('code-input'), '123456');
    expect(await screen.findByText('Your W-9')).toBeTruthy();
    expect(screen.getByText('Only goes into your signed W-9. It is not saved in the app.')).toBeTruthy();
    expect(screen.getByText('Continue')).toBeTruthy();
  });
});
