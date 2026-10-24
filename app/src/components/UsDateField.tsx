import { DateField } from './PickerField';
import { useSalesStrings } from '@/i18n/useSalesStrings';
import { useStrings } from '@/i18n/useStrings';
import { dateFromKey, formatShortDate, formatUsDate, parseUsDate } from '@/lib/leadRules';

type Props = {
  label: string;
  /** "MM/DD/AAAA" o '' (el formato que guardan los formularios). */
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  /** Fecha opcional: muestra "Quitar fecha". */
  optional?: boolean;
  allowPast?: boolean;
};

/**
 * Fecha de un formulario con el calendario del mes en una hoja (D-216): nunca se escribe. Se muestra como
 * "Jue 24 oct" (con el año si no es el actual), igual que el seguimiento del lead.
 */
export function UsDateField({ label, value, onChange, error, optional = false, allowPast = false }: Props) {
  const s = useSalesStrings();
  const strings = useStrings();
  const key = parseUsDate(value);
  return (
    <DateField
      label={label}
      value={key === 'invalid' ? null : key}
      onChange={(k) => onChange(formatUsDate(k))}
      format={(k) => {
        const d = dateFromKey(k);
        const short = formatShortDate(d, s);
        return d.getFullYear() === new Date().getFullYear() ? short : `${short} ${d.getFullYear()}`;
      }}
      placeholder={optional ? strings.common.noDate : strings.common.pickDate}
      calendar={{ months: s.schedule.months, weekDays: s.schedule.weekDays, previousMonth: s.schedule.previousMonth, nextMonth: s.schedule.nextMonth }}
      clearLabel={optional ? strings.common.clearDate : undefined}
      error={error}
      allowPast={allowPast}
    />
  );
}

/** La misma fecha con el valor en AAAA-MM-DD (o null). La usan Accounting y la fecha del servicio del extra. */
export function KeyDateField({
  label,
  value,
  onChange,
  error,
  optional = false,
  allowPast = true,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  error?: string | null;
  optional?: boolean;
  allowPast?: boolean;
}) {
  const s = useSalesStrings();
  const strings = useStrings();
  return (
    <DateField
      label={label}
      value={value}
      onChange={onChange}
      format={(k) => {
        const d = dateFromKey(k);
        const short = formatShortDate(d, s);
        return d.getFullYear() === new Date().getFullYear() ? short : `${short} ${d.getFullYear()}`;
      }}
      placeholder={optional ? strings.common.noDate : strings.common.pickDate}
      calendar={{ months: s.schedule.months, weekDays: s.schedule.weekDays, previousMonth: s.schedule.previousMonth, nextMonth: s.schedule.nextMonth }}
      clearLabel={optional ? strings.common.clearDate : undefined}
      error={error}
      allowPast={allowPast}
    />
  );
}
