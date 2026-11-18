import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { AppText } from './AppText';
import { useStrings } from '@/i18n/useStrings';
import { initials } from '@/lib/employeeRules';
import { useSession } from '@/lib/session';
import { useTheme } from '@/theme';

/**
 * Avatar de las pantallas principales (D-337 (4), muestra navegacion-aprobado): círculo de marca de 44px con las
 * iniciales; un toque abre "Mi cuenta" desde cualquier pestaña.
 */
export function AccountButton() {
  const router = useRouter();
  const { brand } = useTheme();
  const strings = useStrings();
  const { profile } = useSession();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={strings.account.open}
      onPress={() => router.push('/account')}
      style={[styles.avatar, { backgroundColor: brand }]}
    >
      <AppText weight="bold" color="#FFFFFF">
        {initials(profile?.fullName ?? '')}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
