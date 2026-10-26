import { useEffect } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Ellipse, Path } from 'react-native-svg';

import { LETTER_LENGTHS, LOGO_PATHS, WAVE_PARTS } from './logoPaths';
import { LogoCanvas, LogoDefs, LOGO_VIEWBOX, useLogoPrefix } from './LogoLayers';

/**
 * "Apertura" (orden 34, D-250; animaciones.html escena 3), unos 2.6 s al abrir la app, después de la pantalla nativa
 * de inicio (logo fijo en blanco): las olas entran como agua y se asientan (los `d` de los paths ondulan en un worklet,
 * con una amplitud que crece y se calma como el feDisplacementMap de la muestra, mientras derivan hasta su sitio), la c
 * y la d se trazan y se llenan, y la gota cae, rebota y deja una onda. Todo en el hilo de la interfaz: un solo valor de
 * tiempo y estilos/props derivados. Con "reducir movimiento" no se dibuja nada: queda el logo fijo de la pantalla
 * nativa y se entra a la app.
 */

export const OPENING_MS = 2600;
const CLOSE_MS = 200;

const AnimatedPath = Animated.createAnimatedComponent(Path);

// Curvas de la muestra.
const EOUT = Easing.bezierFn(0.23, 1, 0.32, 1);
const EINOUT = Easing.bezierFn(0.77, 0, 0.175, 1);
const EFALL = Easing.bezierFn(0.5, 0, 0.75, 0); // caída con gravedad (keyframes "fall" aprobados)

function seg(t: number, a: number, b: number): number {
  'worklet';
  return Math.min(1, Math.max(0, (t - a) / (b - a)));
}

/** d de una ola con cada y desplazada por una onda senoidal (x, y en pares). */
function waveD(parts: readonly string[], nums: readonly number[], amp: number, phase: number): string {
  'worklet';
  let s = parts[0];
  for (let i = 0; i < nums.length; i++) {
    const v = i % 2 === 1 ? nums[i] + amp * Math.sin(nums[i - 1] * 0.0285 + phase) : nums[i];
    s += v.toFixed(2) + parts[i + 1];
  }
  return s;
}

/** Punto del viewBox como porcentaje del lienzo (para transformOrigin). */
const pct = (x: number, y: number): [string, string, number] => [
  `${(((x - LOGO_VIEWBOX.x) / LOGO_VIEWBOX.size) * 100).toFixed(2)}%`,
  `${(((y - LOGO_VIEWBOX.y) / LOGO_VIEWBOX.size) * 100).toFixed(2)}%`,
  0,
];
const DROP_ORIGIN = pct(504, 307);
const RIPPLE_ORIGIN = pct(505, 300);

