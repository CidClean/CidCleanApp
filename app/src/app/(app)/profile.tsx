import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { ListRow, rowStyles } from '@/components/ListRow';
import { Segmented } from '@/components/Segmented';
import { TopBar } from '@/components/TopBar';
import { useStrings } from '@/i18n/useStrings';
import { useGoBack } from '@/lib/navigation';
import type { Locale } from '@/i18n';
import { useSession } from '@/lib/session';
import { iconStrokeWidth, sample, useTheme } from '@/theme';

/** Mi perfil (D-166): Nombre, Correo (solo lectura), Idioma y Cerrar sesión; con confirmación (D-167). */
export default function ProfileScreen() {
  const { colors, status } = useTheme();
  const goBack = useGoBack();
  const strings = useStrings();
  const { profile, locale, setLanguage, signOut } = useSession();
  const [confirming, setConfirming] = useState(false);
  const [pickingLanguage, setPickingLanguage] = useState(false);
  const [languageError, setLanguageError] = useState(false);

  async function chooseLanguage(next: Locale) {
    if (next === locale) return;
    setLanguageError(false);
    const ok = await setLanguage(next);
    if (!ok) setLanguageError(true);
  }

  if (confirming) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <TopBar title={strings.profile.title} onBack={goBack} backLabel={strings.common.back} />
        <ScrollView contentContainerStyle={{ padding: 12 }}>
          <AppText weight="medium" size={sample.headingSize} style={{ marginBottom: 4 }}>
            {strings.profile.confirmTitle}
          </AppText>
          <AppText size={sample.noteSize} color={colors.secondary} style={{ marginBottom: 12 }}>
            {strings.profile.confirmBody}
          </AppText>
          <View style={styles.buttons}>
            <View style={styles.flex}>
              <AppButton label={strings.profile.cancel} variant="outline" onPress={() => setConfirming(false)} />
            </View>
            <View style={styles.flex}>
              <AppButton label={strings.profile.signOut} onPress={() => void signOut()} />
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar title={strings.profile.title} onBack={goBack} backLabel={strings.common.back} />
      <ScrollView contentContainerStyle={{ padding: 12 }}>
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
        <Pressable accessibilityRole="button" onPress={() => setConfirming(true)} style={[styles.signOutRow, { borderBottomWidth: 0 }]}>
          <AppText weight="medium">{strings.profile.signOut}</AppText>
          <Icon name="chevron-right" size={18} strokeWidth={iconStrokeWidth} color={colors.text} />
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  buttons: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
  signOutRow: rowStyles.base,
});
