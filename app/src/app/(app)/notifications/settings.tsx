import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppAlert } from '@/components/AppAlert';
import { AppText } from '@/components/AppText';
import { Switch } from '@/components/Switch';
import { CardBlock } from '@/components/bento/Card';
import { BackHeader } from '@/components/bento/Header';
import { useNotificationsStrings } from '@/i18n/useNotificationsStrings';
import { useStrings } from '@/i18n/useStrings';
import { useGoBack } from '@/lib/navigation';
import { fetchChannelSettings, saveChannelSettings, type ChannelSettings } from '@/lib/notificationsApi';
import { sample, useTheme } from '@/theme';

/**
 * Mis notificaciones (D-085, ronda 10): tres interruptores de 40px, Push (En tu teléfono), Email (A tu correo) y En la
 * app (Dentro de la bandeja), que valen para todas las áreas; encendidos por defecto (D-215). Push queda deshabilitado
 * con "Pronto" hasta que exista (D-215, D-200).
 */
export default function NotificationSettingsScreen() {
  const goBack = useGoBack();
  const { colors } = useTheme();
  const strings = useStrings();
  const t = useNotificationsStrings();
  const [s, setS] = useState<ChannelSettings | null>(null);
  const [failed, setFailed] = useState<'load' | 'save' | null>(null);

  useEffect(() => {
    void fetchChannelSettings().then((r) => (r.ok ? setS(r.data) : setFailed('load')));
  }, []);

  async function change(next: ChannelSettings) {
    const before = s;
    setS(next);
    setFailed(null);
    const r = await saveChannelSettings(next);
    if (!r.ok) {
      setS(before);
      setFailed('save');
    }
  }

  const row = (label: string, hint: string, value: boolean, onChange: (v: boolean) => void, disabled = false, last = false) => (
    <View style={[styles.row, { borderBottomColor: colors.border, borderBottomWidth: last ? 0 : 0.5 }]}>
      <View style={{ flex: 1 }}>
        <AppText weight="medium" color={disabled ? colors.secondary : colors.text}>
          {label}
        </AppText>
        <AppText size={sample.noteSize} color={colors.secondary}>
          {hint}
        </AppText>
      </View>
      <Switch value={value} onChange={onChange} accessibilityLabel={label} disabled={disabled} />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BackHeader onBack={goBack} backLabel={strings.common.back} title={t.settingsTitle} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24 }}>
        {failed === 'load' ? <AppAlert tone="error" text={t.errorLoad} /> : null}
        {failed === 'save' ? <AppAlert tone="error" text={t.errorSave} /> : null}
        {s ? (
          <CardBlock>
            {row(t.push, `${t.pushHint} · ${t.pushSoon}`, s.push, (v) => void change({ ...s, push: v }), true)}
            {row(t.email, t.emailHint, s.email, (v) => void change({ ...s, email: v }))}
            {row(t.inApp, t.inAppHint, s.inApp, (v) => void change({ ...s, inApp: v }), false, true)}
          </CardBlock>
        ) : null}
        <AppText size={sample.noteSize} color={colors.secondary}>
          {t.settingsNote}
        </AppText>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 56, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 12 },
});
