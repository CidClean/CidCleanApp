import { useLocalSearchParams } from 'expo-router';

import { OneTimeQuoteEditor } from '@/components/quotes/OneTimeQuoteEditor';

/** Quote one-time de un sitio del lead (orden 162, D-350 (4)). */
export default function OneTimeQuoteScreen() {
  const { siteId } = useLocalSearchParams<{ id: string; siteId: string }>();
  return <OneTimeQuoteEditor siteId={siteId} />;
}
