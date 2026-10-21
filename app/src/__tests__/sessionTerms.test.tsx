import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Text, Pressable } from 'react-native';

// Proveedor de sesión real con la comprobación simulada: sin red al abrir la app no se entra (D-179).
const mockCheckSession = jest.fn();
jest.mock('@/lib/sessionStore', () => ({
  checkSession: (...a: unknown[]) => mockCheckSession(...a),
  endSession: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: jest.fn() } } }) },
    rpc: jest.fn(),
  },
}));
jest.mock('@/i18n/languageStore', () => ({
  readRememberedLanguage: jest.fn().mockResolvedValue(null),
  rememberLanguage: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'es' }] }));

import { RECHECK_MS, SessionProvider, useSession } from '@/lib/session';

const profile = { id: 'p1', fullName: 'Ana', email: 'ana@correo.com', role: 'employee', isSuperAdmin: false, language: 'es' };
const inWith = (terms: 'enter' | 'accept' | 'offline', withProfile = true, verified = true) => ({
  status: 'in' as const,
  profile: withProfile ? profile : null,
  permissions: withProfile ? [] : null,
  terms,
  verified,
});

function Probe() {
  const { status, termsPending, termsOffline, refresh } = useSession();
  return (
    <>
      <Text testID="estado">{`${status}|pending=${termsPending}|offline=${termsOffline}`}</Text>
      <Pressable accessibilityRole="button" onPress={() => void refresh()}>
        <Text>reintentar</Text>
      </Pressable>
    </>
  );
}

const advance = (ms: number) => act(async () => { await jest.advanceTimersByTimeAsync(ms); });
const estado = () => screen.getByTestId('estado').props.children as string;

beforeEach(() => mockCheckSession.mockReset());

describe('sesión: términos sin conexión (D-179, D-197)', () => {
  test('al abrir la app sin conexión para revisar los términos queda bloqueado (offline)', async () => {
    mockCheckSession.mockResolvedValue(inWith('offline'));
    await render(<SessionProvider><Probe /></SessionProvider>);
    expect(estado()).toBe('in|pending=false|offline=true');
  });

  test('sin poder ni leer el perfil y sin saber que es Super Admin también queda bloqueado', async () => {
    mockCheckSession.mockResolvedValue(inWith('offline', false));
    await render(<SessionProvider><Probe /></SessionProvider>);
    expect(estado()).toBe('in|pending=false|offline=true');
  });

  test('al volver la conexión y reintentar entra', async () => {
    mockCheckSession.mockResolvedValue(inWith('offline'));
    await render(<SessionProvider><Probe /></SessionProvider>);
    mockCheckSession.mockResolvedValue(inWith('enter'));
    await fireEvent.press(screen.getByText('reintentar'));
    expect(estado()).toBe('in|pending=false|offline=false');
  });

  test('al volver la conexión con una versión sin aceptar pasa a la pantalla de aceptar', async () => {
    mockCheckSession.mockResolvedValue(inWith('offline'));
    await render(<SessionProvider><Probe /></SessionProvider>);
    mockCheckSession.mockResolvedValue(inWith('accept'));
    await fireEvent.press(screen.getByText('reintentar'));
    expect(estado()).toBe('in|pending=true|offline=false');
  });

  test('quien ya entró no es expulsado si una comprobación posterior falla por falta de red', async () => {
    mockCheckSession.mockResolvedValue(inWith('enter'));
    await render(<SessionProvider><Probe /></SessionProvider>);
    expect(estado()).toBe('in|pending=false|offline=false');
    mockCheckSession.mockResolvedValue(inWith('offline'));
    await fireEvent.press(screen.getByText('reintentar'));
    expect(estado()).toBe('in|pending=false|offline=false');
  });

  test('el Super Admin (o quien no debe aceptar) nunca ve el bloqueo', async () => {
    mockCheckSession.mockResolvedValue(inWith('enter'));
    await render(<SessionProvider><Probe /></SessionProvider>);
    expect(estado()).toContain('offline=false');
  });

  test('al cerrarse la sesión se olvida lo sabido: la siguiente apertura sin red bloquea', async () => {
    mockCheckSession.mockResolvedValue(inWith('enter'));
    await render(<SessionProvider><Probe /></SessionProvider>);
    mockCheckSession.mockResolvedValue({ status: 'out', ended: false });
    await fireEvent.press(screen.getByText('reintentar'));
    expect(estado()).toBe('out|pending=false|offline=false');
    mockCheckSession.mockResolvedValue(inWith('offline'));
    await fireEvent.press(screen.getByText('reintentar'));
    expect(estado()).toBe('in|pending=false|offline=true');
  });
});


describe('sesión: entró sin internet y vuelve la conexión (D-197)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('quien ya había aceptado entra sin internet y la app vuelve a comprobar sola; si hay versión nueva, se la pide', async () => {
    mockCheckSession.mockResolvedValue(inWith('enter', false, false));
    await render(<SessionProvider><Probe /></SessionProvider>);
    expect(estado()).toBe('in|pending=false|offline=false');
    expect(mockCheckSession).toHaveBeenCalledTimes(1);
    // Sigue sin conexión: reintenta y sigue dentro, sin sacar a nadie.
    await advance(RECHECK_MS);
    expect(mockCheckSession).toHaveBeenCalledTimes(2);
    expect(estado()).toBe('in|pending=false|offline=false');
    // Vuelve la conexión y hay una versión nueva: ahora se la pide.
    mockCheckSession.mockResolvedValue(inWith('accept'));
    await advance(RECHECK_MS);
    expect(estado()).toBe('in|pending=true|offline=false');
  });

  test('con la comprobación hecha con el servidor deja de reintentar solo', async () => {
    mockCheckSession.mockResolvedValue(inWith('enter', false, false));
    await render(<SessionProvider><Probe /></SessionProvider>);
    mockCheckSession.mockResolvedValue(inWith('enter'));
    await advance(RECHECK_MS);
    const calls = mockCheckSession.mock.calls.length;
    await advance(RECHECK_MS * 3);
    expect(mockCheckSession).toHaveBeenCalledTimes(calls);
  });

  test('quien nunca aceptó ve la pantalla de conexión y entra solo cuando vuelve la conexión', async () => {
    mockCheckSession.mockResolvedValue(inWith('offline', false, false));
    await render(<SessionProvider><Probe /></SessionProvider>);
    expect(estado()).toBe('in|pending=false|offline=true');
    mockCheckSession.mockResolvedValue(inWith('enter'));
    await advance(RECHECK_MS);
    expect(estado()).toBe('in|pending=false|offline=false');
  });

  test('con la sesión comprobada en línea no hay reintentos periódicos', async () => {
    mockCheckSession.mockResolvedValue(inWith('enter'));
    await render(<SessionProvider><Probe /></SessionProvider>);
    await advance(RECHECK_MS * 3);
    expect(mockCheckSession).toHaveBeenCalledTimes(1);
  });
});
