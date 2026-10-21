const mockGetSession = jest.fn();
const mockSignOut = jest.fn();
const mockMaybeSingle = jest.fn();
const mockStorage: Record<string, string> = {};

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async (k: string) => mockStorage[k] ?? null,
    setItem: async (k: string, v: string) => void (mockStorage[k] = v),
    removeItem: async (k: string) => void delete mockStorage[k],
  },
}));
// Cada tabla responde con lo que diga `mockTables[tabla]` (una función que devuelve { data, error } o lanza).
const mockTables: Record<string, () => Promise<{ data: unknown; error: unknown }>> = {};
jest.mock('./supabase', () => ({
  AUTH_STORAGE_KEY: 'cidclean-auth',
  supabase: {
    auth: { getSession: (...a: unknown[]) => mockGetSession(...a), signOut: (...a: unknown[]) => mockSignOut(...a) },
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'order', 'limit']) chain[m] = () => chain;
      chain.maybeSingle = () => (table === 'profiles' ? mockMaybeSingle() : mockTables[table]());
      chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => mockTables[table]().then(resolve, reject);
      return chain;
    },
  },
}));

import { checkSession, endSession, saveSessionStart } from './sessionStore';

const profileRow = (active: boolean) => ({
  data: { id: 'p1', full_name: 'Ana', email: 'ana@correo.com', role: 'employee', is_super_admin: false, active, language: 'en' },
  error: null,
});

beforeEach(() => {
  mockGetSession.mockReset();
  mockSignOut.mockReset().mockResolvedValue({ error: null });
  mockMaybeSingle.mockReset();
  for (const k of Object.keys(mockStorage)) delete mockStorage[k];
  for (const k of Object.keys(mockTables)) delete mockTables[k];
});

describe('persona desactivada (D-146)', () => {
  test('con la sesión abierta, si su perfil pasó a inactivo la app cierra la sesión y avisa que terminó', async () => {
    await saveSessionStart(Date.now());
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    mockMaybeSingle.mockResolvedValue(profileRow(false));
    expect(await checkSession()).toEqual({ status: 'out', ended: true });
    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  test('con el perfil activo la sesión sigue', async () => {
    await saveSessionStart(Date.now());
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    mockMaybeSingle.mockResolvedValue(profileRow(true));
    const result = await checkSession();
    expect(result.status).toBe('in');
    expect(mockSignOut).not.toHaveBeenCalled();
  });
});


// --- Términos del staff: quién debe aceptar y qué pasa sin conexión (D-168, D-176, D-179) ---------------------

const superRow = {
  data: { id: 'p0', full_name: 'Carla', email: 'carla@correo.com', role: 'admin', is_super_admin: true, active: true, language: 'es' },
  error: null,
};
const ok = (data: unknown) => async () => ({ data, error: null });
const failing = async () => ({ data: null, error: { message: 'TypeError: Network request failed' } });
const throwing = async () => {
  throw new TypeError('Network request failed');
};

async function signedIn() {
  await saveSessionStart(Date.now());
  mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
}

describe('términos del staff al entrar', () => {
  beforeEach(async () => {
    await signedIn();
    mockTables.profile_permissions = ok([]);
  });

  test('sin versión publicada no se pide aceptar nada', async () => {
    mockMaybeSingle.mockResolvedValue(profileRow(true));
    mockTables.terms_documents = ok([]);
    expect(await checkSession()).toMatchObject({ status: 'in', terms: 'enter' });
  });

  test('con versión publicada sin aceptar se pide aceptar', async () => {
    mockMaybeSingle.mockResolvedValue(profileRow(true));
    mockTables.terms_documents = ok([{ id: 'v1' }]);
    mockTables.terms_acceptances = ok([]);
    expect(await checkSession()).toMatchObject({ status: 'in', terms: 'accept' });
  });

  test('con la versión vigente aceptada se entra', async () => {
    mockMaybeSingle.mockResolvedValue(profileRow(true));
    mockTables.terms_documents = ok([{ id: 'v1' }]);
    mockTables.terms_acceptances = ok([{ document_id: 'v1' }]);
    expect(await checkSession()).toMatchObject({ status: 'in', terms: 'enter' });
  });

  test('red caída al consultar la versión: no se entra (ya no se deja pasar)', async () => {
    mockMaybeSingle.mockResolvedValue(profileRow(true));
    mockTables.terms_documents = failing;
    expect(await checkSession()).toMatchObject({ status: 'in', terms: 'offline' });
  });

  test('red caída con la consulta lanzando una excepción: no se entra', async () => {
    mockMaybeSingle.mockResolvedValue(profileRow(true));
    mockTables.terms_documents = throwing;
    expect(await checkSession()).toMatchObject({ status: 'in', terms: 'offline' });
  });

  test('red caída al consultar las aceptaciones: no se entra', async () => {
    mockMaybeSingle.mockResolvedValue(profileRow(true));
    mockTables.terms_documents = ok([{ id: 'v1' }]);
    mockTables.terms_acceptances = failing;
    expect(await checkSession()).toMatchObject({ status: 'in', terms: 'offline' });
  });

  test('sin red ni para leer el perfil: quien no se sabe que es Super Admin no entra', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: 'Network request failed' } });
    mockTables.terms_documents = failing;
    expect(await checkSession()).toMatchObject({ status: 'in', profile: null, terms: 'offline' });
  });

  test('el Super Admin entra aunque la red esté caída y ni consulta los términos', async () => {
    mockMaybeSingle.mockResolvedValue(superRow);
    mockTables.terms_documents = throwing;
    expect(await checkSession()).toMatchObject({ status: 'in', terms: 'enter' });
  });

  test('el Super Admin entra sin red para leer su perfil si ya se sabía que lo era en esta cuenta', async () => {
    mockMaybeSingle.mockResolvedValue(superRow);
    await checkSession(); // con red: queda guardado que es Super Admin
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: 'Network request failed' } });
    mockTables.terms_documents = failing;
    expect(await checkSession()).toMatchObject({ status: 'in', profile: null, terms: 'enter' });
  });

  test('lo guardado de otra cuenta no vale: otra persona sin red no entra', async () => {
    mockMaybeSingle.mockResolvedValue(superRow);
    await checkSession();
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u2' } } } });
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: 'Network request failed' } });
    expect(await checkSession()).toMatchObject({ status: 'in', profile: null, terms: 'offline' });
  });

  test('al cerrar la sesión se olvida que era Super Admin', async () => {
    mockMaybeSingle.mockResolvedValue(superRow);
    await checkSession();
    await endSession();
    await signedIn();
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: 'Network request failed' } });
    expect(await checkSession()).toMatchObject({ status: 'in', profile: null, terms: 'offline' });
  });
});
