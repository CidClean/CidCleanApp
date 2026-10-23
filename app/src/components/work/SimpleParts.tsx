import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '../AppText';
import { useTheme } from '@/theme';

/**
 * Piezas del Schedule simple, copiadas de `surveys/schedule-simple-aprobado.html` (D-232) en el estilo C1.
 */

// Colores de los círculos de las personas (muestra D-232); cada persona tiene siempre el mismo.
const AVATAR = ['#0F766E', '#8A4B0F', '#5B5BB0', '#B0473F'];
export function avatarColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR[h % AVATAR.length];
}

/** Círculo de 22px con la inicial en blanco 11/800. */
export function Initial({ id, name }: { id: string; name: string }) {
  return (
    <View style={[styles.av, { backgroundColor: avatarColor(id) }]}>
      <AppText size={11} weight="heavy" color="#FFFFFF">
        {(name.trim()[0] ?? '?').toUpperCase()}
      </AppText>
    </View>
  );
}

/** Ficha de persona: 30px de alto, radio 15, fondo #F6EFE6 (blanco al 18% sobre la tarjeta de hoy), 13/600. */
export function PersonChip({ id, name, onBrand = false }: { id: string; name: string; onBrand?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.chip, { backgroundColor: onBrand ? 'rgba(255,255,255,0.18)' : colors.surface }]}>
      <Initial id={id} name={name} />
      <AppText size={13} weight="medium" color={onBrand ? '#FFFFFF' : colors.text}>
        {name}
      </AppText>
    </View>
  );
}

/** "Falta asignar personal" en ámbar (blanco al 20% sobre la tarjeta de hoy). */
export function MissingChip({ label, onBrand = false }: { label: string; onBrand?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.empty, { backgroundColor: onBrand ? 'rgba(255,255,255,0.2)' : colors.attention }]}>
      <AppText size={13} weight="bold" color={onBrand ? '#FFFFFF' : colors.attentionText}>
        {label}
      </AppText>
    </View>
  );
}

type Opt<T extends string> = { value: T; label: string };

/** Selector de modo: fondo de tarjeta, radio 16, relleno 4; botones de 40px, radio 12, 14/700; el activo en marca. */
export function ModeSeg<T extends string>({ options, value, onChange }: { options: readonly Opt<T>[]; value: T; onChange: (v: T) => void }) {
  const { colors, brand } = useTheme();
  return (
    <View style={[styles.seg, { backgroundColor: colors.card }]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={[styles.segBtn, on ? { backgroundColor: brand } : null]}
          >
            <AppText size={14} weight="bold" color={on ? '#FFFFFF' : colors.secondary} center>
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Pastillas de rango: 36px, radio 18, 13/700, fondo de tarjeta; la elegida en oscuro con texto blanco. */
export function RangePills<T extends string>({ options, value, onChange }: { options: readonly Opt<T>[]; value: T; onChange: (v: T) => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.range}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={[styles.pill, { backgroundColor: on ? colors.darkCard : colors.card }]}
          >
            <AppText size={13} weight="bold" color={on ? '#FFFFFF' : colors.text}>
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Botones de la ventana: 44px, radio 14, 15/700; Guardar en marca y Cancelar con borde de marca. */
export function DialogButtons({ cancel, save, onCancel, onSave, disabled = false }: { cancel: string; save: string; onCancel: () => void; onSave: () => void; disabled?: boolean }) {
  const { colors, brand } = useTheme();
  return (
    <View style={styles.row}>
      <Pressable accessibilityRole="button" onPress={onCancel} style={[styles.btn, { borderWidth: 1, borderColor: brand }]}>
        <AppText size={15} weight="bold" color={colors.text}>
          {cancel}
        </AppText>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        onPress={disabled ? undefined : onSave}
        style={[styles.btn, { backgroundColor: brand, opacity: disabled ? 0.6 : 1 }]}
      >
        <AppText size={15} weight="bold" color="#FFFFFF">
          {save}
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  av: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, paddingLeft: 4, paddingRight: 10, borderRadius: 15 },
  empty: { borderRadius: 15, paddingHorizontal: 10, paddingVertical: 6 },
  seg: { flexDirection: 'row', borderRadius: 16, padding: 4, gap: 4 },
  segBtn: { flex: 1, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  range: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  pill: { height: 36, paddingHorizontal: 14, borderRadius: 18, justifyContent: 'center' },
  row: { flexDirection: 'row', gap: 8, marginTop: 4 },
  btn: { flex: 1, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
