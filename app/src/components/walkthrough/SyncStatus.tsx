import { StyleSheet, View } from 'react-native';

import { AppText } from '../AppText';
import { Icon } from '../Icon';
import type { SyncBadge } from '@/lib/walkthroughRules';
import { iconStrokeWidth } from '@/theme';

type Props = { badge: SyncBadge; pendingLabel: (n: number) => string; syncedLabel: string };

/**
 * Aviso bajo el título del encabezado (muestra ronda 12): 12px en blanco, iconos de 14px.
 * Con cola: nube y "N pendientes" (D-091). Sin cola tras sincronizar: nube, marca y "Sincronizado", que se queda (D-119).
 */
export function SyncStatus({ badge, pendingLabel, syncedLabel }: Props) {
  if (badge.kind === 'none') return null;
  return (
    <View style={styles.row} accessibilityLiveRegion="polite">
      <Icon name="cloud" size={14} strokeWidth={iconStrokeWidth} color="#FFFFFF" />
      {badge.kind === 'synced' ? <Icon name="check" size={14} strokeWidth={iconStrokeWidth} color="#FFFFFF" /> : null}
      <AppText size={12} color="#FFFFFF">
        {badge.kind === 'pending' ? pendingLabel(badge.count) : syncedLabel}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
});
