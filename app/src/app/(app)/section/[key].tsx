import { useLocalSearchParams } from 'expo-router';

import { PendingScreen } from '@/components/PendingScreen';
import { useStrings } from '@/i18n/useStrings';
import { usePermissions } from '@/lib/session';
import { visibleMenuItems, type MenuKey } from '@/lib/visibility';

// TEMPORAL: Schedule y Work, Accounting y Notificaciones aún no existen.
// Reemplazar cada una con su pantalla al construirla.
export default function SectionScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const strings = useStrings();
  const { access } = usePermissions();
  const menuKey = key as MenuKey;
  const allowed = menuKey !== 'profile' && menuKey !== 'employees' && menuKey !== 'settings' && menuKey !== 'history' && visibleMenuItems(access).includes(menuKey);
  return <PendingScreen title={allowed ? strings.nav[menuKey] : ''} allowed={allowed} back />;
}
