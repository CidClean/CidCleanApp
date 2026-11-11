import { getAddressStrings, type AddressStrings } from './address';
import { useSession } from '@/lib/session';

export function useAddressStrings(): AddressStrings {
  return getAddressStrings(useSession().locale);
}
