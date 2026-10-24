import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { AppAlert } from '../AppAlert';
import { AppButton } from '../AppButton';
import { AppText } from '../AppText';
import { Chip } from '../Chip';
import { ListRow } from '../ListRow';
import { CardBlock } from '../bento/Card';
import { useQuoteStrings } from '@/i18n/useQuoteStrings';
import { money, shortDate, statusTone } from '@/lib/quoteRules';
import { createExtraQuote, fetchJobsiteExtras, type ExtraQuoteRow } from '@/lib/quotesApi';
import { usePermissions, useSession } from '@/lib/session';
import { sample, useTheme } from '@/theme';

/** Quién ve los quotes de extra del jobsite y quién los arma (los permisos del quote de siempre, D-238). */
export function extraQuoteAccess(can: (k: string) => boolean): { see: boolean; create: boolean } {
  return {
    see: can('quotes_ver') || can('quotes_editar') || can('quotes_enviar'),
    create: can('quotes_editar') && can('quotes_ver_precios'),
  };
}

/**
 * Quotes de extra del jobsite (D-238): cada uno con su versión, fecha del servicio, total (con ver precios) y estado;
 * el botón "Nuevo quote" (con permiso de armar quotes) abre el borrador sin enviar o crea uno nuevo.
 */
export function JobsiteExtras({ jobsiteId, terminated }: { jobsiteId: string; terminated: boolean }) {
  const router = useRouter();
  const { colors } = useTheme();
  const q = useQuoteStrings();
  const { locale } = useSession();
  const { can } = usePermissions();
  const access = extraQuoteAccess(can);
  const [rows, setRows] = useState<ExtraQuoteRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!access.see) return;
      let cancelled = false;
      void fetchJobsiteExtras(jobsiteId).then((r) => {
        if (!cancelled && r.ok) setRows(r.data);
      });
      return () => {
        cancelled = true;
      };
    }, [jobsiteId, access.see]),
  );

  if (!access.see) return null;

  async function onNew() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const r = await createExtraQuote(jobsiteId);
    setBusy(false);
    if (!r.ok) {
      setFailed(true);
      return;
    }
    router.push({ pathname: '/jobsites/[id]/quote/[quoteId]', params: { id: jobsiteId, quoteId: r.data } });
  }

  const list = rows ?? [];
  return (
    <View style={{ marginTop: 14 }}>
      <AppText size={sample.labelSize} color={colors.secondary} style={{ marginBottom: 2 }}>
        {q.extrasTitle}
      </AppText>
      {failed ? <AppAlert tone="error" text={q.errorNewExtra} /> : null}
      <CardBlock>
        {list.length === 0 ? (
          <AppText size={sample.noteSize} color={colors.secondary} style={{ paddingVertical: 12 }}>
            {q.noExtras}
          </AppText>
        ) : (
          list.map((r, i) => (
            <ListRow
              key={r.quoteId}
              title={q.extraRow(r.version)}
              detail={[r.serviceDate ? `${q.serviceDate}: ${shortDate(`${r.serviceDate}T12:00:00`, locale)}` : null, r.total !== null ? money(r.total) : null]
                .filter(Boolean)
                .join(' · ')}
              right={<Chip label={q.status[r.status]} tone={statusTone(r.status)} />}
              chevron
              last={i === list.length - 1}
              onPress={() => router.push({ pathname: '/jobsites/[id]/quote/[quoteId]', params: { id: jobsiteId, quoteId: r.quoteId } })}
            />
          ))
        )}
      </CardBlock>
      {access.create && !terminated ? <AppButton label={q.newExtra} variant="outline" icon="plus" onPress={() => void onNew()} disabled={busy} /> : null}
    </View>
  );
}
