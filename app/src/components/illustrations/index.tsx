import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { illustrations } from '@/theme';

/**
 * Ilustraciones pequeñas del estilo C (D-223), copiadas de `surveys/estilo-c-aprobado/`: edificio con destellos,
 * cubeta con trapeador, burbujas y destello (#F2C27B). Son decorativas: no las lee el lector de pantalla.
 * Todas se apagan juntas con `illustrations` en theme.ts: sin ellas no dibujan nada y las tarjetas se acomodan solas.
 */

export function BuildingArt({ width = 120, height = 104 }: { width?: number; height?: number }) {
  if (!illustrations) return null;
  return (
    <Svg width={width} height={height} viewBox="0 0 120 104" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Rect x={30} y={20} width={60} height={84} rx={6} fill="#0B5A54" />
      <Rect x={40} y={32} width={14} height={12} rx={3} fill="#BFE3DE" />
      <Rect x={66} y={32} width={14} height={12} rx={3} fill="#FFFFFF" />
      <Rect x={40} y={52} width={14} height={12} rx={3} fill="#FFFFFF" />
      <Rect x={66} y={52} width={14} height={12} rx={3} fill="#BFE3DE" />
      <Rect x={40} y={72} width={14} height={12} rx={3} fill="#BFE3DE" />
      <Rect x={66} y={72} width={14} height={12} rx={3} fill="#BFE3DE" />
      <Sparkle />
      <Bubbles />
    </Svg>
  );
}

/** Destello de cuatro puntas (#F2C27B), dentro de otra ilustración. */
function Sparkle() {
  return <Path d="M104 18l4 9 9 4-9 4-4 9-4-9-9-4 9-4z" fill="#F2C27B" />;
}

function Bubbles() {
  return (
    <>
      <Circle cx={16} cy={44} r={8} fill="none" stroke="#BFE3DE" strokeWidth={2} />
      <Circle cx={12} cy={68} r={5} fill="none" stroke="#BFE3DE" strokeWidth={2} />
    </>
  );
}

/** Cubeta con trapeador sobre la tarjeta de marca (inicio del staff). */
export function BucketArt({ width = 92, height = 80 }: { width?: number; height?: number }) {
  if (!illustrations) return null;
  return (
    <Svg width={width} height={height} viewBox="0 0 92 80" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d="M22 30h40l-5 46H27z" fill="#FCE9C9" />
      <Rect x={18} y={24} width={48} height={9} rx={4.5} fill="#F2C27B" />
      <Path d="M80 2L64 60" stroke="#FFFFFF" strokeWidth={4} strokeLinecap="round" />
      <Circle cx={8} cy={30} r={6} fill="none" stroke="#BFE3DE" strokeWidth={2} />
      <Circle cx={12} cy={52} r={4} fill="none" stroke="#BFE3DE" strokeWidth={2} />
    </Svg>
  );
}

/** Cubeta pequeña sobre tarjeta blanca (fila "Walkthrough en curso"). */
export function SmallBucketArt() {
  if (!illustrations) return null;
  return (
    <Svg width={52} height={44} viewBox="0 0 52 44" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d="M14 16h24l-3 26H17z" fill="#FCE9C9" />
      <Rect x={11} y={12} width={30} height={6} rx={3} fill="#F2C27B" />
      <Path d="M44 2L34 38" stroke="#0F766E" strokeWidth={3} strokeLinecap="round" />
    </Svg>
  );
}

/** Burbujas y destello sueltos (para estados vacíos). */
export function SparklesArt({ size = 64 }: { size?: number }) {
  if (!illustrations) return null;
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d="M40 8l4 9 9 4-9 4-4 9-4-9-9-4 9-4z" fill="#F2C27B" />
      <Circle cx={18} cy={36} r={8} fill="none" stroke="#BFE3DE" strokeWidth={2} />
      <Circle cx={30} cy={52} r={5} fill="none" stroke="#BFE3DE" strokeWidth={2} />
    </Svg>
  );
}
