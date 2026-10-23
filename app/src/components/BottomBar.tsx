import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/Icon';
import { useStrings } from '@/i18n/useStrings';
import { usePermissions } from '@/lib/session';
import { visibleTabs, type TabKey } from '@/lib/visibility';
import { iconStrokeWidth, radius, useTheme } from '@/theme';

/** Iconos de la barra inferior (D-135, Tabler, trazo 1.5px). */
const ICONS: Record<TabKey, IconName> = {
  pipeline: 'layout-kanban',
  accounts: 'building',
  home: 'home',
  menu: 'menu-2',
};

/** Nombre de cada ruta de la barra: coincide con TabKey. */
const ROUTE_TO_TAB: Record<string, TabKey> = {
  pipeline: 'pipeline',
  accounts: 'accounts',
  index: 'home',
  menu: 'menu',
};

/**
 * Barra inferior (D-029, D-132, D-169; D-223): solo iconos, flotante, blanca con esquinas de 24px y 64px de alto; el
 * destino activo en un cuadro de marca de 48px con esquinas de 16px e icono blanco. Solo los destinos permitidos.
 */
export function BottomBar({ state, emitter, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { colors, brand } = useTheme();
  // El margen alrededor de la barra flotante lleva el fondo crema de la pantalla.
  const strings = useStrings();
  const { access } = usePermissions();
  const allowed = visibleTabs(access);

  return (
    <View style={{ backgroundColor: colors.background, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 + insets.bottom }}>
    <View style={[styles.bar, { backgroundColor: colors.card }]}>
      {allowed.map((tab) => {
        const index = state.routes.findIndex((r) => ROUTE_TO_TAB[r.name] === tab);
        if (index < 0) return null;
        const route = state.routes[index];
        const focused = state.index === index;
                return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityLabel={strings.nav[tab]}
            accessibilityState={{ selected: focused }}
            onPress={() => {
              const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigateToTab(route.key);
            }}
            style={[styles.item, focused ? { backgroundColor: brand } : null]}
          >
            <Icon name={ICONS[tab]} size={24} strokeWidth={iconStrokeWidth} color={focused ? '#FFFFFF' : colors.navInactive} />
          </Pressable>
        );
      })}
    </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 64,
    borderRadius: radius.card,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  item: { width: 48, height: 48, borderRadius: radius.tile, alignItems: 'center', justifyContent: 'center' },
});
