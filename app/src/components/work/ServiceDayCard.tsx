import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppAlert } from '../AppAlert';
import { AppText } from '../AppText';
import { Card } from '../bento/Card';
import { showDone } from '@/components/brand/DoneOverlay';
import { useServiceDaysStrings } from '@/i18n/useServiceDaysStrings';
import type { MyVisit } from '@/lib/scheduleApi';
import { completeServiceDay } from '@/lib/serviceDays';
import { formatTime } from '@/lib/week';
import { useTheme } from '@/theme';

/**
 * Inicio del 1099 (D-275, D-286 (1), `surveys/dias-servicio-aprobado.html`): tarjeta verde con la cuenta de hoy,
 * "Hoy · Franja de acceso del cliente: {inicio} – {fin}" y el botón blanco "Marcar como completado". Sin clock in,
 * sin horas y sin ubicación: la app nunca pide la ubicación a un 1099 (D-277). Devuelto, muestra la nota del admin
 * y "Marcar de nuevo como completado".
 */
export function ServiceDayCard({ visit, onChanged }: { visit: MyVisit; onChanged: () => void }) {
  const t = useServiceDaysStrings();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = new Date(visit.startsAt.getTime() + visit.minutes * 60000);
  const day = visit.serviceDay;

  async function mark() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await completeServiceDay(visit.id);
    setBusy(false);
    if (!r.ok) {
      setError(r.reason === 'network' ? t.offlineMark : t.errorMark);
      return;
    }
    showDone();
    onChanged();
  }

  return (
    <Card tone="brand" wide style={styles.card}>
      <View style={{ gap: 6 }}>
        <AppText weight="heavy" size={22} color="#FFFFFF">
          {visit.jobsite}
        </AppText>
        <AppText size={12} color="#FFFFFF" style={{ opacity: 0.85 }}>
          {t.todayWindow(formatTime(visit.startsAt), formatTime(end))}
        </AppText>
      </View>
      {error ? <AppAlert tone="error" text={error} /> : null}
      {day?.status === 'needs_correction' && day.note ? (
        <View style={styles.amber}>
          <AppText size={13} color="#8A4B0F">
            {day.note}
          </AppText>
        </View>
      ) : null}
      {day?.status === 'pending' ? (
        <AppText weight="bold" color="#FFFFFF">
          {t.sentPending}
        </AppText>
      ) : day?.status === 'approved' ? (
        <AppText weight="bold" color="#FFFFFF">
          {t.approvedToday}
        </AppText>
      ) : (
        <WhiteButton label={day?.status === 'needs_correction' ? t.markAgain : t.markCompleted} onPress={() => void mark()} disabled={busy} />
      )}
    </Card>
  );
}

/** Botón blanco sobre la tarjeta de marca (D-286: `.btnw`). */
export function WhiteButton({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  const { brand } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      onPress={disabled ? undefined : onPress}
      style={[styles.button, { opacity: disabled ? 0.6 : 1 }]}
    >
      <AppText weight="heavy" size={15} color={brand}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { padding: 18, gap: 10 },
  button: { backgroundColor: '#FFFFFF', borderRadius: 16, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  amber: { backgroundColor: '#FBE3C7', borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12 },
});
