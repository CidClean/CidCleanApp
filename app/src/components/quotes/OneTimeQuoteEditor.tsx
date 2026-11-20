import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { AppAlert } from '../AppAlert';
import { AppButton } from '../AppButton';
import { AppField } from '../AppField';
import { AppText } from '../AppText';
import { Chip } from '../Chip';
import { FormScroll } from '../FormScroll';
import { DateField, TimeField, type Clock } from '../PickerField';
import { TopBar } from '../TopBar';
import { clock12 } from './QuoteView';
import { useQuoteStrings } from '@/i18n/useQuoteStrings';
import { useSalesStrings } from '@/i18n/useSalesStrings';
import { useStrings } from '@/i18n/useStrings';
import { dateFromKey, formatShortDate } from '@/lib/leadRules';
import { useGoBack } from '@/lib/navigation';
import {
  SCOPE_MAX,
  money,
  oneTimeFormFrom,
  parseAmount,
  quoteActions,
  shortDate,
  statusTone,
  validateOneTime,
  type OneTimeErrors,
  type OneTimeForm,
} from '@/lib/quoteRules';
import {
  ensureOneTimeQuote,
  fetchOneTimeQuote,
  newQuoteVersion,
  saveOneTimeQuote,
  sendQuote,
  type OneTimeQuote,
} from '@/lib/quotesApi';
import { usePermissions, useSession } from '@/lib/session';
import { sample, useTheme } from '@/theme';

const toClock = (t: string | null): Clock | null => {
  const m = /^(\d{1,2}):(\d{2})/.exec(t ?? '');
  return m ? { hours: Number(m[1]), minutes: Number(m[2]) } : null;
};
const fromClock = (c: Clock) => `${String(c.hours).padStart(2, '0')}:${String(c.minutes).padStart(2, '0')}`;

/**
 * Quote one-time (orden 162, D-350 (4), survey leads-fuentes-aprobado pantalla 4): precio total, fecha y hora del
 * servicio y alcance; sin tarifa mensual ni contrato mensual; walkthrough opcional. Se envía con send-quote como un
 * extra (sin SOW) y el cliente acepta o rechaza en el portal.
 */
