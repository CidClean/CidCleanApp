import { getAccountingStrings, type AccountingStrings } from './accounting';
import { useSession } from '@/lib/session';

export function useAccountingStrings(): AccountingStrings {
  return getAccountingStrings(useSession().locale);
}
