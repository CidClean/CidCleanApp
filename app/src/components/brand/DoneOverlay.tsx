import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
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
import Svg, { Defs, LinearGradient, Path, Stop, Circle } from 'react-native-svg';

import { LogoLayers } from './LogoLayers';

/**
 * "Listo" (orden 34, D-250; animaciones.html escena 2): anillo de progreso → logo → check con destellos. La muestra
 * dura 3.6 s; aquí la misma secuencia en 2.2 s (la orden pide 1.8–2.4 s) y un cierre de 150 ms. Se muestra al marcar
 * clock in y clock out, al enviar un quote y en el portal al aceptar. No bloquea nada: pointerEvents="none", y se
 * cierra solo. Con "reducir movimiento" solo aparece el check fijo y se va con un fundido.
 */

export const DONE_MS = 2200;
const CLOSE_MS = 150;
const REDUCED_MS = 1200;

type Listener = () => void;
const listeners = new Set<Listener>();

/** Muestra "Listo" (lo dibuja el DoneOverlayHost del layout raíz). */
export function showDone(): void {
  listeners.forEach((l) => l());
}

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** Una sola instancia, en el layout raíz. */
export function DoneOverlayHost() {
  const [run, setRun] = useState(0);
  useEffect(() => {
    const l = () => setRun((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  if (run === 0) return null;
  return <DoneOverlay key={run} onDone={() => setRun(0)} />;
}

export function DoneOverlay({ onDone }: { onDone: () => void }) {
  const reduced = useReducedMotion();
  const p = useSharedValue(reduced ? 1 : 0);
  const fade = useSharedValue(1);

  useEffect(() => {
    const finish = () => {
      fade.set(withTiming(0, { duration: CLOSE_MS }, (ok) => {
        if (ok) scheduleOnRN(onDone);
      }));
    };
    if (reduced) {
      const t = setTimeout(finish, REDUCED_MS);
      return () => clearTimeout(t);
    }
    p.set(withTiming(1, { duration: DONE_MS, easing: Easing.linear }, (ok) => {
      if (ok) scheduleOnRN(finish);
    }));
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const root = useAnimatedStyle(() => ({ opacity: fade.get() }));
  // Porcentajes de los keyframes de la muestra sobre el avance p (0..1).
  const ring = useAnimatedStyle(() => {
    const v = p.get();
    return {
      opacity: interpolate(v, [0, 0.3, 0.4, 1], [1, 1, 0, 0]),
      transform: [{ rotate: `${interpolate(v, [0, 0.3, 0.4], [0, 540, 600], 'clamp')}deg` }, { scale: interpolate(v, [0.3, 0.4], [1, 1.1], 'clamp') }],
    };
  });
  const logo = useAnimatedStyle(() => {
    const v = p.get();
    return {
      opacity: interpolate(v, [0, 0.32, 0.42, 0.62, 0.7, 1], [0, 0, 1, 1, 0, 0]),
      transform: [{ scale: interpolate(v, [0.32, 0.42, 0.62, 0.7], [0.7, 1, 1, 0.85], 'clamp') }],
    };
  });
  const ok = useAnimatedStyle(() => {
    const v = p.get();
    return {
      opacity: interpolate(v, [0.66, 0.76], [0, 1], 'clamp'),
      transform: [{ scale: interpolate(v, [0.66, 0.76, 0.82], [0.6, 1.06, 1], 'clamp') }],
    };
  });
  const check = useAnimatedProps(() => ({ strokeDashoffset: interpolate(p.get(), [0.74, 0.88], [60, 0], 'clamp') }));
  const spark = useAnimatedStyle(() => {
    const v = p.get();
    return {
      opacity: interpolate(v, [0.78, 0.86, 1], [0, 1, 0.9], 'clamp'),
      transform: [{ scale: interpolate(v, [0.78, 0.86, 1], [0.4, 1.1, 1], 'clamp') }],
    };
  });

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.scrim, root]} testID="done-overlay">
      <View style={styles.card} accessible accessibilityRole="alert" accessibilityLabel="Done">
        <View style={styles.stage}>
          {reduced ? null : (
            <>
              <Animated.View testID="done-ring" style={[styles.ring, ring]} />
              <Animated.View style={[styles.abs, logo]}>
                <LogoLayers size={120} />
              </Animated.View>
            </>
          )}
          <Animated.View style={[styles.abs, ok]}>
            <Svg width={130} height={130} viewBox="0 0 130 130">
              <Defs>
                <LinearGradient id="ccDoneOk" x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0" stopColor="#2FB8AE" />
                  <Stop offset="1" stopColor="#0F766E" />
                </LinearGradient>
              </Defs>
              <Circle cx={65} cy={65} r={65} fill="#2FB8AE" fillOpacity={0.15} />
              <Circle cx={65} cy={65} r={51} fill="url(#ccDoneOk)" />
              {/* Check de la muestra (viewBox 64, 64 px de ancho) centrado en el círculo. */}
              <AnimatedPath
                d="M16 33l11 11 22-24"
                transform="translate(33 33)"
                fill="none"
                stroke="#FFFFFF"
                strokeWidth={8}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={[60, 60]}
                animatedProps={check}
                {...(reduced ? { strokeDashoffset: 0 } : null)}
              />
            </Svg>
          </Animated.View>
          {reduced
            ? null
            : SPARKS.map((s, i) => (
                <Animated.Text key={i} style={[styles.spark, s.style, { fontSize: s.size }, spark]}>
                  ✦
                </Animated.Text>
              ))}
        </View>
      </View>
    </Animated.View>
  );
}

const SPARKS = [
  { size: 26, style: { top: 4, right: 6 } },
  { size: 18, style: { bottom: 14, left: 4 } },
  { size: 14, style: { top: 40, right: -6 } },
];

const styles = StyleSheet.create({
  // D-200: tarjeta blanca de 24 px sobre un velo suave, al centro de la pantalla.
  scrim: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(30,42,40,0.18)', zIndex: 1000, elevation: 1000 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 20 },
  stage: { width: 200, height: 200, alignItems: 'center', justifyContent: 'center' },
  abs: { position: 'absolute' },
  ring: { position: 'absolute', width: 150, height: 150, borderRadius: 75, borderWidth: 12, borderColor: '#BFE9E4', borderTopColor: '#2FB8AE', borderRightColor: '#2FB8AE' },
  spark: { position: 'absolute', color: '#2FB8AE' },
});
