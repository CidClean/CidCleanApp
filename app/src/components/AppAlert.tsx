import { Icon } from './Icon';
import { StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { iconStrokeWidth, radius, sample, useTheme } from '@/theme';

/** Alerta ámbar (D-032): tarjeta con borde de 1px en el color de advertencia, con icono. */
export function AppAlert({ text }: { text: string }) {
  const { colors, status } = useTheme();
  return (
    <View
      accessibilityRole="alert"
      style={[styles.box, { borderColor: status.warning, backgroundColor: colors.background }]}
    >
      <Icon name="alert-triangle" size={sample.alertIconSize} strokeWidth={iconStrokeWidth} color={status.warning} />
      <AppText size={sample.noteSize} style={styles.text}>
        {text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: radius.control,
    marginBottom: 12,
  },
  text: { flex: 1 },
});
