import { StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { sample, radius, useTheme } from '@/theme';

/** Tarjeta de la visita de hoy en grande (D-165): "Hoy", sitio y horario. */
export function TodayCard({ label, siteName, range }: { label: string; siteName: string; range: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { borderColor: colors.fieldBorder }]}>
      <AppText size={sample.noteSize} color={colors.secondary}>
        {label}
      </AppText>
      <AppText weight="medium" size={18}>
        {siteName}
      </AppText>
      <AppText size={sample.noteSize} color={colors.secondary}>
        {range}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.control,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
});
