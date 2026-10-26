import { useId } from 'react';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { LOGO_PATHS } from './logoPaths';

/**
 * Logo de Cid Clean por capas (orden 34, D-248, D-250): los 5 paths de brand/cid-clean-simbolo-vector-transparente.svg
 * (letra-c, letra-d, gota, ola-principal, ola-clara) con sus degradados. Las animaciones apilan varias copias, cada una
 * con algunas capas, y mueven cada copia por separado (transform y opacity en el hilo de la interfaz).
 */

/** Recorte del viewBox de la muestra animaciones.html (el símbolo sin el margen del lienzo de 1024). */
export const LOGO_VIEWBOX = { x: 60, y: 60, size: 904 };
const VIEWBOX = `${LOGO_VIEWBOX.x} ${LOGO_VIEWBOX.y} ${LOGO_VIEWBOX.size} ${LOGO_VIEWBOX.size}`;

export type LogoLayer = 'letraC' | 'letraD' | 'gota' | 'olaPrincipal' | 'olaClara';
export const ALL_LAYERS: readonly LogoLayer[] = ['letraD', 'gota', 'letraC', 'olaPrincipal', 'olaClara'];

/** Degradado de cada capa (los del SVG). */
export const LAYER_GRADIENT: Record<LogoLayer, 'petroleo' | 'gota' | 'ola' | 'menta'> = {
  letraC: 'petroleo',
  letraD: 'petroleo',
  gota: 'gota',
  olaPrincipal: 'ola',
  olaClara: 'menta',
};

/** Degradados del SVG; `prefix` evita choques de id entre varias copias en pantalla. */
export function LogoDefs({ prefix }: { prefix: string }) {
  return (
    <Defs>
      <LinearGradient id={`${prefix}petroleo`} x1="0" y1="1" x2="1" y2="0">
        <Stop offset="0" stopColor="#004b51" />
        <Stop offset="0.5" stopColor="#006e70" />
        <Stop offset="1" stopColor="#008481" />
      </LinearGradient>
      <LinearGradient id={`${prefix}gota`} x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0" stopColor="#65dfda" />
        <Stop offset="1" stopColor="#00a7ad" />
      </LinearGradient>
      <LinearGradient id={`${prefix}ola`} x1="0" y1="0" x2="1" y2="0">
        <Stop offset="0" stopColor="#00a3ab" />
        <Stop offset="1" stopColor="#008f9a" />
      </LinearGradient>
      <LinearGradient id={`${prefix}menta`} x1="0" y1="0" x2="1" y2="0">
        <Stop offset="0" stopColor="#b1e9df" />
        <Stop offset="1" stopColor="#70d5d0" />
      </LinearGradient>
    </Defs>
  );
}

/** Lienzo con el viewBox del logo; los hijos dibujan en sus coordenadas. */
export function LogoCanvas({ size, children }: { size: number; children: React.ReactNode }) {
  return (
    <Svg width={size} height={size} viewBox={VIEWBOX} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {children}
    </Svg>
  );
}

export function useLogoPrefix(): string {
  return `cc${useId().replace(/[^a-zA-Z0-9]/g, '')}-`;
}

/** Logo fijo con las capas pedidas (todas por defecto). */
export function LogoLayers({ size, layers = ALL_LAYERS }: { size: number; layers?: readonly LogoLayer[] }) {
  const prefix = useLogoPrefix();
  return (
    <LogoCanvas size={size}>
      <LogoDefs prefix={prefix} />
      {ALL_LAYERS.filter((l) => layers.includes(l)).map((l) => (
        <Path key={l} d={LOGO_PATHS[l]} fill={`url(#${prefix}${LAYER_GRADIENT[l]})`} fillRule="evenodd" />
      ))}
    </LogoCanvas>
  );
}
