import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppButton } from '../AppButton';
import { AppText } from '../AppText';
import { Dialog } from '../Dialog';
import { Icon } from '../Icon';
import { useAccountingStrings } from '@/i18n/useAccountingStrings';
import { isRange, monthKeyOf, monthTitle, normalizePeriod, periodTitle, shiftMonth, shiftPeriod, type Period } from '@/lib/accountingRules';
import { iconStrokeWidth, radius, sample, useTheme } from '@/theme';

/**
 * Selector de mes con flecha izquierda, mes y flecha derecha (D-069) y, a la derecha, "Rango" (D-215: por mes o
 * rango) que abre una ventana al centro (D-229) con Desde y Hasta, cada uno con sus flechas.
 */
export function PeriodBar({ period, onChange }: { period: Period; onChange: (p: Period) => void }) {
  const { colors, brand } = useTheme();
  const a = useAccountingStrings();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Period>(period);
  return (
    <View style={styles.wrap}>
      <View style={[styles.bar, { backgroundColor: colors.card }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={a.previousMonth} hitSlop={8} onPress={() => onChange(shiftPeriod(period, -1))} style={styles.arrow}>
          <Icon name="chevron-left" size={20} strokeWidth={iconStrokeWidth} color={colors.text} />
        </Pressable>
        <AppText weight="bold" size={15} center style={{ flex: 1 }} accessibilityRole="header">
          {periodTitle(period, a)}
        </AppText>
        <Pressable accessibilityRole="button" accessibilityLabel={a.nextMonth} hitSlop={8} onPress={() => onChange(shiftPeriod(period, 1))} style={styles.arrow}>
          <Icon name="chevron-right" size={20} strokeWidth={iconStrokeWidth} color={colors.text} />
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: isRange(period) }}
        onPress={() => {
          setDraft(period);
          setOpen(true);
        }}
        style={[styles.range, { backgroundColor: isRange(period) ? brand : colors.card }]}
      >
        <AppText weight="bold" size={13} color={isRange(period) ? '#FFFFFF' : colors.brandText}>
          {a.range}
        </AppText>
      </Pressable>
      <Dialog visible={open} onClose={() => setOpen(false)}>
        <AppText weight="medium" size={sample.headingSize} style={{ marginBottom: 8 }}>
          {a.rangeTitleDialog}
        </AppText>
        <MonthStepper label={a.from} value={draft.from} onChange={(from) => setDraft({ ...draft, from })} />
        <MonthStepper label={a.to} value={draft.to} onChange={(to) => setDraft({ ...draft, to })} />
        <View style={{ gap: 8, marginTop: 8 }}>
          <AppButton
            label={a.apply}
            onPress={() => {
              onChange(normalizePeriod(draft));
              setOpen(false);
            }}
          />
          <AppButton
            label={a.oneMonth}
            variant="outline"
            onPress={() => {
              const m = isRange(period) ? period.to : monthKeyOf(new Date());
              onChange({ from: m, to: m });
              setOpen(false);
            }}
          />
          <AppButton label={a.cancel} variant="text" onPress={() => setOpen(false)} />
        </View>
      </Dialog>
    </View>
  );
}

function MonthStepper({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const { colors } = useTheme();
  const a = useAccountingStrings();
  return (
    <View style={{ marginBottom: 8 }}>
      <AppText size={sample.labelSize} color={colors.secondary} style={{ marginBottom: 3 }}>
        {label}
      </AppText>
      <View style={[styles.stepper, { borderColor: colors.fieldBorder }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${label} · ${a.previousMonth}`} hitSlop={8} onPress={() => onChange(shiftMonth(value, -1))} style={styles.arrow}>
          <Icon name="chevron-left" size={18} strokeWidth={iconStrokeWidth} color={colors.text} />
        </Pressable>
        <AppText center style={{ flex: 1 }}>
          {monthTitle(value, a)}
        </AppText>
        <Pressable accessibilityRole="button" accessibilityLabel={`${label} · ${a.nextMonth}`} hitSlop={8} onPress={() => onChange(shiftMonth(value, 1))} style={styles.arrow}>
          <Icon name="chevron-right" size={18} strokeWidth={iconStrokeWidth} color={colors.text} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  bar: { flex: 1, height: 48, borderRadius: radius.card, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  arrow: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  range: { height: 48, borderRadius: radius.card, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  stepper: { borderWidth: 1, borderRadius: radius.control, flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingHorizontal: 4 },
});
