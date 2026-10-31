import { getSummaryPlStrings, type SummaryPlStrings } from './summaryPl';
import { useSession } from '@/lib/session';

export function useSummaryPlStrings(): SummaryPlStrings {
  return getSummaryPlStrings(useSession().locale);
}
