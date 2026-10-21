import {
  IconBuilding,
  IconHome,
  IconLayoutKanban,
  IconMenu2,
} from '@tabler/icons-react-native';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useStrings } from '@/i18n/useStrings';
import { usePermissions } from '@/lib/session';
import { visibleTabs, type TabKey } from '@/lib/visibility';
import { iconStrokeWidth, useTheme } from '@/theme';

/** Iconos de la barra inferior (D-135, Tabler, trazo 1.5px). */
const ICONS = {
  pipeline: IconLayoutKanban, // layout-kanban
  accounts: IconBuilding, // building
  home: IconHome, // home
  menu: IconMenu2, // menu-2
} as const;

/** Nombre de cada ruta de la barra: coincide con TabKey. */
const ROUTE_TO_TAB: Record<string, TabKey> = {
  pipeline: 'pipeline',
  accounts: 'accounts',
  index: 'home',
  menu: 'menu',
};

/**
 * Barra inferior (D-029, D-132, D-169): solo iconos, el destino activo en color de marca y el resto en el secundario.
 * Solo aparecen los destinos permitidos.
 */
export function BottomBar({ state, emitter, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { colors, brand } = useTheme();
  const strings = useStrings();
  const { access } = usePermissions();
  const allowed = visibleTabs(access);

  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: 10 + insets.bottom },
      ]}
    >
      {allowed.map((tab) => {
        const index = state.routes.findIndex((r) => ROUTE_TO_TAB[r.name] === tab);
        if (index < 0) return null;
        const route = state.routes[index];
        const focused = state.index === index;
        const Icon = ICONS[tab];
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
            style={styles.item}
          >
            <Icon size={24} strokeWidth={iconStrokeWidth} color={focused ? brand : colors.secondary} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 10,
    paddingHorizontal: 12,
    borderTopWidth: 0.5,
  },
  item: { minWidth: 48, minHeight: 32, alignItems: 'center', justifyContent: 'center' },
});
