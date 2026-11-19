import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppAlert } from '../AppAlert';
import { AppButton } from '../AppButton';
import { AppField } from '../AppField';
import { AppText } from '../AppText';
import { Dialog } from '../Dialog';
import { UsDateField } from '../UsDateField';
import { AmberNote } from '../contract/ContractParts';
import { wholeMoney } from './JobsiteParts';
import type { ClientsStrings } from '@/i18n/clients';
import { useStrings } from '@/i18n/useStrings';
import { canChangeStatus, canSeeRate, money, parseMoney, type Jobsite } from '@/lib/clientRules';
import { fetchPeriodSummary, reactivateJobsite, type PeriodSummary } from '@/lib/clientsApi';
import { dateFromKey, dayKey, formatUsDate, parseUsDate } from '@/lib/leadRules';
import { usePermissions, useSession } from '@/lib/session';
import { radius, sample, useTheme } from '@/theme';

/** "Aug 31, 2026" / "31 ago 2026" de una fecha AAAA-MM-DD. */
function longDay(key: string, locale: 'es' | 'en'): string {
  return new Intl.DateTimeFormat(locale === 'es' ? 'es-US' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(dateFromKey(key));
}
function shortDay(key: string, locale: 'es' | 'en'): string {
  return new Intl.DateTimeFormat(locale === 'es' ? 'es-US' : 'en-US', { month: 'short', day: 'numeric' }).format(dateFromKey(key));
}

/**
 * Jobsite terminado (orden 151, D-340 (2), muestra pantalla 3): aviso ámbar con la fecha de fin y la tarifa anterior,
 * resumen del periodo (visitas aprobadas, ingresos y personal; las cifras con sus permisos) y "Reactivar jobsite", que
 * pide la fecha de inicio nueva y la tarifa (precargada con la anterior) y lo devuelve a Activas.
 */
export function TerminatedPanel({ jobsite, c, onReactivated }: { jobsite: Jobsite; c: ClientsStrings; onReactivated: () => Promise<void> }) {
  const { colors } = useTheme();
  const strings = useStrings();
  const { locale } = useSession();
  const lang = locale === 'en' ? 'en' : 'es';
  const { access } = usePermissions();
  const seesRate = canSeeRate(access);
  const [summary, setSummary] = useState<PeriodSummary | null>(null);
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState('');
  const [rate, setRate] = useState('');
  const [error, setError] = useState<'start' | 'rate' | 'save' | null>(null);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void fetchPeriodSummary(jobsite.id).then((r) => !cancelled && r.ok && setSummary(r.data));
      return () => {
        cancelled = true;
      };
    }, [jobsite.id]),
  );

  async function save() {
    if (busy) return;
    const key = parseUsDate(start);
    if (!key || key === 'invalid' || key < dayKey(new Date())) return setError('start');
    let n: number | null = null;
    if (seesRate) {
      n = parseMoney(rate);
      if (n === null) return setError('rate');
    }
    setBusy(true);
    setError(null);
    const r = await reactivateJobsite(jobsite.id, key, n);
    setBusy(false);
    if (!r.ok) return setError(r.reason === 'invalid' ? 'start' : 'save');
    setOpen(false);
    await onReactivated();
  }

  if (!summary) return null;
  const money2 = (x: number | null) => (x === null ? null : wholeMoney(x));
  const line = c.detail.periodMoney(money2(summary.income), money2(summary.staff));
  return (
    <View style={{ gap: 10, marginBottom: 12 }}>
      <AmberNote title={c.detail.endedNote(longDay(summary.endedOn, lang), summary.monthlyRate !== null ? money(summary.monthlyRate) : null)} text="" />
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <AppText weight="bold">{c.detail.approvedVisits(summary.visits)}</AppText>
        <AppText size={sample.noteSize} color={colors.secondary}>
          {c.detail.periodRange(shortDay(summary.from, lang), longDay(summary.to, lang))}
        </AppText>
        {line ? (
          <>
            <AppText weight="bold" style={{ marginTop: 6 }}>
              {line}
            </AppText>
            <AppText size={sample.noteSize} color={colors.secondary}>
              {c.detail.periodNote}
            </AppText>
          </>
        ) : null}
      </View>
      {canChangeStatus(access) ? (
        <>
          <AppButton
            label={c.detail.reactivate}
            onPress={() => {
              setStart(formatUsDate(dayKey(new Date())));
              setRate(summary.monthlyRate !== null ? String(summary.monthlyRate) : '');
              setError(null);
              setOpen(true);
            }}
          />
          <AppText size={12} color={colors.secondary} center>
            {c.detail.reactivateNote}
          </AppText>
        </>
      ) : null}
      <Dialog visible={open} onClose={() => setOpen(false)}>
        <AppText weight="bold" size={sample.headingSize} style={{ marginBottom: 6 }}>
          {c.detail.reactivateTitle(jobsite.name)}
        </AppText>
        <AppText size={sample.noteSize} color={colors.secondary} style={{ marginBottom: 10 }}>
          {c.detail.reactivateBody}
        </AppText>
        <UsDateField
          label={c.detail.newStart}
          value={start}
          onChange={(v) => {
            setStart(v);
            setError(null);
          }}
          error={error === 'start' ? c.detail.errorStart : null}
        />
        {seesRate ? (
          <AppField
            label={c.detail.newRate}
            value={rate}
            onChangeText={(t) => {
              setRate(t);
              setError(null);
            }}
            keyboardType="decimal-pad"
            error={error === 'rate' ? c.form.errorRate : null}
          />
        ) : null}
        {error === 'save' ? <AppAlert tone="error" text={c.detail.errorReactivate} /> : null}
        <View style={styles.buttons}>
          <View style={{ flex: 1 }}>
            <AppButton label={strings.common.cancel} variant="outline" onPress={() => setOpen(false)} />
          </View>
          <View style={{ flex: 1 }}>
            <AppButton label={c.detail.confirmReactivate} onPress={() => void save()} disabled={busy} />
          </View>
        </View>
      </Dialog>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card - 4, padding: 14, gap: 2 },
  buttons: { flexDirection: 'row', gap: 8, marginTop: 12 },
});
