import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { FormScroll } from '@/components/FormScroll';
import { AppAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { LeadFormFields } from '@/components/sales/LeadFormFields';
import { TopBar } from '@/components/TopBar';
import { useSalesStrings } from '@/i18n/useSalesStrings';
import { useStrings } from '@/i18n/useStrings';
import {
  canEditLeads,
  emptyLeadForm,
  hasLeadErrors,
  validateLeadForm,
  type LeadForm,
  type LeadFormErrors,
} from '@/lib/leadRules';
import { createLead } from '@/lib/leadsApi';
import { useGoBack } from '@/lib/navigation';
import { usePermissions } from '@/lib/session';
import { useTheme } from '@/theme';

/** Nuevo lead (registro manual, flujo "Ventas 1: Lead"): una sola pantalla, como Nuevo empleado (D-171). Al crear abre el lead. */
export default function NewLeadScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const { colors } = useTheme();
  const strings = useStrings();
  const s = useSalesStrings();
  const { access } = usePermissions();
  const [form, setForm] = useState<LeadForm>(emptyLeadForm);
  const [errors, setErrors] = useState<LeadFormErrors>({});
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<'forbidden' | 'generic' | null>(null);

  if (!canEditLeads(access)) return <Redirect href="/" />;

  async function submit() {
    if (saving) return;
    const found = validateLeadForm(form);
    setErrors(found);
    setFailure(null);
    if (hasLeadErrors(found)) return;
    setSaving(true);
    const result = await createLead(form);
    setSaving(false);
    if (!result.ok) {
      setFailure(result.reason === 'forbidden' ? 'forbidden' : 'generic');
      return;
    }
    // D-200: al crear se abre el lead, pestaña Datos.
    router.replace({ pathname: '/leads/[id]', params: { id: result.data } });
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar title={s.form.newTitle} onBack={goBack} backLabel={strings.common.back} />
      <FormScroll contentContainerStyle={{ padding: 12 }} keyboardShouldPersistTaps="handled">
        <LeadFormFields form={form} errors={errors} onChange={setForm} s={s} />
        <View style={{ height: 4 }} />
        {failure ? (
          <AppAlert tone="error" text={failure === 'forbidden' ? s.form.errorForbidden : s.form.errorCreate} />
        ) : null}
        <AppButton label={s.form.create} onPress={() => void submit()} disabled={saving} />
      </FormScroll>
    </View>
  );
}
