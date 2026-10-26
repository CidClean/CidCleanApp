import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { LogoLayers } from './LogoLayers';

const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);
const PERIOD = 1600; // animaciones.html escena 1: bob y spin de 1.6 s

/**
 * "Cargando" (orden 34, D-250; animaciones.html escena 1): la gota flota y un arco gira alrededor, en bucle, mientras
 * una pantalla carga sus datos. Solo transform en el hilo de la interfaz. Con "reducir movimiento" el logo queda fijo.
 */
export function BrandLoading({ size = 72, center = true, label = 'Loading' }: { size?: number; center?: boolean; label?: string }) {
  const reduced = useReducedMotion();
  const spin = useSharedValue(0);
  const bob = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    spin.set(withRepeat(withTiming(1, { duration: PERIOD, easing: Easing.linear }), -1, false));
    bob.set(withRepeat(withTiming(1, { duration: PERIOD / 2, easing: EASE_IN_OUT }), -1, true));
    return () => {
      cancelAnimation(spin);
      cancelAnimation(bob);
    };
  }, [reduced, spin, bob]);

  const arcStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.get() * 360}deg` }] }));
  // 12 px de 160 en la muestra.
  const dropStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -bob.get() * size * 0.075 }] }));
  const inset = Math.round(size * 0.11);

  return (
    <View
      style={center ? styles.center : styles.inline}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      testID="brand-loading"
    >
      <View style={{ width: size, height: size }}>
        {reduced ? null : (
          <Animated.View
            testID="brand-loading-arc"
            style={[
              styles.arc,
              { top: -inset, left: -inset, right: -inset, bottom: -inset, borderRadius: size, borderWidth: Math.max(2, size / 40) },
              arcStyle,
            ]}
          />
        )}
        <View style={StyleSheet.absoluteFill}>
          <LogoLayers size={size} layers={['letraC', 'letraD', 'olaPrincipal', 'olaClara']} />
        </View>
        <Animated.View style={[StyleSheet.absoluteFill, dropStyle]}>
          <LogoLayers size={size} layers={['gota']} />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  inline: { alignItems: 'center', paddingVertical: 32 },
  arc: { position: 'absolute', borderColor: 'transparent', borderTopColor: 'rgba(47,184,174,0.55)' },
});
