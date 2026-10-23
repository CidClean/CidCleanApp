import { AppField } from '../AppField';
import type { ClientsStrings } from '@/i18n/clients';

export type ClientForm = { name: string; phone: string; email: string; address: string; notes: string };
export const emptyClientForm: ClientForm = { name: '', phone: '', email: '', address: '', notes: '' };

/** Datos de la empresa del Cliente (D-210): nombre, teléfono, email, dirección y notas. */
export function ClientFields({ form, onChange, c, nameError }: { form: ClientForm; onChange: (f: ClientForm) => void; c: ClientsStrings; nameError: boolean }) {
  const set = (k: keyof ClientForm) => (v: string) => onChange({ ...form, [k]: v });
  return (
    <>
      <AppField label={c.client.name} value={form.name} onChangeText={set('name')} autoCapitalize="words" error={nameError ? c.client.errorName : null} />
      <AppField label={c.client.phone} value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
      <AppField label={c.client.email} value={form.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" />
      <AppField label={c.client.address} value={form.address} onChangeText={set('address')} />
      <AppField label={c.client.notes} value={form.notes} onChangeText={set('notes')} multiline textAlignVertical="top" style={{ minHeight: 72 }} />
    </>
  );
}
