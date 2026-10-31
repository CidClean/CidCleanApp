import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppAlert } from '../AppAlert';
import { AppButton } from '../AppButton';
import { AppField } from '../AppField';
import { AppText } from '../AppText';
import { Dialog } from '../Dialog';
import { UsDateField } from '../UsDateField';
import { DialogButtons } from '../work/SimpleParts';
import { Pill } from '../contract/ContractParts';
import { useIcaStrings } from '@/i18n/ica';
import { chooseFile, type PickedFile } from '@/lib/documents';
import { formatDate } from '@/lib/employeeRules';
import { createWarning, fetchWarnings, voidWarning, type Warning, type Warnings } from '@/lib/icaApi';
import { noon, warningsTone } from '@/lib/icaRules';
import { dayKey, formatUsDate, parseUsDate } from '@/lib/leadRules';
import { useSession } from '@/lib/session';
import { radius, sample, useTheme } from '@/theme';

/**
 * Advertencias escritas del perfil (D-285, ICA §10; muestra surveys/ica-ofertas-aprobado.html (4)): contador
 * "{n} de 3", una fila por advertencia (fecha, motivo, "PDF" si tiene documento) con "Vigente" o "Anulada", "Nueva
 * advertencia" y "Anular" solo para el Super Admin, y el aviso ámbar. Lo ven el Super Admin y quien edita y desactiva
 * empleados (la base lo decide).
 */
export function WarningsSection({ profileId, fullName }: { profileId: string; fullName: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const t = useIcaStrings();
  const { locale } = useSession();
  const today = useMemo(() => dayKey(new Date()), []);
  const [data, setData] = useState<Warnings | null>(null);
  const [creating, setCreating] = useState(false);
  const [date, setDate] = useState(formatUsDate(today));
  const [reason, setReason] = useState('');
  const [file, setFile] = useState<PickedFile | null>(null);
  const [voiding, setVoiding] = useState<Warning | null>(null);
  const [voidText, setVoidText] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetchWarnings(profileId);
    if (r.ok) setData(r.data);
  }, [profileId]);
  useEffect(() => {
      void load();
  }, [load]);

  if (!data) return null;

  async function save() {
    if (busy) return;
    const key = parseUsDate(date);
    if (!key || key === 'invalid' || key > today) return setFormError(t.error);
    if (!reason.trim()) return setFormError(t.reasonRequired);
    setBusy(true);
    setFormError(null);
    const r = await createWarning(profileId, key, reason.trim(), file);
    setBusy(false);
    if (!r.ok) return setFormError(t.error);
    setCreating(false);
    setReason('');
    setFile(null);
    await load();
  }

  async function doVoid() {
    if (busy || !voiding) return;
    if (!voidText.trim()) return setFormError(t.reasonRequired);
    setBusy(true);
    setFormError(null);
    const r = await voidWarning(voiding.id, voidText.trim());
    setBusy(false);
    if (!r.ok) return setFormError(t.error);
    setVoiding(null);
    setVoidText('');
    await load();
  }

  async function attach() {
    const p = await chooseFile();
    if (p.kind === 'picked') setFile(p.file);
  }

  return (
    <View style={{ gap: 8, marginTop: 10 }}>
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <View style={styles.row}>
          <AppText weight="bold" size={14}>
            {t.warningsTitle}
          </AppText>
          <Pill label={t.countOf3(data.activeCount)} tone={warningsTone(data.activeCount)} />
        </View>
        {data.items.length === 0 ? (
          <AppText size={12} color={colors.secondary}>
            {t.noWarnings}
          </AppText>
        ) : null}
        {data.items.map((w) => (
          <Pressable
            key={w.id}
            accessibilityRole={w.hasDocument ? 'button' : undefined}
            disabled={!w.hasDocument}
            onPress={() => router.push({ pathname: '/viewer', params: { source: 'warning', documentId: w.id, title: t.warningsTitle } })}
            style={styles.row}
          >
            <View style={{ flexShrink: 1 }}>
              <AppText size={14}>{formatDate(noon(w.issuedOn), locale)}</AppText>
              <AppText size={12} color={colors.secondary}>
                {w.hasDocument ? `${w.reason} · ${t.withPdf}` : w.reason}
              </AppText>
              {w.status === 'voided' && w.voidReason ? (
                <AppText size={12} color={colors.secondary}>
                  {`${t.voided}: ${w.voidReason}`}
                </AppText>
              ) : null}
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Pill label={w.status === 'active' ? t.active : t.voided} tone="neutral" />
              {data.canManage && w.status === 'active' ? (
                <AppButton label={t.voidAction} variant="text" onPress={() => { setFormError(null); setVoiding(w); }} />
              ) : null}
            </View>
          </Pressable>
        ))}
        {data.canManage ? (
          <AppButton label={t.newWarning} variant="outline" onPress={() => { setFormError(null); setCreating(true); }} />
        ) : null}
      </View>
      <View style={[styles.amber, { backgroundColor: colors.attention }]}>
        <AppText size={13} color={colors.attentionText}>
          {data.activeCount >= 3 ? t.amberAt3(fullName, data.activeCount) : t.amberBefore}
        </AppText>
      </View>

      <Dialog visible={creating} onClose={() => setCreating(false)}>
        <AppText weight="bold" size={sample.headingSize} style={{ marginBottom: 8 }}>
          {t.newWarning}
        </AppText>
        <UsDateField label={t.date} value={date} onChange={setDate} allowPast />
        <AppField label={t.reason} value={reason} onChangeText={setReason} multiline maxLength={2000} />
        <AppButton label={file ? t.attached : t.attach} variant="text" icon="upload" onPress={() => void attach()} />
        {formError ? <AppAlert tone="error" text={formError} /> : null}
        <DialogButtons cancel={t.cancel} save={t.save} onCancel={() => setCreating(false)} onSave={() => void save()} disabled={busy} />
      </Dialog>

      <Dialog visible={voiding !== null} onClose={() => setVoiding(null)}>
        <AppText weight="bold" size={sample.headingSize} style={{ marginBottom: 8 }}>
          {t.voidTitle}
        </AppText>
        <AppField label={t.voidReason} value={voidText} onChangeText={setVoidText} maxLength={500} />
        {formError ? <AppAlert tone="error" text={formError} /> : null}
        <DialogButtons cancel={t.cancel} save={t.voidAction} onCancel={() => setVoiding(null)} onSave={() => void doVoid()} disabled={busy} />
      </Dialog>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card - 4, padding: 14, gap: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  amber: { borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12 },
});
