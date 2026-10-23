import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { FormScroll } from '@/components/FormScroll';
import { AppButton } from '@/components/AppButton';
import { AppField } from '@/components/AppField';
import { AppText } from '@/components/AppText';
import { AreaPhotos } from '@/components/walkthrough/AreaPhotos';
import { Segmented } from '@/components/Segmented';
import { SelectField } from '@/components/SelectField';
import { TopBar } from '@/components/TopBar';
import { SyncStatus } from '@/components/walkthrough/SyncStatus';
import { useStrings } from '@/i18n/useStrings';
import { useWalkthroughStrings } from '@/i18n/useWalkthroughStrings';
import { pickPhotos, takePhoto, type PickedFile } from '@/lib/documents';
import { useGoBack } from '@/lib/navigation';
import { usePermissions } from '@/lib/session';
import { useWalkthrough } from '@/lib/useWalkthrough';
import { keepPhotoOnDevice } from '@/lib/walkthroughApi';
import {
  AREA_SIZES,
  AREA_TYPES,
  CONDITIONS,
  canDoWalkthroughs,
  isEditable,
  isUntouched,
  newArea,
  newId,
  photoPath,
  removePhoto,
  syncBadge,
  upsertArea,
  withAreaType,
  type Area,
  type Photo,
  type WalkthroughDoc,
} from '@/lib/walkthroughRules';
import { sample, useTheme } from '@/theme';

/**
 * Área del walkthrough (D-037, D-074; muestras rondas 3 y 8; D-217): Tipo, Nombre ("Type ##" por defecto), Tamaño
 * Pequeña / Mediana / Grande, condición Buena / Regular / Mala, Pedido especial, Notas, el apartado de Fotos (cámara
 * al instante y galería) y Guardar y otra. Se guarda en el teléfono con cada cambio; un área nueva sin tocar no se
 * guarda (D-200).
 *
 * Las fotos se leen siempre del documento guardado y cada cambio de un campo conserva las fotos guardadas: así una foto
 * nunca se pierde por un cambio hecho con datos viejos de la pantalla (D-217, fallo "las fotos no quedan guardadas").
 */
