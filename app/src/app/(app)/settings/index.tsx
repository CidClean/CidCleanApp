import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Bento, Card, CardBlock } from '@/components/bento/Card';
import { AppText } from '@/components/AppText';
import { DocIcon, LeadCalendarIcon } from '@/components/illustrations';
import { AppAlert } from '@/components/AppAlert';
import { ListRow } from '@/components/ListRow';
import { ExpenseCategoriesSettingsRow } from '@/components/accounting/ExpenseCategoriesSettingsRow';
import { LostReasonsSettingsRow } from '@/components/sales/LostReasonsSettingsRow';
import { TopBar } from '@/components/TopBar';
import { useStrings } from '@/i18n/useStrings';
import { useGoBack } from '@/lib/navigation';
import { usePermissions } from '@/lib/session';
import { useQuoteStrings } from '@/i18n/useQuoteStrings';
import { useLegalStrings } from '@/i18n/useLegalStrings';
import { fetchCurrentTerms, type CurrentTerms } from '@/lib/termsApi';
import { useTheme } from '@/theme';

/**
 * Menú → Ajustes (D-107, D-114, D-169, D-187): filas con nombre, valor actual y flecha. Solo el Super Admin.
 * Términos del staff, Categorías de gastos (D-254), Motivos de lead perdido y Transferir rol de Super Admin (D-090).
 */
export default function SettingsScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const { colors } = useTheme();
  const strings = useStrings();
  const { isSuperAdmin } = usePermissions();
  const [current, setCurrent] = useState<CurrentTerms | null | undefined>(undefined); // undefined: aún no se lee
  const [failed, setFailed] = useState(false);
  const [portal, setPortal] = useState<CurrentTerms | null | undefined>(undefined); // términos del portal (D-209)
  const qs = useQuoteStrings();
  const legal = useLegalStrings();
  const [privacy, setPrivacy] = useState<CurrentTerms | null | undefined>(undefined); // Política de Privacidad (D-282)

  // Se vuelve a leer al volver de publicar, para mostrar la versión nueva.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      fetchCurrentTerms().then((result) => {
        if (cancelled) return;
        setFailed(!result.ok);
        if (result.ok) setCurrent(result.data);
      });
      fetchCurrentTerms('portal').then((result) => {
        if (!cancelled && result.ok) setPortal(result.data);
      });
      fetchCurrentTerms('privacy').then((result) => {
        if (!cancelled && result.ok) setPrivacy(result.data);
      });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  if (!isSuperAdmin) return <Redirect href="/" />;

  const value = current === undefined ? '' : current === null ? strings.settings.unpublished : strings.settings.termsValue(current.version);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar title={strings.nav.settings} onBack={goBack} backLabel={strings.common.back} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16 }}>
        {failed ? <AppAlert tone="error" text={strings.terms.errorLoad} /> : null}
        {/* D-226: los términos en un mosaico con su versión vigente; el resto en filas sobre tarjeta. */}
        <Bento>
          <Card onPress={() => router.push('/settings/terms')} accessibilityLabel={strings.settings.termsRow} style={{ gap: 10 }}>
            <DocIcon />
            <View style={{ gap: 2 }}>
              <AppText weight="heavy" size={15}>
                {strings.settings.termsRow}
              </AppText>
              {value ? (
                <AppText size={12} color={colors.secondary}>
                  {value}
                </AppText>
              ) : null}
            </View>
          </Card>
          <Card tone="attention" onPress={() => router.push({ pathname: '/settings/terms', params: { kind: 'portal' } })} accessibilityLabel={qs.portalTermsRow} style={{ gap: 10 }}>
            <LeadCalendarIcon />
            <View style={{ gap: 2 }}>
              <AppText weight="heavy" size={15}>
                {qs.portalTermsRow}
              </AppText>
              {portal !== undefined ? (
                <AppText size={12} color={colors.attentionText}>
                  {portal === null ? strings.settings.unpublished : strings.settings.termsValue(portal.version)}
                </AppText>
              ) : null}
            </View>
          </Card>
        </Bento>
        <View style={{ height: 12 }} />
        <CardBlock>
        {/* D-107/D-254: Categorías de gastos va antes que Motivos de lead perdido, como en la lista aprobada. */}
        {/* D-282 (D-200): Política de Privacidad (se publica como los términos) y solicitudes de eliminación de cuenta. */}
        <ListRow
          title={legal.privacyRow}
          detail={privacy === undefined ? undefined : privacy === null ? strings.settings.unpublished : strings.settings.termsValue(privacy.version)}
          chevron
          onPress={() => router.push({ pathname: '/settings/terms', params: { kind: 'privacy' } })}
        />
        <ListRow title={legal.requestsRow} chevron onPress={() => router.push('/settings/account-deletions')} />
        <ExpenseCategoriesSettingsRow />
        <LostReasonsSettingsRow />
        <ListRow title={strings.transfer.row} chevron last onPress={() => router.push('/settings/transfer')} />
        </CardBlock>
      </ScrollView>
    </View>
  );
}
