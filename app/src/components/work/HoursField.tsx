import { SelectField } from '../SelectField';
import { useWorkStrings } from '@/i18n/useWorkStrings';
import { formatMinutes, HOUR_STEPS, toQuarter } from '@/lib/scheduleRules';

/**
 * Duración en horas (D-231): selector de 0.25 h a 24 h en pasos de 0.25 h, en la ventana al centro (D-229). Guarda
 * minutos como texto ("90" = 1.5 h), igual que el campo que reemplaza.
 */
export function HoursField({ label, value, onChange }: { label: string; value: string; onChange: (minutes: string) => void }) {
  const t = useWorkStrings();
  const options = HOUR_STEPS.map((m) => ({ value: String(m), label: formatMinutes(m, t.hours) }));
  const n = Number(value);
  const current = Number.isFinite(n) && n > 0 ? String(toQuarter(n)) : '';
  return <SelectField label={label} options={options} value={current} onChange={onChange} />;
}
