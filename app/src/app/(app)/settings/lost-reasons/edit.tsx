import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { FormScroll } from '@/components/FormScroll';
import { AppAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { AppField } from '@/components/AppField';
import { TopBar } from '@/components/TopBar';
import { useSalesStrings } from '@/i18n/useSalesStrings';
import { useStrings } from '@/i18n/useStrings';
import { nextReasonSort, validateReasonForm, type ReasonForm, type ReasonFormErrors } from '@/lib/leadRules';
import { createLostReason, fetchLostReasons, updateLostReason } from '@/lib/leadsApi';
import { useGoBack } from '@/lib/navigation';
import { usePermissions } from '@/lib/session';
import { useTheme } from '@/theme';

/** Motivo de lead perdido (D-203): texto en español y en inglés y Guardar. Sin `id` crea uno nuevo al final de la lista. */
export default function LostReasonFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const goBack = useGoBack();
  const { colors } = useTheme();
  const strings = useStrings();
  const s = useSalesStrings();
  const { isSuperAdmin } = usePermissions();
  const [form, setForm] = useState<ReasonForm>({ labelEs: '', labelEn: '' });
  const [sort, setSort] = useState<number | null>(null);
  const [errors, setErrors] = useState<ReasonFormErrors>({});
  const [failure, setFailure] = useState<'load' | 'save' | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchLostReasons().then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setFailure('load');
        return;
      }
      setSort(nextReasonSort(result.data));
      const found = id ? result.data.find((r) => r.id === id) : undefined;
      if (id && !found) setFailure('load');
      if (found) setForm({ labelEs: found.labelEs, labelEn: found.labelEn });
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!isSuperAdmin) return <Redirect href="/" />;

  async function save() {
    if (saving || sort === null) return;
    const found = validateReasonForm(form);
    setErrors(found);
    setFailure(null);
    if (found.labelEs || found.labelEn) return;
    setSaving(true);
    const result = id
      ? await updateLostReason(id, form.labelEs, form.labelEn)
      : await createLostReason(form.labelEs, form.labelEn, sort);
    setSaving(false);
    if (!result.ok) {
      setFailure('save');
      return;
    }
    goBack();
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar title={id ? s.reasons.editTitle : s.reasons.newTitle} onBack={goBack} backLabel={strings.common.back} />
      <FormScroll contentContainerStyle={{ padding: 12 }} keyboardShouldPersistTaps="handled">
        {failure === 'load' ? <AppAlert tone="error" text={s.reasons.errorLoad} /> : null}
        <AppField
          label={s.reasons.labelEs}
          value={form.labelEs}
          onChangeText={(v) => setForm({ ...form, labelEs: v })}
          error={errors.labelEs ? s.reasons.errorEs : null}
        />
        <AppField
          label={s.reasons.labelEn}
          value={form.labelEn}
          onChangeText={(v) => setForm({ ...form, labelEn: v })}
          error={errors.labelEn ? s.reasons.errorEn : null}
        />
        <View style={{ height: 4 }} />
        {failure === 'save' ? <AppAlert tone="error" text={s.reasons.errorSave} /> : null}
        <AppButton label={strings.common.save} onPress={() => void save()} disabled={saving || sort === null} />
      </FormScroll>
    </View>
  );
}
