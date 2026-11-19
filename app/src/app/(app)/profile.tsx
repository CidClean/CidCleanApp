import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { CardBlock } from '@/components/bento/Card';
import { AppAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { AppField } from '@/components/AppField';
import { PhoneField } from '@/components/PhoneField';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { ListRow, rowStyles } from '@/components/ListRow';
import { DeleteAccount } from '@/components/profile/DeleteAccount';
import { MyDocuments } from '@/components/profile/MyDocuments';
import { Segmented } from '@/components/Segmented';
import { Sheet } from '@/components/Sheet';
import { SignOutDialog } from '@/components/SignOutDialog';
import { TopBar } from '@/components/TopBar';
import { useServiceDaysStrings } from '@/i18n/useServiceDaysStrings';
import { useStrings } from '@/i18n/useStrings';
import { useNotificationsStrings } from '@/i18n/useNotificationsStrings';
import { showsMyDocuments } from '@/lib/myDocuments';
import { fetchMyProfile, saveMyProfile, validateMyProfile, type MyProfileError, type MyProfileForm } from '@/lib/myProfileApi';
import { useGoBack } from '@/lib/navigation';
import type { Locale } from '@/i18n';
import { useSession } from '@/lib/session';
import { THEME_PREFERENCES, setThemePreference, useThemePreference, type ThemePreference } from '@/lib/themePreference';
import { iconStrokeWidth, sample, useTheme } from '@/theme';

/**
 * Editar mi perfil (D-166, D-222; orden 152, D-340 (3), muestra pantalla 4): Nombre, Apellido y Teléfono editables con
 * "Guardar" (update_my_profile), el correo de entrada solo se muestra, y la nota de la firma de las plantillas (D-330).
 * Debajo, como antes: Idioma, Tema, avisos y Cerrar sesión; Mis horas (D-274); el 1099 ve Mis documentos (D-271).
 */
export default function ProfileScreen() {
  const { colors, status, brand } = useTheme();
  const router = useRouter();
  const nt = useNotificationsStrings();
  const goBack = useGoBack();
  const strings = useStrings();
  const sd = useServiceDaysStrings();
  const { profile, locale, setLanguage, refresh } = useSession();
  const [form, setForm] = useState<MyProfileForm | null>(null);
  const [formError, setFormError] = useState<MyProfileError | 'save' | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    void fetchMyProfile(profile.id).then((f) => !cancelled && f && setForm(f));
    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  async function saveProfile() {
    if (!form || saving) return;
    const err = validateMyProfile(form);
    setFormError(err);
    setSaved(false);
    if (err) return;
    setSaving(true);
    const r = await saveMyProfile(form);
    setSaving(false);
    if (r !== 'ok') {
      setFormError(r === 'invalid' ? 'phone' : 'save');
      return;
    }
    setSaved(true);
    await refresh();
  }
  const edit = (patch: Partial<MyProfileForm>) => {
    setForm((f) => (f ? { ...f, ...patch } : f));
    setFormError(null);
    setSaved(false);
  };
  const theme = useThemePreference();
  const [pickingTheme, setPickingTheme] = useState(false);
  const themeLabel = (t: ThemePreference) =>
    t === 'light' ? strings.profile.themeLight : t === 'dark' ? strings.profile.themeDark : strings.profile.themeSystem;
  const [confirming, setConfirming] = useState(false);
  const [pickingLanguage, setPickingLanguage] = useState(false);
  const [languageError, setLanguageError] = useState(false);

  async function chooseLanguage(next: Locale) {
    if (next === locale) return;
    setLanguageError(false);
    const ok = await setLanguage(next);
    if (!ok) setLanguageError(true);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar title={strings.profile.editTitle} onBack={goBack} backLabel={strings.common.back} />
      <ScrollView contentContainerStyle={{ padding: 12 }} keyboardShouldPersistTaps="handled">
        {form ? (
          <View style={{ marginBottom: 12 }}>
            <AppField
              label={strings.profile.firstName}
              value={form.firstName}
              onChangeText={(v) => edit({ firstName: v })}
              maxLength={60}
              autoComplete="given-name"
              error={formError === 'name' && !form.firstName.trim() ? strings.profile.nameRequired : null}
            />
            <AppField
              label={strings.profile.lastName}
              value={form.lastName}
              onChangeText={(v) => edit({ lastName: v })}
              maxLength={60}
              autoComplete="family-name"
              error={formError === 'name' && !form.lastName.trim() ? strings.profile.nameRequired : null}
            />
            <PhoneField
              label={strings.profile.phone}
              value={form.phone}
              onChange={(v) => edit({ phone: v })}
              error={formError === 'phone' ? strings.common.phoneError : null}
            />
            <CardBlock>
              <ListRow title={strings.profile.email} detail={strings.profile.signInEmail(profile?.email ?? '')} last />
            </CardBlock>
            <AppText size={sample.noteSize} color={colors.secondary} style={{ marginVertical: 8 }}>
              {strings.profile.signatureNote}
            </AppText>
            {formError === 'save' ? <AppAlert tone="error" text={strings.profile.saveError} /> : null}
            {saved ? (
              <AppText size={sample.noteSize} color={status.success} style={{ marginBottom: 6 }}>
                {strings.profile.saved}
              </AppText>
            ) : null}
            <AppButton label={strings.common.save} onPress={() => void saveProfile()} disabled={saving} />
          </View>
        ) : null}
        <CardBlock>
        <ListRow
          title={strings.profile.language}
          detail={locale === 'es' ? strings.profile.spanish : strings.profile.english}
          chevron
          onPress={() => setPickingLanguage((v) => !v)}
        />
        {pickingLanguage ? (
          <View style={{ paddingVertical: 8 }}>
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
          </View>
        ) : null}
        {/* D-222 b: tema por teléfono, junto a Idioma. */}
        <ListRow title={strings.profile.theme} detail={themeLabel(theme)} chevron onPress={() => setPickingTheme(true)} />
        {/* D-085, D-215: canales de los avisos. */}
        <ListRow title={nt.settingsRow} chevron onPress={() => router.push('/notifications/settings')} />
        <Pressable accessibilityRole="button" onPress={() => setConfirming(true)} style={[styles.signOutRow, { borderBottomWidth: 0 }]}>
          <AppText weight="medium">{strings.profile.signOut}</AppText>
          <Icon name="chevron-right" size={18} strokeWidth={iconStrokeWidth} color={colors.text} />
        </Pressable>
        </CardBlock>
        {/* D-274, D-279: Mis horas solo para W-2; el 1099 ve Mis días de servicio. También en el Inicio del staff (D-200). */}
        <CardBlock>
          {profile?.workerType === '1099' ? (
            <ListRow title={sd.title} detail={sd.rowDetail} chevron last onPress={() => router.push('/my-service-days')} />
          ) : (
            <ListRow title={strings.myHours.title} detail={strings.myHours.rowDetail} chevron last onPress={() => router.push('/my-hours')} />
          )}
        </CardBlock>
        {/* D-263, D-271: los documentos propios del 1099. */}
        {profile && showsMyDocuments(profile) ? <MyDocuments profileId={profile.id} strings={strings} locale={locale} /> : null}
        {/* Orden 57 (D-282): Cuenta → Eliminar cuenta, para todo el personal menos el Super Admin. */}
        {profile && !profile.isSuperAdmin ? <DeleteAccount /> : null}
      </ScrollView>
      {/* D-222 a: la misma ventana al centro que el Menú. */}
      <SignOutDialog visible={confirming} onClose={() => setConfirming(false)} />
      <Sheet visible={pickingTheme} onClose={() => setPickingTheme(false)}>
        <AppText weight="medium" size={sample.headingSize} style={{ marginBottom: 4 }}>
          {strings.profile.theme}
        </AppText>
        {THEME_PREFERENCES.map((t, i) => {
          const on = t === theme;
          return (
            <Pressable
              key={t}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              onPress={() => {
                void setThemePreference(t);
                setPickingTheme(false);
              }}
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

const styles = StyleSheet.create({
  option: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 9, height: 9, borderRadius: 5 },
  signOutRow: rowStyles.base,
});
