import { getStatisticsStrings, type StatisticsStrings } from './statistics';
import { useSession } from '@/lib/session';

export function useStatisticsStrings(): StatisticsStrings {
  return getStatisticsStrings(useSession().locale);
}
