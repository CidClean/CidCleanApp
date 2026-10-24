import { useLocalSearchParams } from 'expo-router';

import { QuoteEditor } from '@/components/quotes/QuoteEditor';

/** Quote de un sitio del lead (D-077, D-208, D-209). El armado vive en QuoteEditor (también lo usa el extra, D-238). */
export default function SiteQuoteScreen() {
  const { id: leadId, siteId } = useLocalSearchParams<{ id: string; siteId: string }>();
  return <QuoteEditor source={{ kind: 'site', leadId, siteId }} />;
}
