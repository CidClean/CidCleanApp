import { Redirect } from 'expo-router';
import { View } from 'react-native';

import { AppText } from './AppText';
import { TopBar } from './TopBar';
import { useStrings } from '@/i18n/useStrings';
import { useGoBack } from '@/lib/navigation';
import { useTheme } from '@/theme';

/** TEMPORAL: contenido de una pantalla o pestaña que todavía no existe. Reemplazar al construirla. */
export function PendingBody() {
  const strings = useStrings();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <AppText center>{strings.pending}</AppText>
    </View>
  );
}

/** TEMPORAL: pantalla que todavía no existe. Muestra su título y "Pendiente". `back` pone la flecha de volver (D-180). */
export function PendingScreen({ title, allowed = true, back = false }: { title: string; allowed?: boolean; back?: boolean }) {
  const { colors } = useTheme();
  const strings = useStrings();
  const goBack = useGoBack();
  if (!allowed) return <Redirect href="/" />;
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar title={title} onBack={back ? goBack : undefined} backLabel={strings.common.back} />
      <PendingBody />
    </View>
  );
}