export function OpeningAnimation({ onDone }: { onDone: () => void }) {
  const reduced = useReducedMotion();
  const { width } = useWindowDimensions();
  const size = Math.min(width * 0.78, 240);
  const unit = size / LOGO_VIEWBOX.size;
  const prefix = useLogoPrefix();
  const t = useSharedValue(0);
  const fade = useSharedValue(1);

  useEffect(() => {
    if (reduced) {
      onDone();
      return;
    }
    const close = () => {
      fade.set(withTiming(0, { duration: CLOSE_MS }, (ok) => {
        if (ok) scheduleOnRN(onDone);
      }));
    };
    t.set(withTiming(OPENING_MS, { duration: OPENING_MS, easing: Easing.linear }, (ok) => {
      if (ok) scheduleOnRN(close);
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const root = useAnimatedStyle(() => ({ opacity: fade.get() }));

  // Olas: aparecen en 250 ms, derivan 90 unidades hasta su sitio y ondulan con amplitud 0 → 23 → 9 → 0.
  const amp = (v: number) => {
    'worklet';
    return interpolate(seg(v, 50, 1850), [0, 0.15, 0.6, 1], [0, 23, 9, 0]);
  };
  const clara = WAVE_PARTS.olaClara;
  const principal = WAVE_PARTS.olaPrincipal;
  const claraProps = useAnimatedProps(() => {
    const v = t.get();
    return { d: waveD(clara.parts, clara.nums, amp(v), v * 0.0075) };
  });
  const principalProps = useAnimatedProps(() => {
    const v = t.get();
    return { d: waveD(principal.parts, principal.nums, amp(v) * 0.85, v * 0.0075 + 1.3) };
  });
  const claraStyle = useAnimatedStyle(() => {
    const v = t.get();
    return { opacity: seg(v, 50, 300), transform: [{ translateX: -90 * unit * (1 - EOUT(seg(v, 50, 1850))) }] };
  });
  const principalStyle = useAnimatedStyle(() => {
    const v = t.get();
    return { opacity: seg(v, 50, 300), transform: [{ translateX: -90 * unit * (1 - EOUT(seg(v, 150, 1750))) }] };
  });

  // Letras: trazo y después relleno.
  const letter = (v: number, len: number, a: number, b: number, fa: number, fb: number) => {
    'worklet';
    const fill = EOUT(seg(v, fa, fb));
    return {
      strokeDashoffset: len * (1 - EINOUT(seg(v, a, b))),
      strokeOpacity: v < a ? 0 : 1 - fill,
      fillOpacity: fill,
    };
  };
  const cProps = useAnimatedProps(() => letter(t.get(), LETTER_LENGTHS.letraC, 450, 1150, 1000, 1450));
  const dProps = useAnimatedProps(() => letter(t.get(), LETTER_LENGTHS.letraD, 600, 1400, 1200, 1650));

  // Gota: cae (1350–2100 ms), se aplasta, rebota y se asienta (2100–2600 ms).
  const dropStyle = useAnimatedStyle(() => {
    const v = t.get();
    if (v < 2100) {
      const s = seg(v, 1350, 2100);
      const e = EFALL(s);
      return {
        opacity: Math.min(1, s / 0.15),
        transform: [
          { translateY: -260 * unit * (1 - e) },
          { scaleX: interpolate(e, [0, 1], [0.85, 0.88]) },
          { scaleY: interpolate(e, [0, 1], [1.25, 1.18]) },
        ],
      };
    }
    const e = EOUT(seg(v, 2100, 2600));
    return {
      opacity: 1,
      transform: [
        { translateY: interpolate(e, [0, 0.45, 1], [0, -14 * unit, 0]) },
        { scaleX: interpolate(e, [0, 0.45, 1], [1.16, 0.94, 1]) },
        { scaleY: interpolate(e, [0, 0.45, 1], [0.8, 1.06, 1]) },
      ],
    };
  });

  // Onda al caer la gota.
  const rippleStyle = useAnimatedStyle(() => {
    const e = EOUT(seg(t.get(), 2050, 2600));
    return { opacity: t.get() < 2050 ? 0 : 0.9 * (1 - e), transform: [{ scale: interpolate(e, [0, 1], [0.3, 2.4]) }] };
  });

  if (reduced) return null;

  const layer = (child: React.ReactNode, style?: object, origin?: [string, string, number]) => (
    <Animated.View style={[StyleSheet.absoluteFill, origin ? { transformOrigin: origin } : null, style]}>
      <LogoCanvas size={size}>
        <LogoDefs prefix={prefix} />
        {child}
      </LogoCanvas>
    </Animated.View>
  );

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, root]} testID="opening-animation" accessibilityLabel="Cid Clean">
      <View style={{ width: size, height: size }}>
        {layer(<AnimatedPath animatedProps={claraProps} d={LOGO_PATHS.olaClara} fill={`url(#${prefix}menta)`} fillRule="evenodd" />, claraStyle)}
        {layer(<AnimatedPath animatedProps={principalProps} d={LOGO_PATHS.olaPrincipal} fill={`url(#${prefix}ola)`} fillRule="evenodd" />, principalStyle)}
        {layer(
          <>
            <AnimatedPath
              animatedProps={cProps}
              d={LOGO_PATHS.letraC}
              fill={`url(#${prefix}petroleo)`}
              fillRule="evenodd"
              stroke={`url(#${prefix}petroleo)`}
              strokeWidth={6}
              strokeDasharray={[LETTER_LENGTHS.letraC, LETTER_LENGTHS.letraC]}
            />
            <AnimatedPath
              animatedProps={dProps}
              d={LOGO_PATHS.letraD}
              fill={`url(#${prefix}petroleo)`}
              fillRule="evenodd"
              stroke={`url(#${prefix}petroleo)`}
              strokeWidth={6}
              strokeDasharray={[LETTER_LENGTHS.letraD, LETTER_LENGTHS.letraD]}
            />
          </>,
        )}
        {layer(<Ellipse cx={505} cy={300} rx={60} ry={16} fill="none" stroke="#65dfda" strokeWidth={6} />, rippleStyle, RIPPLE_ORIGIN)}
        {layer(<Path d={LOGO_PATHS.gota} fill={`url(#${prefix}gota)`} fillRule="evenodd" />, dropStyle, DROP_ORIGIN)}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // El mismo fondo blanco de la pantalla nativa de inicio (app.json, expo-splash-screen).
  root: { backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', zIndex: 2000, elevation: 2000 },
});
