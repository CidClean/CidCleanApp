import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '../AppText';
import { Icon } from '../Icon';
import { useSummaryPlStrings } from '@/i18n/useSummaryPlStrings';
import { iconStrokeWidth, radius, useTheme } from '@/theme';

/** Año con flecha izquierda y derecha (como D-069 y D-274, sin pastillas): resumen del empleado y Profit & Loss. */
export function YearBar({ year, onChange }: { year: number; onChange: (y: number) => void }) {
  const { colors } = useTheme();
  const t = useSummaryPlStrings();
  return (
    <View style={[styles.bar, { backgroundColor: colors.card }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={t.previousYear} hitSlop={8} onPress={() => onChange(year - 1)} style={styles.arrow}>
        <Icon name="chevron-left" size={20} strokeWidth={iconStrokeWidth} color={colors.brandText} />
      </Pressable>
      <AppText weight="heavy" size={15} center style={{ flex: 1 }} accessibilityRole="header">
        {String(year)}
      </AppText>
      <Pressable accessibilityRole="button" accessibilityLabel={t.nextYear} hitSlop={8} onPress={() => onChange(year + 1)} style={styles.arrow}>
        <Icon name="chevron-right" size={20} strokeWidth={iconStrokeWidth} color={colors.brandText} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { height: 48, borderRadius: radius.card, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  arrow: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
});
