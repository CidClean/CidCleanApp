import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { ListRow } from '@/components/ListRow';
import { TopBar } from '@/components/TopBar';
import { useStrings } from '@/i18n/useStrings';
import { useWalkthroughStrings } from '@/i18n/useWalkthroughStrings';
import { useGoBack } from '@/lib/navigation';
import { usePermissions } from '@/lib/session';
import { canDoWalkthroughs, inProgress, type WalkthroughDoc } from '@/lib/walkthroughRules';
import { listWalkthroughs } from '@/lib/walkthroughStore';
import { useTheme } from '@/theme';

/**
 * Walkthroughs en curso en este teléfono (D-212), cuando hay más de uno: filas de 48px con "{empresa} · {sitio}"
 * y la fecha del último cambio. Funciona sin internet: todo sale de lo guardado en el teléfono.
 */
export default function WalkthroughsInProgressScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const { colors } = useTheme();
  const strings = useStrings();
  const w = useWalkthroughStrings();
  const { access } = usePermissions();
  const [docs, setDocs] = useState<WalkthroughDoc[]>([]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void listWalkthroughs().then((all) => {
        if (!cancelled) setDocs(inProgress(all));
      });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  if (!canDoWalkthroughs(access)) return <Redirect href="/" />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar title={w.home.row} onBack={goBack} backLabel={strings.common.back} />
      <ScrollView contentContainerStyle={{ padding: 12 }}>
        {docs.map((d, i) => (
          <ListRow
            key={d.id}
            title={d.company}
            detail={`${d.siteLabel} · ${w.stepLine(d.step, w.steps[(['site', 'areas', 'frequency', 'internal', 'summary'] as const)[Math.min(4, Math.max(0, d.step - 1))]])}`}
            chevron
            last={i === docs.length - 1}
            onPress={() => router.push({ pathname: '/walkthrough/[id]', params: { id: d.id } })}
          />
        ))}
      </ScrollView>
    </View>
  );
}
