import { Pressable, StyleSheet } from 'react-native';

import { AppText } from './AppText';
import { radius, sample, useTheme } from '@/theme';

type Props = {
  label: string;
  onPress: () => void;
  /** solid: botón de marca (D-149). text: botón de texto (D-150). */
  variant?: 'solid' | 'text';
  /** Estilo "deshabilitado" de la muestra aprobada: superficie, borde y texto secundario. */
  disabled?: boolean;
};

export function AppButton({ label, onPress, variant = 'solid', disabled = false }: Props) {
  const { colors, brand } = useTheme();
  const solid = variant === 'solid';

  const box = solid
    ? disabled
      ? { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }
      : { backgroundColor: brand, borderColor: brand, borderWidth: 1 }
    : null;
  const textColor = solid ? (disabled ? colors.secondary : '#FFFFFF') : disabled ? colors.secondary : colors.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      onPress={disabled ? undefined : onPress}
      style={[styles.base, box]}
    >
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
    alignItems: 'center',
    justifyContent: 'center',
  },
});
