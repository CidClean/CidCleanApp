import { useColorScheme } from 'react-native';

import { useThemePreference } from './lib/themePreference';

/**
 * Valores vigentes de current/diseno-visual.md. Nada aquí se inventa.
 * Los valores marcados "muestra" salen de la muestra aprobada
 * (surveys/ronda-13-pantalla-entrada-aprobado.html y ronda-04-portal-quote-aprobado.html)
 * porque el repositorio no los fija en otro lugar.
 */

/**
 * Interruptor único de las ilustraciones pequeñas del estilo C (D-223). El dueño elegirá entre ilustraciones más
 * trabajadas o ninguna; con false ninguna se dibuja y las tarjetas se ven completas.
 */
export const illustrations = true;

/** D-024 */
export const brand = '#0F766E';

/** D-034 */
export const status = {
  success: '#3F8F5F',
  warning: '#B7791F',
  error: '#C0504D',
} as const;

/**
 * D-223 (estilo C "Combinación", reemplaza los grises de D-033 en fondos y tarjetas): fondo crema, tarjetas blancas
 * de 24px, texto verde muy oscuro y secundario cálido. El modo oscuro se deriva de la misma paleta (fondo cálido
 * oscuro, tarjetas un tono más claro) y respeta el contraste de 4.5:1 en texto.
 */
const light = {
  background: '#FBF6EF', // D-223
  /** Tarjetas del mosaico (D-223). */
  card: '#FFFFFF',
  /** Superficie cálida: barras fijas, botón deshabilitado, días de la semana (muestra estilo C: #F6EFE6). */
  surface: '#F6EFE6',
  text: '#1E2A28', // D-223
  border: '#EADFD2', // derivado de la paleta (línea fina cálida)
  secondary: '#6B5F52', // D-223
  /** Iconos de la barra inferior sin elegir (muestra estilo C). */
  navInactive: '#8C8173',
  /** Tarjeta de atención (D-223). */
  attention: '#FBE3C7',
  attentionText: '#8A4B0F',
  /** Tarjeta oscura (D-223). */
  darkCard: '#1E2A28',
  darkCardText: '#FFFFFF',
  /** Fondo del icono en tarjeta blanca (muestra estilo C: #DDEFEC). */
  brandSoft: '#DDEFEC',
  /** Marca como texto o línea sobre el fondo (sobre crema, #0F766E da 5.2:1). */
  brandText: '#0F766E',
  // muestra: borde de campos y casillas = color de texto al 32% de opacidad (D-030)
  fieldBorder: 'rgba(30, 42, 40, 0.32)',
  // muestra ronda 15: interruptor apagado = texto al 40% (D-173); círculo de opción sin marcar = texto al 45%
  switchOff: 'rgba(30, 42, 40, 0.4)',
  radioBorder: 'rgba(30, 42, 40, 0.45)',
} as const;

const dark = {
  background: '#16130F', // cálido oscuro (derivado de D-223)
  card: '#221E19', // un tono más claro que el fondo
  surface: '#2B261F',
  text: '#F5EFE7', // 15.9:1 sobre el fondo
  border: '#3A332A',
  secondary: '#B9AD9E', // 8.2:1 sobre el fondo
  navInactive: '#9C9082',
  attention: '#4A3218',
  attentionText: '#F6C98E', // 7.9:1 sobre la tarjeta de atención
  darkCard: '#0F1A18',
  darkCardText: '#F5EFE7',
  brandSoft: '#16332F',
  brandText: '#4FB8AC', // 7.3:1 sobre el fondo oscuro; el relleno de marca sigue en #0F766E con texto blanco (5.4:1)
  fieldBorder: 'rgba(245, 239, 231, 0.32)',
  switchOff: 'rgba(245, 239, 231, 0.4)',
  radioBorder: 'rgba(245, 239, 231, 0.45)',
} as const;

export type Palette = { [K in keyof typeof light]: string };
export const palettes: { light: Palette; dark: Palette } = { light, dark };

/** D-025, D-031; D-223: tarjetas de 24px, cuadro activo de la barra de 16px. */
export const radius = {
  control: 12,
  chip: 6,
  card: 24,
  tile: 16,
} as const;

/** D-026: Manrope (cargada en _layout con @expo-google-fonts/manrope). */
export const fonts = {
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  /** D-223: Manrope 700 en los títulos de las tarjetas y 800 en títulos y cifras. */
  bold: 'Manrope_700Bold',
  heavy: 'Manrope_800ExtraBold',
} as const;

/** D-036 (densidad estándar) */
export const density = {
  text: 15,
  row: 48,
  fieldPaddingVertical: 10,
} as const;

/** D-120, D-035 */
export const iconStrokeWidth = 1.5;

/** Valores tomados de las muestras aprobadas (ronda 13 y ronda 4). */
export const sample = {
  screenMaxWidth: 420,
  titleSize: 26, // D-149
  headingSize: 16,
  noteSize: 13,
  labelSize: 12,
  buttonSize: 14,
  buttonMinHeight: 40,
  fieldHorizontalPadding: 12,
  fieldLineHeight: 21,
  codeBoxHeight: 48, // D-040
  codeBoxGap: 6,
  codeBoxSize: 18,
  keyHeight: 36,
  keyRadius: 10,
  keyGap: 6,
  alertIconSize: 18,
  barPaddingVertical: 10,
  barTextSize: 14,
} as const;

export function useTheme() {
  // D-028: automático, sigue el modo del teléfono; D-222 b: o el tema que la persona eligió en Mi perfil.
  const system = useColorScheme();
  const preference = useThemePreference();
  const scheme = preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;
  const colors = scheme === 'dark' ? palettes.dark : palettes.light;
  return { scheme, colors, brand, status } as const;
}
