import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Checkbox } from '@/components/Checkbox';
import { Icon } from '@/components/Icon';
import { TermsOffline } from '@/components/TermsOffline';
import { SignOutDialog } from '@/components/SignOutDialog';
import { TopBar } from '@/components/TopBar';
import { useLegalStrings } from '@/i18n/useLegalStrings';
import { useStrings } from '@/i18n/useStrings';
import { openLegal } from '@/lib/legalLinks';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { iconStrokeWidth, sample, useTheme } from '@/theme';

/**
 * "Antes de empezar" (D-086, D-168): tres puntos, enlace a los términos completos (el PDF vigente, D-176),
 * casilla y Aceptar. Sin conexión para revisarlos (D-179) muestra "Necesitas conexión para continuar".
 * D-282: los textos legales van solo en inglés (PDF publicado o página en inglés); también se acepta aquí una versión
 * importante de la Política de Privacidad; quien no acepta solo puede leer el texto y cerrar sesión.
 */
export default function TermsScreen() {
  const { termsOffline } = useSession();
  return termsOffline ? <TermsOffline /> : <AcceptTerms />;
}

function AcceptTerms() {
  const { colors, status } = useTheme();
  const strings = useStrings();
  const { refresh } = useSession();
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const router = useRouter();
  const legal = useLegalStrings();
  const [signingOut, setSigningOut] = useState(false);
  const [linkError, setLinkError] = useState(false);

  function read(kind: 'staff' | 'privacy') {
    setLinkError(false);
    openLegal(router, kind, kind === 'staff' ? strings.settings.termsRow : legal.privacyRow).catch(() => setLinkError(true));
  }

  async function accept() {
    if (!checked || saving) return;
    setSaving(true);
    setError(false);
    const { error: rpcError } = await supabase.rpc('accept_pending_terms'); // staff y privacidad pendientes (D-282)
    if (rpcError) {
      setSaving(false);
      setError(true);
      return;
    }
    await refresh(); // la aceptación queda registrada y la app pasa a Inicio
  }

  const points = [
    { icon: 'map-pin' as const, text: strings.terms.location },
    { icon: 'camera' as const, text: strings.terms.photos },
    { icon: 'file-text' as const, text: strings.terms.data },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar title={strings.terms.barTitle} />
      <ScrollView contentContainerStyle={{ padding: 12 }}>
        {points.map(({ icon, text }, i) => (
          <View
            key={text}
            style={[
              styles.point,
              { borderBottomColor: colors.border, borderBottomWidth: i === points.length - 1 ? 0 : 0.5 },
            ]}
          >
            <Icon name={icon} size={18} strokeWidth={iconStrokeWidth} color={colors.text} />
            <AppText>{text}</AppText>
          </View>
        ))}
        <Pressable accessibilityRole="link" onPress={() => read('staff')}>
          <AppText size={sample.noteSize} color={colors.secondary} style={styles.link}>
            {strings.terms.readFull}
          </AppText>
        </Pressable>
        {/* D-282 (D-200): enlace a la Política de Privacidad y aviso de que los textos legales están en inglés. */}
        <Pressable accessibilityRole="link" onPress={() => read('privacy')}>
          <AppText size={sample.noteSize} color={colors.secondary} style={[styles.link, { marginTop: 0 }]}>
            {legal.readPrivacy}
          </AppText>
        </Pressable>
        <AppText size={sample.noteSize} color={colors.secondary} style={{ marginBottom: 10 }}>
          {legal.englishOnly}
        </AppText>
        {linkError ? (
          <AppText size={sample.noteSize} color={status.error} style={{ marginBottom: 8 }}>
            {strings.terms.errorLoad}
          </AppText>
        ) : null}
        <Checkbox label={strings.terms.checkbox} checked={checked} onChange={setChecked} />
        {error ? (
          <AppText size={sample.noteSize} color={status.error} style={{ marginBottom: 8 }}>
            {strings.terms.errorSave}
          </AppText>
        ) : null}
        <AppButton label={strings.terms.accept} onPress={() => void accept()} disabled={!checked || saving} />
        {/* D-282: si no acepta, solo puede leer el texto y cerrar sesión (misma ventana al centro de D-222 a). */}
        <View style={{ marginTop: 8 }}>
          <AppButton label={strings.profile.signOut} variant="text" onPress={() => setSigningOut(true)} />
        </View>
      </ScrollView>
      <SignOutDialog visible={signingOut} onClose={() => setSigningOut(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  point: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  link: { marginTop: 6, marginBottom: 10, textDecorationLine: 'underline' },
});
