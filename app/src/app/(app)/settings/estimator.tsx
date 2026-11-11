import { Redirect } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { AppAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { AppField } from '@/components/AppField';
import { AppText } from '@/components/AppText';
import { Card, CardBlock } from '@/components/bento/Card';
import { FormScroll } from '@/components/FormScroll';
import { TopBar } from '@/components/TopBar';
import { useEstimatorStrings } from '@/i18n/useEstimatorStrings';
import { useStrings } from '@/i18n/useStrings';
import {
  fromForm,
  previewQuote,
  toForm,
  usd,
  validateEstimatorForm,
  type EstimatorErrors,
  type EstimatorForm,
  type EstimatorSettings,
} from '@/lib/estimator';
import { fetchEstimatorSettings, saveEstimatorSettings } from '@/lib/estimatorApi';
import { useGoBack } from '@/lib/navigation';
import { usePermissions } from '@/lib/session';
import { useTheme } from '@/theme';

/**
 * Ajustes → Estimador del sitio (orden 91; D-309 (4), D-014): solo el Super Admin. Tarifa por tipo, visitas y ajuste
 * por frecuencia, mínimo, rango, redondeo y umbral del walkthrough, con la vista previa de una oficina de 3,000 sq ft
 * 3 veces por semana. Estilo de los formularios de Ajustes (D-200).
 */
export default function EstimatorSettingsScreen() {
  const goBack = useGoBack();
  const { colors } = useTheme();
  const strings = useStrings();
  const t = useEstimatorStrings();
  const { isSuperAdmin } = usePermissions();
  const [base, setBase] = useState<EstimatorSettings | null>(null);
  const [form, setForm] = useState<EstimatorForm | null>(null);
  const [errors, setErrors] = useState<EstimatorErrors>({});
  const [failure, setFailure] = useState<'load' | 'save' | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchEstimatorSettings().then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setFailure('load');
        return;
      }
      setBase(result.data);
      setForm(toForm(result.data));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const preview = useMemo(() => (form && base ? previewQuote(form, base) : null), [form, base]);

  if (!isSuperAdmin) return <Redirect href="/" />;

  async function save() {
    if (saving || !form || !base) return;
    const found = validateEstimatorForm(form, base);
    setErrors(found);
    setFailure(null);
    if (Object.keys(found).length) return;
    setSaving(true);
    const result = await saveEstimatorSettings(fromForm(form, base));
    setSaving(false);
    if (!result.ok) {
      setFailure('save');
      return;
    }
    goBack();
  }

  const err = (k: string) => (errors[k] ? t.errorValue : null);
  const setMap = (field: 'rates' | 'visits' | 'adjustments', key: string, v: string) =>
    form && setForm({ ...form, [field]: { ...form[field], [key]: v } });

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar title={t.row} onBack={goBack} backLabel={strings.common.back} />
      <FormScroll contentContainerStyle={{ padding: 12, gap: 12 }} keyboardShouldPersistTaps="handled">
        {failure === 'load' ? <AppAlert tone="error" text={t.errorLoad} /> : null}
        {form && base ? (
          <>
            <AppText size={13} color={colors.secondary}>
              {t.intro}
            </AppText>
            <Card tone="brand" wide accessibilityLabel={t.preview} style={{ gap: 4 }}>
              <AppText weight="bold" size={12} color="#FFFFFF">
                {t.preview} · {t.previewWhat}
              </AppText>
              {preview ? (
                <>
                  <AppText weight="heavy" size={26} color="#FFFFFF" testID="estimator-preview">
                    {`${usd(preview.low)} – ${usd(preview.high)}`}
                  </AppText>
                  <AppText size={12} color="#FFFFFF">
                    {t.previewPerVisit(usd(preview.perVisit))}
                  </AppText>
                </>
              ) : (
                <AppText size={13} color="#FFFFFF">
                  {t.previewInvalid}
                </AppText>
              )}
            </Card>

            <AppText weight="heavy" size={15}>
              {t.types}
            </AppText>
            <CardBlock>
              <View style={{ padding: 12 }}>
                {base.placeTypes.map((p) => (
                  <AppField
                    key={p.key}
                    label={`${p.name} · ${t.rate}`}
                    value={form.rates[p.key] ?? ''}
                    onChangeText={(v) => setMap('rates', p.key, v)}
                    keyboardType="decimal-pad"
                    error={err(`rate:${p.key}`)}
                  />
                ))}
              </View>
            </CardBlock>

            <AppText weight="heavy" size={15}>
              {t.frequencies}
            </AppText>
            <CardBlock>
              <View style={{ padding: 12 }}>
                {base.frequencies.map((f) => (
                  <View key={f.key}>
                    <AppText weight="bold" size={14} style={{ marginTop: 4, marginBottom: 2 }}>
                      {f.name}
                    </AppText>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <AppField
                          label={t.visits}
                          accessibilityLabel={`${f.name} · ${t.visits}`}
                          value={form.visits[f.key] ?? ''}
                          onChangeText={(v) => setMap('visits', f.key, v)}
                          keyboardType="decimal-pad"
                          error={err(`visits:${f.key}`)}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <AppField
                          label={t.adjustment}
                          accessibilityLabel={`${f.name} · ${t.adjustment}`}
                          value={form.adjustments[f.key] ?? ''}
                          onChangeText={(v) => setMap('adjustments', f.key, v)}
                          keyboardType="decimal-pad"
                          error={err(`adjustment:${f.key}`)}
                        />
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            </CardBlock>

            <AppText weight="heavy" size={15}>
              {t.general}
            </AppText>
            <CardBlock>
              <View style={{ padding: 12 }}>
                <AppField label={t.minPerVisit} value={form.minPerVisit} onChangeText={(v) => setForm({ ...form, minPerVisit: v })} keyboardType="decimal-pad" error={err('minPerVisit')} />
                <AppField label={t.rangePercent} value={form.rangePercent} onChangeText={(v) => setForm({ ...form, rangePercent: v })} keyboardType="decimal-pad" error={err('rangePercent')} />
                <AppField label={t.roundTo} value={form.roundTo} onChangeText={(v) => setForm({ ...form, roundTo: v })} keyboardType="number-pad" error={err('roundTo')} />
                <AppField label={t.walkthroughSqft} value={form.walkthroughSqft} onChangeText={(v) => setForm({ ...form, walkthroughSqft: v })} keyboardType="number-pad" error={err('walkthroughSqft')} />
              </View>
            </CardBlock>

            {failure === 'save' ? <AppAlert tone="error" text={t.errorSave} /> : null}
            <AppButton label={strings.common.save} onPress={() => void save()} disabled={saving} />
          </>
        ) : null}
      </FormScroll>
    </View>
  );
}
