import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { AppText } from '../AppText';
import { CardBlock } from '../bento/Card';
import { ListRow } from '../ListRow';
import { useEmailTemplatesStrings } from '@/i18n/useEmailTemplatesStrings';
import { useSalesStrings } from '@/i18n/useSalesStrings';
import type { TemplateEntity } from '@/lib/emailTemplates';
import { fetchEmailLog, type EmailLogEntry } from '@/lib/emailTemplatesApi';
import { formatDateTime } from '@/lib/leadRules';
import { sample, useTheme } from '@/theme';

/**
 * Lista "Correos enviados" del lead o del cliente: la línea de tiempo de los correos con plantilla
 * y los recordatorios automáticos del quote (fecha, plantilla y quién, D-321 (5)). D-200: lista compacta de 5.
 * Orden 132 (D-332 (5)): el botón "Enviar correo" se eliminó; el correo se abre con "Correo" de la tarjeta principal.
 */
export function SendEmailBlock({ kind, id }: { kind: TemplateEntity; id: string }) {
  const t = useEmailTemplatesStrings();
  const s = useSalesStrings();
  const { colors } = useTheme();
  const [log, setLog] = useState<EmailLogEntry[]>([]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void fetchEmailLog(kind, id).then((r) => {
        if (!cancelled && r.ok) setLog(r.data.slice(0, 5));
      });
      return () => {
        cancelled = true;
      };
    }, [kind, id]),
  );

  return (
    <View style={{ marginTop: 12 }}>
      {log.length > 0 ? (
        <>
          <AppText size={sample.labelSize} color={colors.secondary} style={{ marginTop: 2, marginBottom: 2 }}>
            {t.logTitle}
          </AppText>
          <CardBlock>
            {log.map((e, i) => (
              <ListRow
                key={`${e.at}-${i}`}
                title={e.action === 'quote_recordatorio' ? t.reminder(e.template) : (e.template ?? t.send)}
                detail={t.logLine(formatDateTime(new Date(e.at), s), e.actor)}
                last={i === log.length - 1}
              />
            ))}
          </CardBlock>
        </>
      ) : null}
    </View>
  );
}
