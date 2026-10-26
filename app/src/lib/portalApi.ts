import { FunctionsHttpError } from '@supabase/supabase-js';

import { supabase } from './supabase';

/**
 * Portal del cliente (D-209): todo pasa por la Edge Function quote-portal, sin cuenta. La sesión del portal es un
 * token aleatorio que el servidor guarda con hash; vive solo en esta pestaña del navegador.
 */

export type PortalState = 'open' | 'expired' | 'superseded' | 'changes_requested' | 'decided' | 'not_found';
export type PortalFailure = 'invalid' | 'closed' | 'rate_limited' | 'wrong' | 'locked' | 'expired' | 'session' | 'network' | 'server';
export type PortalResult<T> = { ok: true; data: T } | { ok: false; reason: PortalFailure };

export type PortalQuote = {
  status: string;
  version: string;
  language: 'es' | 'en';
  company: string;
  site: string;
  address: string;
  frequency: { kind: 'daily' | 'weekly' | 'other'; days: number[]; other: string } | null;
  lines: {
    services: { label: string; description?: string; amount: number; taxable: boolean }[];
    addons: { label: string; description?: string; amount: number; taxable: boolean }[];
    discounts: { label: string; kind: 'amount' | 'percent'; value: number }[];
  };
  tax_rate: number;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  sent_at: string;
  expires_at: string;
  sow_opened: boolean;
  terms_version: number | null;
  /** Quote de extra de una cuenta (D-238) y su fecha del servicio (AAAA-MM-DD). */
  extra?: boolean;
  service_date?: string | null;
  reasons: { id: string; label: string }[];
  decision: { kind: 'accepted' | 'rejected' | 'changes_requested'; name: string | null; at: string } | null;
};

async function call<T>(body: Record<string, unknown>): Promise<PortalResult<T>> {
  try {
    const { data, error } = await supabase.functions.invoke('quote-portal', { body });
    if (error) {
      if (error instanceof FunctionsHttpError) {
        let code: string | undefined;
        try {
          code = (await error.context.json())?.error;
        } catch {
          code = undefined;
        }
        const known: PortalFailure[] = ['invalid', 'closed', 'rate_limited', 'wrong', 'locked', 'expired', 'session'];
        return { ok: false, reason: known.includes(code as PortalFailure) ? (code as PortalFailure) : 'server' };
      }
      return { ok: false, reason: 'network' };
    }
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

export async function portalState(token: string): Promise<PortalResult<{ state: PortalState; language: 'es' | 'en' }>> {
  const r = await call<{ state: PortalState; language?: string }>({ action: 'state', token });
  if (!r.ok) return r;
  return { ok: true, data: { state: r.data.state, language: r.data.language === 'es' ? 'es' : 'en' } };
}

export const requestCode = (token: string, email: string) => call<{ ok: true }>({ action: 'request', token, email });
export const verifyCode = (token: string, email: string, code: string) => call<{ session: string }>({ action: 'verify', token, email, code });
export const fetchPortalQuote = (session: string) => call<PortalQuote>({ action: 'quote', session });
export const portalFileUrl = (session: string, kind: 'sow' | 'pdf' | 'terms') => call<{ url: string }>({ action: 'file', session, kind });
export const decide = (
  session: string,
  d: { kind: 'accepted' | 'rejected' | 'changes_requested'; name?: string; title?: string; reason_id?: string | null; note?: string; read_confirmed?: boolean },
) => call<{ kind: string }>({ action: 'decide', session, ...d });

const KEY = (token: string) => `cidclean-portal-${token}`;

/** La sesión del portal se guarda solo en esta pestaña (sessionStorage), no en el teléfono ni en el navegador para siempre. */
export function savePortalSession(token: string, session: string | null) {
  try {
    if (typeof sessionStorage === 'undefined') return;
    if (session) sessionStorage.setItem(KEY(token), session);
    else sessionStorage.removeItem(KEY(token));
  } catch {
    // sin almacenamiento: se pedirá el código otra vez
  }
}

export function readPortalSession(token: string): string | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(KEY(token));
  } catch {
    return null;
  }
}
