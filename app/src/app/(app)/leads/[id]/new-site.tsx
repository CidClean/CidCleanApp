import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { FormScroll } from '@/components/FormScroll';
import { AppAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { AddressFields } from '@/components/AddressFields';
import { AppField } from '@/components/AppField';
import { TopBar } from '@/components/TopBar';
import { useAddressStrings } from '@/i18n/useAddressStrings';
import { useSalesStrings } from '@/i18n/useSalesStrings';
import { useStrings } from '@/i18n/useStrings';
import { addressErrors, emptyAddress, hasAddressErrors, type AddressErrors } from '@/lib/address';
import { canEditLeads } from '@/lib/leadRules';
import { addSite, fetchLead, updateSite } from '@/lib/leadsApi';
import { useGoBack } from '@/lib/navigation';
import { usePermissions } from '@/lib/session';
import { useTheme } from '@/theme';

/**
 * Formulario del sitio (D-003, D-202): nombre opcional y dirección (obligatoria, con los campos comunes de D-301).
 * Sin `site` es "Nuevo sitio" (Agregar sitio); con `site` lo abre el lápiz de la fila y es "Editar sitio" (Guardar).
 * Al guardar vuelve al lead (D-200).
 */
export default function SiteFormScreen() {
  const { id, site } = useLocalSearchParams<{ id: string; site?: string }>();
  const goBack = useGoBack();
  const { colors } = useTheme();
  const strings = useStrings();
  const s = useSalesStrings();
  const addressT = useAddressStrings();
  const { access } = usePermissions();
  const editing = Boolean(site);
  const [name, setName] = useState('');
  const [address, setAddress] = useState(emptyAddress());
  const [loaded, setLoaded] = useState(!editing);
  const [loadFailed, setLoadFailed] = useState(false);
  const [errors, setErrors] = useState<AddressErrors>({});
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
      setAddress(found.addressParts ?? { ...emptyAddress(), addressLine1: found.address });
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [id, site]);

  if (!canEditLeads(access)) return <Redirect href="/" />;

  async function submit() {
    if (saving || !loaded) return;
    const e = addressErrors(address, 'required');
    setErrors(e);
    setFailed(false);
    if (hasAddressErrors(e)) return;
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
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar title={editing ? s.sites.editTitle : s.sites.newTitle} onBack={goBack} backLabel={strings.common.back} />
      <FormScroll contentContainerStyle={{ padding: 12 }} keyboardShouldPersistTaps="handled">
        {loadFailed ? <AppAlert tone="error" text={s.sites.errorLoad} /> : null}
        {loaded ? (
          <>
            <AppField label={s.sites.name} value={name} onChangeText={setName} autoCapitalize="words" />
            <AddressFields form={address} onChange={setAddress} t={addressT} errors={errors} />
            <View style={{ height: 4 }} />
            {failed ? <AppAlert tone="error" text={editing ? s.form.errorSave : s.sites.errorAdd} /> : null}
            <AppButton label={editing ? strings.common.save : s.sites.add} onPress={() => void submit()} disabled={saving} />
          </>
        ) : null}
      </FormScroll>
    </View>
  );
}
