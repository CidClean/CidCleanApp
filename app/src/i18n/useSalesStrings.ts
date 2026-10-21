import { getSalesStrings, type SalesStrings } from './sales';
import { useSession } from '@/lib/session';

/** Textos de Ventas en el idioma vigente (el mismo de useStrings). */
export function useSalesStrings(): SalesStrings {
  return getSalesStrings(useSession().locale);
}
