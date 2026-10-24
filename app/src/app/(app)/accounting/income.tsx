import { Redirect, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { AppField } from '@/components/AppField';
import { AppText } from '@/components/AppText';
import { Chip } from '@/components/Chip';
import { Dialog } from '@/components/Dialog';
import { Switch } from '@/components/Switch';
import { KeyDateField } from '@/components/UsDateField';
import { PeriodBar } from '@/components/accounting/PeriodBar';
import { usePeriod } from '@/components/accounting/usePeriod';
import { Card, CardBlock } from '@/components/bento/Card';
import { BackHeader } from '@/components/bento/Header';
import { useAccountingStrings } from '@/i18n/useAccountingStrings';
import { useStrings } from '@/i18n/useStrings';
import { adjustIncome, fetchIncome, setIncomeReceived, type IncomeRow } from '@/lib/accountingApi';
import { accountingAccess, isRange, monthTitle, money, parseMoney, periodTitle, progress, todayKey } from '@/lib/accountingRules';
import { useGoBack } from '@/lib/navigation';
import { shortDate } from '@/lib/quoteRules';
import { usePermissions, useSession } from '@/lib/session';
import { sample, useTheme } from '@/theme';

/**
 * Ingresos (D-063, D-064, D-238): arriba Esperado y Recibido (18px) con barra de avance de 6px; debajo, una tarjeta
 * por jobsite con monto y ficha Recibido / Pendiente, el interruptor Recibido con la Fecha de cobro, "Ajustar" con
 * nota obligatoria (ventana al centro, D-229) mientras no esté recibido, y los extras debajo.
 */
export default function IncomeScreen() {
  const goBack = useGoBack();
  const { colors, brand } = useTheme();
  const strings = useStrings();
  const a = useAccountingStrings();
  const { locale } = useSession();
  const { access } = usePermissions();
  const acc = accountingAccess(access);
  const { period, setPeriod, jobsiteId } = usePeriod();
  const [rows, setRows] = useState<IncomeRow[] | null>(null);
  const [error, setError] = useState<'load' | 'save' | null>(null);
  const [adjusting, setAdjusting] = useState<IncomeRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetchIncome(period, jobsiteId);
    if (!r.ok) {
      setError('load');
      return;
    }
    setError((e) => (e === 'load' ? null : e));
    setRows(r.data);
  }, [period, jobsiteId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!acc.income) return <Redirect href="/" />;

  const expected = (rows ?? []).reduce((s, r) => s + r.total, 0);
  const received = (rows ?? []).reduce((s, r) => s + r.receivedAmount, 0);

  async function mark(row: IncomeRow, on: boolean, date: string | null) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await setIncomeReceived(row.id, on, on ? date : null);
    setBusy(false);
    if (!r.ok) setError('save');
    await load();
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BackHeader onBack={goBack} backLabel={strings.common.back} title={a.incomeTitle(periodTitle(period, a))} />
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <PeriodBar period={period} onChange={setPeriod} />
        {error === 'load' ? <AppAlert tone="error" text={a.errorLoad} /> : null}
        {error === 'save' ? <AppAlert tone="error" text={a.errorSave} /> : null}
        <Card wide style={{ gap: 10, marginBottom: 12 }}>
          <View style={styles.summary}>
            <View>
              <AppText size={13} color={colors.secondary}>
                {a.expected}
              </AppText>
              <AppText weight="heavy" size={18}>
                {money(expected)}
              </AppText>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <AppText size={13} color={colors.secondary}>
                {a.received}
              </AppText>
              <AppText weight="heavy" size={18}>
                {money(received)}
              </AppText>
            </View>
          </View>
          <View style={[styles.track, { backgroundColor: colors.surface }]}>
            <View style={{ width: `${Math.round(progress(received, expected) * 100)}%`, height: 6, borderRadius: 3, backgroundColor: brand }} />
          </View>
        </Card>
        {rows && rows.length === 0 ? (
          <AppText size={sample.noteSize} color={colors.secondary}>
            {a.noIncome}
          </AppText>
        ) : null}
        {(rows ?? []).map((row) => (
          <CardBlock key={row.id} style={{ paddingVertical: 12, gap: 6 }}>
            <View style={styles.head}>
              <View style={{ flex: 1 }}>
                <AppText weight="bold">{row.jobsite}</AppText>
                <AppText size={sample.noteSize} color={colors.secondary}>
                  {isRange(period) ? `${row.client} · ${monthTitle(row.month.slice(0, 7), a)}` : row.client}
                </AppText>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <AppText weight="bold">{money(row.total)}</AppText>
                <Chip label={row.received ? a.received : a.pending} tone={row.received ? 'success' : 'warning'} />
              </View>
            </View>
            {row.adjustedAmount !== null ? (
              <AppText size={sample.noteSize} color={colors.secondary}>
                {[a.adjusted(money(row.amount)), row.adjustedBy ? a.adjustedBy(row.adjustedBy) : null].filter(Boolean).join(' ')}
                {row.adjustNote ? ` · ${row.adjustNote}` : ''}
              </AppText>
            ) : null}
            {row.extras.length > 0 ? (
              <View style={{ gap: 2 }}>
                <AppText size={sample.labelSize} color={colors.secondary}>
                  {a.extras}
                </AppText>
                {row.extras.map((x) => (
                  <View key={x.id} style={styles.extra}>
                    <AppText size={13} style={{ flex: 1 }}>
                      {x.serviceDate ? `${x.label} · ${shortDate(`${x.serviceDate}T12:00:00`, locale)}` : x.label}
                      {x.afterReceived ? ` · ${a.extraPendingAfter}` : ''}
                    </AppText>
                    <AppText size={13} weight="medium">
                      {money(x.amount)}
                    </AppText>
                  </View>
                ))}
              </View>
            ) : null}
            {acc.markReceived ? (
              <View style={styles.switchRow}>
                <AppText size={14}>{a.received}</AppText>
                <Switch value={row.received} accessibilityLabel={`${a.received} · ${row.jobsite}`} disabled={busy} onChange={(v) => void mark(row, v, todayKey())} />
              </View>
            ) : null}
            {row.received && acc.markReceived ? (
              <KeyDateField label={a.receivedDate} value={row.receivedOn} onChange={(d) => d && void mark(row, true, d)} />
            ) : row.received && row.receivedOn ? (
              <AppText size={sample.noteSize} color={colors.secondary}>
                {`${a.receivedDate}: ${shortDate(`${row.receivedOn}T12:00:00`, locale)}`}
              </AppText>
            ) : null}
            {!row.received && acc.adjust ? (
              <Pressable accessibilityRole="button" onPress={() => setAdjusting(row)} style={{ alignSelf: 'flex-start', paddingVertical: 4 }}>
                <AppText weight="bold" size={14} color={colors.brandText}>
                  {a.adjust}
                </AppText>
              </Pressable>
            ) : null}
          </CardBlock>
        ))}
      </ScrollView>
      <AdjustDialog
        row={adjusting}
        onClose={() => setAdjusting(null)}
        onSaved={async () => {
          setAdjusting(null);
          await load();
        }}
      />
    </View>
  );
}

