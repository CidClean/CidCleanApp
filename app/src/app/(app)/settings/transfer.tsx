import { Redirect, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { AppAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Checkbox } from '@/components/Checkbox';
import { Segmented } from '@/components/Segmented';
import { SelectField } from '@/components/SelectField';
import { TopBar } from '@/components/TopBar';
import { useStrings } from '@/i18n/useStrings';
import { useGoBack } from '@/lib/navigation';
import { usePermissions, useSession } from '@/lib/session';
import type { WorkerType } from '@/lib/employeeRules';
import { fetchOwnWorkerType, fetchSuperAdminCandidates, transferSuperAdmin, type Candidate } from '@/lib/transferApi';
import { sample, useTheme } from '@/theme';

/**
 * Ajustes → Transferir el rol de Super Admin (D-090, D-116, D-199, muestra ronda 10): selector "Nuevo Super Admin",
 * casilla "Entiendo que dejaré de ser Super Admin" y botón sólido "Transferir rol", sin confirmación extra.
 * Si quien transfiere no tiene tipo de trabajador, arriba del selector elige W-2 / 1099 (D-206): se guarda junto con la
 * transferencia y el botón espera a que lo elija. Al transferir se vuelve a leer el perfil: quien transfirió deja de ver Ajustes.
 */
export default function TransferScreen() {
  const goBack = useGoBack();
  const router = useRouter();
  const { colors } = useTheme();
  const strings = useStrings();
  const { refresh, profile } = useSession();
  const { isSuperAdmin } = usePermissions();
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [selected, setSelected] = useState<string>('');
  const [understood, setUnderstood] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<'load' | 'transfer' | null>(null);
  // undefined: aún no se sabe; null: no tiene tipo y debe elegirlo (D-206).
  const [ownType, setOwnType] = useState<WorkerType | null | undefined>(undefined);
  const [chosenType, setChosenType] = useState<WorkerType | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSuperAdminCandidates().then((result) => {
      if (cancelled) return;
      if (result.ok) setCandidates(result.data);
      else setError('load');
    });
    if (profile?.id) {
      fetchOwnWorkerType(profile.id).then((result) => {
        if (cancelled) return;
        if (result.ok) setOwnType(result.data);
        else setError('load');
      });
    }
    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  if (!isSuperAdmin) return <Redirect href="/" />;

  const needsType = ownType === null;
  const ready = Boolean(selected) && understood && ownType !== undefined && (!needsType || chosenType !== null);

  async function transfer() {
    if (!ready || sending) return;
    setSending(true);
    setError(null);
    const result = await transferSuperAdmin(selected, needsType ? chosenType : null);
    if (!result.ok) {
      setSending(false);
      setError('transfer');
      return;
    }
    await refresh(); // ya no es Super Admin: Ajustes desaparece del Menú
    router.replace('/');
  }

  const options = (candidates ?? []).map((c) => ({ value: c.id, label: c.fullName }));
  const errorText =
    error === 'load' ? strings.transfer.errorLoad : error === 'transfer' ? strings.transfer.errorTransfer : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar title={strings.transfer.title} onBack={goBack} backLabel={strings.common.back} />
      <ScrollView contentContainerStyle={{ padding: 12 }} keyboardShouldPersistTaps="handled">
        {errorText ? <AppAlert tone="error" text={errorText} /> : null}
        {needsType ? (
          <View style={{ marginBottom: 8 }}>
            <AppText size={sample.labelSize} color={colors.secondary} style={{ marginBottom: 2 }}>
              {strings.newEmployee.type}
            </AppText>
            <Segmented
              options={[
                { value: 'w2', label: strings.employees.w2 },
                { value: '1099', label: strings.employees.contractor },
              ]}
              value={chosenType}
              onChange={setChosenType}
            />
          </View>
        ) : null}
        <SelectField label={strings.transfer.newSuperAdmin} options={options} value={selected} onChange={setSelected} />
        {candidates !== null && candidates.length === 0 ? (
          <AppText size={sample.noteSize} color={colors.secondary} style={{ marginBottom: 8 }}>
            {strings.transfer.noCandidates}
          </AppText>
        ) : null}
        <View style={{ marginTop: 4 }}>
          <Checkbox label={strings.transfer.understand} checked={understood} onChange={setUnderstood} />
        </View>
        <AppButton
          label={strings.transfer.submit}
          onPress={() => void transfer()}
          disabled={!ready || sending}
        />
      </ScrollView>
    </View>
  );
}
