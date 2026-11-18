import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { BackHeader } from '@/components/bento/Header';
import { CardBlock } from '@/components/bento/Card';
import { Icon } from '@/components/Icon';
import { ListRow } from '@/components/ListRow';
import { Segmented } from '@/components/Segmented';
import { Sheet } from '@/components/Sheet';
import { SignOutDialog } from '@/components/SignOutDialog';
import { ExpenseCategoriesSettingsRow } from '@/components/accounting/ExpenseCategoriesSettingsRow';
import { EmailTemplatesSettingsRow } from '@/components/sales/EmailTemplatesSettingsRow';
import { EstimatorSettingsRow } from '@/components/sales/EstimatorSettingsRow';
import { LostReasonsSettingsRow } from '@/components/sales/LostReasonsSettingsRow';
import type { Locale } from '@/i18n';
import { useLegalStrings } from '@/i18n/useLegalStrings';
import { useServiceDaysStrings } from '@/i18n/useServiceDaysStrings';
import { useStrings } from '@/i18n/useStrings';
import { roleLabel } from '@/lib/employeeLabels';
import { initials, type RoleKey } from '@/lib/employeeRules';
import { useGoBack } from '@/lib/navigation';
import { usePermissions, useSession } from '@/lib/session';
import { THEME_PREFERENCES, setThemePreference, useThemePreference, type ThemePreference } from '@/lib/themePreference';
import { showsCompanySettings } from '@/lib/visibility';
import { iconStrokeWidth, sample, useTheme } from '@/theme';

/**
 * Mi cuenta (D-337 (4), muestra navegacion-aprobado (4)): la abre el avatar desde cualquier pantalla principal.
 * Cabecera con avatar, nombre, rol y correo; "Me": Editar mi perfil, Mis horas o Mis días de servicio según el tipo,
 * Idioma · Tema y Mis notificaciones; "Company settings" solo para el Super Admin, con las entradas de Ajustes que
 * llevan a sus pantallas de siempre; y Cerrar sesión. Es una pantalla (no una hoja) para que funcione igual en la
 * web (D-200).
 */
