import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { AppAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { ClientFields, emptyClientForm, type ClientForm } from '@/components/clients/ClientFields';
import { TopBar } from '@/components/TopBar';
import { useClientsStrings } from '@/i18n/useClientsStrings';
import { useStrings } from '@/i18n/useStrings';
import { canCreateLegacy } from '@/lib/clientRules';
import { createLegacyClient } from '@/lib/clientsApi';
import { useGoBack } from '@/lib/navigation';
import { usePermissions } from '@/lib/session';
import { useTheme } from '@/theme';

/** Nuevo cliente previo a la app (D-210): datos de la empresa; al crear se abre el Cliente para agregar sus jobsites. */
export default function NewClientScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const { colors } = useTheme();
  const strings = useStrings();
  const c = useClientsStrings();
  const { access } = usePermissions();
  const [form, setForm] = useState<ClientForm>(emptyClientForm);
  const [nameError, setNameError] = useState(false);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!canCreateLegacy(access)) return <Redirect href="/" />;

  async function submit() {
    if (saving) return;
    const missing = form.name.trim() === '';
    setNameError(missing);
    setFailed(false);
    if (missing) return;
    setSaving(true);
    const result = await createLegacyClient(form);
    setSaving(false);
    if (!result.ok) {
      setFailed(true);
      return;
    }
    router.replace({ pathname: '/clients/[id]', params: { id: result.data } });
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <TopBar title={c.list.newClient} onBack={goBack} backLabel={strings.common.back} />
      <ScrollView contentContainerStyle={{ padding: 12 }} keyboardShouldPersistTaps="handled">
        <ClientFields form={form} onChange={setForm} c={c} nameError={nameError} />
        <View style={{ height: 4 }} />
        {failed ? <AppAlert tone="error" text={c.client.errorSave} /> : null}
        <AppButton label={c.client.create} onPress={() => void submit()} disabled={saving} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
