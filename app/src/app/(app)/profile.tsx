import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { ListRow } from '@/components/ListRow';
import { TopBar } from '@/components/TopBar';
import { useStrings } from '@/i18n/useStrings';
import type { Locale } from '@/i18n';
import { useSession } from '@/lib/session';
import { iconStrokeWidth, radius, sample, useTheme } from '@/theme';

/** Mi perfil (D-166): Nombre, Correo (solo lectura), Idioma y Cerrar sesión; con confirmación (D-167). */
export default function ProfileScreen() {
  const { colors, brand, status } = useTheme();
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
        <TopBar title={strings.profile.title} />
        <ScrollView contentContainerStyle={{ padding: 12 }}>
          <AppText weight="medium" size={sample.headingSize} style={{ marginBottom: 4 }}>
            {strings.profile.confirmTitle}
          </AppText>
          <AppText size={sample.noteSize} color={colors.secondary} style={{ marginBottom: 12 }}>
            {strings.profile.confirmBody}
          </AppText>
          <View style={styles.buttons}>
            <View style={styles.flex}>
              <OutlineButton label={strings.profile.cancel} onPress={() => setConfirming(false)} />
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
      <TopBar title={strings.profile.title} />
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
            <View style={[styles.seg, { borderColor: colors.fieldBorder }]}>
              {(['en', 'es'] as const).map((code) => {
                const on = locale === code;
                return (
                  <Pressable
                    key={code}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    onPress={() => void chooseLanguage(code)}
                    style={[styles.segItem, on ? { backgroundColor: brand } : null]}
                  >
                    <AppText weight={on ? 'medium' : 'regular'} size={14} color={on ? '#FFFFFF' : colors.text} center>
                      {code === 'en' ? strings.profile.english : strings.profile.spanish}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
            {languageError ? (
              <AppText size={sample.noteSize} color={status.error}>
                {strings.profile.languageError}
              </AppText>
            ) : null}
          </View>
        ) : null}
        <Pressable accessibilityRole="button" onPress={() => setConfirming(true)} style={styles.signOutRow}>
          <AppText weight="medium">{strings.profile.signOut}</AppText>
          <Icon name="chevron-right" size={18} strokeWidth={iconStrokeWidth} color={colors.text} />
        </Pressable>
      </ScrollView>
    </View>
  );
}

function OutlineButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { brand, colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        minHeight: sample.buttonMinHeight,
        borderRadius: radius.control,
        borderWidth: 1,
        borderColor: brand,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <AppText weight="medium" size={sample.buttonSize} color={colors.text}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  buttons: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
  seg: { flexDirection: 'row', borderWidth: 1, borderRadius: radius.control, overflow: 'hidden' },
  segItem: { flex: 1, paddingVertical: 8, alignItems: 'center' },
  signOutRow: {
    minHeight: 48,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
});
