import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { FormScroll } from '@/components/FormScroll';
import { AppAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { AppField } from '@/components/AppField';
import { SelectField } from '@/components/SelectField';
import { TopBar } from '@/components/TopBar';
import { useSalesStrings } from '@/i18n/useSalesStrings';
import { useStrings } from '@/i18n/useStrings';
import { activeReasons, canEditLeads, reasonLabel, type LostReason } from '@/lib/leadRules';
import { fetchLostReasons, markLeadLost } from '@/lib/leadsApi';
import { useGoBack } from '@/lib/navigation';
import { usePermissions, useSession } from '@/lib/session';
import { useTheme } from '@/theme';

/** Marcar como perdido (D-079, muestra ronda 9): Motivo (lista de D-107), Nota (opcional) y botón sólido. Vuelve al lead. */
export default function MarkLostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const goBack = useGoBack();
  const { colors } = useTheme();
  const strings = useStrings();
  const s = useSalesStrings();
  const { locale } = useSession();
  const { access } = usePermissions();
  const [reasons, setReasons] = useState<LostReason[] | null>(null);
  const [reasonId, setReasonId] = useState<string>('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<'load' | 'save' | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchLostReasons().then((result) => {
      if (cancelled) return;
      if (result.ok) {
        // Solo los motivos activos se ofrecen (D-203: los desactivados siguen en los leads que ya los usan).
        const offered = activeReasons(result.data);
        setReasons(offered);
        // D-200: parte con el primer motivo elegido, como la muestra (Precio).
        setReasonId((prev) => prev || (offered[0]?.id ?? ''));
      } else {
        setError('load');
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!canEditLeads(access)) return <Redirect href="/" />;

  async function submit() {
    if (saving || !reasonId) return;
    setSaving(true);
    setError(null);
    const result = await markLeadLost(id, reasonId, note);
    setSaving(false);
    if (!result.ok) {
      setError('save');
      return;
    }
    goBack();
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar title={s.lost.title} onBack={goBack} backLabel={strings.common.back} />
      <FormScroll contentContainerStyle={{ padding: 12 }} keyboardShouldPersistTaps="handled">
        {error === 'load' ? <AppAlert tone="error" text={s.lost.errorLoad} /> : null}
        {reasons && reasons.length > 0 ? (
          <>
            <SelectField
              label={s.lost.reason}
              options={reasons.map((r) => ({ value: r.id, label: reasonLabel(r, locale) }))}
              value={reasonId}
              onChange={setReasonId}
            />
            <AppField label={s.lost.note} value={note} onChangeText={setNote} multiline />
            {error === 'save' ? <AppAlert tone="error" text={s.lost.errorSave} /> : null}
            <AppButton label={s.lost.submit} onPress={() => void submit()} disabled={saving} />
          </>
        ) : null}
      </FormScroll>
    </View>
  );
}
