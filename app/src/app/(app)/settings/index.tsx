import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { AppAlert } from '@/components/AppAlert';
import { ListRow } from '@/components/ListRow';
import { LostReasonsSettingsRow } from '@/components/sales/LostReasonsSettingsRow';
import { TopBar } from '@/components/TopBar';
import { useStrings } from '@/i18n/useStrings';
import { useGoBack } from '@/lib/navigation';
import { usePermissions } from '@/lib/session';
import { fetchCurrentTerms, type CurrentTerms } from '@/lib/termsApi';
import { useTheme } from '@/theme';

/**
 * Menú → Ajustes (D-107, D-114, D-169, D-187): filas con nombre, valor actual y flecha. Solo el Super Admin.
 * Por ahora una sola fila, "Términos del staff"; las demás se agregan cuando existan sus módulos.
 */
export default function SettingsScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const { colors } = useTheme();
  const strings = useStrings();
  const { isSuperAdmin } = usePermissions();
  const [current, setCurrent] = useState<CurrentTerms | null | undefined>(undefined); // undefined: aún no se lee
  const [failed, setFailed] = useState(false);

  // Se vuelve a leer al volver de publicar, para mostrar la versión nueva.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      fetchCurrentTerms().then((result) => {
        if (cancelled) return;
        setFailed(!result.ok);
        if (result.ok) setCurrent(result.data);
      });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  if (!isSuperAdmin) return <Redirect href="/" />;

  const value = current === undefined ? '' : current === null ? strings.settings.unpublished : strings.settings.termsValue(current.version);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar title={strings.nav.settings} onBack={goBack} backLabel={strings.common.back} />
      <ScrollView contentContainerStyle={{ padding: 12 }}>
        {failed ? <AppAlert tone="error" text={strings.terms.errorLoad} /> : null}
        <ListRow title={strings.settings.termsRow} detail={value} chevron onPress={() => router.push('/settings/terms')} />
        <LostReasonsSettingsRow last />
      </ScrollView>
    </View>
  );
}
