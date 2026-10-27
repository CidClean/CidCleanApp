import { FunctionsHttpError } from '@supabase/supabase-js';

import { failureFromCode, functionFailure, type ApiResult } from './employeesApi';
import { supabase } from './supabase';
import type { TinType, W9Change, W9Data } from './w9Rules';

/**
 * W-9 por llenar del 1099 (D-255, D-256). En la app: mandar, reenviar y ver el estado (empleados_gestionar_documentos,
 * D-193). En el portal: la Edge Function w9-portal sin cuenta, con un código por correo. El número (SSN, ITIN o EIN)
 * solo sale de la pantalla en sign() y nunca se guarda en el teléfono ni en el navegador.
 */

export type W9Status = {
  id: string;
  status: 'sent' | 'expired' | 'signed';
  email: string;
  sentAt: string;
  expiresAt: string;
  signedAt: string | null;
  documentId: string | null;
  changes: W9Change[];
};

export async function fetchW9Status(profileId: string): Promise<ApiResult<W9Status | null>> {
  try {
    const { data, error } = await supabase.rpc('w9_request_status', { p_profile: profileId });
    if (error) return { ok: false, reason: failureFromCode(error.code) };
    if (!data) return { ok: true, data: null };
    const d = data as Record<string, unknown>;
    return {
      ok: true,
      data: {
        id: d.id as string,
        status: d.status as W9Status['status'],
        email: d.email as string,
        sentAt: d.sent_at as string,
        expiresAt: d.expires_at as string,
        signedAt: (d.signed_at as string | null) ?? null,
        documentId: (d.document_id as string | null) ?? null,
        changes: (d.changes as W9Change[] | null) ?? [],
      },
    };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

export type W9Sent = { id: string; sent: boolean; expiresAt: string };

async function invokeSend(body: Record<string, unknown>): Promise<ApiResult<W9Sent>> {
  try {
    const { data, error } = await supabase.functions.invoke('send-w9', { body });
    if (error) return { ok: false, reason: await functionFailure(error) };
    return { ok: true, data: { id: data.id as string, sent: data.sent === true, expiresAt: data.expires_at as string } };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

export const sendW9 = (profileId: string, data: W9Data, email: string) =>
  invokeSend({ profile_id: profileId, data, email: email.trim().toLowerCase() });
export const resendW9 = (requestId: string) => invokeSend({ request_id: requestId, resend: true });

// Portal ---------------------------------------------------------------------------------------------------------

export type W9PortalState = 'open' | 'expired' | 'signed' | 'replaced' | 'not_found';
export type W9PortalFailure =
  | 'invalid' | 'invalid_tin' | 'closed' | 'rate_limited' | 'wrong' | 'locked' | 'expired' | 'session' | 'network' | 'server';
export type W9PortalResult<T> = { ok: true; data: T } | { ok: false; reason: W9PortalFailure };

export type W9PortalData = {
  status: W9PortalState;
  language: 'es' | 'en';
  data: W9Data;
  expires_at: string;
  signed_at: string | null;
  signer_name: string | null;
  requester: string[];
  form_version: string;
};

async function call<T>(body: Record<string, unknown>): Promise<W9PortalResult<T>> {
  try {
    const { data, error } = await supabase.functions.invoke('w9-portal', { body });
    if (error) {
      if (error instanceof FunctionsHttpError) {
        let code: string | undefined;
        try {
          code = (await error.context.json())?.error;
        } catch {
          code = undefined;
        }
        const known: W9PortalFailure[] = ['invalid', 'invalid_tin', 'closed', 'rate_limited', 'wrong', 'locked', 'expired', 'session'];
        return { ok: false, reason: known.includes(code as W9PortalFailure) ? (code as W9PortalFailure) : 'server' };
      }
      return { ok: false, reason: 'network' };
    }
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

export async function w9State(token: string): Promise<W9PortalResult<{ state: W9PortalState; language: 'es' | 'en' }>> {
  const r = await call<{ state: W9PortalState; language?: string }>({ action: 'state', token });
  if (!r.ok) return r;
  return { ok: true, data: { state: r.data.state, language: r.data.language === 'es' ? 'es' : 'en' } };
}
export const w9RequestCode = (token: string, email: string) => call<{ ok: true }>({ action: 'request', token, email });
export const w9VerifyCode = (token: string, email: string, code: string) => call<{ session: string }>({ action: 'verify', token, email, code });
export const w9Data = (session: string) => call<W9PortalData>({ action: 'data', session });
/** Vista previa del PDF sin número ni firma (el servidor no la guarda). */
export const w9Preview = (session: string, data: W9Data) => call<{ pdf: string }>({ action: 'preview', session, data });
export const w9Sign = (
  session: string,
  d: { data: W9Data; tinType: TinType; tin: string; signerName: string; agreed: boolean },
) => call<{ ok: true; signed_at: string }>({
  action: 'sign', session, data: d.data, tin_type: d.tinType, tin: d.tin, signer_name: d.signerName, agreed: d.agreed,
});

const KEY = (token: string) => `cidclean-w9-${token}`;

/** Solo la sesión (nunca el número) se guarda en esta pestaña, como en el portal del quote. */
export function saveW9Session(token: string, session: string | null) {
  try {
    if (typeof sessionStorage === 'undefined') return;
    if (session) sessionStorage.setItem(KEY(token), session);
    else sessionStorage.removeItem(KEY(token));
  } catch {
    // sin almacenamiento: se pedirá el código otra vez
  }
}

export function readW9Session(token: string): string | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(KEY(token));
  } catch {
    return null;
  }
}