export default function AreaScreen() {
  const params = useLocalSearchParams<{ id: string; area?: string }>();
  const goBack = useGoBack();
  const { colors } = useTheme();
  const strings = useStrings();
  const w = useWalkthroughStrings();
  const { access } = usePermissions();
  const { doc, update } = useWalkthrough(params.id);
  const [area, setArea] = useState<Area | null>(null);
  const [photoError, setPhotoError] = useState<'camera' | 'gallery' | 'photo' | null>(null);
  const isNew = useRef(!params.area);

  const typeLabel = (t: Area['type']) => w.types[t];

  useEffect(() => {
    if (!doc || area) return;
    const existing = params.area ? doc.data.areas.find((a) => a.id === params.area) : undefined;
    setArea(existing ?? newArea(doc.data.areas, typeLabel));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, area, params.area]);

  if (!canDoWalkthroughs(access)) return <Redirect href="/" />;
  // Cerrado se ve en el Resumen; para cambiar un área primero se toca Editar (D-212).
  if (doc && !isEditable(doc)) return <Redirect href={{ pathname: '/walkthrough/[id]', params: { id: params.id } }} />;

  const saved = area && doc ? doc.data.areas.find((a) => a.id === area.id) : undefined;
  const photos: Photo[] = saved?.photos ?? [];

  /** El área con los campos de la pantalla y las fotos que ya están guardadas en el documento. */
  function merged(d: WalkthroughDoc, fields: Area): Area {
    const stored = d.data.areas.find((a) => a.id === fields.id);
    return { ...fields, photos: stored?.photos ?? [] };
  }

  function change(next: Area) {
    setArea(next);
    if (isNew.current && isUntouched({ ...next, photos })) return;
    void update((d) => ({ ...d, data: { ...d.data, areas: upsertArea(d.data.areas, merged(d, next)) } }));
  }

  async function addFiles(files: PickedFile[]) {
    if (!area) return;
    const added: Photo[] = files.map((f) => {
      const id = newId();
      const path = photoPath(params.id, id, f.mimeType);
      const uri = keepPhotoOnDevice(f.uri, params.id, path.split('/')[1]);
      return { id, path, uri, note: '', uploaded: false };
    });
    // La foto cuelga del área: se guarda aunque todavía no se haya tocado nada.
    const fields = area;
    await update((d) => {
      const base = merged(d, fields);
      return { ...d, data: { ...d.data, areas: upsertArea(d.data.areas, { ...base, photos: [...base.photos, ...added] }) } };
    });
    isNew.current = false;
  }

  async function take() {
    setPhotoError(null);
    try {
      const picked = await takePhoto();
      if (picked.kind === 'denied') return setPhotoError('camera');
      if (picked.kind === 'cancelled') return;
      await addFiles([picked.file]);
    } catch {
      setPhotoError('photo');
    }
  }

  async function fromGallery() {
    setPhotoError(null);
    try {
      const picked = await pickPhotos();
      if (picked.kind === 'denied') return setPhotoError('gallery');
      if (picked.kind === 'cancelled') return;
      await addFiles(picked.files);
    } catch {
      setPhotoError('photo');
    }
  }

  function setNote(photoId: string, note: string) {
    if (!area) return;
    const areaId = area.id;
    void update((d) => ({
      ...d,
      data: {
        ...d.data,
        areas: d.data.areas.map((a) =>
          a.id === areaId ? { ...a, photos: a.photos.map((p) => (p.id === photoId ? { ...p, note } : p)) } : a,
        ),
      },
    }));
  }

  function deletePhoto(photoId: string) {
    if (!area) return;
    const areaId = area.id;
    void update((d) => ({ ...d, data: { ...d.data, areas: removePhoto(d.data.areas, areaId, photoId) } }));
  }

  function saveAndNext() {
    if (!doc || !area) return;
    const fields = area;
    const areas = upsertArea(doc.data.areas, merged(doc, fields));
    void update((d) => ({ ...d, data: { ...d.data, areas: upsertArea(d.data.areas, merged(d, fields)) } }));
    isNew.current = true;
    setPhotoError(null);
    setArea(newArea(areas, typeLabel, area.type));
  }

  const title = area && !isNew.current ? area.name : w.areas.newTitle;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar
        title={title}
        onBack={goBack}
        backLabel={strings.common.back}
        subtitle={doc ? <SyncStatus badge={syncBadge(doc)} pendingLabel={w.pending} syncedLabel={w.synced} /> : undefined}
      />
      <FormScroll contentContainerStyle={{ padding: 12 }} keyboardShouldPersistTaps="handled">
        {doc && area ? (
          <>
            <SelectField
              label={w.areas.type}
              options={AREA_TYPES.map((t) => ({ value: t, label: w.types[t] }))}
              value={area.type}
              onChange={(t) => change(withAreaType(area, t, w.types[t], doc.data.areas))}
            />
            <AppField
              label={w.areas.name}
              value={area.name}
              onChangeText={(v) => change({ ...area, name: v, nameEdited: true })}
            />
            <AppText size={sample.labelSize} color={colors.secondary} style={{ marginBottom: 3 }}>
              {w.areas.size}
            </AppText>
            <Segmented
              options={AREA_SIZES.map((z) => ({ value: z, label: w.sizes[z] }))}
              value={area.size}
              onChange={(z) => change({ ...area, size: z })}
            />
            <AppText size={sample.labelSize} color={colors.secondary} style={{ marginBottom: 3 }}>
              {w.areas.condition}
            </AppText>
            <Segmented
              options={CONDITIONS.map((c) => ({ value: c, label: w.conditions[c] }))}
              value={area.condition}
              onChange={(c) => change({ ...area, condition: c })}
            />
            <View style={{ height: 8 }} />
            <AppField
              label={w.areas.specialRequest}
              value={area.specialRequest}
              onChangeText={(v) => change({ ...area, specialRequest: v })}
            />
            <AppField label={w.areas.notes} value={area.notes} multiline onChangeText={(v) => change({ ...area, notes: v })} />
            <AreaPhotos
              w={w}
              common={strings.common}
              photos={photos}
              error={photoError}
              onTake={() => void take()}
              onGallery={() => void fromGallery()}
              onNote={setNote}
              onRemove={deletePhoto}
            />
            <AppButton label={w.areas.saveAndNext} onPress={saveAndNext} />
          </>
        ) : null}
      </FormScroll>
    </View>
  );
}
