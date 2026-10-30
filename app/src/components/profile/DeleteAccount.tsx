import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { AppAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { CardBlock } from '@/components/bento/Card';
import { Dialog } from '@/components/Dialog';
import { ListRow } from '@/components/ListRow';
import { LEGAL_URLS } from '@/i18n/legal';
import { useLegalStrings } from '@/i18n/useLegalStrings';
import { fetchMyDeletionRequest, requestAccountDeletion } from '@/lib/accountDeletionApi';
import { formatDate } from '@/lib/employeeRules';
import { useSession } from '@/lib/session';
import { sample, useTheme } from '@/theme';

/**
 * Cuenta → Eliminar cuenta (orden 57, D-282), para todo el personal salvo el Super Admin. El staff no tiene Ajustes:
 * la sección Cuenta va en Mi perfil (D-200). Ventana al centro (D-229) con el plazo de 30 días, lo que la ley obliga a
 * guardar y el enlace a https://app.cidclean.com/delete-account. Enviada, la fila dice "Solicitud enviada el {fecha}".
 */
export function DeleteAccount() {
  const { colors } = useTheme();
  const t = useLegalStrings();
  const { locale } = useSession();
  const [sentAt, setSentAt] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchMyDeletionRequest().then((r) => {
      if (!cancelled && r.ok && r.data?.status === 'pending') setSentAt(r.data.requestedAt);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function send() {
    if (sending) return;
    setSending(true);
    setError(false);
    const r = await requestAccountDeletion();
    setSending(false);
    if (!r.ok) {
      setError(true);
      return;
    }
    setSentAt(r.data.requestedAt);
    setOpen(false);
  }

  return (
    <>
      <AppText weight="medium" size={sample.noteSize} color={colors.secondary} style={styles.section}>
        {t.accountSection}
      </AppText>
      <CardBlock>
        {sentAt ? (
          <ListRow title={t.deleteAccount} detail={t.requestSent(formatDate(sentAt, locale))} last />
        ) : (
          <ListRow title={t.deleteAccount} chevron last onPress={() => setOpen(true)} />
        )}
      </CardBlock>
      <Dialog visible={open} onClose={() => setOpen(false)}>
        <View style={{ paddingVertical: 8 }}>
          <AppText weight="medium" size={sample.headingSize} style={{ marginBottom: 4 }}>
            {t.deleteTitle}
          </AppText>
          <AppText size={sample.noteSize} color={colors.secondary} style={{ marginBottom: 6 }}>
            {t.deleteBody}
          </AppText>
          <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(LEGAL_URLS.deleteAccount)}>
            <AppText size={sample.noteSize} color={colors.secondary} style={styles.link}>
              {t.deleteMore}
            </AppText>
          </Pressable>
          {error ? <AppAlert tone="error" text={t.errorRequest} /> : null}
          <View style={styles.buttons}>
            <View style={styles.flex}>
              <AppButton label={t.cancel} variant="outline" onPress={() => setOpen(false)} />
            </View>
            <View style={styles.flex}>
              <AppButton label={t.deleteConfirm} onPress={() => void send()} disabled={sending} />
            </View>
          </View>
        </View>
      </Dialog>
    </>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 4, marginBottom: 6, marginLeft: 4 },
  link: { textDecorationLine: 'underline', marginBottom: 12 },
  buttons: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
});
