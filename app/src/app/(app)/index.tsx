import { View } from 'react-native';

import { AppText } from '@/components/AppText';
import { strings } from '@/i18n';
import { useTheme } from '@/theme';

// TEMPORAL: reemplazar al construir Inicio
export default function HomePlaceholder() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <AppText center>{strings.home.placeholder}</AppText>
    </View>
  );
}
