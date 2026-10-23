import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppAlert } from '../AppAlert';
import { AppText } from '../AppText';
import { Card } from '../bento/Card';
import { CartArt } from '../illustrations';
import { SlideToMark } from '../SlideToMark';
import { useStrings } from '@/i18n/useStrings';
import { useWorkStrings } from '@/i18n/useWorkStrings';
import { currentPosition, locationAvailable, type Position } from '@/lib/location';
import { checkDistance, clockIn, clockOut, type MyVisit } from '@/lib/scheduleApi';
import { elapsed } from '@/lib/scheduleRules';
import { newId } from '@/lib/walkthroughRules';
import { formatTime } from '@/lib/week';
import { enqueue, loadShift, saveShift, syncWorkQueue, type Shift } from '@/lib/workQueue';
import { illustrations, useTheme } from '@/theme';

type Phase = { kind: 'idle' } | { kind: 'locating' } | { kind: 'away'; distance: number; pos: Position | null } | { kind: 'saving' };

/**
 * Tarjeta de hoy del staff (D-049 a D-051, D-165, D-214, D-223): sitio y horario, "Desliza para marcar entrada"; si
 * el GPS queda a más de 150 m, "Estás a X m del sitio" con Reintentar ubicación y Marcar de todos modos; con el turno
 * abierto, la hora de entrada, el cronómetro de 34px y Marcar salida. Sin internet se guarda en el teléfono.
 */
