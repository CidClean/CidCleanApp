import { Redirect, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { FormScroll } from '@/components/FormScroll';
import { CardBlock } from '@/components/bento/Card';
import { AppAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Checkbox } from '@/components/Checkbox';
import { Chip } from '@/components/Chip';
import { ClientFields, clientPayload, clientPhoneOk, type ClientForm } from '@/components/clients/ClientFields';
import { formatPhone } from '@/lib/phone';
import { ListRow } from '@/components/ListRow';
import { BackHeader } from '@/components/bento/Header';
import { MainCard } from '@/components/bento/MainCard';
import { useSalesStrings } from '@/i18n/useSalesStrings';
import { useClientsStrings } from '@/i18n/useClientsStrings';
import { useStrings } from '@/i18n/useStrings';
import { canCreateLegacy, canEditClientData, canSeeAccounts, statusTone, type Client, type Jobsite } from '@/lib/clientRules';
import { fetchClient, fetchJobsites, setClientAccountProvider, updateClient } from '@/lib/clientsApi';
import { useGoBack } from '@/lib/navigation';
import { usePermissions } from '@/lib/session';
import { sample, useTheme } from '@/theme';

/**
 * Cliente (D-210, diseño bajo D-208): encabezado con el nombre y la ficha "Previo a la app" si aplica; filas con los
 * datos de la empresa; "Editar" en la barra (como D-174); sus jobsites como en Cuentas. "Agregar jobsite" solo en
 * clientes previos: los demás jobsites nacen al aceptar un quote.
 */
export default function ClientScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const goBack = useGoBack();
  const { colors } = useTheme();
  const strings = useStrings();
  const c = useClientsStrings();
  const s = useSalesStrings();
  const { access } = usePermissions();
  const [client, setClient] = useState<Client | null>(null);
  const [jobsites, setJobsites] = useState<Jobsite[]>([]);
  const [failed, setFailed] = useState(false);
  const [form, setForm] = useState<ClientForm | null>(null);
  const [nameError, setNameError] = useState(false);
  const [phoneError, setPhoneError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [providerError, setProviderError] = useState(false);

  const load = useCallback(async () => {
    const [cl, js] = await Promise.all([fetchClient(id), fetchJobsites(id)]);
    if (!cl.ok) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setClient(cl.data);
    if (js.ok) setJobsites(js.data);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!canSeeAccounts(access)) return <Redirect href="/" />;

  async function save() {
    if (!form || saving) return;
    const missing = form.name.trim() === '';
    const badPhone = !clientPhoneOk(form);
    setNameError(missing);
    setPhoneError(badPhone);
    if (missing || badPhone) return;
    setSaving(true);
    setSaveError(false);
    const result = await updateClient(id, clientPayload(form));
    setSaving(false);
    if (!result.ok) {
      setSaveError(true);
      return;
    }
    setForm(null);
    await load();
  }

  async function toggleProvider(value: boolean) {
    if (!client || saving) return;
    setSaving(true);
    setProviderError(false);
    const r = await setClientAccountProvider(client.id, value);
    setSaving(false);
    if (!r.ok) {
      setProviderError(true);
      return;
    }
    await load();
  }

  const editAction =
    client && canEditClientData(access)
      ? form
        ? { label: strings.common.cancel, accessibilityLabel: strings.common.cancel, onPress: () => setForm(null) }
        : {
            label: strings.common.edit,
            accessibilityLabel: strings.common.edit,
            onPress: () =>
              setForm({ name: client.name, phone: formatPhone(client.phone), email: client.email ?? '', address: client.address ?? '', notes: client.notes ?? '' }),
          }
      : undefined;

  const value = (v: string | null) => (v && v.trim() !== '' ? v : c.client.none);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BackHeader onBack={goBack} backLabel={strings.common.back} action={editAction} />
      <FormScroll contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
        {failed && !client ? <AppAlert tone="error" text={c.client.errorLoad} /> : null}
        {client ? (
          <>
            {/* D-226: tarjeta principal de marca con Llamar y Correo. */}
            <MainCard
              title={client.name}
              subtitle={`${c.client.barTitle} · ${c.list.jobsitesCount(jobsites.length)}`}
              chip={client.accountProvider ? c.accountProvider : client.legacy ? c.legacy : undefined}
              contact={{ phone: client.phone, email: client.email, callLabel: s.detail.call, mailLabel: s.detail.mail }}
            />
            {form ? (
              <>
                <ClientFields form={form} onChange={setForm} c={c} nameError={nameError} phoneError={phoneError} />
                {saveError ? <AppAlert tone="error" text={c.client.errorSave} /> : null}
                <AppButton label={strings.common.save} onPress={() => void save()} disabled={saving} />
              </>
            ) : (
              <>
                <CardBlock>
                <ListRow title={c.client.phone} detail={client.phone ? formatPhone(client.phone) : c.client.none} />
                <ListRow title={c.client.email} detail={value(client.email)} />
                <ListRow title={c.client.address} detail={value(client.address)} />
                <ListRow title={c.client.notes} detail={value(client.notes)} last />
                </CardBlock>
                {canEditClientData(access) ? (
                  <View style={{ marginTop: 10 }}>
                    <Checkbox label={c.accountProvider} checked={!!client.accountProvider} onChange={(v) => void toggleProvider(v)} />
                    <AppText size={sample.noteSize} color={colors.secondary} style={{ marginTop: 4 }}>
                      {c.accountProviderNote}
                    </AppText>
                    {providerError ? <AppAlert tone="error" text={c.accountProviderError} /> : null}
                  </View>
                ) : null}
                <AppText size={sample.labelSize} color={colors.secondary} style={styles.section}>
                  {c.client.jobsites}
                </AppText>
                {jobsites.length === 0 ? (
                  <AppText size={sample.noteSize} color={colors.secondary}>
                    {c.list.noJobsites}
                  </AppText>
                ) : null}
                {jobsites.length > 0 ? (
                <CardBlock>
                {jobsites.map((j, i) => (
                  <ListRow
                    key={j.id}
                    title={j.name}
                    detail={j.address}
                    right={<Chip label={c.status[j.status]} tone={statusTone(j.status)} />}
                    last={i === jobsites.length - 1}
                    onPress={() => router.push({ pathname: '/jobsites/[id]', params: { id: j.id } })}
                  />
                ))}
                </CardBlock>
                ) : null}
                {(client.legacy || client.accountProvider) && canCreateLegacy(access) ? (
                  <View style={{ marginTop: 12 }}>
                    <AppButton
                      label={c.client.addJobsite}
                      variant="outline"
                      icon="plus"
                      onPress={() => router.push({ pathname: '/jobsites/new', params: { client: client.id } })}
                    />
                  </View>
                ) : null}
              </>
            )}
          </>
        ) : null}
      </FormScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  section: { marginTop: 14, marginBottom: 2 },
});
