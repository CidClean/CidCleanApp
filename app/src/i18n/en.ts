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
    languageError: "We couldn't change the language. Check your connection and try again.",
  },

  terms: {
    barTitle: 'Before you start', // first-sign-in terms screen
    location: 'Location only when you clock in and out',
    photos: 'Work photos',
    data: 'Your personal data',
    readFull: 'Read the full terms',
    checkbox: 'I have read and accept the terms',
    accept: 'Accept',
    errorSave: "We couldn't save your acceptance. Check your connection and try again.",
    errorLoad: "We couldn't load the terms. Check your connection and try again.",
  },
};
