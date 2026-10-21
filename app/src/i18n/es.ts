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

  nav: {
    pipeline: 'Pipeline', // APROBADO (D-132): destino de la barra inferior (solo icono, sin texto) y título de su pantalla
    accounts: 'Cuentas', // APROBADO (D-132)
    home: 'Inicio', // APROBADO (muestra ronda 14)
    menu: 'Menú', // APROBADO (muestra deducida, D-134)
    employees: 'Empleados', // APROBADO (D-134)
    scheduleWork: 'Schedule y Work', // APROBADO (D-134)
    accounting: 'Accounting', // APROBADO (D-134)
    settings: 'Ajustes', // APROBADO (D-134)
    history: 'Historial de cambios', // APROBADO (D-134)
    notifications: 'Notificaciones', // APROBADO (D-134)
    profile: 'Mi perfil e idioma', // APROBADO (D-134)
  },

  pending: 'Pendiente', // TEMPORAL: texto de las pantallas que aún no existen (orden del arquitecto)

  home: {
    income: 'Ingresos del mes', // APROBADO (D-111, muestra ronda 14)
    profit: 'Profit', // APROBADO (D-111)
    caughtUp: 'Todo al día', // APROBADO (D-164)
    nothingToReview: 'No hay pendientes por revisar', // APROBADO (D-164)
    today: 'Hoy', // APROBADO (D-165)
    slideToClockIn: 'Desliza para marcar entrada', // APROBADO (D-049)
    timeRange: (from: string, to: string) => `${from} a ${to}`, // APROBADO (muestra ronda 14): "6:00 PM a 9:00 PM"
    weekDays: ['L', 'M', 'X', 'J', 'V', 'S', 'D'], // APROBADO (D-048)
  },

  profile: {
    title: 'Mi perfil', // APROBADO (muestra ronda 14)
    name: 'Nombre', // APROBADO (D-166)
    email: 'Correo', // APROBADO (D-166)
    language: 'Idioma', // APROBADO (D-166)
    signOut: 'Cerrar sesión', // APROBADO (D-166)
    english: 'English', // APROBADO (D-087)
    spanish: 'Español', // APROBADO (D-087)
    confirmTitle: '¿Cerrar sesión?', // APROBADO (D-167)
    confirmBody: 'Tendrás que pedir un código para volver a entrar.', // APROBADO (D-167)
    cancel: 'Cancelar', // APROBADO (D-167)
    languageError: 'No pudimos cambiar el idioma. Revisa tu conexión e inténtalo otra vez.', // SIN APROBAR
  },

  terms: {
    barTitle: 'Antes de empezar', // APROBADO (muestra ronda 10, D-086)
    location: 'Ubicación solo al marcar entrada y salida', // APROBADO (muestra ronda 10)
    photos: 'Fotos del trabajo', // APROBADO (muestra ronda 10)
    data: 'Tus datos personales', // APROBADO (muestra ronda 10)
    readFull: 'Leer los términos completos', // APROBADO (muestra ronda 10)
    checkbox: 'He leído y acepto los términos', // APROBADO (muestra ronda 10)
    accept: 'Aceptar', // APROBADO (muestra ronda 10)
    errorSave: 'No pudimos guardar tu aceptación. Revisa tu conexión e inténtalo otra vez.', // SIN APROBAR
    errorLoad: 'No pudimos cargar los términos. Revisa tu conexión e inténtalo otra vez.', // SIN APROBAR
  },
};

export type Strings = typeof es;
