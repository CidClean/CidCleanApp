import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from './AppText';
import { sample, useTheme } from '@/theme';

/** Barra superior de marca con el título de la pantalla (muestras aprobadas). */
export function TopBar({ title }: { title: string }) {
  const insets = useSafeAreaInsets();
  const { brand } = useTheme();
  return (
    <View style={[styles.bar, { backgroundColor: brand, paddingTop: insets.top + sample.barPaddingVertical }]}>
      <AppText weight="medium" size={sample.barTextSize} color="#FFFFFF" accessibilityRole="header">
        {title}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { paddingHorizontal: 12, paddingBottom: sample.barPaddingVertical },
});
