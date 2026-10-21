import { requestCode as requestCodeWith, verifyCode as verifyCodeWith } from './authCore';
import type { RequestCodeResult, VerifyCodeResult } from './authCore';
import { saveSessionStart } from './sessionStore';
import { supabase } from './supabase';

export type { RequestCodeResult, VerifyCodeResult };

export function requestCode(email: string): Promise<RequestCodeResult> {
  return requestCodeWith(supabase, email);
}

/** Verifica el código y, si sale bien, guarda la fecha de inicio de la sesión (D-124). */
export async function verifyCode(email: string, token: string): Promise<VerifyCodeResult> {
  const result = await verifyCodeWith(supabase, email, token);
  if (result.ok) await saveSessionStart();
  return result;
}
