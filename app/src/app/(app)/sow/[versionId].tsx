import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { AppField } from '@/components/AppField';
import { AppText } from '@/components/AppText';
import { Dialog } from '@/components/Dialog';
import { FormScroll } from '@/components/FormScroll';
import { TopBar } from '@/components/TopBar';
import { showDone } from '@/components/brand/DoneOverlay';
import { AmberNote } from '@/components/contract/ContractParts';
import { DialogButtons } from '@/components/work/SimpleParts';
import { useQuoteStrings } from '@/i18n/useQuoteStrings';
import { useSowStrings } from '@/i18n/useSowStrings';
import { useStrings } from '@/i18n/useStrings';
import { useGoBack } from '@/lib/navigation';
import { sendQuote } from '@/lib/quotesApi';
import { usePermissions } from '@/lib/session';
import { fetchQuoteSow, saveQuoteSow } from '@/lib/sowApi';
import { SOW_SECTIONS, changedFields, sectionSummary, type SowData, type SowSectionKey } from '@/lib/sowRules';
import { radius, sample, useTheme } from '@/theme';

const MULTILINE = new Set(['a4_clarifications', 'floors_rooms', 'holidays', 'a3_periodic_task', 'a3_addons_task', 'restricted_areas']);

/**
 * Scope of Work del quote (orden 112, D-318, D-320 muestra 2): se arma solo con el walkthrough; una tarjeta por sección
 * con lo ya llenado y "Editar", "Ver PDF del SOW" y "Enviar quote". El precio no va en el SOW (va en el quote).
 */
