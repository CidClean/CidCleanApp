import { getSowStrings, type SowStrings } from './sow';
import { useSession } from '@/lib/session';

/** Textos de la pantalla "Scope of Work" en el idioma vigente de la app. */
export function useSowStrings(): SowStrings {
  return getSowStrings(useSession().locale);
}
