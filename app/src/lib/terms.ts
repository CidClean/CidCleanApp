/**
 * Términos del staff (D-086, D-168). Lógica pura de cuándo se pide aceptar.
 * - Sin versión publicada del staff no se pide nada.
 * - El Super Admin no acepta.
 * - Se pide a todo el que tenga acceso a la app en el primer ingreso y cuando haya una versión nueva.
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
