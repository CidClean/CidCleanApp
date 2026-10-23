import { getWorkStrings, type WorkStrings } from './work';
import { useSession } from '@/lib/session';

export function useWorkStrings(): WorkStrings {
  return getWorkStrings(useSession().locale);
}
