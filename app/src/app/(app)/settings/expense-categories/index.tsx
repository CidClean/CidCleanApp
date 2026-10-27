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
import { useAccountingStrings } from '@/i18n/useAccountingStrings';
import { useStrings } from '@/i18n/useStrings';
import { fetchExpenseCategories, removeExpenseCategory, type ExpenseCategory } from '@/lib/accountingApi';
import { activeReasons, reasonLabel } from '@/lib/leadRules';
import { useGoBack } from '@/lib/navigation';
import { usePermissions, useSession } from '@/lib/session';
import { iconStrokeWidth, sample, useTheme } from '@/theme';

/**
 * Ajustes → Categorías de gastos (D-113, D-114, D-130, D-254): una fila por categoría activa en el idioma de quien la ve,
 * con el otro idioma en gris, lápiz y papelera; botón de contorno "Agregar". Solo el Super Admin.
 * La papelera borra la categoría; si algún gasto la usa, el servidor la desactiva (se quita de la lista y los gastos la conservan).
 * La confirmación es la ventana al centro (D-229). Copia de la pantalla de motivos de lead perdido.
 */
export default function ExpenseCategoriesScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const { colors } = useTheme();
  const strings = useStrings();
  const a = useAccountingStrings();
  const { locale } = useSession();
  const { isSuperAdmin } = usePermissions();
  const [categories, setCategories] = useState<ExpenseCategory[] | null>(null);
  const [error, setError] = useState<'load' | 'delete' | null>(null);
  const [notice, setNotice] = useState(false);
  const [confirm, setConfirm] = useState<ExpenseCategory | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    const result = await fetchExpenseCategories();
    if (result.ok) {
      setCategories(activeReasons(result.data));
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
    const result = await removeExpenseCategory(confirm.id);
    setDeleting(false);
    setConfirm(null);
    if (!result.ok) {
      setError('delete');
      return;
    }
    setNotice(result.data === 'deactivated');
    await load();
  }

  const other = (c: ExpenseCategory) => (locale === 'es' ? c.labelEn : c.labelEs);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar title={a.categories.row} onBack={goBack} backLabel={strings.common.back} />
      <ScrollView contentContainerStyle={{ padding: 12 }}>
        {error === 'load' ? <AppAlert tone="error" text={a.categories.errorLoad} /> : null}
        {error === 'delete' ? <AppAlert tone="error" text={a.categories.errorDelete} /> : null}
        {notice ? <AppAlert text={a.categories.deactivated} /> : null}
        {categories?.map((c, i) => (
          <ListRow
            key={c.id}
            title={reasonLabel(c, locale)}
            detail={other(c)}
            last={i === categories.length - 1}
            right={
              <View style={styles.icons}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={a.categories.editLabel(reasonLabel(c, locale))}
                  onPress={() => router.push({ pathname: '/settings/expense-categories/edit', params: { id: c.id } })}
                  hitSlop={8}
                >
                  <Icon name="pencil" size={18} strokeWidth={iconStrokeWidth} color={colors.text} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={a.categories.deleteLabel(reasonLabel(c, locale))}
                  onPress={() => setConfirm(c)}
                  hitSlop={8}
                >
                  <Icon name="trash" size={18} strokeWidth={iconStrokeWidth} color={colors.text} />
                </Pressable>
              </View>
            }
          />
        ))}
        {categories ? (
          <View style={{ marginTop: 10 }}>
            <AppButton label={a.categories.add} variant="outline" onPress={() => router.push('/settings/expense-categories/edit')} />
          </View>
        ) : null}
      </ScrollView>

      <Sheet visible={confirm !== null} onClose={() => setConfirm(null)}>
        <AppText weight="medium" size={sample.headingSize} center>
          {confirm ? a.categories.deleteTitle(reasonLabel(confirm, locale)) : ''}
        </AppText>
        <View style={styles.sheetButtons}>
          <View style={styles.flex}>
            <AppButton label={strings.common.cancel} variant="outline" onPress={() => setConfirm(null)} />
          </View>
          <View style={styles.flex}>
            <AppButton label={a.categories.delete} onPress={() => void confirmDelete()} disabled={deleting} />
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
