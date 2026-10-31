import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppAlert } from '../AppAlert';
import { AppButton } from '../AppButton';
import { AppField } from '../AppField';
import { AppText } from '../AppText';
import { Dialog } from '../Dialog';
import { DialogButtons } from '../work/SimpleParts';
import { Pill } from '../contract/ContractParts';
import { useIcaStrings } from '@/i18n/ica';
import { chooseFile } from '@/lib/documents';
import {
  countersignIca,
  fetchIcaInfo,
  ICA_FIELDS,
  prepareIca,
  saveIcaFields,
  sendIca,
  uploadSignedIca,
  type IcaDraft,
  type IcaInfo,
} from '@/lib/icaApi';
import { icaPill, shortDay } from '@/lib/icaRules';
import { useSession } from '@/lib/session';
import { radius, sample, useTheme } from '@/theme';

/**
 * ICA en Documentos del perfil 1099 (D-285; opcional desde D-292, diseño surveys/ica-ofertas-aprobado.html (1)):
 * tarjeta "Contrato de contratista (ICA)" con su ficha; sin ICA, "Preparar ICA"; enviado, "Ver PDF" y la nota; firmado
 * por el contratista, "Contrafirmar"; firmado, "Ver ICA firmado". Las acciones y abrir el firmado son solo del Super Admin.
 */
