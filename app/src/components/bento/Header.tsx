import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '../AppText';
import { Icon, type IconName } from '../Icon';
import { iconStrokeWidth, useTheme } from '@/theme';

/**
 * Encabezados de las pantallas sin barra de marca (D-223, D-226). Respetan el área segura de arriba (barra de estado
 * del teléfono) con el inset del sistema más el relleno de la muestra.
 */

/** Título de pantalla principal: línea gris de 13px, título de 24px/800 y, a la derecha, un cuadro de marca de 48px. */
export function TitleHeader({
  kicker,
  title,
  action,
  left,
}: {
  kicker?: string;
  title: string;
  action?: { icon: IconName; label: string; onPress: () => void };
  /** Algo a la izquierda en lugar del texto (perfil del Menú). */
  left?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { colors, brand } = useTheme();
  return (
    <View style={[styles.title, { paddingTop: insets.top + 20 }]}>
      {left ?? (
        <View style={{ gap: 2, flex: 1 }}>
          {kicker ? (
            <AppText size={13} color={colors.secondary}>
              {kicker}
            </AppText>
          ) : null}
          <AppText weight="heavy" size={24} accessibilityRole="header">
            {title}
          </AppText>
        </View>
      )}
      {action ? (
        <Pressable accessibilityRole="button" accessibilityLabel={action.label} onPress={action.onPress} style={[styles.square, { backgroundColor: brand }]}>
          <Icon name={action.icon} size={22} strokeWidth={2} color="#FFFFFF" />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Barra de un detalle (muestra Lead): botón blanco de volver de 44px con esquinas de 14px y una acción de texto. */
export function BackHeader({
  onBack,
  backLabel,
  title,
  action,
  subtitle,
}: {
  onBack: () => void;
  backLabel: string;
  /** Título opcional al centro (secciones abiertas desde el mosaico). */
  title?: string;
  /** Acción de texto (Editar) o, con icono, un cuadro de marca de 44px (+ para crear). */
  action?: { label: string; onPress: () => void; icon?: IconName; accessibilityLabel?: string };
  /** Línea bajo la barra (aviso de sincronización del walkthrough, D-091). */
  subtitle?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { colors, brand } = useTheme();
  return (
    <View style={{ paddingTop: insets.top + 16, paddingBottom: 8, paddingHorizontal: 16 }}>
    <View style={styles.back}>
      <Pressable accessibilityRole="button" accessibilityLabel={backLabel} onPress={onBack} style={[styles.whiteSquare, { backgroundColor: colors.card }]}>
        <Icon name="chevron-left" size={22} strokeWidth={iconStrokeWidth} color={colors.text} />
      </Pressable>
      {title ? (
        <AppText weight="heavy" size={18} accessibilityRole="header" numberOfLines={1} style={{ flex: 1, textAlign: 'center' }}>
          {title}
        </AppText>
      ) : (
        <View style={{ flex: 1 }} />
      )}
      {action?.icon ? (
        <Pressable accessibilityRole="button" accessibilityLabel={action.accessibilityLabel ?? action.label} onPress={action.onPress} style={[styles.whiteSquare, { backgroundColor: brand }]}>
          <Icon name={action.icon} size={22} strokeWidth={2} color="#FFFFFF" />
        </Pressable>
      ) : action ? (
        <Pressable accessibilityRole="button" accessibilityLabel={action.accessibilityLabel ?? action.label} onPress={action.onPress} style={[styles.textButton, { backgroundColor: colors.card }]}>
          <AppText weight="bold" size={14} color={colors.brandText}>
            {action.label}
          </AppText>
        </Pressable>
      ) : (
        <View style={{ width: 44 }} />
      )}
    </View>
    {subtitle ? <View style={{ marginTop: 6, alignItems: 'center' }}>{subtitle}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { paddingHorizontal: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  square: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  back: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  whiteSquare: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  textButton: { height: 44, paddingHorizontal: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
