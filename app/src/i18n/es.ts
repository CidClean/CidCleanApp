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
    languageError: 'No se pudo cambiar el idioma. Inténtalo otra vez.', // APROBADO (D-178)
  },

  common: {
    back: 'Volver', // SIN APROBAR: solo lo lee el lector de pantalla (nombre de la flecha de volver, D-180)
    edit: 'Editar', // APROBADO (D-174)
    save: 'Guardar', // APROBADO (orden de la ronda 15: botón Guardar del formulario, D-174)
    cancel: 'Cancelar', // APROBADO (D-167, D-173)
    yes: 'Sí', // APROBADO (D-184)
    no: 'No', // APROBADO (D-174: fila Acceso a la app sin acceso)
  },

  employees: {
    active: 'Activo', // APROBADO (D-083, D-173)
    inactive: 'Inactivo', // APROBADO (D-083)
    w2: 'W-2', // APROBADO (D-171)
    contractor: '1099', // APROBADO (D-171)
    roleEmployee: 'Empleado', // APROBADO (D-152, muestra ronda 15)
    roleSupervisor: 'Supervisor', // APROBADO (D-152)
    roleAdmin: 'Admin', // APROBADO (D-152)
    roleSuperAdmin: 'Super Admin', // APROBADO (D-114)
    errorLoad: 'No se pudieron cargar los empleados. Inténtalo otra vez.', // SIN APROBAR (con el patrón de D-178)
  },

  newEmployee: {
    title: 'Nuevo empleado', // APROBADO (D-171)
    name: 'Nombre', // APROBADO (D-171)
    phone: 'Teléfono', // APROBADO (D-171)
    type: 'Tipo', // APROBADO (D-171)
    role: 'Rol de partida', // APROBADO (D-171)
    hasAccess: 'Tiene acceso a la app', // APROBADO (D-171)
    email: 'Correo', // APROBADO (D-171)
    language: 'Idioma', // APROBADO (D-171)
    create: 'Crear empleado', // APROBADO (D-171)
    errorName: 'Escribe el nombre.', // SIN APROBAR (mismo patrón que D-156 "Escribe un correo válido.")
    errorEmailTaken: 'Ese correo ya está registrado.', // SIN APROBAR
    errorCreate: 'No se pudo crear el empleado. Inténtalo otra vez.', // SIN APROBAR (con el patrón de D-178)
    errorForbidden: 'No tienes permiso para crear empleados.', // SIN APROBAR
  },

  employee: {
    tabData: 'Datos', // APROBADO (D-057)
    tabPermissions: 'Permisos', // APROBADO (D-057)
    tabPay: 'Pagos', // APROBADO (D-057)
    activeLabel: 'Activo', // APROBADO (D-173)
    deactivateTitle: (name: string) => `¿Desactivar a ${name}?`, // APROBADO (D-173)
    deactivateBody: 'Ya no podrá entrar a la app. Su historial se conserva.', // APROBADO (D-173)
    deactivate: 'Desactivar', // APROBADO (D-173)
    reactivateTitle: (name: string) => `¿Reactivar a ${name}?`, // APROBADO (D-182)
    reactivate: 'Reactivar', // APROBADO (D-182)
    phone: 'Teléfono', // APROBADO (D-174)
    email: 'Correo', // APROBADO (D-174)
    appAccess: 'Acceso a la app', // APROBADO (D-172, D-174)
    invitationSent: 'Invitación enviada', // APROBADO (D-172)
    pendingChip: 'Pendiente', // APROBADO (D-172)
    resendInvitation: 'Reenviar invitación', // APROBADO (D-172)
    accessSince: (date: string) => `Sí · desde ${date}`, // APROBADO (D-184)
    invitationResent: 'Invitación reenviada.', // SIN APROBAR
    invitationFailed: 'El empleado se creó, pero no se pudo enviar la invitación. Toca Reenviar invitación.', // SIN APROBAR
    errorSave: 'No se pudo guardar. Inténtalo otra vez.', // SIN APROBAR (con el patrón de D-178)
    errorToggle: 'No se pudo cambiar el estado. Inténtalo otra vez.', // SIN APROBAR (con el patrón de D-178)
    errorResend: 'No se pudo reenviar la invitación. Inténtalo otra vez.', // SIN APROBAR (con el patrón de D-178)
    errorLoad: 'No se pudo cargar el empleado. Inténtalo otra vez.', // SIN APROBAR (con el patrón de D-178)
    documents: 'Documentos', // APROBADO (D-175)
    w9: 'W-9', // APROBADO (D-175)
    insuranceCertificate: 'Certificado de seguro', // APROBADO (D-175)
    uploadedOn: (date: string) => `Subido el ${date}`, // APROBADO (D-175)
    noFile: 'Sin archivo', // APROBADO (D-175)
    uploadedChip: 'Subido', // APROBADO (D-175)
    missingChip: 'Falta', // APROBADO (D-175)
    upload: 'Subir documento', // APROBADO (D-175)
    takePhoto: 'Tomar foto', // SIN APROBAR (D-183 dice "tomar una foto con la cámara")
    chooseFile: 'Elegir archivo', // SIN APROBAR (D-183 dice "escoger un archivo del teléfono")
    errorUpload: 'No se pudo subir el documento. Inténtalo otra vez.', // SIN APROBAR (con el patrón de D-178)
    errorOpen: 'No se pudo abrir el documento. Inténtalo otra vez.', // SIN APROBAR (con el patrón de D-178)
    errorCamera: 'Permite el acceso a la cámara en los ajustes del teléfono.', // SIN APROBAR
  },

  terms: {
    barTitle: 'Antes de empezar', // APROBADO (muestra ronda 10, D-086)
    location: 'Ubicación solo al marcar entrada y salida', // APROBADO (muestra ronda 10)
    photos: 'Fotos del trabajo', // APROBADO (muestra ronda 10)
    data: 'Tus datos personales', // APROBADO (muestra ronda 10)
    readFull: 'Leer los términos completos', // APROBADO (muestra ronda 10)
    checkbox: 'He leído y acepto los términos', // APROBADO (muestra ronda 10)
    accept: 'Aceptar', // APROBADO (muestra ronda 10)
    errorSave: 'No se pudo guardar tu aceptación. Inténtalo otra vez.', // APROBADO (D-178)
    errorLoad: 'No se pudieron cargar los términos. Inténtalo otra vez.', // APROBADO (D-178)
  },
};

export type Strings = typeof es;
