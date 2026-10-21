import { PendingScreen } from '@/components/PendingScreen';
import { useStrings } from '@/i18n/useStrings';
import { usePermissions } from '@/lib/session';
import { visibleTabs } from '@/lib/visibility';

// TEMPORAL: reemplazar al construir Pipeline (leads, walkthroughs y quotes de Ventas, D-133)
export default function PipelineScreen() {
  const strings = useStrings();
  const { access } = usePermissions();
  return <PendingScreen title={strings.nav.pipeline} allowed={visibleTabs(access).includes('pipeline')} />;
}
