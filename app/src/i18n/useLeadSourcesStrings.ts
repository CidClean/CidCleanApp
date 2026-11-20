import { getLeadSourcesStrings, type LeadSourcesStrings } from './leadSources';
import { useSession } from '@/lib/session';

export function useLeadSourcesStrings(): LeadSourcesStrings {
  return getLeadSourcesStrings(useSession().locale);
}
