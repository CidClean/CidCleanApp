import { StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { Icon } from './Icon';
import { iconStrokeWidth, radius, sample, useTheme } from '@/theme';

/** Alerta (D-032): tarjeta con borde de 1px y icono. Ámbar por defecto; roja para errores (D-178). */
export function AppAlert({ text, tone = 'warning' }: { text: string; tone?: 'warning' | 'error' }) {
  const { colors, status } = useTheme();
  const color = tone === 'error' ? status.error : status.warning;
  return (
    <View accessibilityRole="alert" style={[styles.box, { borderColor: color, backgroundColor: colors.background }]}>
      <Icon name="alert-triangle" size={sample.alertIconSize} strokeWidth={iconStrokeWidth} color={color} />
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