export function ClockCard({ visit, onChanged }: { visit: MyVisit; onChanged: () => void }) {
  const strings = useStrings();
  const t = useWorkStrings();
  const [shift, setShift] = useState<Shift | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [notice, setNotice] = useState<{ tone: 'error' | 'warning'; text: string } | null>(null);
  const [now, setNow] = useState(new Date());

  // Turno abierto: el del servidor o el guardado en el teléfono sin conexión.
  useEffect(() => {
    let cancelled = false;
    void loadShift().then((local) => {
      if (cancelled) return;
      if (visit.entry && !visit.entry.clockOut)
        setShift({ visitId: visit.id, clientId: local?.clientId ?? '', entryId: visit.entry.id, clockIn: visit.entry.clockIn.toISOString(), jobsite: visit.jobsite });
      else if (local && local.visitId === visit.id) setShift(local);
      else setShift(null);
    });
    return () => {
      cancelled = true;
    };
  }, [visit]);

  useEffect(() => {
    if (!shift) return;
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [shift]);

  async function startIn(pos: Position | null, skipCheck = false) {
    setNotice(null);
    if (!skipCheck && pos) {
      const check = await checkDistance(visit.id, pos.latitude, pos.longitude);
      if (check.ok && check.data.status === 'out_of_range') {
        setPhase({ kind: 'away', distance: check.data.distanceM ?? 0, pos });
        return;
      }
    }
    setPhase({ kind: 'saving' });
    const clientId = newId();
    const at = new Date();
    const r = await clockIn({ visitId: visit.id, clientId, at, lat: pos?.latitude ?? null, lng: pos?.longitude ?? null, offline: false });
    if (r.ok) {
      const s = { visitId: visit.id, clientId, entryId: r.data.id, clockIn: at.toISOString(), jobsite: visit.jobsite };
      await saveShift(s);
      setShift(s);
      setPhase({ kind: 'idle' });
      onChanged();
      return;
    }
    if (r.reason === 'network') {
      // D-214: sin internet se guarda con la hora del teléfono y se manda después.
      await enqueue({ kind: 'in', clientId, visitId: visit.id, at: at.toISOString(), lat: pos?.latitude ?? null, lng: pos?.longitude ?? null });
      const s = { visitId: visit.id, clientId, entryId: null, clockIn: at.toISOString(), jobsite: visit.jobsite };
      await saveShift(s);
      setShift(s);
      setNotice({ tone: 'warning', text: t.savedOffline });
      setPhase({ kind: 'idle' });
      return;
    }
    setNotice({ tone: 'error', text: r.reason === 'not_today' ? t.notToday : t.errorClock });
    setPhase({ kind: 'idle' });
  }

  async function onSlide() {
    setPhase({ kind: 'locating' });
    const pos = await currentPosition();
    await startIn(pos);
  }

  async function onClockOut() {
    if (!shift) return;
    setPhase({ kind: 'saving' });
    setNotice(null);
    const pos = await currentPosition();
    const at = new Date();
    const item = { lat: pos?.latitude ?? null, lng: pos?.longitude ?? null };
    let saved = false;
    if (shift.entryId) {
      const r = await clockOut({ entryId: shift.entryId, at, ...item, offline: false });
      if (r.ok) saved = true;
      else if (r.reason !== 'network') {
        setNotice({ tone: 'error', text: t.errorClock });
        setPhase({ kind: 'idle' });
        return;
      }
    }
    if (!saved) {
      await enqueue({ kind: 'out', clientId: shift.clientId, entryId: shift.entryId, at: at.toISOString(), ...item });
      setNotice({ tone: 'warning', text: t.savedOffline });
    }
    await saveShift(null);
    setShift(null);
    setPhase({ kind: 'idle' });
    void syncWorkQueue({ clockIn, clockOut });
    onChanged();
  }

  const end = new Date(visit.startsAt.getTime() + visit.minutes * 60000);
  return (
    <Card tone="brand" wide style={styles.card}>
      <View style={[styles.head, illustrations ? styles.headArt : null]}>
        <View style={{ gap: 6, flexShrink: 1, paddingBottom: illustrations ? 14 : 0 }}>
          <AppText size={13} color="#FFFFFF" style={{ opacity: 0.85 }}>
            {strings.home.today}
          </AppText>
          <AppText weight="heavy" size={22} color="#FFFFFF">
            {visit.jobsite}
          </AppText>
          <AppText size={14} color="#FFFFFF" style={{ opacity: 0.9 }}>
            {strings.home.timeRange(formatTime(visit.startsAt), formatTime(end))}
          </AppText>
        </View>
        <CartArt />
      </View>
      <View style={styles.body}>
        {notice ? <AppAlert tone={notice.tone} text={notice.text} /> : null}
        {shift ? (
          // D-050: hora de entrada, cronómetro de 34px y Marcar salida.
          <View style={{ gap: 8 }}>
            <AppText size={14} color="#FFFFFF">
              {t.clockedInAt(formatTime(new Date(shift.clockIn)))}
            </AppText>
            <AppText weight="heavy" size={34} color="#FFFFFF" accessibilityRole="timer">
              {elapsed(new Date(shift.clockIn), now)}
            </AppText>
            <OnBrandButton label={t.clockOut} solid onPress={() => void onClockOut()} disabled={phase.kind === 'saving'} />
          </View>
        ) : phase.kind === 'away' ? (
          // D-051: lejos del sitio.
          <View style={{ gap: 8 }}>
            <AppText weight="bold" size={15} color="#FFFFFF">
              {t.awayTitle(phase.distance)}
            </AppText>
            <OnBrandButton label={t.retryLocation} onPress={() => void onSlide()} />
            <OnBrandButton label={t.markAnyway} solid onPress={() => void startIn(phase.pos, true)} />
          </View>
        ) : visit.entry?.clockOut ? (
          <AppText weight="bold" color="#FFFFFF">
            {t.done}
          </AppText>
        ) : (
          <View style={{ gap: 6 }}>
            <SlideToMark label={strings.home.slideToClockIn} onComplete={() => void onSlide()} onBrand />
            <AppText size={12} color="#FFFFFF" style={{ opacity: 0.85 }} center>
              {phase.kind === 'locating' || phase.kind === 'saving' ? t.locating : locationAvailable() ? t.locationReady : t.noLocation}
            </AppText>
          </View>
        )}
      </View>
    </Card>
  );
}

/** Botón sobre la tarjeta de marca (como Llamar y Correo, D-226): blanco sólido o blanco al 18%. */
function OnBrandButton({ label, onPress, solid = false, disabled = false }: { label: string; onPress: () => void; solid?: boolean; disabled?: boolean }) {
  const { brand } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      onPress={disabled ? undefined : onPress}
      style={[styles.button, { backgroundColor: solid ? '#FFFFFF' : 'rgba(255,255,255,0.18)', opacity: disabled ? 0.6 : 1 }]}
    >
      <AppText weight="bold" size={15} color={solid ? brand : '#FFFFFF'}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  card: { padding: 0, gap: 0 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 8, padding: 18 },
  headArt: { height: 150, paddingRight: 0, paddingBottom: 0 },
  body: { marginHorizontal: 12, marginBottom: 12 },
});
