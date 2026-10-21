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
    weekDays: ['M', 'T', 'W', 'T', 'F', 'S', 'S'], // staff home: week strip, Monday first
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
  },

  common: {
    back: 'Back', // screen reader name of the back arrow in the top bar (D-180)
    edit: 'Edit', // employee profile, Details tab: text button on the right of the top bar (D-174)
    save: 'Save', // employee profile, Details tab in edit mode: solid button
    cancel: 'Cancel', // cancel button of the confirmation sheets and of the edit mode
    yes: 'Yes', // employee profile: app access row
    no: 'No', // employee profile: app access row, person without access
  },

  employees: {
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

  terms: {
    barTitle: 'Before you start', // first-sign-in terms screen
    location: 'Location only when you clock in and out',
    photos: 'Work photos',
    data: 'Your personal data',
    readFull: 'Read the full terms',
    checkbox: 'I have read and accept the terms',
    accept: 'Accept',
    errorSave: "Couldn't save your acceptance. Try again.", // terms screen: red notice above Accept (D-178)
    errorLoad: "Couldn't load the terms. Try again.", // full terms screen: red notice (D-178)
  },
};
