import { TimeField, type Clock } from '../PickerField';
import { useStrings } from '@/i18n/useStrings';
import { formatClock } from '@/lib/leadRules';

/** Campo de hora con la ventana de hora, minutos de 5 en 5 y AM / PM (D-216), en formato "10:00 AM". */
export function ClockField({ label, value, onChange, error }: { label: string; value: Clock | null; onChange: (v: Clock) => void; error?: string | null }) {
  const strings = useStrings();
  return (
    <TimeField
      label={label}
      value={value}
      onChange={onChange}
      format={(v) => formatClock(v.hours, v.minutes)}
      placeholder={strings.common.pickTime}
      strings={{ hour: strings.common.hour, minutes: strings.common.minutes, done: strings.common.done }}
      error={error}
    />
  );
}

export const clockOf = (d: Date): Clock => ({ hours: d.getHours(), minutes: d.getMinutes() });