export function IcaSection({ profileId }: { profileId: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const t = useIcaStrings();
  const { locale } = useSession();
  const l = locale === 'es' ? 'es' : 'en';
  const [info, setInfo] = useState<IcaInfo | null>(null);
  const [draft, setDraft] = useState<IcaDraft | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [showMissing, setShowMissing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'error' | 'warning'; text: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetchIcaInfo(profileId);
    if (r.ok) setInfo(r.data);
  }, [profileId]);
  useEffect(() => {
      void load();
  }, [load]);

  if (!info || info.state === 'not_required') return null;
  const a = info.agreement;
  const pill = icaPill(info, t);
  const detail = !a
    ? t.noIcaDetail
    : a.status === 'signed' && a.source === 'paper' && a.uploadedAt
      ? t.uploadedOn(a.ica, shortDay(a.uploadedAt, l), a.uploadedBy)
      : a.status === 'signed' && a.ccSignedAt
        ? t.signedOn(a.ica, shortDay(a.ccSignedAt, l))
        : a.status === 'contractor_signed' && a.contractorSignedAt
          ? t.signedByOn(a.ica, a.contractorSignerName ?? '', shortDay(a.contractorSignedAt, l))
          : a.status === 'sent' && a.sentAt
            ? t.sentOn(a.ica, shortDay(a.sentAt, l))
            : t.draftDetail(a.ica);

  async function openPrepare() {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    const r = await prepareIca(profileId);
    setBusy(false);
    if (!r.ok) return setNotice({ tone: 'error', text: t.error });
    setDraft(r.data);
    setShowMissing(false);
    setValues(Object.fromEntries(ICA_FIELDS.map((f) => [f, r.data.fields[f] ?? ''])));
  }

  async function saveDraft(): Promise<IcaDraft | null> {
    if (!draft) return null;
    const r = await saveIcaFields(draft.id, values);
    if (!r.ok) return null;
    setDraft(r.data);
    return r.data;
  }

  async function viewPdf() {
    if (busy) return;
    setBusy(true);
    const d = draft ? await saveDraft() : null;
    setBusy(false);
    if (draft && !d) return setNotice({ tone: 'error', text: t.error });
    setDraft(null);
    router.push({ pathname: '/viewer', params: { source: 'ica', documentId: profileId, title: d?.ica ?? a?.ica ?? '' } });
  }

  async function send() {
    if (busy) return;
    setBusy(true);
    const d = await saveDraft();
    if (!d) {
      setBusy(false);
      return setNotice({ tone: 'error', text: t.error });
    }
    if (d.missing.length > 0) {
      setBusy(false);
      return setShowMissing(true);
    }
    const r = await sendIca(d.id);
    setBusy(false);
    if (!r.ok) {
      if (r.reason === 'missing_fields') return setShowMissing(true);
      return setNotice({ tone: 'error', text: t.error });
    }
    setDraft(null);
    setNotice(r.data.sent ? null : { tone: 'warning', text: t.mailFailed });
    await load();
  }

  async function countersign() {
    if (busy || !a) return;
    setBusy(true);
    const r = await countersignIca(a.id);
    setBusy(false);
    setConfirm(false);
    if (!r.ok) return setNotice({ tone: 'error', text: t.error });
    await load();
  }

  async function upload() {
    if (busy) return;
    setNotice(null);
    const picked = await chooseFile();
    if (picked.kind !== 'picked') return;
    setBusy(true);
    const r = await uploadSignedIca(profileId, picked.file);
    setBusy(false);
    if (!r.ok) return setNotice({ tone: 'error', text: t.error });
    await load();
  }

  const manage = info.canManage;
  const status = a?.status ?? 'none';

  return (
    <View style={{ gap: 8, marginTop: 10 }}>
      {notice ? <AppAlert tone={notice.tone} text={notice.text} /> : null}
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <View style={styles.row}>
          <View style={{ flexShrink: 1 }}>
            <AppText weight="bold" size={14}>
              {t.icaTitle}
            </AppText>
            <AppText size={12} color={colors.secondary}>
              {detail}
            </AppText>
          </View>
          <Pill label={pill.label} tone={pill.tone} />
        </View>
        {manage && (status === 'none' || status === 'draft') ? (
          <AppButton label={t.prepare} onPress={() => void openPrepare()} disabled={busy} />
        ) : null}
        {manage && status === 'sent' ? (
          <>
            <AppButton label={t.viewPdf} variant="outline" onPress={() => void viewPdf()} disabled={busy} />
            <AppText size={12} color={colors.secondary}>
              {t.sentNote}
            </AppText>
            <AppButton label={t.resend} variant="text" onPress={() => void openPrepare()} disabled={busy} />
          </>
        ) : null}
        {manage && status === 'contractor_signed' ? (
          <>
            <AppButton label={t.viewPdf} variant="outline" onPress={() => void viewPdf()} disabled={busy} />
            <AppButton label={t.countersign} onPress={() => setConfirm(true)} disabled={busy} />
          </>
        ) : null}
        {manage && status === 'signed' && a ? (
          <AppButton
            label={t.viewSigned}
            variant="outline"
            onPress={() => router.push({ pathname: '/viewer', params: { source: 'ica-signed', documentId: a.id, title: a.ica } })}
          />
        ) : null}
        {manage && status !== 'signed' ? (
          <AppButton label={t.uploadSigned} variant="text" icon="upload" onPress={() => void upload()} disabled={busy} />
        ) : null}
        {!manage ? (
          <AppText size={12} color={colors.secondary}>
            {t.onlySuperAdmin}
          </AppText>
        ) : null}
      </View>

      <Dialog visible={draft !== null} onClose={() => setDraft(null)}>
        <AppText weight="bold" size={sample.headingSize} style={{ marginBottom: 8 }}>
          {t.prepare}
        </AppText>
        {ICA_FIELDS.map((f) => (
          <AppField
            key={f}
            label={t.fields[f] ?? f}
            value={values[f] ?? ''}
            onChangeText={(v) => setValues((x) => ({ ...x, [f]: v }))}
            error={showMissing && draft?.missing.includes(f) && !values[f]?.trim() ? t.missing : null}
            maxLength={500}
          />
        ))}
        <AppText size={12} color={colors.secondary} style={{ marginBottom: 10 }}>
          {t.prepareNote}
        </AppText>
        <View style={{ gap: 8 }}>
          <AppButton label={t.viewPdf} variant="outline" onPress={() => void viewPdf()} disabled={busy} />
          <AppButton label={t.sendForSignature} onPress={() => void send()} disabled={busy} />
        </View>
      </Dialog>

      <Dialog visible={confirm} onClose={() => setConfirm(false)}>
        <AppText weight="bold" size={sample.headingSize} style={{ marginBottom: 6 }}>
          {t.countersign}
        </AppText>
        <AppText size={sample.noteSize} color={colors.secondary} style={{ marginBottom: 12 }}>
          {t.countersignConfirm}
        </AppText>
        <DialogButtons cancel={t.cancel} save={t.countersign} onCancel={() => setConfirm(false)} onSave={() => void countersign()} disabled={busy} />
      </Dialog>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card - 4, padding: 14, gap: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
});
