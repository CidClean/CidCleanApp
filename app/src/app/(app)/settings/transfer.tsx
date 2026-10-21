import { Redirect, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { AppAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Checkbox } from '@/components/Checkbox';
import { SelectField } from '@/components/SelectField';
import { TopBar } from '@/components/TopBar';
import { useStrings } from '@/i18n/useStrings';
import { useGoBack } from '@/lib/navigation';
import { usePermissions, useSession } from '@/lib/session';
import { fetchSuperAdminCandidates, transferSuperAdmin, type Candidate } from '@/lib/transferApi';
import { sample, useTheme } from '@/theme';

/**
 * Ajustes → Transferir el rol de Super Admin (D-090, D-116, D-199, muestra ronda 10): selector "Nuevo Super Admin",
 * casilla "Entiendo que dejaré de ser Super Admin" y botón sólido "Transferir rol", sin confirmación extra.
 * Al transferir se vuelve a leer el perfil: quien transfirió deja de ver Ajustes.
 */
export default function TransferScreen() {
  const goBack = useGoBack();
  const router = useRouter();
  const { colors } = useTheme();
  const strings = useStrings();
  const { refresh } = useSession();
  const { isSuperAdmin } = usePermissions();
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [selected, setSelected] = useState<string>('');
  const [understood, setUnderstood] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<'load' | 'transfer' | 'no_worker_type' | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSuperAdminCandidates().then((result) => {
      if (cancelled) return;
      if (result.ok) setCandidates(result.data);
      else setError('load');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!isSuperAdmin) return <Redirect href="/" />;

  async function transfer() {
    if (!selected || !understood || sending) return;
    setSending(true);
    setError(null);
    const result = await transferSuperAdmin(selected);
    if (!result.ok) {
      setSending(false);
      setError(result.reason === 'no_worker_type' ? 'no_worker_type' : 'transfer');
      return;
    }
    await refresh(); // ya no es Super Admin: Ajustes desaparece del Menú
    router.replace('/');
  }

  const options = (candidates ?? []).map((c) => ({ value: c.id, label: c.fullName }));
  const errorText =
    error === 'load'
      ? strings.transfer.errorLoad
      : error === 'no_worker_type'
        ? strings.transfer.errorNoType
        : error === 'transfer'
          ? strings.transfer.errorTransfer
          : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar title={strings.transfer.title} onBack={goBack} backLabel={strings.common.back} />
      <ScrollView contentContainerStyle={{ padding: 12 }} keyboardShouldPersistTaps="handled">
        {errorText ? <AppAlert tone="error" text={errorText} /> : null}
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
          disabled={!selected || !understood || sending}
        />
      </ScrollView>
    </View>
  );
}
