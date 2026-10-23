import { getClientsStrings, type ClientsStrings } from './clients';
import { useSession } from '@/lib/session';

export function useClientsStrings(): ClientsStrings {
  return getClientsStrings(useSession().locale);
}
