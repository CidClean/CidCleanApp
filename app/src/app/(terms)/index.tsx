import { IconCamera, IconCheck, IconFileText, IconMapPin } from '@tabler/icons-react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { TopBar } from '@/components/TopBar';
import { useStrings } from '@/i18n/useStrings';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { iconStrokeWidth, sample, useTheme } from '@/theme';

/** "Antes de empezar" (D-086, D-168): tres puntos, enlace a los términos completos, casilla y Aceptar. */
export default function TermsScreen() {
  const router = useRouter();
  const { colors, brand, status } = useTheme();
  const strings = useStrings();
  const { refresh } = useSession();
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  async function accept() {
    if (!checked || saving) return;
    setSaving(true);
    setError(false);
    const { error: rpcError } = await supabase.rpc('accept_staff_terms');
    if (rpcError) {
      setSaving(false);
      setError(true);
      return;
    }
    await refresh(); // la aceptación queda registrada y la app pasa a Inicio
  }

  const points = [
    { Icon: IconMapPin, text: strings.terms.location },
    { Icon: IconCamera, text: strings.terms.photos },
    { Icon: IconFileText, text: strings.terms.data },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar title={strings.terms.barTitle} />
      <ScrollView contentContainerStyle={{ padding: 12 }}>
        {points.map(({ Icon, text }, i) => (
          <View
            key={text}
            style={[
              styles.point,
              { borderBottomColor: colors.border, borderBottomWidth: i === points.length - 1 ? 0 : 0.5 },
            ]}
          >
            <Icon size={18} strokeWidth={iconStrokeWidth} color={colors.text} />
            <AppText>{text}</AppText>
          </View>
        ))}
        <Pressable accessibilityRole="link" onPress={() => router.push('/read')}>
          <AppText size={sample.noteSize} color={colors.secondary} style={styles.link}>
            {strings.terms.readFull}
          </AppText>
        </Pressable>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked }}
          onPress={() => setChecked((v) => !v)}
          style={styles.check}
        >
          <View
            style={[
              styles.box,
              checked ? { backgroundColor: brand } : { borderWidth: 1, borderColor: colors.fieldBorder },
            ]}
          >
            {checked ? <IconCheck size={13} strokeWidth={iconStrokeWidth} color="#FFFFFF" /> : null}
          </View>
          <AppText size={14}>{strings.terms.checkbox}</AppText>
        </Pressable>
        {error ? (
          <AppText size={sample.noteSize} color={status.error} style={{ marginBottom: 8 }}>
            {strings.terms.errorSave}
          </AppText>
        ) : null}
        <AppButton label={strings.terms.accept} onPress={() => void accept()} disabled={!checked || saving} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  point: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  link: { marginTop: 6, marginBottom: 10, textDecorationLine: 'underline' },
  check: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  box: { width: 20, height: 20, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
});
