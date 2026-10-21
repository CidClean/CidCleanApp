import { StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { initials } from '@/lib/employeeRules';
import { useTheme } from '@/theme';

/** Círculo con las iniciales: 48px en el perfil (D-057) y 36px con texto de 13px en la lista (D-083). */
export function Avatar({ name, size = 48 }: { name: string; size?: 36 | 48 }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <AppText weight="medium" size={size === 36 ? 13 : 15}>
        {initials(name)}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center', borderWidth: 0.5 },
});
