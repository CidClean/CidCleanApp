import { getWalkthroughStrings, type WalkthroughStrings } from './walkthrough';
import { useSession } from '@/lib/session';

export function useWalkthroughStrings(): WalkthroughStrings {
  return getWalkthroughStrings(useSession().locale);
}
