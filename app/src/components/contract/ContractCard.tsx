import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppAlert } from '../AppAlert';
import { AppButton } from '../AppButton';
import { AppField } from '../AppField';
import { AppText } from '../AppText';
import { Dialog } from '../Dialog';
import { DialogButtons } from '../work/SimpleParts';
import { Pill, Steps } from './ContractParts';
import { useContractStrings } from '@/i18n/contract';
import {
  contractStep,
  countersignContract,
  fetchContractInfo,
  fieldsToShow,
  prepareContract,
  saveContractFields,
  sendContract,
  type ContractDraft,
  type ContractInfo,
} from '@/lib/contractApi';
import { useSession } from '@/lib/session';
import { radius, sample, useTheme } from '@/theme';

const MONTHS = {
  es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

/** "Oct 30" / "30 oct" en la hora de Naples. */
export function shortDay(iso: string, l: 'es' | 'en'): string {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'numeric', day: 'numeric' }).formatToParts(new Date(iso));
  const m = MONTHS[l][Number(p.find((x) => x.type === 'month')?.value) - 1];
  const d = p.find((x) => x.type === 'day')?.value;
  return l === 'es' ? `${d} ${m}` : `${m} ${d}`;
}

export function clockTime(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso));
}

/**
 * Ficha del contrato del cliente (D-283, diseño D-289): estado, línea de pasos, nota de los 15 días y, para el Super
 * Admin, "Preparar contrato" (ventana con los campos que la app no conoce, "Ver PDF" y "Enviar para firma") y
 * "Contrafirmar". Va en el quote aceptado (por sitio) y en el jobsite.
 */
