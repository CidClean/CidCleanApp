import { Redirect, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { CardBlock } from '@/components/bento/Card';
import { BrandLoading } from '@/components/brand/BrandLoading';
import { Dialog } from '@/components/Dialog';
import { ListRow } from '@/components/ListRow';
import { TopBar } from '@/components/TopBar';
import { useLegalStrings } from '@/i18n/useLegalStrings';
import { useStrings } from '@/i18n/useStrings';
import { completeDeletionRequest, fetchDeletionRequests, type DeletionRequest } from '@/lib/accountDeletionApi';
import { formatDate } from '@/lib/employeeRules';
import { useGoBack } from '@/lib/navigation';
import { usePermissions, useSession } from '@/lib/session';
import { sample, useTheme } from '@/theme';

/**
 * Ajustes → Solicitudes de eliminación de cuenta (orden 57, D-282; forma D-200 con los componentes de Ajustes). Solo el
 * Super Admin. Pendientes primero; "Marcar como atendida" (ventana al centro, D-229) desactiva la cuenta y su acceso.
 */
export default function AccountDeletionsScreen() {
  const goBack = useGoBack();
  const { colors } = useTheme();
  const strings = useStrings();
  const t = useLegalStrings();
  const { locale } = useSession();
  const { isSuperAdmin } = usePermissions();
  const [rows, setRows] = useState<DeletionRequest[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [confirming, setConfirming] = useState<DeletionRequest | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const load = useCallback(() => {
    let cancelled = false;
    fetchDeletionRequests().then((r) => {
      if (cancelled) return;
      setFailed(!r.ok);
      setRows(r.ok ? r.data : []);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  useFocusEffect(load);

  if (!isSuperAdmin) return <Redirect href="/" />;

  async function markDone() {
    if (!confirming || saving) return;
    setSaving(true);
    setSaveError(false);
    const r = await completeDeletionRequest(confirming.id);
    setSaving(false);
    if (!r.ok) {
      setSaveError(true);
      return;
    }
    setConfirming(null);
    load();
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar title={t.requestsRow} onBack={goBack} backLabel={strings.common.back} />
      {rows === null ? (
        <BrandLoading label={strings.common.loading} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16 }}>
          {failed ? <AppAlert tone="error" text={t.errorLoad} /> : null}
          {rows.length === 0 && !failed ? (
            <AppText size={sample.noteSize} color={colors.secondary}>
              {t.requestsEmpty}
            </AppText>
          ) : null}
          {rows.length > 0 ? (
            <CardBlock>
              {rows.map((r, i) => (
                <ListRow
                  key={r.id}
                  title={r.fullName}
                  detail={[
                    r.email ?? '',
                    t.requestedOn(formatDate(r.requestedAt, locale)),
                    r.status === 'pending' ? t.pending : t.done(formatDate(r.handledAt ?? r.requestedAt, locale)),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  chevron={r.status === 'pending'}
                  last={i === rows.length - 1}
                  onPress={r.status === 'pending' ? () => setConfirming(r) : undefined}
                />
              ))}
            </CardBlock>
          ) : null}
        </ScrollView>
      )}
      <Dialog visible={confirming !== null} onClose={() => setConfirming(null)}>
        <View style={{ paddingVertical: 8 }}>
          <AppText weight="medium" size={sample.headingSize} style={{ marginBottom: 4 }}>
            {t.markDoneTitle}
          </AppText>
          <AppText size={sample.noteSize} color={colors.secondary} style={{ marginBottom: 12 }}>
            {confirming ? `${confirming.fullName}. ${t.markDoneBody}` : ''}
          </AppText>
          {saveError ? <AppAlert tone="error" text={t.errorDone} /> : null}
          <View style={styles.buttons}>
            <View style={styles.flex}>
              <AppButton label={t.cancel} variant="outline" onPress={() => setConfirming(null)} />
            </View>
            <View style={styles.flex}>
              <AppButton label={t.markDone} onPress={() => void markDone()} disabled={saving} />
            </View>
          </View>
        </View>
      </Dialog>
    </View>
  );
}

const styles = StyleSheet.create({
  buttons: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
});
