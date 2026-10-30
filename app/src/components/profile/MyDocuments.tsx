import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { Chip } from '@/components/Chip';
import { Sheet } from '@/components/Sheet';
import type { Locale } from '@/i18n';
import type { Strings } from '@/i18n/es';
import { chooseFile, fetchDocuments, takePhoto, uploadDocument, type PickResult } from '@/lib/documents';
import type { EmployeeDocument } from '@/lib/employeeRules';
import { myDocumentCards, type MyDocumentCard } from '@/lib/myDocuments';
import { sample, useTheme } from '@/theme';

/**
 * "Mis documentos" del 1099 con acceso a la app (D-263, muestra aprobada D-271): una tarjeta por documento; el W-9 se
 * abre en el visor con "Descargar" y la nota de quién lo ve; el certificado se sube con cámara o archivo (D-183) y
 * reemplaza al anterior (queda en el historial).
 */
export function MyDocuments({ profileId, strings, locale }: { profileId: string; strings: Strings; locale: Locale }) {
  const { colors } = useTheme();
  const router = useRouter();
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [choosing, setChoosing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<'upload' | 'camera' | null>(null);

  const load = useCallback(async () => {
    const result = await fetchDocuments(profileId);
    if (result.ok) setDocuments(result.data);
  }, [profileId]);

  useEffect(() => {
    void load();
  }, [load]);

  function open(card: MyDocumentCard) {
    if (!card.documentId) return;
    setError(null);
    router.push({
      pathname: '/viewer',
      params: {
        source: 'document',
        documentId: card.documentId,
        title: card.title,
        // D-263, D-271: su propio W-9 lo descarga él, con la nota de quién lo ve.
        ...(card.kind === 'w9' ? { download: '1', note: 'own-w9' } : {}),
      },
    });
  }

  async function pick(source: 'camera' | 'file') {
    setChoosing(false);
    setError(null);
    try {
      const picked: PickResult = source === 'camera' ? await takePhoto() : await chooseFile();
      if (picked.kind === 'denied') return setError('camera');
      if (picked.kind === 'cancelled') return;
      setUploading(true);
      const result = await uploadDocument(profileId, 'insurance_certificate', picked.file);
      setUploading(false);
      if (!result.ok) return setError('upload');
      await load();
    } catch {
      setUploading(false);
      setError('upload');
    }
  }

  return (
    <View style={{ gap: 10, marginTop: 12 }}>
      <AppText weight="heavy" size={18}>
        {strings.profile.myDocuments}
      </AppText>
      {myDocumentCards(documents, strings, locale).map((card) => (
        <View key={card.kind} style={[styles.card, { backgroundColor: colors.card }]}>
          <Pressable
            accessibilityRole={card.documentId ? 'button' : undefined}
            disabled={!card.documentId}
            onPress={() => open(card)}
            style={styles.row}
          >
            <View style={{ flex: 1 }}>
              <AppText weight="heavy">{card.title}</AppText>
              <AppText size={sample.noteSize} color={colors.secondary}>
                {card.detail}
              </AppText>
            </View>
            <Chip label={card.chip} tone={card.tone} />
          </Pressable>
          {card.upload ? (
            <>
              {error ? (
                <AppAlert tone="error" text={error === 'camera' ? strings.employee.errorCamera : strings.employee.errorUpload} />
              ) : null}
              <AppButton
                label={card.upload.label}
                variant={card.upload.variant}
                disabled={uploading}
                onPress={() => {
                  setError(null);
                  setChoosing(true);
                }}
              />
              {card.upload.note ? (
                <AppText size={sample.noteSize} color={colors.secondary}>
                  {card.upload.note}
                </AppText>
              ) : null}
            </>
          ) : null}
        </View>
      ))}
      <Sheet visible={choosing} onClose={() => setChoosing(false)}>
        <AppText weight="medium" size={sample.headingSize} center style={{ marginBottom: 12 }}>
          {strings.employee.insuranceCertificate}
        </AppText>
        <View style={{ gap: 8 }}>
          <AppButton label={strings.employee.takePhoto} variant="outline" onPress={() => void pick('camera')} />
          <AppButton label={strings.employee.chooseFile} variant="outline" onPress={() => void pick('file')} />
          <AppButton label={strings.common.cancel} variant="text" onPress={() => setChoosing(false)} />
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, padding: 14, gap: 8 }, // muestra aprobada (D-271)
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
});
