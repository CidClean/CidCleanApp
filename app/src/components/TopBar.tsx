import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { iconStrokeWidth, sample, useTheme } from '@/theme';

/** Acción a la derecha de la barra: texto ("Editar", D-174) o icono (+, D-185). */
export type TopBarAction = {
  label?: string;
  icon?: IconName;
  onPress: () => void;
  accessibilityLabel: string;
};

type Props = {
  title: string;
  /** Flecha de volver a la izquierda (D-180): se pone en las pantallas a las que se entra desde otra. */
  onBack?: () => void;
  backLabel?: string;
  action?: TopBarAction;
  /** Línea bajo el título (aviso de sincronización del walkthrough, D-091, D-119). */
  subtitle?: ReactNode;
};

/** Barra superior de marca con el título de la pantalla (muestras aprobadas). */
export function TopBar({ title, onBack, backLabel, action, subtitle }: Props) {
  const insets = useSafeAreaInsets();
  const { brand } = useTheme();
  return (
    <View style={[styles.bar, { backgroundColor: brand, paddingTop: insets.top + sample.barPaddingVertical }]}>
      <View style={styles.left}>
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={backLabel}
            onPress={onBack}
            hitSlop={12}
            style={styles.back}
          >
            <Icon name="chevron-left" size={22} strokeWidth={iconStrokeWidth} color="#FFFFFF" />
          </Pressable>
        ) : null}
        <View style={styles.title}>
          <AppText weight="medium" size={sample.barTextSize} color="#FFFFFF" accessibilityRole="header" numberOfLines={1}>
            {title}
          </AppText>
          {subtitle}
        </View>
      </View>
      {action ? (
        <Pressable accessibilityRole="button" accessibilityLabel={action.accessibilityLabel} onPress={action.onPress} hitSlop={12}>
          {action.icon ? (
            <Icon name={action.icon} size={22} strokeWidth={iconStrokeWidth} color="#FFFFFF" />
          ) : (
            <AppText weight="medium" size={sample.barTextSize} color="#FFFFFF">
              {action.label}
            </AppText>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: 12,
    paddingBottom: sample.barPaddingVertical,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  back: { marginLeft: -4 },
  title: { flexShrink: 1 },
});
