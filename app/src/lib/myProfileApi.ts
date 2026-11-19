import { isValidPhone, normalizePhone } from './phone';
import { supabase } from './supabase';

/**
 * "Editar mi perfil" (orden 152, D-340 (3)): nombre, apellido y teléfono del propio usuario. Se leen de la fila propia
 * (reglas por fila) y se guardan con update_my_profile (migración 20261121000003), que solo toca esa fila y esos campos.
 */
export type MyProfileForm = { firstName: string; lastName: string; phone: string };
export type MyProfileError = 'name' | 'phone' | null;

/** Lo que falta o está mal antes de guardar: nombre y apellido obligatorios; teléfono opcional pero válido (D-216). */
export function validateMyProfile(f: MyProfileForm): MyProfileError {
  if (f.firstName.trim() === '' || f.lastName.trim() === '') return 'name';
  if (!isValidPhone(f.phone)) return 'phone';
  return null;
}

/** Nombre y apellido guardados; si un perfil viejo solo tiene el nombre completo, se parte en la primera palabra. */
export function splitName(first: string | null, last: string | null, full: string): { firstName: string; lastName: string } {
  if ((first ?? '').trim() || (last ?? '').trim()) return { firstName: (first ?? '').trim(), lastName: (last ?? '').trim() };
  const parts = full.trim().split(/\s+/);
  return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') };
}

export async function fetchMyProfile(profileId: string): Promise<MyProfileForm | null> {
  try {
    const { data, error } = await supabase.from('profiles').select('first_name, last_name, full_name, phone').eq('id', profileId).maybeSingle();
    if (error || !data) return null;
    const n = splitName(data.first_name, data.last_name, data.full_name ?? '');
    return { ...n, phone: data.phone ?? '' };
  } catch {
    return null;
  }
}

export async function saveMyProfile(f: MyProfileForm): Promise<'ok' | 'invalid' | 'error'> {
  try {
    const { error } = await supabase.rpc('update_my_profile', {
      p_first_name: f.firstName.trim(),
      p_last_name: f.lastName.trim(),
      p_phone: normalizePhone(f.phone),
    });
    if (!error) return 'ok';
    return error.code === '22023' ? 'invalid' : 'error';
  } catch {
    return 'error';
  }
}
