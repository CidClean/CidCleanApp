/**
 * Términos del staff (D-086, D-168, D-176, D-179). Lógica pura de cuándo se pide aceptar y cuándo no se deja entrar.
 * - Sin versión publicada del staff no se pide nada.
 * - El Super Admin no acepta.
 * - Se pide a todo el que tenga acceso a la app en el primer ingreso y cuando haya una versión nueva.
 * - Si quien debe aceptar entra y no se pueden revisar los términos (sin conexión), no entra (D-179).
 */
export function termsRequired(input: {
  isSuperAdmin: boolean;
  latestStaffDocumentId: string | null;
  acceptedDocumentIds: readonly string[];
}): boolean {
  if (input.isSuperAdmin) return false;
  if (input.latestStaffDocumentId === null) return false;
  return !input.acceptedDocumentIds.includes(input.latestStaffDocumentId);
}

/** Resultado de consultar los términos: lo leído, o 'unknown' si no se pudo consultar (sin red u otro error). */
export type TermsLookup =
  | { kind: 'unknown' }
  | { kind: 'ok'; latestStaffDocumentId: string | null; acceptedDocumentIds: readonly string[] };

/**
 * Qué pantalla corresponde antes de entrar a la app.
 * - 'enter': entra (Super Admin, versión ya aceptada o sin versión publicada).
 * - 'accept': pantalla "Antes de empezar" con los tres puntos y Aceptar.
 * - 'offline': pantalla "Necesitas conexión para continuar" (D-179): no se pudo revisar y quien no es Super Admin no entra.
 * `isSuperAdmin` es null cuando todavía no se sabe (no se pudo leer el perfil ni hay dato guardado).
 */
export type TermsGate = 'enter' | 'accept' | 'offline';

export function termsGate(input: { isSuperAdmin: boolean | null; lookup: TermsLookup }): TermsGate {
  if (input.isSuperAdmin === true) return 'enter';
  if (input.lookup.kind === 'unknown') return 'offline';
  return termsRequired({
    isSuperAdmin: false,
    latestStaffDocumentId: input.lookup.latestStaffDocumentId,
    acceptedDocumentIds: input.lookup.acceptedDocumentIds,
  })
    ? 'accept'
    : 'enter';
}

/**
 * Los términos se revisan al entrar (D-179). Si ya se revisaron en esta apertura de la app y una comprobación
 * posterior (al volver a primer plano) falla por falta de red, se conserva lo que se sabía: no se saca de la app
 * a quien ya entró. Al abrir la app (sin estado previo) un fallo sí bloquea.
 */
export function nextTermsGate(previous: TermsGate | null, current: TermsGate): TermsGate {
  if (current === 'offline' && previous !== null && previous !== 'offline') return previous;
  return current;
}
