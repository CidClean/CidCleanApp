import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { illustrations } from '@/theme';

/**
 * Ilustraciones del estilo C1 (D-223, D-224), copiadas de `surveys/estilo-c1-aprobado/`. Son PROVISIONALES: se
 * reemplazarán por piezas profesionales sin tocar las pantallas, que solo importan estos componentes.
 * Son decorativas (no las lee el lector de pantalla). Todas se apagan juntas con `illustrations` en theme.ts: sin
 * ellas no dibujan nada y las tarjetas se acomodan solas.
 */

const hidden = { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const };

/** Dos edificios relucientes con atomizador y destellos (tarjeta principal del admin), 176×154. */
export function OfficeArt() {
  if (!illustrations) return null;
  return (
    <Svg width={176} height={154} viewBox="0 0 176 154" {...hidden}>
      <Circle cx={122} cy={52} r={40} fill="#13887F" />
      <Rect x={40} y={58} width={58} height={96} rx={6} fill="#0A4F49" />
      <Rect x={48} y={68} width={12} height={10} rx={2} fill="#2E9C92" />
      <Rect x={66} y={68} width={12} height={10} rx={2} fill="#FFFFFF" />
      <Rect x={84} y={68} width={8} height={10} rx={2} fill="#2E9C92" />
      <Rect x={48} y={84} width={12} height={10} rx={2} fill="#FFFFFF" />
      <Rect x={66} y={84} width={12} height={10} rx={2} fill="#2E9C92" />
      <Rect x={84} y={84} width={8} height={10} rx={2} fill="#FFFFFF" />
      <Rect x={48} y={100} width={12} height={10} rx={2} fill="#2E9C92" />
      <Rect x={66} y={100} width={12} height={10} rx={2} fill="#2E9C92" />
      <Rect x={84} y={100} width={8} height={10} rx={2} fill="#2E9C92" />
      <Rect x={90} y={26} width={64} height={128} rx={8} fill="#F7F1E7" />
      <Rect x={90} y={26} width={64} height={12} rx={6} fill="#E8DCC9" />
      <Rect x={100} y={46} width={14} height={12} rx={3} fill="#BFE3DE" />
      <Rect x={122} y={46} width={14} height={12} rx={3} fill="#BFE3DE" />
      <Rect x={100} y={66} width={14} height={12} rx={3} fill="#BFE3DE" />
      <Rect x={122} y={66} width={14} height={12} rx={3} fill="#0F766E" />
      <Rect x={100} y={86} width={14} height={12} rx={3} fill="#0F766E" />
      <Rect x={122} y={86} width={14} height={12} rx={3} fill="#BFE3DE" />
      <Rect x={100} y={106} width={14} height={12} rx={3} fill="#BFE3DE" />
      <Rect x={122} y={106} width={14} height={12} rx={3} fill="#BFE3DE" />
      <Rect x={112} y={128} width={20} height={26} rx={3} fill="#0A4F49" />
      <Path d="M104 46l10 12M100 52l6 6" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" opacity={.9} />
      <Rect x={14} y={112} width={20} height={42} rx={6} fill="#F2C27B" />
      <Rect x={18} y={100} width={12} height={14} rx={3} fill="#FFFFFF" />
      <Path d="M30 104h10v6H30" fill="#FFFFFF" />
      <Circle cx={48} cy={104} r={2.5} fill="#FFFFFF" />
      <Circle cx={54} cy={98} r={2} fill="#FFFFFF" />
      <Circle cx={54} cy={110} r={2} fill="#FFFFFF" />
      <Path d="M162 18l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#F2C27B" />
      <Path d="M74 32l2.5 5.5 5.5 2.5-5.5 2.5-2.5 5.5-2.5-5.5-5.5-2.5 5.5-2.5z" fill="#FFFFFF" />
      <Circle cx={160} cy={66} r={5} fill="none" stroke="#BFE3DE" strokeWidth={1.5} />
      <Circle cx={168} cy={84} r={3} fill="none" stroke="#BFE3DE" strokeWidth={1.5} />
    </Svg>
  );
}

/** Icono ilustrado de 40px: quotes por vencer (tarjeta ámbar). */
export function QuoteDueIcon() {
  if (!illustrations) return null;
  return (
    <Svg width={40} height={40} viewBox="0 0 40 40" {...hidden}>
      <Rect width={40} height={40} rx={12} fill="#FFFFFF" />
      <Rect x={11} y={9} width={18} height={23} rx={3} fill="#F2C27B" />
      <Path d="M15 16h10M15 21h10M15 26h6" stroke="#8A4B0F" strokeWidth={1.6} strokeLinecap="round" />
      <Circle cx={29} cy={28} r={6} fill="#8A4B0F" />
      <Path d="M29 25v3l2 1.5" stroke="#FFFFFF" strokeWidth={1.4} strokeLinecap="round" />
    </Svg>
  );
}

