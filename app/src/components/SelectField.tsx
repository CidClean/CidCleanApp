import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { Icon } from './Icon';
import { density, iconStrokeWidth, radius, sample, useTheme } from '@/theme';

type Option<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  label: string;
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
};

/** Campo desplegable (muestra ronda 15): igual que un campo, con la flecha hacia abajo; las opciones se abren debajo. */
export function SelectField<T extends string>({ label, options, value, onChange }: Props<T>) {
  const { colors, brand } = useTheme();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <View style={styles.wrap}>
      <AppText size={sample.labelSize} color={colors.secondary} style={styles.label}>
        {label}
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)}
        style={[styles.box, { borderColor: colors.fieldBorder }]}
      >
        <AppText>{current?.label ?? ''}</AppText>
        <Icon name="chevron-down" size={18} strokeWidth={iconStrokeWidth} color={colors.text} />
      </Pressable>
      {open ? (
        <View>
          {options.map((o, i) => {
            const on = o.value === value;
            return (
              <Pressable
                key={o.value}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                onPress={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                style={[
                  styles.option,
                  { borderBottomColor: colors.border, borderBottomWidth: i === options.length - 1 ? 0 : 0.5 },
                ]}
              >
                <View style={[styles.radio, { borderColor: on ? brand : colors.radioBorder }]}>
                  {on ? <View style={[styles.dot, { backgroundColor: brand }]} /> : null}
                </View>
                <AppText>{o.label}</AppText>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 8 },
  label: { marginBottom: 3 },
  box: {
    borderWidth: 1,
    borderRadius: radius.control,
    paddingVertical: density.fieldPaddingVertical,
    paddingHorizontal: sample.fieldHorizontalPadding,
    minHeight: sample.fieldLineHeight + density.fieldPaddingVertical * 2 + 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  option: { minHeight: density.row, flexDirection: 'row', alignItems: 'center', gap: 10 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 9, height: 9, borderRadius: 5 },
});
