import { Icon } from './Icon';
import { useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { iconStrokeWidth, radius, useTheme } from '@/theme';

const KNOB_WIDTH = 42;
const TRACK_PADDING = 3;

/**
 * Pista deslizable de 48px con perilla de marca (D-049). Llama a `onComplete` al llegar al final.
 * Hoy no se muestra: solo va con la tarjeta de la visita de hoy y todavía no hay visitas (etapa 4).
 */
export function SlideToMark({ label, onComplete, onBrand = false }: { label: string; onComplete: () => void; onBrand?: boolean }) {
  const { colors, brand } = useTheme();
  const knobWidth = onBrand ? 44 : KNOB_WIDTH;
  const [trackWidth, setTrackWidth] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const travel = Math.max(0, trackWidth - knobWidth - (onBrand ? 12 : TRACK_PADDING * 2 + 2));
  const travelRef = useRef(0);
  travelRef.current = travel;
  const doneRef = useRef(onComplete);
  doneRef.current = onComplete;

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, g) => x.setValue(Math.min(Math.max(0, g.dx), travelRef.current)),
      onPanResponderRelease: (_, g) => {
        if (travelRef.current > 0 && g.dx >= travelRef.current * 0.85) doneRef.current();
        Animated.spring(x, { toValue: 0, useNativeDriver: false }).start();
      },
    }),
  ).current;

  return (
    <View
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
      style={onBrand ? styles.brandTrack : [styles.track, { borderColor: colors.fieldBorder }]}
    >
      <Animated.View
        {...pan.panHandlers}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[onBrand ? styles.brandKnob : [styles.knob, { backgroundColor: brand }], { transform: [{ translateX: x }] }]}
      >
        <Icon name={onBrand ? 'arrow-right' : 'logout'} size={onBrand ? 22 : 18} strokeWidth={iconStrokeWidth} color={onBrand ? brand : '#FFFFFF'} />
      </Animated.View>
      <AppText
        size={onBrand ? 15 : 14}
        weight={onBrand ? 'bold' : 'regular'}
        color={onBrand ? '#FFFFFF' : colors.secondary}
        center
        style={[styles.label, onBrand ? { left: 50 } : null]}
        pointerEvents="none"
      >
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 48,
    borderRadius: radius.control,
    borderWidth: 1,
    padding: TRACK_PADDING,
    flexDirection: 'row',
    alignItems: 'center',
  },
  knob: {
    width: KNOB_WIDTH,
    height: 40,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  label: { position: 'absolute', left: 0, right: 0 },
  // D-223 (muestra estilo C): sobre la tarjeta de marca, pista de 56px blanca al 18% con esquinas de 18px y perilla
  // blanca de 44px con esquinas de 14px y flecha de marca.
  brandTrack: { height: 56, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.18)', padding: 6, flexDirection: 'row', alignItems: 'center' },
  brandKnob: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', zIndex: 1 },
});
