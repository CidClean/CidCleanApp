import { Redirect, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { AppField } from '@/components/AppField';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/Sheet';
import { TopBar } from '@/components/TopBar';
import { SyncStatus } from '@/components/walkthrough/SyncStatus';
import { useStrings } from '@/i18n/useStrings';
import { useWalkthroughStrings } from '@/i18n/useWalkthroughStrings';
import { takePhoto } from '@/lib/documents';
import { useGoBack } from '@/lib/navigation';
import { usePermissions } from '@/lib/session';
import { useWalkthrough } from '@/lib/useWalkthrough';
import { keepPhotoOnDevice } from '@/lib/walkthroughApi';
import { canDoWalkthroughs, newId, photoPath, syncBadge, type Photo } from '@/lib/walkthroughRules';
import { iconStrokeWidth, sample, useTheme } from '@/theme';

/**
 * Fotos de un área (D-039, muestra ronda 3): "Fotos de {área}", carrusel de miniaturas de 96px con esquinas de 8px y la
 * nota de 12px debajo, y el botón de contorno Tomar foto. Cada foto se copia a la carpeta privada de la app y entra a
 * la cola de subida (D-004). Tocar una miniatura abre su nota (D-200).
 */
export default function PhotosScreen() {
  const params = useLocalSearchParams<{ id: string; area: string }>();
  const goBack = useGoBack();
  const { colors } = useTheme();
  const strings = useStrings();
  const w = useWalkthroughStrings();
  const { access } = usePermissions();
  const { doc, update } = useWalkthrough(params.id);
  const [error, setError] = useState<'camera' | 'photo' | null>(null);
  const [editing, setEditing] = useState<Photo | null>(null);
  const [note, setNote] = useState('');

  if (!canDoWalkthroughs(access)) return <Redirect href="/" />;
  const area = doc?.data.areas.find((a) => a.id === params.area) ?? null;

  function setPhotos(change: (photos: Photo[]) => Photo[]) {
    return update((d) => ({
      ...d,
      data: { ...d.data, areas: d.data.areas.map((a) => (a.id === params.area ? { ...a, photos: change(a.photos) } : a)) },
    }));
  }

  async function take() {
    setError(null);
    try {
      const picked = await takePhoto();
      if (picked.kind === 'denied') {
        setError('camera');
        return;
      }
      if (picked.kind === 'cancelled') return;
      const id = newId();
      const path = photoPath(params.id, id, picked.file.mimeType);
      const uri = keepPhotoOnDevice(picked.file.uri, params.id, path.split('/')[1]);
      await setPhotos((photos) => [...photos, { id, path, uri, note: '', uploaded: false }]);
    } catch {
      setError('photo');
    }
  }

  function saveNote() {
    if (!editing) return;
    const target = editing.id;
    void setPhotos((photos) => photos.map((p) => (p.id === target ? { ...p, note: note.trim() } : p)));
    setEditing(null);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar
        title={area?.name ?? ''}
        onBack={goBack}
        backLabel={strings.common.back}
        subtitle={doc ? <SyncStatus badge={syncBadge(doc)} pendingLabel={w.pending} syncedLabel={w.synced} /> : undefined}
      />
      <ScrollView contentContainerStyle={{ padding: 12 }}>
        {area ? (
          <>
            <AppText weight="medium" size={18} style={{ marginBottom: 12 }}>
              {w.photos.heading(area.name)}
            </AppText>
            {error ? <AppAlert tone="error" text={error === 'camera' ? w.photos.cameraDenied : w.photos.errorPhoto} /> : null}
            {area.photos.length === 0 ? (
              <AppText size={sample.noteSize} color={colors.secondary}>
                {w.photos.empty}
              </AppText>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carousel}>
                {area.photos.map((p) => (
                  <Pressable
                    key={p.id}
                    accessibilityRole="button"
                    accessibilityLabel={p.note || w.photos.noteTitle}
                    onPress={() => {
                      setEditing(p);
                      setNote(p.note);
                    }}
                    style={styles.item}
                  >
                    <View style={[styles.thumb, { backgroundColor: colors.surface }]}>
                      {p.uri ? (
                        <Image source={{ uri: p.uri }} style={styles.image} accessibilityIgnoresInvertColors />
                      ) : (
                        <Icon name="camera" size={37} strokeWidth={iconStrokeWidth} color={colors.secondary} />
                      )}
                    </View>
                    <AppText size={12} color={colors.secondary} numberOfLines={2} style={{ width: 96 }}>
                      {p.note}
                    </AppText>
                  </Pressable>
                ))}
              </ScrollView>
            )}
            <View style={{ marginTop: 12 }}>
              <AppButton label={w.photos.take} variant="outline" icon="camera" onPress={() => void take()} />
            </View>
          </>
        ) : null}
      </ScrollView>

      <Sheet visible={editing !== null} onClose={() => setEditing(null)}>
        <AppText weight="medium" size={sample.headingSize} center style={{ marginBottom: 8 }}>
          {w.photos.noteTitle}
        </AppText>
        <AppField label={w.photos.note} value={note} onChangeText={setNote} />
        <View style={styles.sheetButtons}>
          <View style={styles.flex}>
            <AppButton label={strings.common.cancel} variant="outline" onPress={() => setEditing(null)} />
          </View>
          <View style={styles.flex}>
            <AppButton label={strings.common.save} onPress={saveNote} />
          </View>
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  carousel: { gap: 10 },
  item: { gap: 4 },
  thumb: { width: 96, height: 96, borderRadius: 8, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  image: { width: 96, height: 96 },
  sheetButtons: { flexDirection: 'row', gap: 8, marginTop: 4 },
  flex: { flex: 1 },
});
