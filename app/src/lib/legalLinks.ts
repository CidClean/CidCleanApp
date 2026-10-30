import { Linking } from 'react-native';

import { LEGAL_URLS } from '@/i18n/legal';
import { fetchCurrentTerms, type TermsKind } from './termsApi';

/**
 * Abre un texto legal (D-282: solo en inglés): el PDF de la versión publicada en el visor de la app (D-176, D-196) o,
 * si todavía no hay versión publicada, la página en inglés de app.cidclean.com.
 */
export async function openLegal(router: { push: (href: { pathname: '/viewer'; params: Record<string, string> }) => void }, kind: TermsKind, title: string): Promise<void> {
  const current = await fetchCurrentTerms(kind);
  if (current.ok && current.data !== null) {
    router.push({ pathname: '/viewer', params: { source: 'terms', kind, title } });
    return;
  }
  await Linking.openURL(kind === 'privacy' ? LEGAL_URLS.privacy : kind === 'portal' ? LEGAL_URLS.portal : LEGAL_URLS.staff);
}
