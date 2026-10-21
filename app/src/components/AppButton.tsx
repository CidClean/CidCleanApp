import { Pressable, StyleSheet } from 'react-native';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { iconStrokeWidth, radius, sample, useTheme } from '@/theme';

type Props = {
  label: string;
  onPress: () => void;
  /** solid: botón de marca (D-149). outline: botón de contorno (muestras de la ronda 15). text: botón de texto (D-150). */
  variant?: 'solid' | 'outline' | 'text';
  /** Estilo "deshabilitado" de la muestra aprobada: superficie, borde y texto secundario. */
  disabled?: boolean;
  /** Icono de línea fina a la izquierda del texto (18px). */
  icon?: IconName;
};

export function AppButton({ label, onPress, variant = 'solid', disabled = false, icon }: Props) {
  const { colors, brand } = useTheme();
  const solid = variant === 'solid';
  const outline = variant === 'outline';

  const box = solid
    ? disabled
      ? { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }
      : { backgroundColor: brand, borderColor: brand, borderWidth: 1 }
    : outline
      ? { borderColor: disabled ? colors.border : brand, borderWidth: 1 }
      : null;
  const textColor = solid ? (disabled ? colors.secondary : '#FFFFFF') : disabled ? colors.secondary : colors.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      onPress={disabled ? undefined : onPress}
      style={[styles.base, box]}
    >
      {icon ? <Icon name={icon} size={18} strokeWidth={iconStrokeWidth} color={textColor} /> : null}
      <AppText weight="medium" size={sample.buttonSize} color={textColor}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: sample.buttonMinHeight,
    borderRadius: radius.control,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
