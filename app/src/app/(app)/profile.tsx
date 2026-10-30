import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { CardBlock } from '@/components/bento/Card';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { ListRow, rowStyles } from '@/components/ListRow';
import { MyDocuments } from '@/components/profile/MyDocuments';
import { Segmented } from '@/components/Segmented';
import { Sheet } from '@/components/Sheet';
import { SignOutDialog } from '@/components/SignOutDialog';
import { TopBar } from '@/components/TopBar';
import { useStrings } from '@/i18n/useStrings';
import { useNotificationsStrings } from '@/i18n/useNotificationsStrings';
import { showsMyDocuments } from '@/lib/myDocuments';
import { useGoBack } from '@/lib/navigation';
import type { Locale } from '@/i18n';
import { useSession } from '@/lib/session';
import { THEME_PREFERENCES, setThemePreference, useThemePreference, type ThemePreference } from '@/lib/themePreference';
import { iconStrokeWidth, sample, useTheme } from '@/theme';

/** Mi perfil (D-166, D-222): Nombre, Correo (solo lectura), Idioma, Tema y Cerrar sesión con la ventana al centro; el 1099 ve Mis documentos (D-271). */
export default function ProfileScreen() {
  const { colors, status, brand } = useTheme();
  const router = useRouter();
  const nt = useNotificationsStrings();
  const goBack = useGoBack();
  const strings = useStrings();
  const { profile, locale, setLanguage } = useSession();
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
      <TopBar title={strings.profile.title} onBack={goBack} backLabel={strings.common.back} />
      <ScrollView contentContainerStyle={{ padding: 12 }}>
        <CardBlock>
        <ListRow title={strings.profile.name} detail={profile?.fullName ?? ''} />
        <ListRow title={strings.profile.email} detail={profile?.email ?? ''} />
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
        {/* D-263, D-271: los documentos propios del 1099. */}
        {profile && showsMyDocuments(profile) ? <MyDocuments profileId={profile.id} strings={strings} locale={locale} /> : null}
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
