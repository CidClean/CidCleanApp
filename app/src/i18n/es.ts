/**
 * Todas las cadenas visibles de la app, en español.
 * Estructura lista para en.ts (D-087): cuando exista, tendrá el mismo tipo `Strings`.
 * Cada cadena sale literalmente de decisiones o muestras aprobadas (D-149 a D-151, D-156).
 */
export const es = {
  appName: 'Cid Clean', // APROBADO (D-149)

  email: {
    prompt: 'Entra con tu correo', // APROBADO (D-149)
    label: 'Correo', // APROBADO (muestra ronda 13)
    send: 'Enviar código', // APROBADO (D-149)
    sessionEnded: 'Tu sesión terminó. Escribe tu correo para entrar otra vez.', // APROBADO (D-151)
    invalid: 'Escribe un correo válido.', // APROBADO (D-156)
    errorNetwork: 'No pudimos enviar el código. Revisa tu conexión e inténtalo otra vez.', // APROBADO (D-156)
    errorRateLimit: 'Pediste demasiados códigos. Espera un momento e inténtalo otra vez.', // APROBADO (D-156)
  },

  code: {
    barTitle: 'Código', // APROBADO (muestra ronda 13)
    title: 'Revisa tu correo', // APROBADO (D-150)
    note: 'Si tu correo tiene acceso, recibirás un código de 6 dígitos. Vale 10 minutos.', // APROBADO (D-150)
    resend: 'Reenviar código', // APROBADO (D-150)
    errorWrong: 'El código es incorrecto o ya venció. Revisa tu correo e inténtalo otra vez.', // APROBADO (D-156)
    errorNetwork: 'No pudimos verificar el código. Revisa tu conexión e inténtalo otra vez.', // APROBADO (D-156)
    errorRateLimit: 'Pediste demasiados códigos. Espera un momento e inténtalo otra vez.', // APROBADO (D-156)
  },

  home: {
    // TEMPORAL: reemplazar al construir Inicio
    placeholder: 'Sesión iniciada. Pantalla de inicio pendiente.', // texto pedido por la orden del arquitecto
  },
};

export type Strings = typeof es;
