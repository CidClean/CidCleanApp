import { useLocalSearchParams } from 'expo-router';

import { QuoteEditor } from '@/components/quotes/QuoteEditor';

/** Quote de extra de un jobsite (D-238): el mismo armado del quote, sin walkthrough, con fecha del servicio. */
export default function ExtraQuoteScreen() {
  const { quoteId } = useLocalSearchParams<{ id: string; quoteId: string }>();
  return <QuoteEditor source={{ kind: 'extra', quoteId }} />;
}
