import { AppField } from './AppField';
import { formatPhoneInput } from '@/lib/phone';

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Texto de error debajo (D-061); lo pone la pantalla al guardar si el teléfono no es válido. */
  error?: string | null;
  onBlur?: () => void;
};

/** Campo Teléfono (D-216): teclado de teléfono y formato "(239) 555-0142" mientras se escribe. */
export function PhoneField({ label, value, onChange, error, onBlur }: Props) {
  return (
    <AppField
      label={label}
      value={value}
      onChangeText={(v) => onChange(formatPhoneInput(v))}
      keyboardType="phone-pad"
      autoComplete="tel"
      textContentType="telephoneNumber"
      placeholder="(239) 555-0142"
      maxLength={14}
      error={error}
      onBlur={onBlur}
    />
  );
}
