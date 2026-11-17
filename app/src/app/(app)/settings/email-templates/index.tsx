import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { AppAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { AppText } from '@/components/AppText';
import { CardBlock } from '@/components/bento/Card';
import { Chip } from '@/components/Chip';
import { ListRow } from '@/components/ListRow';
import { Tabs } from '@/components/Tabs';
import { TopBar } from '@/components/TopBar';
import { useEmailTemplatesStrings } from '@/i18n/useEmailTemplatesStrings';
import { useStrings } from '@/i18n/useStrings';
import { sortTemplates, type EmailTemplate, type TemplateAudience } from '@/lib/emailTemplates';
import { fetchTemplates } from '@/lib/emailTemplatesApi';
import { useGoBack } from '@/lib/navigation';
import { usePermissions } from '@/lib/session';
import { sample, useTheme } from '@/theme';

/**
 * Ajustes → Plantillas de correo (D-323 (2), surveys/plantillas-correo-aprobado.html): pestañas Prospectos / Clientes,
 * una fila por plantilla con su asunto y Activa / Inactiva, y "Nueva plantilla". Solo el Super Admin.
 */
export default function EmailTemplatesScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const { colors } = useTheme();
  const strings = useStrings();
  const t = useEmailTemplatesStrings();
  const { isSuperAdmin } = usePermissions();
  const [tab, setTab] = useState<TemplateAudience>('prospect');
  const [list, setList] = useState<EmailTemplate[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async (audience: TemplateAudience) => {
    setList(null);
    const r = await fetchTemplates(audience, false);
    setFailed(!r.ok);
    if (r.ok) setList(sortTemplates(r.data));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load(tab);
    }, [load, tab]),
  );

  if (!isSuperAdmin) return <Redirect href="/" />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar title={t.row} onBack={goBack} backLabel={strings.common.back} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16 }}>
        <Tabs
          tabs={[
            { key: 'prospect', label: t.tabProspects },
            { key: 'client', label: t.tabClients },
          ]}
          value={tab}
          onChange={setTab}
        />
        <View style={{ height: 12 }} />
        {failed ? <AppAlert tone="error" text={t.errorLoad} /> : null}
        {list && list.length === 0 ? (
          <AppText size={sample.noteSize} color={colors.secondary} style={{ marginBottom: 12 }}>
            {tab === 'prospect' ? t.emptyProspects : t.emptyClients}
          </AppText>
        ) : null}
        {list && list.length > 0 ? (
          <CardBlock>
            {list.map((x, i) => (
              <ListRow
                key={x.id}
                title={x.name}
                detail={x.subject}
                right={<Chip label={x.active ? t.active : t.inactive} tone={x.active ? 'success' : 'neutral'} />}
                last={i === list.length - 1}
                onPress={() => router.push({ pathname: '/settings/email-templates/edit', params: { id: x.id } })}
              />
            ))}
          </CardBlock>
        ) : null}
        {list ? (
          <View style={{ marginTop: 12 }}>
            <AppButton
              label={t.add}
              variant="outline"
              icon="plus"
              onPress={() => router.push({ pathname: '/settings/email-templates/edit', params: { audience: tab, sort: String(nextSort(list)) } })}
            />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function nextSort(list: EmailTemplate[]): number {
  return list.reduce((m, x) => Math.max(m, x.sort), 0) + 1;
}