export default function AccountScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const { colors, brand, status } = useTheme();
  const strings = useStrings();
  const legal = useLegalStrings();
  const sd = useServiceDaysStrings();
  const { profile, locale, setLanguage } = useSession();
  const { access } = usePermissions();
  const theme = useThemePreference();
  const [prefs, setPrefs] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [languageError, setLanguageError] = useState(false);

  const themeLabel = (t: ThemePreference) =>
    t === 'light' ? strings.profile.themeLight : t === 'dark' ? strings.profile.themeDark : strings.profile.themeSystem;
  const name = profile?.fullName ?? '';
  const role = roleLabel(strings, (profile?.role ?? 'employee') as RoleKey, profile?.isSuperAdmin ?? false);

  async function chooseLanguage(next: Locale) {
    if (next === locale) return;
    setLanguageError(false);
    const ok = await setLanguage(next);
    if (!ok) setLanguageError(true);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BackHeader onBack={goBack} backLabel={strings.common.back} title={strings.account.title} />
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.me}>
          <View style={[styles.avatar, { backgroundColor: brand }]}>
            <AppText weight="bold" size={17} color="#FFFFFF">
              {initials(name)}
            </AppText>
          </View>
          <View style={{ flex: 1 }}>
            <AppText weight="heavy" size={18} accessibilityRole="header">
              {name}
            </AppText>
            <AppText size={13} color={colors.secondary}>
              {strings.account.roleLine(role, profile?.email ?? '')}
            </AppText>
          </View>
        </View>

        <Group label={strings.account.me} />
        <CardBlock>
          <ListRow title={strings.account.editProfile} detail={strings.account.editProfileDetail} chevron onPress={() => router.push('/profile')} />
          {/* D-274, D-279: Mis horas para W-2; el 1099 ve Mis días de servicio. */}
          {profile?.workerType === '1099' ? (
            <ListRow title={sd.title} chevron onPress={() => router.push('/my-service-days')} />
          ) : (
            <ListRow title={strings.myHours.title} chevron onPress={() => router.push('/my-hours')} />
          )}
          <ListRow
            title={strings.account.languageTheme}
            detail={`${locale === 'es' ? strings.profile.spanish : strings.profile.english} · ${themeLabel(theme)}`}
            chevron
            onPress={() => setPrefs(true)}
          />
          <ListRow title={strings.account.myNotifications} chevron last onPress={() => router.push('/notifications/settings')} />
        </CardBlock>

        {showsCompanySettings(access) ? (
          <>
            <Group label={strings.account.company} />
            <CardBlock>
              <EmailTemplatesSettingsRow />
              <EstimatorSettingsRow />
              {/* Términos del staff, del portal y Política de Privacidad: la pantalla de Ajustes de siempre. */}
              <ListRow title={strings.account.termsPrivacy} chevron onPress={() => router.push('/settings')} />
              <ExpenseCategoriesSettingsRow />
              <LostReasonsSettingsRow />
              <ListRow title={legal.requestsRow} chevron onPress={() => router.push('/settings/account-deletions')} />
              <ListRow title={strings.transfer.row} chevron last onPress={() => router.push('/settings/transfer')} />
            </CardBlock>
          </>
        ) : null}

        <Pressable accessibilityRole="button" onPress={() => setConfirming(true)} style={[styles.signOut, { borderColor: colors.border }]}>
          <Icon name="logout" size={20} strokeWidth={iconStrokeWidth} color={SIGN_OUT} />
          <AppText weight="bold" size={15} color={SIGN_OUT}>
            {strings.profile.signOut}
          </AppText>
        </Pressable>
      </ScrollView>

      <SignOutDialog visible={confirming} onClose={() => setConfirming(false)} />
      <Sheet visible={prefs} onClose={() => setPrefs(false)}>
        <AppText weight="medium" size={sample.headingSize} style={{ marginBottom: 8 }}>
          {strings.profile.language}
        </AppText>
        <Segmented
          options={[
            { value: 'en', label: strings.profile.english },
            { value: 'es', label: strings.profile.spanish },
          ]}
          value={locale}
          onChange={(code) => void chooseLanguage(code)}
        />
        {languageError ? (
          <AppText size={sample.noteSize} color={status.error}>
            {strings.profile.languageError}
          </AppText>
        ) : null}
        <AppText weight="medium" size={sample.headingSize} style={{ marginTop: 16, marginBottom: 4 }}>
          {strings.profile.theme}
        </AppText>
        {THEME_PREFERENCES.map((t, i) => {
          const on = t === theme;
          return (
            <Pressable
              key={t}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              onPress={() => void setThemePreference(t)}
              style={[styles.option, { borderBottomColor: colors.border, borderBottomWidth: i === THEME_PREFERENCES.length - 1 ? 0 : 0.5 }]}
            >
              <View style={[styles.radio, { borderColor: on ? brand : colors.radioBorder }]}>
                {on ? <View style={[styles.dot, { backgroundColor: brand }]} /> : null}
              </View>
              <AppText>{themeLabel(t)}</AppText>
            </Pressable>
          );
        })}
      </Sheet>
    </View>
  );
}

/** Rojo del botón Cerrar sesión (muestra D-226, D-337). */
const SIGN_OUT = '#B0473F';

function Group({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <AppText weight="heavy" size={11} color={colors.secondary} style={styles.group}>
      {label.toUpperCase()}
    </AppText>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24 },
  me: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  group: { letterSpacing: 0.6, paddingTop: 12, paddingBottom: 6 },
  signOut: { width: '100%', height: 52, borderWidth: 1, borderRadius: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4 },
  option: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 9, height: 9, borderRadius: 5 },
});
