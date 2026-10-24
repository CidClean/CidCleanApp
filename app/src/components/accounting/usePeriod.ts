import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { periodFromParams, type Period } from '@/lib/accountingRules';

/** Periodo (y cuenta) de una pantalla de Accounting: sale de la ruta (?from&to&jobsite) y se cambia ahí mismo. */
export function usePeriod(): {
  period: Period;
  setPeriod: (p: Period) => void;
  jobsiteId: string | null;
  setJobsiteId: (id: string | null) => void;
  params: (p?: Period, jobsite?: string | null) => Record<string, string>;
} {
  const raw = useLocalSearchParams<{ from?: string; to?: string; jobsite?: string }>();
  const [period, setPeriod] = useState<Period>(() => periodFromParams(raw.from, raw.to));
  const [jobsiteId, setJobsiteId] = useState<string | null>(typeof raw.jobsite === 'string' && raw.jobsite ? raw.jobsite : null);
  const params = (p: Period = period, jobsite: string | null = jobsiteId) => {
    const out: Record<string, string> = { from: p.from, to: p.to };
    if (jobsite) out.jobsite = jobsite;
    return out;
  };
  return { period, setPeriod, jobsiteId, setJobsiteId, params };
}