/** Icono ilustrado de 40px: trabajos por aprobar y otros pendientes (tarjeta blanca). */
export function ApproveIcon() {
  if (!illustrations) return null;
  return (
    <Svg width={40} height={40} viewBox="0 0 40 40" {...hidden}>
      <Rect width={40} height={40} rx={12} fill="#DDEFEC" />
      <Rect x={10} y={10} width={20} height={22} rx={4} fill="#FFFFFF" stroke="#0F766E" strokeWidth={1.5} />
      <Rect x={15} y={7} width={10} height={6} rx={2} fill="#0F766E" />
      <Path d="M15 22l3 3 7-7" stroke="#0F766E" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

/** Icono ilustrado de 52×48: walkthrough en curso. */
export function WalkthroughIcon() {
  if (!illustrations) return null;
  return (
    <Svg width={52} height={48} viewBox="0 0 52 48" {...hidden}>
      <Rect width={52} height={48} rx={14} fill="#F6EFE6" />
      <Path d="M14 20h22l-3 20H17z" fill="#FCE9C9" />
      <Rect x={12} y={16} width={26} height={6} rx={3} fill="#F2C27B" />
      <Path d="M44 6L36 38" stroke="#0F766E" strokeWidth={3} strokeLinecap="round" />
      <Path d="M32 38h10l2 4H30z" fill="#0F766E" />
      <Circle cx={22} cy={28} r={2} fill="#FFFFFF" />
      <Circle cx={27} cy={31} r={1.5} fill="#FFFFFF" />
    </Svg>
  );
}

/** Carrito de limpieza con cubeta, trapeador y atomizador (tarjeta de hoy del staff), 150×132. */
export function CartArt() {
  if (!illustrations) return null;
  return (
    <Svg width={150} height={132} viewBox="0 0 150 132" {...hidden}>
      <Circle cx={96} cy={58} r={42} fill="#13887F" />
      <Rect x={28} y={70} width={92} height={44} rx={8} fill="#0A4F49" />
      <Rect x={34} y={62} width={80} height={10} rx={5} fill="#F7F1E7" />
      <Path d="M44 40h34l-4 30H48z" fill="#FCE9C9" />
      <Rect x={40} y={34} width={42} height={8} rx={4} fill="#F2C27B" />
      <Circle cx={54} cy={50} r={3} fill="#FFFFFF" />
      <Circle cx={62} cy={46} r={2} fill="#FFFFFF" />
      <Circle cx={68} cy={52} r={2.5} fill="#FFFFFF" />
      <Rect x={88} y={36} width={16} height={28} rx={4} fill="#F2C27B" />
      <Rect x={91} y={26} width={10} height={12} rx={2} fill="#FFFFFF" />
      <Path d="M101 28h9v5h-9" fill="#FFFFFF" />
      <Path d="M136 6l-20 88" stroke="#F7F1E7" strokeWidth={4} strokeLinecap="round" />
      <Path d="M106 92h20l4 10h-28z" fill="#F7F1E7" />
      <Circle cx={42} cy={120} r={8} fill="#1E2A28" />
      <Circle cx={42} cy={120} r={3} fill="#8C8173" />
      <Circle cx={106} cy={120} r={8} fill="#1E2A28" />
      <Circle cx={106} cy={120} r={3} fill="#8C8173" />
      <Path d="M18 20l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#F2C27B" />
      <Circle cx={132} cy={112} r={5} fill="none" stroke="#BFE3DE" strokeWidth={1.5} />
    </Svg>
  );
}

/** Icono ilustrado de 44px: próxima visita (tarjeta ámbar del staff). */
export function CalendarIcon() {
  if (!illustrations) return null;
  return (
    <Svg width={44} height={44} viewBox="0 0 44 44" {...hidden}>
      <Rect width={44} height={44} rx={14} fill="#FFFFFF" />
      <Rect x={10} y={12} width={24} height={22} rx={4} fill="#F2C27B" />
      <Rect x={10} y={12} width={24} height={7} rx={3} fill="#8A4B0F" />
      <Path d="M16 9v6M28 9v6" stroke="#8A4B0F" strokeWidth={2} strokeLinecap="round" />
      <Circle cx={22} cy={26} r={3} fill="#FFFFFF" />
    </Svg>
  );
}
