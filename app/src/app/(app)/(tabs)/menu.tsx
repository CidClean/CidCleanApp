import { useRouter } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { ListRow } from '@/components/ListRow';
import { TopBar } from '@/components/TopBar';
import { useStrings } from '@/i18n/useStrings';
import { usePermissions } from '@/lib/session';
import { visibleMenuItems, type MenuKey } from '@/lib/visibility';
import { useTheme } from '@/theme';

/** Menú (D-134): solo las filas que la persona tiene permiso de ver. */
export default function MenuScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const strings = useStrings();
  const { access } = usePermissions();
  const items = visibleMenuItems(access);

  function open(key: MenuKey) {
    if (key === 'profile') router.push('/profile');
    else if (key === 'employees') router.push('/employees');
    else if (key === 'settings') router.push('/settings');
    else router.push({ pathname: '/section/[key]', params: { key } });
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar title={strings.nav.menu} />
      <ScrollView contentContainerStyle={{ padding: 12 }}>
        {items.map((key, i) => (
          <ListRow
            key={key}
            title={strings.nav[key]}
            chevron
            last={i === items.length - 1}
            onPress={() => open(key)}
          />
        ))}
      </ScrollView>
    </View>
  );
}
