/** Formato de correo que aceptan las pantallas (el servidor decide si tiene acceso). */
const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_FORMAT.test(value);
}
