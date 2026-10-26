import { Image, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { useTheme } from '@/theme';

/**
 * Logo de D-248 con "Cid Clean" en Manrope 800 del color de marca (orden 33, D-250): el mismo encabezado de los
 * correos, para el portal del cliente.
 */
export function BrandMark({ size = 44 }: { size?: number }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row} accessible accessibilityRole="header" accessibilityLabel="Cid Clean">
      <Image source={require('../../../assets/images/brand-logo.png')} style={{ width: size, height: size }} accessibilityIgnoresInvertColors />
      <AppText weight="heavy" size={20} color={colors.brandText}>
        Cid Clean
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
