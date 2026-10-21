import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Lo que el teléfono sabe de la cuenta con la sesión abierta, para poder entrar sin internet (D-179, D-197).
 * Un solo registro por cuenta, guardado en el teléfono y borrado al cerrar la sesión:
 *  - `isSuperAdmin`: el Super Admin no acepta términos y siempre entra;
 *  - `acceptedTermsId`: la versión vigente de los términos del staff que esta cuenta ya aceptó (la última que el
 *    teléfono pudo comprobar). Sin ella, o con otra cuenta, no se sabe y sin conexión no se entra.
 */
export type AccountMemory = {
  isSuperAdmin: boolean | null;
  acceptedTermsId: string | null;
};

const KEY = 'cidclean-account-memory';
/** Clave de las versiones 1.1.x, que solo guardaba si era Super Admin. Se lee para no perder el dato y se borra. */
const LEGACY_SUPER_ADMIN_KEY = 'cidclean-super-admin-hint';

const NOTHING: AccountMemory = { isSuperAdmin: null, acceptedTermsId: null };

type Stored = { userId?: string; isSuperAdmin?: boolean | null; acceptedTermsId?: string | null };

async function readStored(key: string): Promise<Stored | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw === null) return null;
    const value = JSON.parse(raw) as Stored;
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

/** Lo guardado de esta cuenta; de otra cuenta, o sin dato, no vale nada. */
export async function readAccountMemory(authUserId: string): Promise<AccountMemory> {
  const current = await readStored(KEY);
  if (current && current.userId === authUserId) {
    return {
      isSuperAdmin: typeof current.isSuperAdmin === 'boolean' ? current.isSuperAdmin : null,
      acceptedTermsId: typeof current.acceptedTermsId === 'string' ? current.acceptedTermsId : null,
    };
  }
  const legacy = await readStored(LEGACY_SUPER_ADMIN_KEY);
  if (legacy && legacy.userId === authUserId && typeof legacy.isSuperAdmin === 'boolean') {
    return { ...NOTHING, isSuperAdmin: legacy.isSuperAdmin };
  }
  return NOTHING;
}

/** Guarda lo que se acaba de comprobar con conexión; lo que no se pasa se conserva si es de la misma cuenta. */
export async function rememberAccount(authUserId: string, patch: Partial<AccountMemory>): Promise<void> {
  try {
    const before = await readAccountMemory(authUserId);
    const next = { userId: authUserId, ...before, ...patch };
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
    await AsyncStorage.removeItem(LEGACY_SUPER_ADMIN_KEY);
  } catch {
    // sin almacenamiento: solo se pierde la ayuda para entrar sin conexión
  }
}

/** Al cerrar la sesión no queda nada de la cuenta en el teléfono. */
export async function clearAccountMemory(): Promise<void> {
  for (const key of [KEY, LEGACY_SUPER_ADMIN_KEY]) {
    try {
      await AsyncStorage.removeItem(key);
    } catch {
      // nada que borrar
    }
  }
}
