import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { AppAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { AppField } from '@/components/AppField';
import { TopBar } from '@/components/TopBar';
import { useSalesStrings } from '@/i18n/useSalesStrings';
import { useStrings } from '@/i18n/useStrings';
import { canEditLeads } from '@/lib/leadRules';
import { addSite, fetchLead, updateSite } from '@/lib/leadsApi';
import { useGoBack } from '@/lib/navigation';
import { usePermissions } from '@/lib/session';
import { useTheme } from '@/theme';

/**
 * Formulario del sitio (D-003, D-202): nombre opcional y dirección.
 * Sin `site` es "Nuevo sitio" (Agregar sitio); con `site` lo abre el lápiz de la fila y es "Editar sitio" (Guardar).
 * Al guardar vuelve al lead (D-200).
 */
export default function SiteFormScreen() {
  const { id, site } = useLocalSearchParams<{ id: string; site?: string }>();
  const goBack = useGoBack();
  const { colors } = useTheme();
  const strings = useStrings();
  const s = useSalesStrings();
  const { access } = usePermissions();
  const editing = Boolean(site);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [loaded, setLoaded] = useState(!editing);
  const [loadFailed, setLoadFailed] = useState(false);
  const [addressError, setAddressError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!site) return;
    let cancelled = false;
    void fetchLead(id).then((result) => {
      if (cancelled) return;
      const found = result.ok ? result.data.sites.find((x) => x.id === site) : undefined;
      if (!found) {
        setLoadFailed(true);
        return;
      }
      setName(found.name ?? '');
      setAddress(found.address);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [id, site]);

  if (!canEditLeads(access)) return <Redirect href="/" />;

  async function submit() {
    if (saving || !loaded) return;
    const missing = address.trim() === '';
    setAddressError(missing);
    setFailed(false);
    if (missing) return;
    setSaving(true);
    const result = site ? await updateSite(site, name, address) : await addSite(id, name, address);
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
      <TopBar title={editing ? s.sites.editTitle : s.sites.newTitle} onBack={goBack} backLabel={strings.common.back} />
      <ScrollView contentContainerStyle={{ padding: 12 }} keyboardShouldPersistTaps="handled">
        {loadFailed ? <AppAlert tone="error" text={s.sites.errorLoad} /> : null}
        {loaded ? (
          <>
            <AppField label={s.sites.name} value={name} onChangeText={setName} autoCapitalize="words" />
            <AppField
              label={s.sites.address}
              value={address}
              onChangeText={setAddress}
              autoComplete="street-address"
              error={addressError ? s.sites.errorAddress : null}
            />
            <View style={{ height: 4 }} />
            {failed ? <AppAlert tone="error" text={editing ? s.form.errorSave : s.sites.errorAdd} /> : null}
            <AppButton label={editing ? strings.common.save : s.sites.add} onPress={() => void submit()} disabled={saving} />
          </>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
