import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { FormScroll } from '@/components/FormScroll';
import { AppAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { AppField } from '@/components/AppField';
import { TopBar } from '@/components/TopBar';
import { useAccountingStrings } from '@/i18n/useAccountingStrings';
import { useStrings } from '@/i18n/useStrings';
import { createExpenseCategory, fetchExpenseCategories, updateExpenseCategory } from '@/lib/accountingApi';
import { nextReasonSort, validateReasonForm, type ReasonForm, type ReasonFormErrors } from '@/lib/leadRules';
import { useGoBack } from '@/lib/navigation';
import { usePermissions } from '@/lib/session';
import { useTheme } from '@/theme';

/** Categoría de gastos (D-113, D-114, D-130): texto en español y en inglés y Guardar. Sin `id` crea una nueva al final de la lista. */
export default function ExpenseCategoryFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const goBack = useGoBack();
  const { colors } = useTheme();
  const strings = useStrings();
  const a = useAccountingStrings();
  const { isSuperAdmin } = usePermissions();
  const [form, setForm] = useState<ReasonForm>({ labelEs: '', labelEn: '' });
  const [sort, setSort] = useState<number | null>(null);
  const [errors, setErrors] = useState<ReasonFormErrors>({});
  const [failure, setFailure] = useState<'load' | 'save' | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchExpenseCategories().then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setFailure('load');
        return;
      }
      setSort(nextReasonSort(result.data));
      const found = id ? result.data.find((c) => c.id === id) : undefined;
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
      ? await updateExpenseCategory(id, form.labelEs, form.labelEn)
      : await createExpenseCategory(form.labelEs, form.labelEn, sort);
    setSaving(false);
    if (!result.ok) {
      setFailure('save');
      return;
    }
    goBack();
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar title={id ? a.categories.editTitle : a.categories.newTitle} onBack={goBack} backLabel={strings.common.back} />
      <FormScroll contentContainerStyle={{ padding: 12 }} keyboardShouldPersistTaps="handled">
        {failure === 'load' ? <AppAlert tone="error" text={a.categories.errorLoad} /> : null}
        <AppField
          label={a.categories.labelEs}
          value={form.labelEs}
          onChangeText={(v) => setForm({ ...form, labelEs: v })}
          error={errors.labelEs ? a.categories.errorEs : null}
        />
        <AppField
          label={a.categories.labelEn}
          value={form.labelEn}
          onChangeText={(v) => setForm({ ...form, labelEn: v })}
          error={errors.labelEn ? a.categories.errorEn : null}
        />
        <View style={{ height: 4 }} />
        {failure === 'save' ? <AppAlert tone="error" text={a.categories.errorSave} /> : null}
        <AppButton label={strings.common.save} onPress={() => void save()} disabled={saving || sort === null} />
      </FormScroll>
    </View>
  );
}
