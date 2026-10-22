import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/AppButton';
import { AppField } from '@/components/AppField';
import { AppText } from '@/components/AppText';
import { Segmented } from '@/components/Segmented';
import { SelectField } from '@/components/SelectField';
import { TopBar } from '@/components/TopBar';
import { SyncStatus } from '@/components/walkthrough/SyncStatus';
import { useStrings } from '@/i18n/useStrings';
import { useWalkthroughStrings } from '@/i18n/useWalkthroughStrings';
import { useGoBack } from '@/lib/navigation';
import { usePermissions } from '@/lib/session';
import { useWalkthrough } from '@/lib/useWalkthrough';
import {
  AREA_TYPES,
  CONDITIONS,
  canDoWalkthroughs,
  isEditable,
  isUntouched,
  newArea,
  syncBadge,
  upsertArea,
  withAreaType,
  type Area,
} from '@/lib/walkthroughRules';
import { sample, useTheme } from '@/theme';

/**
 * Área del walkthrough (D-037, D-074; muestras rondas 3 y 8): Tipo, Nombre ("Type ##" por defecto), Tamaño, condición
 * Buena / Regular / Mala, Pedido especial y Notas; botones Foto y Guardar y otra. Se guarda en el teléfono con cada
 * cambio; un área nueva sin tocar no se guarda (D-200).
 */
export default function AreaScreen() {
  const params = useLocalSearchParams<{ id: string; area?: string }>();
  const router = useRouter();
  const goBack = useGoBack();
  const { colors } = useTheme();
  const strings = useStrings();
  const w = useWalkthroughStrings();
  const { access } = usePermissions();
  const { doc, update } = useWalkthrough(params.id);
  const [area, setArea] = useState<Area | null>(null);
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

  function change(next: Area) {
    setArea(next);
    if (isNew.current && isUntouched(next)) return;
    void update((d) => ({ ...d, data: { ...d.data, areas: upsertArea(d.data.areas, next) } }));
  }

  async function openPhotos() {
    if (!area) return;
    // La foto cuelga del área: se guarda aunque todavía no se haya tocado nada.
    await update((d) => ({ ...d, data: { ...d.data, areas: upsertArea(d.data.areas, area) } }));
    isNew.current = false;
    router.push({ pathname: '/walkthrough/[id]/photos', params: { id: params.id, area: area.id } });
  }

  function saveAndNext() {
    if (!doc || !area) return;
    const areas = upsertArea(doc.data.areas, area);
    void update((d) => ({ ...d, data: { ...d.data, areas: upsertArea(d.data.areas, area) } }));
    isNew.current = true;
    setArea(newArea(areas, typeLabel, area.type));
  }

  const title = area && !isNew.current ? area.name : w.areas.newTitle;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <TopBar
        title={title}
        onBack={goBack}
        backLabel={strings.common.back}
        subtitle={doc ? <SyncStatus badge={syncBadge(doc)} pendingLabel={w.pending} syncedLabel={w.synced} /> : undefined}
      />
      <ScrollView contentContainerStyle={{ padding: 12 }} keyboardShouldPersistTaps="handled">
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
            <AppField
              label={w.areas.size}
              value={area.size}
              keyboardType="numeric"
              onChangeText={(v) => change({ ...area, size: v })}
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
            <View style={styles.row}>
              <View style={styles.flex}>
                <AppButton
                  label={w.areas.photo}
                  variant="outline"
                  icon="camera"
                  onPress={() => void openPhotos()}
                />
              </View>
              <View style={styles.flex}>
                <AppButton label={w.areas.saveAndNext} onPress={saveAndNext} />
              </View>
            </View>
          </>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, marginTop: 4 },
  flex: { flex: 1 },
});
