import type { Strings } from './es';

/**
 * English version of es.ts (D-157). Same meaning, simple tone. It must keep the same shape as `es`.
 * Each string notes its screen. Translated texts, not yet reviewed by the owner.
 */
export const en: Strings = {
  appName: 'Cid Clean', // title of the email screen

  email: {
    prompt: 'Sign in with your email', // email screen: line under the title
    label: 'Email', // email screen: field label
    send: 'Send code', // email screen: solid button
    sessionEnded: 'Your session ended. Enter your email to sign in again.', // email screen: amber notice (D-151)
    invalid: 'Enter a valid email.', // email screen: error under the field
    errorNetwork: "We couldn't send the code. Check your connection and try again.", // email screen: no connection
    errorRateLimit: "You've requested too many codes. Wait a moment and try again.", // email screen: sending limit
  },

  code: {
    barTitle: 'Code', // code screen: top bar
    title: 'Check your email', // code screen: heading
    note: "If your email has access, you'll receive a 6-digit code. It's valid for 10 minutes.", // code screen: neutral message (D-150)
    resend: 'Resend code', // code screen: text button under the boxes
    errorWrong: 'The code is incorrect or has expired. Check your email and try again.', // code screen: wrong or expired code
    errorNetwork: "We couldn't verify the code. Check your connection and try again.", // code screen: no connection
    errorRateLimit: "You've requested too many codes. Wait a moment and try again.", // code screen: sending limit
  },

  nav: {
    pipeline: 'Pipeline', // bottom bar destination (icon only) and title of its screen
    accounts: 'Accounts',
    home: 'Home',
    menu: 'Menu',
    employees: 'Employees',
    scheduleWork: 'Schedule and Work',
    accounting: 'Accounting',
    statistics: 'Statistics',
    settings: 'Settings',
    history: 'Change history',
    notifications: 'Notifications',
    profile: 'My profile and language',
  },

  pending: 'Pending', // TEMPORAL: text of the screens that do not exist yet

  home: {
    income: 'Income this month', // admin home: month figures
    profit: 'Profit',
    caughtUp: 'All caught up', // admin home: empty state
    nothingToReview: 'Nothing to review',
    today: 'Today', // staff home: today's visit card
    slideToClockIn: 'Slide to clock in',
    timeRange: (from: string, to: string) => `${from} to ${to}`, // "6:00 PM to 9:00 PM"
    weekDays: ['S', 'M', 'T', 'W', 'T', 'F', 'S'], // staff home: week strip, Sunday first (D-231)
    greeting: (name: string) => `Hi, ${name}`,
    dateLine: (d: Date | string) => {
      const x = d instanceof Date ? d : new Date();
      return `${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][x.getDay()]}, ${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][x.getMonth()]} ${x.getDate()}`;
    },
    profitLine: (m: string) => `Profit ${m}`,
    followUps: 'Follow-ups',
    followUpsSub: 'leads for today',
    walkthroughs: 'Walkthroughs',
    walkthroughsSub: 'scheduled',
    walkthroughOngoing: 'Walkthrough in progress',
    walkthroughStep: (company: string, step: number) => `${company} · Step ${step} of 5`,
    next: 'Next',
    yourWeek: 'Your week',
  },

  menu: {
    profileLine: (role: string) => `${role} · My profile`,
    activeEmployees: (n: number) => `${n} active`,
    historyLine: 'Recent changes',
    settingsLine: 'Terms, reasons and Super Admin',
  },

  profile: {
    title: 'My profile',
    name: 'Name',
    email: 'Email',
    language: 'Language',
    signOut: 'Sign out',
    english: 'English',
    spanish: 'Español',
    confirmTitle: 'Sign out?', // sign-out confirmation
    confirmBody: "You'll need to request a code to sign in again.",
    cancel: 'Cancel',
    languageError: "Couldn't change the language. Try again.", // profile screen: red notice under the language options (D-178)
    theme: 'Theme',
    themeSystem: 'System',
    themeLight: 'Light',
    themeDark: 'Dark',
  },

  common: {
    loading: 'Loading',
    back: 'Back', // screen reader name of the back arrow in the top bar (D-180)
    edit: 'Edit', // employee profile, Details tab: text button on the right of the top bar (D-174)
    save: 'Save', // employee profile, Details tab in edit mode: solid button
    cancel: 'Cancel', // cancel button of the confirmation sheets and of the edit mode
    yes: 'Yes', // employee profile: app access row
    no: 'No', // employee profile: app access row, person without access
    // D-216: phone and date/time pickers.
    phoneError: 'Enter a valid US phone number: 10 digits, and the area code and the next 3 digits don\'t start with 0 or 1. Example: (239) 555-0142.',
    pickDate: 'Choose a date',
    pickTime: 'Choose a time',
    noDate: 'No date',
    clearDate: 'Remove date',
    hour: 'Hour',
    minutes: 'Minutes',
    done: 'Done',
  },

  employees: {
    statActive: 'Active',
    statInactive: 'Inactive',
    active: 'Active', // employee list and profile: status chip
    inactive: 'Inactive', // employee list and profile: status chip
    w2: 'W-2', // worker type
    contractor: '1099', // worker type
    roleEmployee: 'Employee', // starting role
    roleSupervisor: 'Supervisor', // starting role
    roleAdmin: 'Admin', // starting role
    roleSuperAdmin: 'Super Admin', // role of the owner's account
    errorLoad: "Couldn't load the employees. Try again.", // employee list: red notice
  },

  newEmployee: {
    title: 'New employee', // top bar of the create screen
    name: 'Name', // field label
    phone: 'Phone', // field label
    type: 'Type', // segmented control label: W-2 / 1099
    role: 'Starting role', // dropdown label: the role is only a permission template that is adjusted later
    hasAccess: 'Has app access', // checkbox: shows the email field
    email: 'Email', // field label, shown only with app access
    language: 'Language', // dropdown label: language of the new employee's app
    create: 'Create employee', // solid button
    errorName: 'Enter the name.', // red notice under the name field
    errorEmailTaken: 'That email is already registered.', // red notice under the email field
    errorCreate: "Couldn't create the employee. Try again.", // red notice above the button
    errorForbidden: "You don't have permission to create employees.", // red notice above the button
  },

  employee: {
    tabData: 'Details', // profile tab
    tabPermissions: 'Permissions', // profile tab
    tabPay: 'Pay', // profile tab
    activeLabel: 'Active', // profile header: label of the on/off switch
    deactivateTitle: (name: string) => `Deactivate ${name}?`, // confirmation sheet when the switch is turned off
    deactivateBody: "They won't be able to sign in to the app anymore. Their history is kept.", // confirmation sheet
    deactivate: 'Deactivate', // confirmation sheet: solid button
    reactivateTitle: (name: string) => `Reactivate ${name}?`, // confirmation sheet when the switch is turned on
    reactivate: 'Reactivate', // confirmation sheet: solid button
    phone: 'Phone', // Details row
    email: 'Email', // Details row
    appAccess: 'App access', // Details row
    invitationSent: 'Invitation sent', // app access row while the person has not signed in yet
    pendingChip: 'Pending', // amber chip next to "Invitation sent"
    resendInvitation: 'Resend invitation', // outline button under the app access row
    accessSince: (date: string) => `Yes · since ${date}`, // app access row once the person has signed in
    invitationResent: 'Invitation resent.', // notice after resending
    inviteToApp: 'Invite to the app',
    inviteTitle: (name: string) => `Invite ${name}`,
    inviteNote: 'They get an email to sign in to the app. Use an email they check.',
    sendInvitation: 'Send invitation',
    inviteEmailError: 'Enter a valid email.',
    inviteSent: 'Invitation sent.',
    inviteError: "Couldn't give access. Try again.",
    invitationFailed: "The employee was created, but the invitation couldn't be sent. Tap Resend invitation.", // notice after creating
    errorSave: "Couldn't save. Try again.", // red notice in edit mode
    errorToggle: "Couldn't change the status. Try again.", // red notice after the switch
    errorResend: "Couldn't resend the invitation. Try again.", // red notice under the resend button
    errorLoad: "Couldn't load the employee. Try again.", // red notice when the profile does not load
    documents: 'Documents', // Details: section of the 1099 documents
    w9: 'W-9', // document name
    insuranceCertificate: 'Insurance certificate', // document name
    uploadedOn: (date: string) => `Uploaded on ${date}`, // document row detail
    noFile: 'No file', // document row detail
    uploadedChip: 'Uploaded', // green chip
    missingChip: 'Missing', // amber chip
    upload: 'Upload document', // outline button under the documents
    takePhoto: 'Take photo', // upload sheet: use the camera
    chooseFile: 'Choose file', // upload sheet: pick a photo or PDF from the phone
    errorUpload: "Couldn't upload the document. Try again.", // red notice under the documents
    errorOpen: "Couldn't open the document. Try again.", // red notice under the documents
    errorCamera: 'Allow camera access in the phone settings.', // red notice when the camera permission is denied
  },

  // Employee profile, Permissions and Pay tabs (D-058, D-188 to D-194). Translated from the Spanish text with context (D-157).
  permissions: {
    template: 'Starting template', // Permissions tab: dropdown label above the areas
    areas: {
      ventas: 'Sales', // permission area
      clientes: 'Clients and jobsites', // permission area
      empleados: 'Employees', // permission area
      schedule_work: 'Schedule and Work', // permission area
      accounting: 'Accounting', // permission area
      sistema: 'System', // permission area
    },
    chipAll: 'All', // area chip: every listed permission is on
    chipPartial: 'Partial', // area chip: some are on
    chipNone: 'No access', // area chip: none is on
    saveChanges: 'Save changes', // fixed solid button at the bottom of the Permissions tab
    applyTitle: (template: string) => `Apply the ${template} template?`, // confirmation sheet when changing the starting template
    applyBody: (name: string) => `Replaces ${name}'s current permissions.`, // confirmation sheet
    apply: 'Apply', // confirmation sheet: solid button
    noPayPermission: "You don't have permission to view pay", // Pay tab without the "View pay and rates" permission
    errorLoad: "Couldn't load the permissions. Try again.", // red notice when the tab does not load
    errorTemplate: "Couldn't load the template. Try again.", // red notice when applying a template fails
    labels: {
      leads_ver: 'View leads', // Sales permission
      leads_editar: 'Create and edit leads', // Sales permission
      leads_eliminar: 'Delete leads', // Sales permission
      walkthroughs_hacer: 'Do walkthroughs', // Sales permission
      quotes_ver: 'View quotes', // Sales permission
      quotes_editar: 'Create and edit quotes', // Sales permission
      quotes_enviar: 'Send quotes', // Sales permission
      quotes_ver_precios: 'View quote prices', // Sales permission
      sow_contratos_subir_ver: 'Upload and view SOWs and contracts', // Sales permission
      clientes_ver: 'View clients and jobsites', // Clients permission
      clientes_editar_datos: 'Edit details and contacts', // Clients permission
      clientes_editar_walkthrough_sow: 'Edit walkthrough and SOW', // Clients permission
      clientes_ver_tarifa: 'View client rate', // Clients permission
      clientes_cambiar_estado: 'Change status', // Clients permission
      empleados_ver: 'View list', // Employees permission
      empleados_invitar_crear: 'Invite and create', // Employees permission
      empleados_editar_desactivar: 'Edit and deactivate', // Employees permission
      empleados_ver_pagos: 'View pay and rates', // Employees permission
      empleados_asignar_pago: 'Assign to jobsites and set their pay', // Employees permission
      empleados_gestionar_permisos: 'Manage permissions', // Employees permission
      empleados_gestionar_documentos: 'Manage employee documents', // Employees permission: the only one that views, uploads and replaces 1099 documents
      schedule_ver_editar: 'View and edit the full schedule', // Schedule and Work permission
      work_registrar_por_otros: 'Log work for others', // Schedule and Work permission
      work_editar: 'Edit work records', // Schedule and Work permission
      work_aprobar: 'Approve work', // Schedule and Work permission
      work_revisar_gps: 'Review GPS alerts', // Schedule and Work permission
      ingresos_ver_registrar: 'View and record income', // Accounting permission
      ingresos_marcar_recibidos: 'Mark income as received', // Accounting permission
      personal_ver_costo: 'View staff cost', // Accounting permission
      gastos_ver: 'View expenses', // Accounting permission
      gastos_registrar_editar: 'Record and edit expenses', // Accounting permission
      gastos_recurrentes: 'Manage recurring expenses', // Accounting permission
      dashboard_global: 'View global dashboard', // Accounting permission
      dashboard_cuenta: 'View account dashboard', // Accounting permission
      reportes_exportar: 'Export reports', // Accounting permission
      estadisticas_ver: 'View statistics', // Accounting permission: the Statistics center (D-252)
      historial_ver: 'View change history', // System permission
    },
  },

  // Change history (D-088, D-198). Translated with context (D-157).
  history: {
    by: (who: string) => `by ${who}`, // history row detail: "{who or what} · by {who}"
    today: 'Today', // history row time: "Today 2:35 PM"
    yesterday: 'Yesterday', // history row time
    am: 'AM',
    pm: 'PM',
    termsKinds: {
      staff: 'Staff', // terms document type
      portal: 'Client portal', // terms document type
      privacy: 'Privacy', // terms document type
    },
    employeeCreated: 'Employee created',
    employeeDeactivated: 'Employee deactivated',
    employeeReactivated: 'Employee reactivated',
    employeeEdited: 'Employee edited',
    roleChanged: (role: string) => `Role changed: ${role}`,
    typeChanged: (type: string) => `Type changed: ${type}`,
    accessGiven: 'App access given',
    accessRemoved: 'App access removed',
    becameSuperAdmin: 'Now Super Admin',
    leftSuperAdmin: 'No longer Super Admin',
    superAdminTransferred: 'Super Admin role transferred',
    invitationSent: 'Invitation sent',
    invitationResent: 'Invitation resent',
    invitationFailed: 'Invitation not sent',
    permissionGiven: (name: string) => `Permission given: ${name}`,
    permissionRemoved: (name: string) => `Permission removed: ${name}`,
    documentUploaded: (name: string) => `Document uploaded: ${name}`,
    documentReplaced: (name: string) => `Document replaced: ${name}`,
    documentOpened: (name: string) => `Document opened: ${name}`,
    termsPublished: (version: string) => `Terms published: version ${version}`,
    termsAccepted: (version: string) => `Terms accepted: version ${version}`,
    leadCreated: 'Lead created',
    leadStatusChanged: 'Lead status changed',
    leadDeleted: 'Lead deleted',
    walkthroughScheduled: 'Walkthrough scheduled',
    walkthroughRescheduled: 'Walkthrough rescheduled',
    walkthroughStatusChanged: 'Walkthrough status changed',
    siteEdited: 'Site edited',
    siteDeleted: 'Site deleted',
    reasonCreated: 'Lost reason created', // lost-lead reason (Settings)
    reasonEdited: 'Lost reason edited',
    reasonDeactivated: 'Lost reason deactivated',
    reasonDeleted: 'Lost reason deleted',
    quoteCreated: 'Quote created',
    quoteNewVersion: (v: string) => `Quote: version ${v}`,
    quoteSent: (v: string) => `Quote sent: version ${v}`,
    quoteViewed: (v: string) => `Quote viewed: version ${v}`,
    quoteAccepted: (v: string) => `Quote accepted: version ${v}`,
    quoteRejected: (v: string) => `Quote rejected: version ${v}`,
    quoteChanges: (v: string) => `Changes requested: version ${v}`,
    clientCreated: 'Client created',
    jobsiteCreated: 'Jobsite created',
    unknown: 'Change recorded', // an action the app does not know yet
    empty: 'No changes yet.',
    errorLoad: "Couldn't load the history. Try again.",
  },

  // Transfer the Super Admin role (D-090, D-116, D-199).
  transfer: {
    row: 'Transfer Super Admin role', // Settings row
    title: 'Transfer Super Admin', // top bar
    newSuperAdmin: 'New Super Admin', // dropdown label
    understand: "I understand I'll no longer be Super Admin", // checkbox
    submit: 'Transfer role', // solid button
    noCandidates: 'No one else can receive the role yet: they must be active and have signed in to the app.',
    errorLoad: "Couldn't load the list. Try again.",
    errorTransfer: "Couldn't transfer the role. Try again.",
  },

  // Leaving the Permissions tab with unsaved changes.
  unsaved: {
    title: 'Leave without saving?', // confirmation sheet
    body: 'Your changes will be lost.', // confirmation sheet
    leave: 'Leave', // confirmation sheet: solid button
  },

  terms: {
    barTitle: 'Before you start', // first-sign-in terms screen
    location: 'Location only when you clock in and out',
    photos: 'Work photos',
    data: 'Your personal data',
    readFull: 'Read the full terms',
    checkbox: 'I have read and accept the terms',
    accept: 'Accept',
    errorSave: "Couldn't save your acceptance. Try again.", // terms screen: red notice above Accept (D-178)
    errorLoad: "Couldn't load the terms. Try again.", // "Read the full terms" link on the terms screen: red notice (D-178)
    offlineTitle: 'You need a connection to continue', // terms screen when the app can't check the terms: no internet (D-179)
    offlineBody: 'We check the terms when you open the app.', // same screen, line under the title ("al entrar" = when you open the app)
    retry: 'Try again', // same screen, solid button that checks again
  },

  // Menu → Settings (Super Admin only) and publishing the staff terms.
  settings: {
    viewPdf: 'View PDF', // D-216: outline button for the current version
    termsRow: 'Staff terms', // Settings row and title of the publish screen
    termsValue: (version: number) => `v${version}`, // value of the Settings row
    unpublished: 'Not published', // value of the row and of the version line when no version is published yet
    currentVersion: (version: number, date: string) => `Current version: ${version} · ${date}`, // publish screen, line under the title
    uploadPdf: 'Upload PDF', // dashed box to pick the lawyer's PDF
    acceptAgain: 'All staff will have to accept this version again.', // amber notice above the publish button
    publish: 'Publish new version', // solid button
    errorPublish: "Couldn't publish. Try again.", // publish screen: red notice if the upload or the publish fails
  },
};
