import { getEstimatorStrings, type EstimatorStrings } from './estimator';
import { useSession } from '@/lib/session';

export function useEstimatorStrings(): EstimatorStrings {
  return getEstimatorStrings(useSession().locale);
}
