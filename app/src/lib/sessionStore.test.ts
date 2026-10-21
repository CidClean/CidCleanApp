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
jest.mock('./supabase', () => ({
  AUTH_STORAGE_KEY: 'cidclean-auth',
  supabase: {
    auth: { getSession: (...a: unknown[]) => mockGetSession(...a), signOut: (...a: unknown[]) => mockSignOut(...a) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => mockMaybeSingle() }) }) }),
  },
}));

import { checkSession, saveSessionStart } from './sessionStore';

const profileRow = (active: boolean) => ({
  data: { id: 'p1', full_name: 'Ana', email: 'ana@correo.com', role: 'employee', is_super_admin: false, active, language: 'en' },
  error: null,
});

beforeEach(() => {
  mockGetSession.mockReset();
  mockSignOut.mockReset().mockResolvedValue({ error: null });
  mockMaybeSingle.mockReset();
  for (const k of Object.keys(mockStorage)) delete mockStorage[k];
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
