import { getQuoteStrings, type QuoteStrings } from './quotes';
import { useSession } from '@/lib/session';

/** Textos del quote en el idioma vigente de la app. */
export function useQuoteStrings(): QuoteStrings {
  return getQuoteStrings(useSession().locale);
}
