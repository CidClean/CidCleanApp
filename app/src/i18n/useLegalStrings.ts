import { getLegalStrings, type LegalStrings } from './legal';
import { useSession } from '@/lib/session';

export function useLegalStrings(): LegalStrings {
  return getLegalStrings(useSession().locale);
}
