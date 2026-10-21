import { View } from 'react-native';

import { AppText } from '@/components/AppText';
import { useStrings } from '@/i18n/useStrings';
import { useTheme } from '@/theme';

// TEMPORAL: reemplazar al construir Inicio
export default function HomePlaceholder() {
  const { colors } = useTheme();
  const strings = useStrings();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <AppText center>{strings.home.placeholder}</AppText>
    </View>
  );
}
