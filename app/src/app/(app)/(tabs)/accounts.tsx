import { PendingScreen } from '@/components/PendingScreen';
import { useStrings } from '@/i18n/useStrings';
import { usePermissions } from '@/lib/session';
import { visibleTabs } from '@/lib/visibility';

// TEMPORAL: reemplazar al construir Cuentas (lista de jobsites agrupada por cliente, D-133)
export default function AccountsScreen() {
  const strings = useStrings();
  const { access } = usePermissions();
  return <PendingScreen title={strings.nav.accounts} allowed={visibleTabs(access).includes('accounts')} />;
}
