import { StyleSheet, TextInput, View } from 'react-native';
import type { RefObject } from 'react';

import { AppText } from './AppText';
import { CODE_LENGTH } from '@/lib/codeEntry';
import { radius, sample, useTheme } from '@/theme';

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  inputRef: RefObject<any>;
  hasError?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
};

/**
 * 6 casillas de 48px (D-040) que se llenan con lo que se escribe en un TextInput real, sin estilo visible,
 * puesto encima de las casillas: tocarlas enfoca el teclado del teléfono (D-163).
 * La casilla activa lleva borde de marca de 2px, como en la muestra.
 */
export function CodeBoxes({ value, onChangeText, inputRef, hasError = false, disabled = false, accessibilityLabel }: Props) {
  const { colors, brand, status } = useTheme();
  return (
    <View style={styles.wrap}>
      <View style={styles.row} pointerEvents="none">
        {Array.from({ length: CODE_LENGTH }, (_, i) => {
          const current = i === value.length;
          return (
            <View
              key={i}
              style={[
                styles.box,
                {
                  borderColor: hasError ? status.error : current ? brand : colors.fieldBorder,
                  borderWidth: current && !hasError ? 2 : 1,
                },
              ]}
            >
              <AppText weight="medium" size={sample.codeBoxSize}>
                {value[i] ?? ''}
              </AppText>
            </View>
          );
        })}
      </View>
      <TextInput
        ref={inputRef}
        testID="code-input"
        value={value}
        onChangeText={onChangeText}
        editable={!disabled}
        autoFocus
        maxLength={CODE_LENGTH}
        keyboardType="number-pad"
        inputMode="numeric"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        autoCorrect={false}
        caretHidden
        selectionColor="transparent"
        accessibilityLabel={accessibilityLabel}
        style={styles.hidden}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginVertical: 8 },
  row: { flexDirection: 'row', gap: sample.codeBoxGap },
  box: {
    flex: 1,
    height: sample.codeBoxHeight,
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Cubre las casillas, invisible pero enfocable.
  hidden: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0,
    color: 'transparent',
    // en la web, sin recuadro de enfoque
    ...({ outlineStyle: 'none' } as object),
  },
});
