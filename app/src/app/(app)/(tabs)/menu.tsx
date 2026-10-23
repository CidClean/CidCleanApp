import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { CardBlock } from '@/components/bento/Card';
import { ListRow } from '@/components/ListRow';
import { SignOutDialog } from '@/components/SignOutDialog';
import { TopBar } from '@/components/TopBar';
import { useStrings } from '@/i18n/useStrings';
import { usePermissions } from '@/lib/session';
import { visibleMenuItems, type MenuKey } from '@/lib/visibility';
import { useTheme } from '@/theme';

/** Menú (D-134): solo las filas que la persona tiene permiso de ver; al final, Cerrar sesión (D-222). */
export default function MenuScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const strings = useStrings();
  const { access } = usePermissions();
  const items = visibleMenuItems(access);
  const [confirming, setConfirming] = useState(false);

  function open(key: MenuKey) {
    if (key === 'profile') router.push('/profile');
    else if (key === 'employees') router.push('/employees');
    else if (key === 'settings') router.push('/settings');
    else if (key === 'history') router.push('/history');
    else router.push({ pathname: '/section/[key]', params: { key } });
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar title={strings.nav.menu} />
      <ScrollView contentContainerStyle={{ padding: 12 }}>
        <CardBlock>
        {items.map((key, i) => (
          <ListRow
            key={key}
            title={strings.nav[key]}
            chevron
            onPress={() => open(key)}
          />
        ))}
        {/* D-222 a: Cerrar sesión al final del Menú, con la ventana al centro. */}
        <ListRow title={strings.profile.signOut} last onPress={() => setConfirming(true)} />
        </CardBlock>
      </ScrollView>
      <SignOutDialog visible={confirming} onClose={() => setConfirming(false)} />
    </View>
  );
}
