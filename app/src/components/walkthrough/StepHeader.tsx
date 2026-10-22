import { StyleSheet, View } from 'react-native';

import { AppText } from '../AppText';
import { sample, useTheme } from '@/theme';

/** "Paso N de 5 · nombre" en gris de 13px y barra de progreso de 4px en color de marca (D-073, muestra ronda 8). */
export function StepHeader({ label, progress }: { label: string; progress: number }) {
  const { colors, brand } = useTheme();
  return (
    <View style={{ marginBottom: 10 }}>
      <AppText size={sample.noteSize} color={colors.secondary} style={{ marginBottom: 4 }}>
        {label}
      </AppText>
      <View style={[styles.track, { backgroundColor: colors.border }]}>
        <View style={[styles.fill, { backgroundColor: brand, width: `${Math.round(progress * 100)}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 4, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 4 },
});