export default function SowScreen() {
  const { versionId, company } = useLocalSearchParams<{ versionId: string; company?: string }>();
  const router = useRouter();
  const goBack = useGoBack();
  const { colors } = useTheme();
  const t = useSowStrings();
  const q = useQuoteStrings();
  const strings = useStrings();
  const { can } = usePermissions();
  const canSee = can('quotes_ver') || can('sow_contratos_subir_ver');
  const canSend = can('quotes_enviar');

  const [sow, setSow] = useState<SowData | null>(null);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState<SowSectionKey | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'error' | 'warning'; text: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetchQuoteSow(versionId ?? '');
    if (!r.ok) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setSow(r.data);
  }, [versionId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!canSee) return <Redirect href="/" />;

  const section = SOW_SECTIONS.find((s) => s.key === editing) ?? null;

  function openEdit(key: SowSectionKey) {
    if (!sow) return;
    const keys = SOW_SECTIONS.find((s) => s.key === key)?.fields ?? [];
    setValues(Object.fromEntries(keys.map((k) => [k, sow.fields[k] ?? ''])));
    setEditing(key);
  }

  async function onSave() {
    if (!sow || !section) return;
    const changed = changedFields(sow.fields, values, section.fields);
    if (Object.keys(changed).length === 0) {
      setEditing(null);
      return;
    }
    setBusy(true);
    const r = await saveQuoteSow(sow.versionId, changed);
    setBusy(false);
    if (!r.ok) {
      setNotice({ tone: 'error', text: t.errorSave });
      return;
    }
    setSow(r.data);
    setEditing(null);
  }

  async function onSend() {
    if (!sow || busy || sow.missing.length > 0) return;
    setBusy(true);
    setNotice(null);
    const r = await sendQuote(sow.versionId);
    setBusy(false);
    if (!r.ok) {
      setNotice({ tone: 'error', text: q.errorSend });
      return;
    }
    if (r.data.failed === 0) showDone(); // D-250
    goBack();
  }

  const label = (k: string) => t.fields[k] ?? k;
  const missingText = sow && sow.missing.length > 0 ? t.missing(sow.missing.map(label).join(', ')) : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar title={t.title} subtitle={company ?? undefined} onBack={goBack} backLabel={strings.common.back} />
      <FormScroll contentContainerStyle={{ padding: 12, gap: 10 }} keyboardShouldPersistTaps="handled">
        {failed ? <AppAlert tone="error" text={t.errorLoad} /> : null}
        {notice ? <AppAlert tone={notice.tone} text={notice.text} /> : null}
        {sow ? (
          <>
            <AppText size={sample.noteSize} color={colors.secondary}>
              {t.intro}
            </AppText>
            {missingText && sow.editable ? <AmberNote title={t.title} text={missingText} /> : null}
            {SOW_SECTIONS.map((s) => {
              const lines = sectionSummary(s.key, sow.fields, {
                toBeDefined: t.toBeDefined,
                empty: t.empty,
                areaCount: t.areaRows,
              });
              return (
                <View key={s.key} style={[styles.card, { backgroundColor: colors.card }]}>
                  <View style={styles.row}>
                    <AppText weight="bold">{t.sections[s.key]}</AppText>
                    {sow.editable ? (
                      <Pressable accessibilityRole="button" accessibilityLabel={`${t.edit} ${t.sections[s.key]}`} onPress={() => openEdit(s.key)} hitSlop={8}>
                        <AppText weight="bold" color={colors.brandText}>
                          {t.edit}
                        </AppText>
                      </Pressable>
                    ) : null}
                  </View>
                  {s.key === 'a4' ? (
                    <AppText size={sample.noteSize} color={colors.secondary}>
                      {t.fixedText}
                    </AppText>
                  ) : null}
                  {s.key === 'a4' ? (
                    <AppText size={sample.noteSize} weight="bold" color={colors.secondary}>
                      {label('a4_clarifications')}
                    </AppText>
                  ) : null}
                  {lines.map((l, i) => (
                    <AppText key={i} size={i === 0 && s.key !== 'a4' ? 15 : sample.noteSize} color={i === 0 && s.key !== 'a4' ? colors.text : colors.secondary}>
                      {l}
                    </AppText>
                  ))}
                  {s.optional ? (
                    <AppText size={sample.noteSize} color={colors.secondary}>
                      {t.optional}
                    </AppText>
                  ) : null}
                </View>
              );
            })}
            <AppText size={sample.noteSize} color={colors.secondary}>
              {t.noPrice}
            </AppText>
            <AppButton
              label={t.viewPdf}
              variant="outline"
              icon="file-text"
              onPress={() =>
                router.push({
                  pathname: '/viewer',
                  params: { source: 'sow-preview', documentId: sow.versionId, title: t.pdfTitle(company ?? ''), download: '1' },
                })
              }
            />
            {sow.editable && canSend ? (
              <AppButton label={t.send} onPress={() => void onSend()} disabled={busy || sow.missing.length > 0} />
            ) : null}
          </>
        ) : null}
      </FormScroll>

      <Dialog visible={section !== null} onClose={() => setEditing(null)}>
        {section ? (
          <>
            <AppText weight="bold" size={sample.headingSize} style={{ marginBottom: 8 }}>
              {t.sections[section.key]}
            </AppText>
            {section.key === 'a3' ? (
              <AppText size={sample.noteSize} color={colors.secondary} style={{ marginBottom: 8 }}>
                {t.a3Hint}
              </AppText>
            ) : null}
            {section.fields.map((k) => (
              <AppField
                key={k}
                label={label(k)}
                value={values[k] ?? ''}
                multiline={MULTILINE.has(k)}
                textAlignVertical={MULTILINE.has(k) ? 'top' : undefined}
                style={MULTILINE.has(k) ? { minHeight: 72 } : undefined}
                onChangeText={(x) => setValues((v) => ({ ...v, [k]: x.slice(0, 2000) }))}
              />
            ))}
            <DialogButtons cancel={t.cancel} save={t.save} onCancel={() => setEditing(null)} onSave={() => void onSave()} disabled={busy} />
          </>
        ) : null}
      </Dialog>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card - 4, padding: 14, gap: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
});
