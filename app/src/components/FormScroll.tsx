import { useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, ScrollView, StyleSheet, TextInput, View, type ScrollViewProps } from 'react-native';

/**
 * Contenedor de formulario que no queda bajo el teclado (D-229), en JS y sin módulos nativos nuevos.
 * Al abrirse el teclado mide cuánto tapa la pantalla (sirve igual si Android redimensiona la ventana o si dibuja de
 * borde a borde), agrega ese espacio al final para poder bajar hasta el botón Guardar, y desplaza la vista para que el
 * campo activo quede visible. Al tocar otro campo con el teclado abierto vuelve a revisar.
 */
export function FormScroll({ children, contentContainerStyle, onScroll, ...rest }: ScrollViewProps) {
  const scroll = useRef<{ scrollTo: (o: { y: number; animated?: boolean }) => void } | null>(null);
  type Measurable = { measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => void };
  const frame = useRef<Measurable | null>(null);
  const offset = useRef(0);
  const keyboardTop = useRef<number | null>(null);
  const [extra, setExtra] = useState(0);

  function ensureVisible() {
    const kbTop = keyboardTop.current;
    if (kbTop === null) return;
    frame.current?.measureInWindow((_x, y, _w, h) => {
      setExtra(Math.max(0, y + h - kbTop));
      const input = TextInput.State.currentlyFocusedInput() as unknown as Measurable | null;
      input?.measureInWindow?.((_ix, iy, _iw, ih) => {
        const visibleBottom = Math.min(y + h, kbTop) - 24;
        if (iy + ih > visibleBottom) scroll.current?.scrollTo({ y: offset.current + (iy + ih - visibleBottom), animated: true });
        else if (iy < y + 8) scroll.current?.scrollTo({ y: Math.max(0, offset.current - (y + 8 - iy)), animated: true });
      });
    });
  }

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => {
      keyboardTop.current = e.endCoordinates.screenY;
      // En iOS el evento llega antes de la animación: se espera a que la vista se acomode.
      setTimeout(ensureVisible, Platform.OS === 'ios' ? 250 : 50);
    });
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => {
      keyboardTop.current = null;
      setExtra(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const base = StyleSheet.flatten(contentContainerStyle) ?? {};
  const bottom = (typeof base.paddingBottom === 'number' ? base.paddingBottom : typeof base.padding === 'number' ? base.padding : 0) + extra;

  return (
    <View ref={frame as never} style={styles.fill} collapsable={false}>
      <ScrollView
        ref={scroll as never}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        {...rest}
        onScroll={(e) => {
          offset.current = e.nativeEvent.contentOffset.y;
          onScroll?.(e);
        }}
        // Tocar otro campo con el teclado abierto: se revisa otra vez cuando ya tiene el foco.
        onTouchEnd={() => {
          if (keyboardTop.current !== null) setTimeout(ensureVisible, 150);
        }}
        contentContainerStyle={[base, { paddingBottom: bottom }]}
      >
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
