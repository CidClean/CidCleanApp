import { getStrings } from './index';
import type { Strings } from './es';
import { useSession } from '@/lib/session';

/** Textos en el idioma vigente (teléfono antes de iniciar sesión, perfil después). */
export function useStrings(): Strings {
  return getStrings(useSession().locale);
}
