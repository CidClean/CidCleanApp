import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppAlert } from '../AppAlert';
import { AppButton } from '../AppButton';
import { AppField } from '../AppField';
import { AppText } from '../AppText';
import { Icon } from '../Icon';
import { Sheet } from '../Sheet';
import type { WalkthroughStrings } from '@/i18n/walkthrough';
import type { Photo } from '@/lib/walkthroughRules';
import { iconStrokeWidth, sample, useTheme } from '@/theme';

type Props = {
  w: WalkthroughStrings;
  /** D-284: aviso junto a la cámara y al selector de fotos del trabajo, en el idioma del perfil. */
  notice?: string;
  common: { cancel: string; save: string };
  photos: readonly Photo[];
  error: 'camera' | 'gallery' | 'photo' | null;
  onTake: () => void;
  onGallery: () => void;
  onNote: (photoId: string, note: string) => void;
  onRemove: (photoId: string) => void;
};

/**
 * Apartado de fotos dentro del formulario del área (D-217): carrusel de miniaturas de 96px con esquinas de 8px y la
 * nota de 12px debajo con su papelera (D-039), y dos botones de contorno: Tomar foto (abre la cámara al instante)
 * y Subir de la galería. Tocar una miniatura abre su nota (D-200); la papelera pide confirmación (D-212).
 */
export function AreaPhotos({ w, notice, common, photos, error, onTake, onGallery, onNote, onRemove }: Props) {
  const { colors } = useTheme();
  const [editing, setEditing] = useState<Photo | null>(null);
  const [note, setNote] = useState('');
  const [removing, setRemoving] = useState<Photo | null>(null);

  return (
    <View style={{ marginBottom: 12 }}>
      <AppText size={sample.labelSize} color={colors.secondary} style={{ marginBottom: 6 }}>
        {w.photos.section}
      </AppText>
      {error ? (
        <AppAlert
          tone="error"
          text={error === 'camera' ? w.photos.cameraDenied : error === 'gallery' ? w.photos.galleryDenied : w.photos.errorPhoto}
        />
      ) : null}
      {photos.length === 0 ? (
        <AppText size={sample.noteSize} color={colors.secondary} style={{ marginBottom: 8 }}>
          {w.photos.empty}
        </AppText>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carousel} style={{ marginBottom: 10 }}>
          {photos.map((p) => (
            <View key={p.id} style={styles.item}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={p.note || w.photos.noteTitle}
                onPress={() => {
                  setEditing(p);
                  setNote(p.note);
                }}
                style={[styles.thumb, { backgroundColor: colors.surface }]}
              >
                {p.uri ? (
                  <Image testID={`photo-${p.id}`} source={{ uri: p.uri }} style={styles.image} accessibilityIgnoresInvertColors />
                ) : (
                  <Icon name="camera" size={37} strokeWidth={iconStrokeWidth} color={colors.secondary} />
                )}
              </Pressable>
              <View style={styles.caption}>
                <AppText size={12} color={colors.secondary} numberOfLines={2} style={{ flex: 1 }}>
                  {p.note}
                </AppText>
                <Pressable accessibilityRole="button" accessibilityLabel={w.remove.photoLabel} onPress={() => setRemoving(p)} hitSlop={8}>
                  <Icon name="trash" size={16} strokeWidth={iconStrokeWidth} color={colors.text} />
                </Pressable>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
      {notice ? (
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginBottom: 8 }}>
          <Icon name="camera" size={16} strokeWidth={iconStrokeWidth} color={colors.secondary} />
          <AppText size={sample.noteSize} color={colors.secondary} style={{ flexShrink: 1 }}>
            {notice}
          </AppText>
        </View>
      ) : null}
      <View style={styles.row}>
        <View style={styles.flex}>
          <AppButton label={w.photos.take} variant="outline" icon="camera" onPress={onTake} />
        </View>
        <View style={styles.flex}>
          <AppButton label={w.photos.gallery} variant="outline" icon="photo" onPress={onGallery} />
        </View>
      </View>

      <Sheet visible={editing !== null} onClose={() => setEditing(null)}>
        <AppText weight="medium" size={sample.headingSize} center style={{ marginBottom: 8 }}>
          {w.photos.noteTitle}
        </AppText>
        <AppField label={w.photos.note} value={note} onChangeText={setNote} />
        <View style={styles.row}>
          <View style={styles.flex}>
            <AppButton label={common.cancel} variant="outline" onPress={() => setEditing(null)} />
          </View>
          <View style={styles.flex}>
            <AppButton
              label={common.save}
              onPress={() => {
                if (editing) onNote(editing.id, note.trim());
                setEditing(null);
              }}
            />
          </View>
        </View>
      </Sheet>
      <Sheet visible={removing !== null} onClose={() => setRemoving(null)}>
        <AppText weight="medium" size={sample.headingSize} center>
          {w.remove.photoTitle}
        </AppText>
        <View style={[styles.row, { marginTop: 12 }]}>
          <View style={styles.flex}>
            <AppButton label={common.cancel} variant="outline" onPress={() => setRemoving(null)} />
          </View>
          <View style={styles.flex}>
            <AppButton
              label={w.remove.delete}
              onPress={() => {
                const target = removing;
                setRemoving(null);
                if (target) onRemove(target.id);
              }}
            />
          </View>
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  caption: { width: 96, flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  carousel: { gap: 10 },
  item: { gap: 4 },
  thumb: { width: 96, height: 96, borderRadius: 8, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  image: { width: 96, height: 96 },
  row: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
});
