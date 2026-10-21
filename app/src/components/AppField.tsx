import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { AppText } from './AppText';
import { density, fonts, radius, sample, useTheme } from '@/theme';

type Props = TextInputProps & {
  label: string;
  /** Texto de error debajo; el contorno pasa a rojo (D-061). */
  error?: string | null;
};

export function AppField({ label, error, style, ...rest }: Props) {
  const { colors, status } = useTheme();
  return (
    <View style={styles.wrap}>
      <AppText size={sample.labelSize} color={colors.secondary} style={styles.label}>
        {label}
      </AppText>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.secondary}
        {...rest}
        style={[
          styles.input,
          {
            borderColor: error ? status.error : colors.fieldBorder,
            color: colors.text,
            fontFamily: fonts.regular,
          },
          style,
        ]}
      />
      {error ? (
        <AppText size={sample.noteSize} color={status.error} style={styles.error}>
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 8 },
  label: { marginBottom: 3 },
  input: {
    borderWidth: 1,
    borderRadius: radius.control,
    paddingVertical: density.fieldPaddingVertical,
    paddingHorizontal: sample.fieldHorizontalPadding,
    fontSize: density.text,
    lineHeight: sample.fieldLineHeight,
    minHeight: sample.fieldLineHeight + density.fieldPaddingVertical * 2 + 2,
  },
  error: { marginTop: 4 },
});
