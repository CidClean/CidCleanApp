import { AppField } from '../AppField';
import { PhoneField } from '../PhoneField';
import { useStrings } from '@/i18n/useStrings';
import { isValidPhone, normalizePhone } from '@/lib/phone';
import type { ClientsStrings } from '@/i18n/clients';

export type ClientForm = { name: string; phone: string; email: string; address: string; notes: string };
export const emptyClientForm: ClientForm = { name: '', phone: '', email: '', address: '', notes: '' };

/** Datos de la empresa del Cliente (D-210): nombre, teléfono, email, dirección y notas. */
/** D-216: el teléfono es de EE. UU. con 10 dígitos; se guarda como (239) 555-0142. */
export const clientPhoneOk = (f: ClientForm) => isValidPhone(f.phone);
export const clientPayload = (f: ClientForm): ClientForm => ({ ...f, phone: normalizePhone(f.phone) });

export function ClientFields({ form, onChange, c, nameError, phoneError = false }: { form: ClientForm; onChange: (f: ClientForm) => void; c: ClientsStrings; nameError: boolean; phoneError?: boolean }) {
  const strings = useStrings();
  const set = (k: keyof ClientForm) => (v: string) => onChange({ ...form, [k]: v });
  return (
    <>
      <AppField label={c.client.name} value={form.name} onChangeText={set('name')} autoCapitalize="words" error={nameError ? c.client.errorName : null} />
      <PhoneField label={c.client.phone} value={form.phone} onChange={set('phone')} error={phoneError ? strings.common.phoneError : null} />
      <AppField label={c.client.email} value={form.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" />
      <AppField label={c.client.address} value={form.address} onChangeText={set('address')} />
      <AppField label={c.client.notes} value={form.notes} onChangeText={set('notes')} multiline textAlignVertical="top" style={{ minHeight: 72 }} />
    </>
  );
}
