import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { TopBar } from '@/components/TopBar';
import { useStrings } from '@/i18n/useStrings';
import { supabase } from '@/lib/supabase';
import { sample, useTheme } from '@/theme';

/** Texto completo de la versión vigente de los términos del staff (texto plano, desplazable). */
export default function ReadTermsScreen() {
  const { colors, status } = useTheme();
  const strings = useStrings();
  const [body, setBody] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('terms_documents')
      .select('body')
      .eq('kind', 'staff')
      .order('version', { ascending: false })
      .limit(1)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data || data.length === 0) setFailed(true);
        else setBody(data[0].body);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar title={strings.terms.readFull} />
      <ScrollView contentContainerStyle={{ padding: 12 }}>
        {body !== null ? <AppText>{body}</AppText> : null}
        {failed ? (
          <AppText size={sample.noteSize} color={status.error}>
            {strings.terms.errorLoad}
          </AppText>
        ) : null}
      </ScrollView>
    </View>
  );
}
