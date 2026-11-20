import type { LeadSourcesStrings } from '@/i18n/leadSources';

/** Fuentes de leads (orden 163, D-350 (5)): reglas puras de la pantalla Mi cuenta → Lead sources. */

export type SourceKind = 'ads' | 'agent' | 'other';
export type EntersAs = 'potential' | 'cold';

export type LeadSourceItem = {
  id: string;
  name: string;
  kind: SourceKind;
  entersAs: EntersAs;
  active: boolean;
  /** Últimos 4 caracteres de la clave; null si todavía no tiene. La clave completa nunca se vuelve a leer. */
  keyLast4: string | null;
  leadCount: number;
};

/** Dirección del webhook: https://<proyecto>.supabase.co/functions/v1/lead-intake. */
export function intakeUrl(supabaseUrl: string | undefined): string {
  return `${(supabaseUrl ?? '').replace(/\/+$/, '')}/functions/v1/lead-intake`;
}

/** Línea gris de cada fuente: "Enters as Potential · via Make · 12 leads" / "Enters as Cold · not used yet". */
export function sourceLine(s: LeadSourceItem, t: LeadSourcesStrings): string {
  return [
    t.enters(s.entersAs === 'potential' ? t.potential : t.cold),
    s.kind === 'ads' ? t.viaMake : null,
    s.leadCount > 0 ? t.leads(s.leadCount) : t.notUsed,
  ]
    .filter(Boolean)
    .join(' · ');
}

export type NewSourceForm = { name: string; kind: SourceKind; entersAs: EntersAs };

/** Por defecto (D-348, D-200): un agente entra en frío; anuncios, potencial. */
export function defaultEntersAs(kind: SourceKind): EntersAs {
  return kind === 'ads' ? 'potential' : 'cold';
}

export function validateNewSource(f: NewSourceForm): { name?: true } {
  const n = f.name.trim();
  return n === '' || n.length > 60 ? { name: true } : {};
}
