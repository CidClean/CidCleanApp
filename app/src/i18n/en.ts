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

  home: {
    // TEMPORAL: reemplazar al construir Inicio
    placeholder: 'Signed in. Home screen pending.', // temporary screen after signing in
  },
};
