import { useColorScheme } from 'react-native';

/**
 * Valores vigentes de current/diseno-visual.md. Nada aquí se inventa.
 * Los valores marcados "muestra" salen de la muestra aprobada
 * (surveys/ronda-13-pantalla-entrada-aprobado.html y ronda-04-portal-quote-aprobado.html)
 * porque el repositorio no los fija en otro lugar.
 */

/** D-024 */
export const brand = '#0F766E';

/** D-034 */
export const status = {
  success: '#3F8F5F',
  warning: '#B7791F',
  error: '#C0504D',
} as const;

/** D-033 (Neutro), claro y oscuro. */
const light = {
  background: '#FFFFFF',
  surface: '#F4F4F4',
  text: '#1A1A1A',
  border: '#E2E2E2',
  secondary: '#6B6B6B',
  // muestra: borde de campos y casillas = color de texto al 32% de opacidad (D-030)
  fieldBorder: 'rgba(26, 26, 26, 0.32)',
  // muestra ronda 15: interruptor apagado = texto al 40% (D-173); círculo de opción sin marcar = texto al 45%
  switchOff: 'rgba(26, 26, 26, 0.4)',
  radioBorder: 'rgba(26, 26, 26, 0.45)',
} as const;

const dark = {
  background: '#121212',
  surface: '#1C1C1C',
  text: '#F2F2F2',
  border: '#333333',
  secondary: '#A0A0A0',
  fieldBorder: 'rgba(242, 242, 242, 0.32)',
  switchOff: 'rgba(242, 242, 242, 0.4)',
  radioBorder: 'rgba(242, 242, 242, 0.45)',
} as const;

export type Palette = { [K in keyof typeof light]: string };
export const palettes: { light: Palette; dark: Palette } = { light, dark };

/** D-025, D-031 */
export const radius = {
  control: 12,
  chip: 6,
} as const;

/** D-026: Manrope 400 y 500 (cargadas en _layout con @expo-google-fonts/manrope). */
export const fonts = {
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
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
  // D-028: automático, sigue el modo del teléfono.
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? palettes.dark : palettes.light;
  return { scheme: scheme === 'dark' ? 'dark' : 'light', colors, brand, status } as const;
}
