/** Correo con el que se pidió el código, para pasarlo de la pantalla del correo a la del código sin ponerlo en la URL. */
let pendingEmail: string | null = null;

export function setPendingEmail(email: string | null): void {
  pendingEmail = email;
}

export function getPendingEmail(): string | null {
  return pendingEmail;
}
