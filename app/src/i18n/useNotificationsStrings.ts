import { getNotificationsStrings, type NotificationsStrings } from './notifications';
import { useSession } from '@/lib/session';

export function useNotificationsStrings(): NotificationsStrings {
  return getNotificationsStrings(useSession().locale);
}
