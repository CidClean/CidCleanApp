import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { ListRow } from '@/components/ListRow';
import { Sheet } from '@/components/Sheet';
import { TopBar } from '@/components/TopBar';
import { useSalesStrings } from '@/i18n/useSalesStrings';
import { useStrings } from '@/i18n/useStrings';
import { activeReasons, reasonLabel, type LostReason } from '@/lib/leadRules';
import { fetchLostReasons, removeLostReason } from '@/lib/leadsApi';
import { useGoBack } from '@/lib/navigation';
import { usePermissions, useSession } from '@/lib/session';
import { iconStrokeWidth, sample, useTheme } from '@/theme';

/**
 * Ajustes → Motivos de lead perdido (D-107, D-113, D-114, D-203): una fila por motivo en el idioma de quien lo ve,
 * con el otro idioma en gris, lápiz y papelera; botón de contorno "Agregar". Solo el Super Admin.
 * La papelera borra el motivo; si algún lead lo usa, el servidor lo desactiva (se quita de la lista y los leads lo conservan).
 */
export default function LostReasonsScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const { colors } = useTheme();
  const strings = useStrings();
  const s = useSalesStrings();
  const { locale } = useSession();
  const { isSuperAdmin } = usePermissions();
  const [reasons, setReasons] = useState<LostReason[] | null>(null);
  const [error, setError] = useState<'load' | 'delete' | null>(null);
  const [notice, setNotice] = useState(false);
  const [confirm, setConfirm] = useState<LostReason | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    const result = await fetchLostReasons();
    if (result.ok) {
      setReasons(activeReasons(result.data));
      setError((e) => (e === 'load' ? null : e));
    } else {
      setError('load');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!isSuperAdmin) return <Redirect href="/" />;

  async function confirmDelete() {
    if (!confirm || deleting) return;
    setDeleting(true);
    setError(null);
    setNotice(false);
    const result = await removeLostReason(confirm.id);
    setDeleting(false);
    setConfirm(null);
    if (!result.ok) {
      setError('delete');
      return;
    }
    setNotice(result.data === 'deactivated');
    await load();
  }

  const other = (r: LostReason) => (locale === 'es' ? r.labelEn : r.labelEs);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar title={s.reasons.row} onBack={goBack} backLabel={strings.common.back} />
      <ScrollView contentContainerStyle={{ padding: 12 }}>
        {error === 'load' ? <AppAlert tone="error" text={s.reasons.errorLoad} /> : null}
        {error === 'delete' ? <AppAlert tone="error" text={s.reasons.errorDelete} /> : null}
        {notice ? <AppAlert text={s.reasons.deactivated} /> : null}
        {reasons?.map((r, i) => (
          <ListRow
            key={r.id}
            title={reasonLabel(r, locale)}
            detail={other(r)}
            last={i === reasons.length - 1}
            right={
              <View style={styles.icons}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={s.reasons.editLabel(reasonLabel(r, locale))}
                  onPress={() => router.push({ pathname: '/settings/lost-reasons/edit', params: { id: r.id } })}
                  hitSlop={8}
                >
                  <Icon name="pencil" size={18} strokeWidth={iconStrokeWidth} color={colors.text} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={s.reasons.deleteLabel(reasonLabel(r, locale))}
                  onPress={() => setConfirm(r)}
                  hitSlop={8}
                >
                  <Icon name="trash" size={18} strokeWidth={iconStrokeWidth} color={colors.text} />
                </Pressable>
              </View>
            }
          />
        ))}
        {reasons ? (
          <View style={{ marginTop: 10 }}>
            <AppButton label={s.reasons.add} variant="outline" onPress={() => router.push('/settings/lost-reasons/edit')} />
          </View>
        ) : null}
      </ScrollView>

      <Sheet visible={confirm !== null} onClose={() => setConfirm(null)}>
        <AppText weight="medium" size={sample.headingSize} center>
          {confirm ? s.reasons.deleteTitle(reasonLabel(confirm, locale)) : ''}
        </AppText>
        <View style={styles.sheetButtons}>
          <View style={styles.flex}>
            <AppButton label={strings.common.cancel} variant="outline" onPress={() => setConfirm(null)} />
          </View>
          <View style={styles.flex}>
            <AppButton label={s.detail.delete} onPress={() => void confirmDelete()} disabled={deleting} />
          </View>
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  icons: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  sheetButtons: { flexDirection: 'row', gap: 8, marginTop: 12 },
  flex: { flex: 1 },
});