export function ContractCard({ jobsiteId, siteId }: { jobsiteId?: string; siteId?: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const k = useContractStrings();
  const { locale } = useSession();
  const l = locale === 'es' ? 'es' : 'en';
  const [info, setInfo] = useState<ContractInfo | null>(null);
  const [draft, setDraft] = useState<ContractDraft | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'error' | 'warning'; text: string } | null>(null);
  const [showMissing, setShowMissing] = useState(false);

  const load = useCallback(async () => {
    const r = await fetchContractInfo({ jobsiteId, siteId });
    if (r.ok) setInfo(r.data);
  }, [jobsiteId, siteId]);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!info) return null;
  const step = contractStep(info);
  const c = info.contract;
  const labels = [
    info.acceptedAt && info.acceptedBy ? k.acceptedBy(shortDay(info.acceptedAt, l), info.acceptedBy, info.acceptedTitle) : k.steps[0],
    c?.sentAt && c.email && step >= 2 ? k.sentTo(shortDay(c.sentAt, l), c.email) : k.steps[1],
    k.steps[2],
    k.steps[3],
  ];
  const title = `${info.company}${info.quoteNumber ? ` · ${info.quoteNumber} v${info.quoteVersion ?? ''}` : ''}`;
  const titleCsa = `${info.company}${c ? ` · ${c.csa}` : ''}`;

  async function openPrepare() {
    if (busy || !info) return;
    setBusy(true);
    setNotice(null);
    const r = await prepareContract(info.jobsiteId);
    setBusy(false);
    if (!r.ok) return setNotice({ tone: 'error', text: k.error });
    setDraft(r.data);
    setShowMissing(false);
    setValues(Object.fromEntries(fieldsToShow(r.data).map((f) => [f, r.data.fields[f] ?? ''])));
  }

  async function saveDraft(): Promise<ContractDraft | null> {
    if (!draft) return null;
    const r = await saveContractFields(draft.id, values);
    if (!r.ok) return null;
    setDraft(r.data);
    return r.data;
  }

  async function viewPdf() {
    if (busy || !info) return;
    setBusy(true);
    const d = await saveDraft();
    setBusy(false);
    if (!d) return setNotice({ tone: 'error', text: k.error });
    setDraft(null);
    router.push({ pathname: '/viewer', params: { source: 'contract', documentId: info.jobsiteId, title: d.csa } });
  }

  async function send() {
    if (busy || !info) return;
    setBusy(true);
    const d = await saveDraft();
    if (!d) {
      setBusy(false);
      return setNotice({ tone: 'error', text: k.error });
    }
    if (d.missing.length > 0) {
      setBusy(false);
      setShowMissing(true);
      setValues((v) => ({ ...Object.fromEntries(d.missing.map((f) => [f, ''])), ...v }));
      return;
    }
    const r = await sendContract(d.id);
    setBusy(false);
    if (!r.ok) {
      if (r.reason === 'missing_fields') return setShowMissing(true);
      return setNotice({ tone: 'error', text: k.error });
    }
    setDraft(null);
    setNotice(r.data.sent ? null : { tone: 'warning', text: k.mailFailed });
    await load();
  }

  async function countersign() {
    if (busy || !c) return;
    setBusy(true);
    const r = await countersignContract(c.id);
    setBusy(false);
    setConfirm(false);
    if (!r.ok) return setNotice({ tone: 'error', text: k.error });
    await load();
  }

  const card = (children: React.ReactNode) => (
    <View style={[styles.card, { backgroundColor: colors.card }]}>{children}</View>
  );
  const head = (text: string, pill: React.ReactNode) => (
    <View style={styles.row}>
      <AppText weight="bold" size={14} style={{ flexShrink: 1 }}>
        {text}
      </AppText>
      {pill}
    </View>
  );

  return (
    <View style={{ gap: 10, marginTop: 12 }}>
      {notice ? <AppAlert tone={notice.tone} text={notice.text} /> : null}
      {info.status === 'both_signed'
        ? card(
            <>
              {head(titleCsa, <Pill label={k.status.both_signed} tone="ok" />)}
              {c?.clientSignerName ? (
                <AppText size={12} color={colors.secondary}>
                  {k.copySent(c.clientSignerName)}
                </AppText>
              ) : null}
              {c?.documentId ? (
                <AppButton
                  label={k.viewContract}
                  variant="outline"
                  onPress={() => router.push({ pathname: '/viewer', params: { source: 'jobsite', documentId: c.documentId as string, title: c.csa } })}
                />
              ) : null}
            </>,
          )
        : info.status === 'client_signed'
          ? card(
              <>
                {head(titleCsa, <Pill label={k.status.client_signed} tone="warn" />)}
                {c?.clientSignedAt && c.clientSignerName ? (
                  <AppText size={12} color={colors.secondary}>
                    {k.signedBy(c.clientSignerName, shortDay(c.clientSignedAt, l), clockTime(c.clientSignedAt))}
                  </AppText>
                ) : null}
                {info.canManage ? (
                  <>
                    <AppButton
                      label={k.viewSignedPdf}
                      variant="outline"
                      onPress={() => router.push({ pathname: '/viewer', params: { source: 'contract', documentId: info.jobsiteId, title: c?.csa ?? '' } })}
                    />
                    <AppButton label={k.countersign} onPress={() => setConfirm(true)} disabled={busy} />
                  </>
                ) : null}
              </>,
            )
          : card(
              <>
                {head(title, <Pill label={info.status === 'needs_update' ? k.status.needs_update : k.status.pending} tone="warn" />)}
                <Steps labels={labels} done={step} />
                {info.status === 'needs_update' ? (
                  <AppText size={12} color={colors.secondary}>
                    {k.needsUpdate}
                  </AppText>
                ) : info.signUntil ? (
                  <AppText size={12} color={colors.secondary}>
                    {k.priceHeld(shortDay(info.signUntil, l))}
                  </AppText>
                ) : null}
                {info.canManage && info.status === 'pending' ? (
                  <AppButton label={c?.status === 'sent' ? k.resend : k.prepare} onPress={() => void openPrepare()} disabled={busy} />
                ) : null}
              </>,
            )}

      <Dialog visible={draft !== null} onClose={() => setDraft(null)}>
        <AppText weight="bold" size={sample.headingSize} style={{ marginBottom: 8 }}>
          {k.prepare}
        </AppText>
        {Object.keys(values).map((f) => (
          <AppField
            key={f}
            label={k.fields[f] ?? f}
            value={values[f]}
            onChangeText={(v) => setValues((x) => ({ ...x, [f]: v }))}
            error={showMissing && !values[f]?.trim() ? k.missing : null}
            maxLength={2000}
          />
        ))}
        <AppText size={12} color={colors.secondary} style={{ marginBottom: 10 }}>
          {k.prepareNote}
        </AppText>
        <View style={{ gap: 8 }}>
          <AppButton label={k.viewPdf} variant="outline" onPress={() => void viewPdf()} disabled={busy} />
          <AppButton label={k.sendForSignature} onPress={() => void send()} disabled={busy} />
        </View>
      </Dialog>

      <Dialog visible={confirm} onClose={() => setConfirm(false)}>
        <AppText weight="bold" size={sample.headingSize} style={{ marginBottom: 6 }}>
          {k.countersign}
        </AppText>
        <AppText size={sample.noteSize} color={colors.secondary} style={{ marginBottom: 12 }}>
          {k.countersignConfirm}
        </AppText>
        <DialogButtons cancel={k.cancel} save={k.countersign} onCancel={() => setConfirm(false)} onSave={() => void countersign()} disabled={busy} />
      </Dialog>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card - 4, padding: 14, gap: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
});
