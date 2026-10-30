import { getServiceDaysStrings, type ServiceDaysStrings } from './serviceDays';
import { useSession } from '@/lib/session';

export function useServiceDaysStrings(): ServiceDaysStrings {
  return getServiceDaysStrings(useSession().locale);
}
