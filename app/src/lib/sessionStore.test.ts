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


// --- Sin internet (D-197): entra quien ya aceptó la versión vigente que conoce el teléfono ---------------------

describe('sin internet (D-197)', () => {
  const offlineProfile = { data: null, error: { message: 'Network request failed' } };

  beforeEach(async () => {
    await signedIn();
    mockTables.profile_permissions = ok([]);
  });

  async function openedOnlineAccepting(version = 'v1') {
    mockMaybeSingle.mockResolvedValue(profileRow(true));
    mockTables.terms_documents = ok([{ id: version }]);
    mockTables.terms_acceptances = ok([{ document_id: version }]);
    expect(await checkSession()).toMatchObject({ status: 'in', terms: 'enter', verified: true });
  }

  function networkDown() {
    mockMaybeSingle.mockResolvedValue(offlineProfile);
    mockTables.terms_documents = failing;
    mockTables.terms_acceptances = failing;
    mockTables.profile_permissions = failing;
  }

  test('nunca aceptó: sin internet no entra y ve la pantalla de conexión', async () => {
    mockMaybeSingle.mockResolvedValue(profileRow(true));
    mockTables.terms_documents = ok([{ id: 'v1' }]);
    mockTables.terms_acceptances = ok([]);
    expect(await checkSession()).toMatchObject({ terms: 'accept' }); // con conexión se le pide aceptar
    networkDown();
    expect(await checkSession()).toMatchObject({ status: 'in', profile: null, terms: 'offline', verified: false });
  });

  test('ya aceptó la versión vigente: sin internet entra, también si solo fallan los términos', async () => {
    await openedOnlineAccepting();
    networkDown();
    expect(await checkSession()).toMatchObject({ status: 'in', profile: null, terms: 'enter', verified: false });
    // El perfil sí se lee pero la consulta de los términos falla: igual entra por lo que sabe el teléfono.
    mockMaybeSingle.mockResolvedValue(profileRow(true));
    mockTables.profile_permissions = ok([]);
    expect(await checkSession()).toMatchObject({ status: 'in', terms: 'enter', verified: false });
  });

  test('sin internet con excepciones de red en lugar de errores: igual entra', async () => {
    await openedOnlineAccepting();
    mockMaybeSingle.mockResolvedValue(profileRow(true));
    mockTables.terms_documents = throwing;
    expect(await checkSession()).toMatchObject({ status: 'in', terms: 'enter', verified: false });
  });

  test('versión nueva: con conexión se le pide aceptar; si vuelve a caerse la red ya no entra (no aceptó la vigente)', async () => {
    await openedOnlineAccepting('v1');
    networkDown();
    expect(await checkSession()).toMatchObject({ terms: 'enter', verified: false }); // la v2 aún no se conoce
    // Vuelve la conexión: ya hay una versión 2 y no la ha aceptado.
    mockMaybeSingle.mockResolvedValue(profileRow(true));
    mockTables.profile_permissions = ok([]);
    mockTables.terms_documents = ok([{ id: 'v2' }]);
    mockTables.terms_acceptances = ok([]);
    expect(await checkSession()).toMatchObject({ status: 'in', terms: 'accept', verified: true });
    networkDown();
    expect(await checkSession()).toMatchObject({ terms: 'offline' });
  });

  test('al aceptar la versión nueva, sin internet vuelve a entrar', async () => {
    await openedOnlineAccepting('v1');
    await openedOnlineAccepting('v2');
    networkDown();
    expect(await checkSession()).toMatchObject({ terms: 'enter', verified: false });
  });

  test('Super Admin: entra sin internet, ya lo sepa por el perfil o por lo guardado', async () => {
    mockMaybeSingle.mockResolvedValue(superRow);
    expect(await checkSession()).toMatchObject({ terms: 'enter', verified: true });
    networkDown();
    expect(await checkSession()).toMatchObject({ status: 'in', profile: null, terms: 'enter', verified: false });
  });

  test('cuenta desconocida: lo que el teléfono sabe de otra cuenta no vale', async () => {
    await openedOnlineAccepting();
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u2' } } } });
    networkDown();
    expect(await checkSession()).toMatchObject({ status: 'in', profile: null, terms: 'offline', verified: false });
  });

  test('cuenta desconocida: sin nada guardado no entra', async () => {
    networkDown();
    expect(await checkSession()).toMatchObject({ terms: 'offline', verified: false });
  });

  test('al cerrar la sesión se olvida la versión aceptada: la siguiente vez sin internet bloquea', async () => {
    await openedOnlineAccepting();
    await endSession();
    await signedIn();
    networkDown();
    expect(await checkSession()).toMatchObject({ terms: 'offline' });
    expect(Object.keys(mockStorage).filter((k) => k.includes('account-memory') || k.includes('hint'))).toEqual([]);
  });

  test('una cuenta que cambia de versión aceptada la actualiza y no mezcla con la de otra persona', async () => {
    await openedOnlineAccepting('v1');
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u2' } } } });
    mockMaybeSingle.mockResolvedValue(profileRow(true));
    mockTables.terms_documents = ok([{ id: 'v1' }]);
    mockTables.terms_acceptances = ok([]); // la segunda persona no aceptó
    await checkSession();
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    networkDown();
    // La memoria quedó con la segunda cuenta: la primera ya no se conoce.
    expect(await checkSession()).toMatchObject({ terms: 'offline' });
  });

  test('el dato de Super Admin que dejaron las versiones 1.1.x se sigue leyendo y se cambia al registro nuevo', async () => {
    mockStorage['cidclean-super-admin-hint'] = JSON.stringify({ userId: 'u1', isSuperAdmin: true });
    networkDown();
    expect(await checkSession()).toMatchObject({ profile: null, terms: 'enter' });
    mockMaybeSingle.mockResolvedValue(superRow);
    await checkSession();
    expect(mockStorage['cidclean-super-admin-hint']).toBeUndefined();
    expect(JSON.parse(mockStorage['cidclean-account-memory'])).toMatchObject({ userId: 'u1', isSuperAdmin: true });
  });
});
