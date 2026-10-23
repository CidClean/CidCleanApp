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
    // D-216 (delegado D-200): teléfono y selectores de fecha y hora.
    phoneError: 'Escribe un teléfono de 10 dígitos, por ejemplo (239) 555-0142.',
    pickDate: 'Elegir fecha',
    pickTime: 'Elegir hora',
    noDate: 'Sin fecha',
    clearDate: 'Quitar fecha',
    hour: 'Hora',
    minutes: 'Minutos',
    done: 'Listo',
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

  // Pestañas Permisos y Pagos del perfil (D-058, D-188 a D-194). Los 36 nombres de permisos salen de current/flujo.md
  // "Roles y permisos"; solo los 7 de Empleados están en la muestra aprobada de la ronda 16.
  permissions: {
    template: 'Plantilla de partida', // APROBADO (muestra ronda 16, D-189)
    areas: {
      ventas: 'Ventas', // APROBADO (muestra ronda 16)
      clientes: 'Clientes y jobsites', // APROBADO (muestra ronda 16)
      empleados: 'Empleados', // APROBADO (muestra ronda 16)
      schedule_work: 'Schedule y Work', // APROBADO (muestra ronda 16)
      accounting: 'Accounting', // APROBADO (muestra ronda 16)
      sistema: 'Sistema', // APROBADO (muestra ronda 16)
    },
    chipAll: 'Todo', // APROBADO (D-110, muestra ronda 16)
    chipPartial: 'Parcial', // APROBADO (D-110, muestra ronda 16)
    chipNone: 'Sin acceso', // APROBADO (D-110, muestra ronda 16)
    saveChanges: 'Guardar cambios', // APROBADO (D-188, muestra ronda 16)
    applyTitle: (template: string) => `¿Aplicar la plantilla ${template}?`, // APROBADO (D-189, muestra ronda 16)
    applyBody: (name: string) => `Reemplaza los permisos actuales de ${name}.`, // APROBADO (D-189, muestra ronda 16)
    apply: 'Aplicar', // APROBADO (D-189, muestra ronda 16)
    noPayPermission: 'No tienes permiso para ver pagos', // APROBADO (D-194, muestra ronda 16)
    errorLoad: 'No se pudieron cargar los permisos. Inténtalo otra vez.', // SIN APROBAR (con el patrón de D-178)
    errorTemplate: 'No se pudo cargar la plantilla. Inténtalo otra vez.', // SIN APROBAR (con el patrón de D-178)
    labels: {
      leads_ver: 'Ver leads', // SIN APROBAR (current/flujo.md: "Ver, crear-editar y eliminar leads")
      leads_editar: 'Crear y editar leads', // SIN APROBAR
      leads_eliminar: 'Eliminar leads', // SIN APROBAR
      walkthroughs_hacer: 'Hacer walkthroughs', // SIN APROBAR
      quotes_ver: 'Ver quotes', // SIN APROBAR
      quotes_editar: 'Crear y editar quotes', // SIN APROBAR
      quotes_enviar: 'Enviar quotes', // SIN APROBAR
      quotes_ver_precios: 'Ver precios de los quotes', // SIN APROBAR
      sow_contratos_subir_ver: 'Subir y ver SOW y contratos', // SIN APROBAR
      clientes_ver: 'Ver clientes y jobsites', // SIN APROBAR
      clientes_editar_datos: 'Editar datos y contactos', // SIN APROBAR
      clientes_editar_walkthrough_sow: 'Editar walkthrough y SOW', // SIN APROBAR
      clientes_ver_tarifa: 'Ver tarifa al cliente', // SIN APROBAR
      clientes_cambiar_estado: 'Cambiar estado', // SIN APROBAR
      empleados_ver: 'Ver lista', // APROBADO (muestra ronda 16)
      empleados_invitar_crear: 'Invitar y crear', // APROBADO (muestra ronda 16)
      empleados_editar_desactivar: 'Editar y desactivar', // APROBADO (muestra ronda 16)
      empleados_ver_pagos: 'Ver pagos y tarifas', // APROBADO (muestra ronda 16)
      empleados_asignar_pago: 'Asignar a jobsites y definir su pago', // APROBADO (muestra ronda 16)
      empleados_gestionar_permisos: 'Gestionar permisos', // APROBADO (muestra ronda 16)
      empleados_gestionar_documentos: 'Gestionar documentos de empleados', // APROBADO (D-193)
      schedule_ver_editar: 'Ver y editar el schedule completo', // SIN APROBAR
      work_registrar_por_otros: 'Registrar trabajo por otros', // SIN APROBAR
      work_editar: 'Editar registros de trabajo', // SIN APROBAR
      work_aprobar: 'Aprobar trabajo', // SIN APROBAR
      work_revisar_gps: 'Revisar alertas de GPS', // SIN APROBAR
      ingresos_ver_registrar: 'Ver y registrar ingresos', // SIN APROBAR
      ingresos_marcar_recibidos: 'Marcar ingresos como recibidos', // SIN APROBAR
      personal_ver_costo: 'Ver costo de personal', // SIN APROBAR
      gastos_ver: 'Ver gastos', // SIN APROBAR
      gastos_registrar_editar: 'Registrar y editar gastos', // SIN APROBAR
      gastos_recurrentes: 'Gestionar gastos recurrentes', // SIN APROBAR
      dashboard_global: 'Ver dashboard global', // SIN APROBAR
      dashboard_cuenta: 'Ver dashboard por cuenta', // SIN APROBAR
      reportes_exportar: 'Exportar reportes', // SIN APROBAR
      historial_ver: 'Ver historial de cambios', // SIN APROBAR
    },
  },

  // Historial de cambios (D-088, D-198). Patrón de títulos de los ejemplos aprobados de la ronda 17.
  history: {
    by: (who: string) => `por ${who}`, // APROBADO (D-198): "{a quién o qué} · por {quién}"
    today: 'Hoy', // APROBADO (D-198)
    yesterday: 'Ayer', // APROBADO (D-198)
    am: 'a. m.', // APROBADO (D-198)
    pm: 'p. m.', // APROBADO (D-198)
    termsKinds: {
      staff: 'Staff', // APROBADO (D-198)
      portal: 'Portal del cliente', // SIN APROBAR (current/flujo.md)
      privacy: 'Privacidad', // SIN APROBAR
    },
    employeeCreated: 'Empleado creado', // APROBADO (D-198)
    employeeDeactivated: 'Empleado desactivado', // APROBADO (D-198)
    employeeReactivated: 'Empleado reactivado', // SIN APROBAR
    employeeEdited: 'Empleado editado', // SIN APROBAR
    roleChanged: (role: string) => `Rol cambiado: ${role}`, // SIN APROBAR
    typeChanged: (type: string) => `Tipo cambiado: ${type}`, // SIN APROBAR
    accessGiven: 'Acceso a la app dado', // SIN APROBAR
    accessRemoved: 'Acceso a la app quitado', // SIN APROBAR
    becameSuperAdmin: 'Ahora es Super Admin', // SIN APROBAR
    leftSuperAdmin: 'Ya no es Super Admin', // SIN APROBAR
    superAdminTransferred: 'Rol de Super Admin transferido', // SIN APROBAR
    invitationSent: 'Invitación enviada', // APROBADO (D-172)
    invitationResent: 'Invitación reenviada', // SIN APROBAR
    invitationFailed: 'Invitación no enviada', // SIN APROBAR
    permissionGiven: (name: string) => `Permiso dado: ${name}`, // APROBADO (D-198)
    permissionRemoved: (name: string) => `Permiso quitado: ${name}`, // SIN APROBAR
    documentUploaded: (name: string) => `Documento subido: ${name}`, // SIN APROBAR
    documentReplaced: (name: string) => `Documento reemplazado: ${name}`, // SIN APROBAR
    documentOpened: (name: string) => `Documento abierto: ${name}`, // APROBADO (D-198)
    termsPublished: (version: string) => `Términos publicados: versión ${version}`, // APROBADO (D-198)
    termsAccepted: (version: string) => `Términos aceptados: versión ${version}`, // APROBADO (D-198)
    leadCreated: 'Lead creado', // SIN APROBAR
    leadStatusChanged: 'Estado del lead cambiado', // SIN APROBAR
    leadDeleted: 'Lead eliminado', // SIN APROBAR
    walkthroughScheduled: 'Walkthrough agendado', // SIN APROBAR
    walkthroughRescheduled: 'Walkthrough reagendado', // SIN APROBAR
    walkthroughStatusChanged: 'Estado del walkthrough cambiado', // SIN APROBAR
    siteEdited: 'Sitio editado', // Delegada por el dueño (D-200; orden 13, patrón de D-198)
    siteDeleted: 'Sitio eliminado', // Delegada por el dueño (D-200; orden 13)
    reasonCreated: 'Motivo creado', // Delegada por el dueño (D-200; orden 13)
    reasonEdited: 'Motivo editado', // Delegada por el dueño (D-200; orden 13)
    reasonDeactivated: 'Motivo desactivado', // Delegada por el dueño (D-200; orden 13)
    reasonDeleted: 'Motivo eliminado', // Delegada por el dueño (D-200; orden 13)
    quoteCreated: 'Quote creado', // D-200 (hito 4, patrón de D-198)
    quoteNewVersion: (v: string) => `Quote: versión ${v}`, // D-200 (hito 4)
    quoteSent: (v: string) => `Quote enviado: versión ${v}`, // D-200 (hito 4)
    quoteViewed: (v: string) => `Quote visto: versión ${v}`, // D-200 (hito 4)
    quoteAccepted: (v: string) => `Quote aceptado: versión ${v}`, // D-200 (hito 4)
    quoteRejected: (v: string) => `Quote rechazado: versión ${v}`, // D-200 (hito 4)
    quoteChanges: (v: string) => `Cambios pedidos: versión ${v}`, // D-200 (hito 4)
    clientCreated: 'Cliente creado', // D-200 (hito 4)
    jobsiteCreated: 'Jobsite creado', // D-200 (hito 4)
    unknown: 'Cambio registrado', // SIN APROBAR: acción que la app aún no conoce
    empty: 'Todavía no hay cambios.', // SIN APROBAR
    errorLoad: 'No se pudo cargar el historial. Inténtalo otra vez.', // SIN APROBAR (con el patrón de D-178)
  },

  // Transferir el rol de Super Admin (D-090, D-116, D-199, muestra ronda 10).
  transfer: {
    row: 'Transferir rol de Super Admin', // fila de Ajustes (dada por la orden 12)
    title: 'Transferir Super Admin', // APROBADO (muestra ronda 10): barra superior
    newSuperAdmin: 'Nuevo Super Admin', // APROBADO (D-090)
    understand: 'Entiendo que dejaré de ser Super Admin', // APROBADO (D-090)
    submit: 'Transferir rol', // APROBADO (D-090)
    noCandidates: 'Nadie más puede recibir el rol todavía: tiene que estar activo y haber entrado a la app.', // SIN APROBAR
    errorLoad: 'No se pudo cargar la lista. Inténtalo otra vez.', // SIN APROBAR (con el patrón de D-178)
    errorTransfer: 'No se pudo transferir el rol. Inténtalo otra vez.', // SIN APROBAR (con el patrón de D-178)
  },

  // Salir de la pestaña Permisos con cambios sin guardar (decisión del arquitecto bajo D-200, orden 12).
  unsaved: {
    title: '¿Salir sin guardar?', // Delegada por el dueño (D-200)
    body: 'Los cambios se perderán.', // Delegada por el dueño (D-200)
    leave: 'Salir', // Delegada por el dueño (D-200)
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
    offlineTitle: 'Necesitas conexión para continuar', // APROBADO (D-179)
    offlineBody: 'Revisamos los términos al entrar.', // APROBADO (D-179)
    retry: 'Reintentar', // APROBADO (D-179)
  },

  // Menú → Ajustes (solo el Super Admin, D-114, D-169) y publicar los términos del staff (D-176, D-187).
  settings: {
    viewPdf: 'Ver PDF', // D-216 (delegado D-200): botón de contorno de la versión vigente
    termsRow: 'Términos del staff', // APROBADO (D-176, D-187): fila de Ajustes y título de la pantalla
    termsValue: (version: number) => `v${version}`, // valor de la fila (formato dado por la orden 10, D-187 dice "la versión vigente")
    unpublished: 'Sin publicar', // SIN APROBAR: valor de la fila y de la línea de versión cuando aún no hay versión publicada
    currentVersion: (version: number, date: string) => `Versión vigente: ${version} · ${date}`, // APROBADO (D-176)
    uploadPdf: 'Subir PDF', // APROBADO (D-176)
    acceptAgain: 'Todo el staff tendrá que aceptar esta versión de nuevo.', // APROBADO (D-176)
    publish: 'Publicar nueva versión', // APROBADO (D-176)
    errorPublish: 'No se pudo publicar. Inténtalo otra vez.', // SIN APROBAR: aviso rojo al fallar la subida o la publicación (mismo estilo de D-178)
  },
};

export type Strings = typeof es;
