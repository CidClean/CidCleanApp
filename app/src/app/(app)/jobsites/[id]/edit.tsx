import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { FormScroll } from '@/components/FormScroll';
import { AppAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { JobsiteFields } from '@/components/clients/JobsiteFields';
import { TopBar } from '@/components/TopBar';
import { useClientsStrings } from '@/i18n/useClientsStrings';
import { useStrings } from '@/i18n/useStrings';
import { canEditClientData, jobsiteData, jobsiteFormFrom, validateJobsite, type JobsiteErrors, type JobsiteForm } from '@/lib/clientRules';
import { fetchJobsite, updateJobsite } from '@/lib/clientsApi';
import { formatUsDate } from '@/lib/leadRules';
import { useGoBack } from '@/lib/navigation';
import { isValidPlusCode } from '@/lib/plusCode';
import { usePermissions } from '@/lib/session';
import { useTheme } from '@/theme';

/** Editar datos y contactos del jobsite (clientes_editar_datos). La tarifa y el estado se cambian en el Resumen. */
export default function EditJobsiteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const goBack = useGoBack();
  const { colors } = useTheme();
  const strings = useStrings();
  const c = useClientsStrings();
  const { access } = usePermissions();
  const [form, setForm] = useState<JobsiteForm | null>(null);
  const [errors, setErrors] = useState<JobsiteErrors>({});
  const [failed, setFailed] = useState<'load' | 'save' | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchJobsite(id).then((r) => {
      if (cancelled) return;
      if (r.ok) setForm(jobsiteFormFrom(r.data, formatUsDate));
      else setFailed('load');
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!canEditClientData(access)) return <Redirect href="/" />;

  async function save() {
    if (!form || saving) return;
    const found = validateJobsite(form, { withRate: false, plusCodeOk: isValidPlusCode });
    setErrors(found);
    setFailed(null);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    const result = await updateJobsite(id, jobsiteData(form));
    setSaving(false);
    if (!result.ok) {
      setFailed('save');
      return;
    }
    goBack();
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar title={c.form.editTitle} onBack={goBack} backLabel={strings.common.back} />
      <FormScroll contentContainerStyle={{ padding: 12 }} keyboardShouldPersistTaps="handled">
        {failed === 'load' ? <AppAlert tone="error" text={c.jobsite.errorLoad} /> : null}
        {form ? (
          <>
            <JobsiteFields form={form} errors={errors} onChange={setForm} c={c} withRate={false} />
            <View style={{ height: 4 }} />
            {failed === 'save' ? <AppAlert tone="error" text={c.form.errorSave} /> : null}
            <AppButton label={strings.common.save} onPress={() => void save()} disabled={saving} />
          </>
        ) : null}
      </FormScroll>
    </View>
  );
}