export function OneTimeQuoteEditor({ siteId }: { siteId: string }) {
  const goBack = useGoBack();
  const { colors } = useTheme();
  const strings = useStrings();
  const q = useQuoteStrings();
  const s = useSalesStrings();
  const { can } = usePermissions();
  const { locale } = useSession();
  const canEdit = can('quotes_editar') && can('quotes_ver_precios');
  const canSend = can('quotes_enviar');
  const [data, setData] = useState<OneTimeQuote | null>(null);
  const [form, setForm] = useState<OneTimeForm | null>(null);
  const [errors, setErrors] = useState<OneTimeErrors>({});
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error' | 'warning'; text: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    let r = await fetchOneTimeQuote(siteId);
    if (r.ok && !r.data.quoteId && canEdit) {
      const made = await ensureOneTimeQuote(siteId);
      if (made.ok) r = await fetchOneTimeQuote(siteId);
    }
    if (!r.ok) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setData(r.data);
    setForm(oneTimeFormFrom(r.data.versions[0] ?? null));
  }, [siteId, canEdit]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const latest = data?.versions[0] ?? null;
  const actions = quoteActions(latest, { edit: canEdit, send: canSend });
  const set = <K extends keyof OneTimeForm>(k: K, v: OneTimeForm[K]) => form && setForm({ ...form, [k]: v });

  async function save(): Promise<boolean> {
    if (!latest || !form) return false;
    const price = form.price.trim() ? parseAmount(form.price) : null;
    if (form.price.trim() && price === null) {
      setErrors({ price: true });
      return false;
    }
    const r = await saveOneTimeQuote(latest.id, {
      price,
      date: form.date,
      time: form.time,
      scope: form.scope,
      validDays: form.validDays,
      recipients: latest.recipients,
    });
    if (!r.ok) setNotice({ tone: 'error', text: q.errorSave });
    return r.ok;
  }

  async function onSave() {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    if (await save()) {
      await load();
      setNotice({ tone: 'ok', text: q.saved });
    }
    setBusy(false);
  }

  async function onSend() {
    if (busy || !latest || !form) return;
    const found = validateOneTime(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    if (!latest.contactEmail && latest.recipients.length === 0) {
      setNotice({ tone: 'error', text: q.oneTime.noEmail });
      return;
    }
    setBusy(true);
    setNotice(null);
    if (!(await save())) {
      setBusy(false);
      return;
    }
    const r = await sendQuote(latest.id);
    await load();
    setNotice(!r.ok ? { tone: 'error', text: q.errorSend } : r.data.failed > 0 ? { tone: 'warning', text: q.sentMailFailed } : { tone: 'ok', text: q.sentOk(r.data.sent) });
    setBusy(false);
  }

  async function onResend() {
    if (busy || !latest) return;
    setBusy(true);
    const r = await sendQuote(latest.id, true);
    setBusy(false);
    setNotice(!r.ok || r.data.failed > 0 ? { tone: 'error', text: q.errorSend } : { tone: 'ok', text: q.sentOk(r.data.sent) });
  }

  async function onNewVersion() {
    if (busy || !data?.quoteId) return;
    setBusy(true);
    const r = await newQuoteVersion(data.quoteId);
    if (!r.ok) setNotice({ tone: 'error', text: q.errorSave });
    await load();
    setBusy(false);
  }

  const dateText = (key: string) => {
    const d = dateFromKey(key);
    const short = formatShortDate(d, s);
    return d.getFullYear() === new Date().getFullYear() ? short : `${short} ${d.getFullYear()}`;
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar title={q.oneTime.title} onBack={goBack} backLabel={strings.common.back} />
      <FormScroll contentContainerStyle={{ padding: 12, gap: 4 }} keyboardShouldPersistTaps="handled">
        {failed ? <AppAlert tone="error" text={q.errorLoad} /> : null}
        {data ? (
          <AppText size={sample.noteSize} color={colors.secondary} style={{ marginBottom: 6 }}>
            {[data.quoteNumber, data.company, data.site].filter(Boolean).join(' · ')}
          </AppText>
        ) : null}
        {latest && latest.status !== 'draft' ? (
          <View style={{ gap: 6, marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Chip label={q.status[latest.status]} tone={statusTone(latest.status)} />
              <AppText size={sample.noteSize} color={colors.secondary}>
                {q.version(latest.version)}
              </AppText>
            </View>
            {latest.totals ? (
              <AppText weight="heavy" size={22}>
                {money(latest.totals.total)}
              </AppText>
            ) : null}
            {latest.serviceDate ? (
              <AppText size={14}>{[shortDate(`${latest.serviceDate}T12:00:00`, locale), clock12(latest.serviceTime)].filter(Boolean).join(' · ')}</AppText>
            ) : null}
            {latest.scope ? <AppText size={14}>{latest.scope}</AppText> : null}
          </View>
        ) : null}
        {form && actions.edit ? (
          <>
            <AppField
              label={q.oneTime.price}
              value={form.price}
              onChangeText={(v) => set('price', v)}
              keyboardType="decimal-pad"
              error={errors.price ? q.oneTime.errorPrice : null}
            />
            <DateField
              label={q.oneTime.date}
              value={form.date}
              onChange={(key) => set('date', key)}
              format={dateText}
              placeholder={strings.common.noDate}
              calendar={{ months: s.schedule.months, weekDays: s.schedule.weekDays, previousMonth: s.schedule.previousMonth, nextMonth: s.schedule.nextMonth }}
              error={errors.date ? q.oneTime.errorDate : null}
            />
            <TimeField
              label={q.oneTime.time}
              value={toClock(form.time)}
              onChange={(c) => set('time', fromClock(c))}
              format={(c) => clock12(fromClock(c))}
              placeholder={strings.common.pickTime}
              strings={{ hour: strings.common.hour, minutes: strings.common.minutes, done: strings.common.done }}
              error={errors.time ? q.oneTime.errorTime : null}
            />
            <AppField
              label={q.oneTime.scope}
              value={form.scope}
              onChangeText={(v) => set('scope', v.slice(0, SCOPE_MAX))}
              multiline
              textAlignVertical="top"
              style={{ minHeight: 96 }}
              error={errors.scope ? q.oneTime.errorScope : null}
            />
            <AppText size={sample.noteSize} color={colors.secondary} style={{ marginBottom: 8 }}>
              {q.oneTime.note}
            </AppText>
            {data?.residential ? (
              <AppText size={sample.noteSize} color={colors.secondary} style={{ marginBottom: 8 }}>
                {q.oneTime.residentialTax}
              </AppText>
            ) : null}
          </>
        ) : null}
        {notice && notice.tone !== 'ok' ? <AppAlert tone={notice.tone} text={notice.text} /> : null}
        {notice && notice.tone === 'ok' ? (
          <AppText size={sample.noteSize} color={colors.brandText} style={{ marginBottom: 8 }}>
            {notice.text}
          </AppText>
        ) : null}
        {actions.edit ? <AppButton label={q.saveDraft} variant="outline" onPress={() => void onSave()} disabled={busy} /> : null}
        {actions.send ? <AppButton label={q.oneTime.send} onPress={() => void onSend()} disabled={busy} /> : null}
        {actions.resend ? <AppButton label={q.resend} variant="outline" onPress={() => void onResend()} disabled={busy} /> : null}
        {actions.newVersion ? (
          <AppButton label={latest?.status === 'expired' ? q.renew : q.newVersion} variant="outline" onPress={() => void onNewVersion()} disabled={busy} />
        ) : null}
      </FormScroll>
    </View>
  );
}
