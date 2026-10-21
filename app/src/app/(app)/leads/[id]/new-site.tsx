import { Redirect, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { AppAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { AppField } from '@/components/AppField';
import { TopBar } from '@/components/TopBar';
import { useSalesStrings } from '@/i18n/useSalesStrings';
import { useStrings } from '@/i18n/useStrings';
import { canEditLeads } from '@/lib/leadRules';
import { addSite } from '@/lib/leadsApi';
import { useGoBack } from '@/lib/navigation';
import { usePermissions } from '@/lib/session';
import { useTheme } from '@/theme';

/** Nuevo sitio del lead (D-003): nombre opcional y dirección. Al guardar vuelve al lead (D-200). */
export default function NewSiteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const goBack = useGoBack();
  const { colors } = useTheme();
  const strings = useStrings();
  const s = useSalesStrings();
  const { access } = usePermissions();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [addressError, setAddressError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!canEditLeads(access)) return <Redirect href="/" />;

  async function submit() {
    if (saving) return;
    const missing = address.trim() === '';
    setAddressError(missing);
    setFailed(false);
    if (missing) return;
    setSaving(true);
    const result = await addSite(id, name, address);
    setSaving(false);
    if (!result.ok) {
      setFailed(true);
      return;
    }
    goBack();
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <TopBar title={s.sites.newTitle} onBack={goBack} backLabel={strings.common.back} />
      <ScrollView contentContainerStyle={{ padding: 12 }} keyboardShouldPersistTaps="handled">
        <AppField label={s.sites.name} value={name} onChangeText={setName} autoCapitalize="words" />
        <AppField
          label={s.sites.address}
          value={address}
          onChangeText={setAddress}
          autoComplete="street-address"
          error={addressError ? s.sites.errorAddress : null}
        />
        <View style={{ height: 4 }} />
        {failed ? <AppAlert tone="error" text={s.sites.errorAdd} /> : null}
        <AppButton label={s.sites.add} onPress={() => void submit()} disabled={saving} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