/** Ajuste a mano (D-238): monto del mes y nota obligatoria, en una ventana al centro (D-229). */
function AdjustDialog({ row, onClose, onSaved }: { row: IncomeRow | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const { colors } = useTheme();
  const a = useAccountingStrings();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [shown, setShown] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ amount?: boolean; note?: boolean; save?: boolean }>({});
  const [busy, setBusy] = useState(false);
  if (row && shown !== row.id) {
    setShown(row.id);
    setAmount((row.adjustedAmount ?? row.amount ?? 0).toFixed(2));
    setNote(row.adjustNote ?? '');
    setErrors({});
  }
  if (!row && shown !== null) setShown(null);

  async function save() {
    if (!row || busy) return;
    const n = parseMoney(amount);
    const e = { amount: n === null, note: note.trim() === '' };
    setErrors(e);
    if (e.amount || e.note || n === null) return;
    setBusy(true);
    const r = await adjustIncome(row.id, n, note.trim());
    setBusy(false);
    if (!r.ok) {
      setErrors({ save: true });
      return;
    }
    await onSaved();
  }

  return (
    <Dialog visible={row !== null} onClose={onClose}>
      <AppText weight="medium" size={sample.headingSize}>
        {a.adjustTitle}
      </AppText>
      {row ? (
        <AppText size={sample.noteSize} color={colors.secondary} style={{ marginBottom: 8 }}>
          {`${row.jobsite} · ${a.calculated} ${money(row.amount)}`}
        </AppText>
      ) : null}
      {errors.save ? <AppAlert tone="error" text={a.errorSave} /> : null}
      <AppField label={a.adjustAmount} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" error={errors.amount ? a.amountError : null} />
      <AppField
        label={a.adjustNote}
        value={note}
        onChangeText={setNote}
        placeholder={a.adjustNoteHint}
        multiline
        error={errors.note ? a.adjustNoteRequired : null}
      />
      <View style={{ gap: 8, marginTop: 4 }}>
        <AppButton label={a.save} onPress={() => void save()} disabled={busy} />
        <AppButton label={a.cancel} variant="text" onPress={onClose} />
      </View>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24 },
  summary: { flexDirection: 'row', justifyContent: 'space-between' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  extra: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 },
});
