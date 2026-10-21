import { Redirect } from 'expo-router';
import { View } from 'react-native';

import { AppText } from './AppText';
import { TopBar } from './TopBar';
import { useStrings } from '@/i18n/useStrings';
import { useTheme } from '@/theme';

/** TEMPORAL: pantalla que todavía no existe. Muestra su título y "Pendiente". Reemplazar al construirla. */
export function PendingScreen({ title, allowed = true }: { title: string; allowed?: boolean }) {
  const { colors } = useTheme();
  const strings = useStrings();
  if (!allowed) return <Redirect href="/" />;
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar title={title} />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <AppText center>{strings.pending}</AppText>
      </View>
    </View>
  );
}
