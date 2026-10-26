import { View } from 'react-native';

import { AppText } from '@/components/AppText';
import { TitleHeader } from '@/components/bento/Header';
import { BrandMark } from '@/components/brand/BrandMark';
import { getPortalStrings } from '@/i18n/quotes';
import { useTheme } from '@/theme';

/** Raíz del portal sin enlace: solo pide abrir el enlace del correo (D-208). */
export default function PortalHome() {
  const { colors } = useTheme();
  const t = getPortalStrings('en');
  const es = getPortalStrings('es');
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Orden 33 (D-250): logo en el encabezado del portal. */}
      <TitleHeader title={t.brand} left={<BrandMark />} />
      <View style={{ padding: 16 }}>
        <AppText center>{t.home}</AppText>
        <AppText center color={colors.secondary} style={{ marginTop: 6 }}>
          {es.home}
        </AppText>
      </View>
    </View>
  );
}
