import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { FormScroll } from '@/components/FormScroll';
import { AppAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { JobsiteFields } from '@/components/clients/JobsiteFields';
import { TopBar } from '@/components/TopBar';
import { useClientsStrings } from '@/i18n/useClientsStrings';
import { useStrings } from '@/i18n/useStrings';
import { canCreateLegacy, emptyJobsiteForm, jobsiteData, parseMoney, validateJobsite, type JobsiteErrors, type JobsiteForm } from '@/lib/clientRules';
import { createLegacyJobsite } from '@/lib/clientsApi';
import { useGoBack } from '@/lib/navigation';
import { isValidPlusCode } from '@/lib/plusCode';
import { usePermissions } from '@/lib/session';
import { useTheme } from '@/theme';
import { saveLocation } from '@/lib/jobsiteLocation';


/** Nuevo jobsite de un cliente previo a la app (D-210): datos, contactos, frecuencia y tarifa. Al crear abre el jobsite. */
export default function NewJobsiteScreen() {
  const { client } = useLocalSearchParams<{ client: string }>();
  const router = useRouter();
  const goBack = useGoBack();
  const { colors } = useTheme();
  const strings = useStrings();
  const c = useClientsStrings();
  const { access } = usePermissions();
  const [form, setForm] = useState<JobsiteForm>(emptyJobsiteForm);
  const [errors, setErrors] = useState<JobsiteErrors>({});
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!canCreateLegacy(access)) return <Redirect href="/" />;

  async function submit() {
    if (saving) return;
    const found = validateJobsite(form, { withRate: true, plusCodeOk: isValidPlusCode });
    setErrors(found);
    setFailed(false);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    const result = await createLegacyJobsite(client, jobsiteData(form), parseMoney(form.rate) ?? 0);
    setSaving(false);
    if (!result.ok) {
      setFailed(true);
      return;
    }
    await saveLocation(result.data, form.plusCode);
    router.replace({ pathname: '/jobsites/[id]', params: { id: result.data } });
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar title={c.form.newTitle} onBack={goBack} backLabel={strings.common.back} />
      <FormScroll contentContainerStyle={{ padding: 12 }} keyboardShouldPersistTaps="handled">
        <JobsiteFields form={form} errors={errors} onChange={setForm} c={c} withRate />
        <View style={{ height: 4 }} />
        {failed ? <AppAlert tone="error" text={c.form.errorSave} /> : null}
        <AppButton label={c.form.create} onPress={() => void submit()} disabled={saving} />
      </FormScroll>
    </View>
  );
}
