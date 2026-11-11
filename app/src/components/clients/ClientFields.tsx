import { AddressFields } from '../AddressFields';
import { AppField } from '../AppField';
import { PhoneField } from '../PhoneField';
import { useAddressStrings } from '@/i18n/useAddressStrings';
import { useStrings } from '@/i18n/useStrings';
import { addressErrors, emptyAddress, type AddressErrors, type AddressParts } from '@/lib/address';
import { isValidPhone, normalizePhone } from '@/lib/phone';
import type { ClientsStrings } from '@/i18n/clients';

export type ClientForm = AddressParts & { name: string; phone: string; email: string; notes: string };
export const emptyClientForm: ClientForm = { name: '', phone: '', email: '', ...emptyAddress(), notes: '' };

/** D-301: la dirección del cliente es opcional, pero si tiene algo va completa. */
export const clientAddressErrors = (f: ClientForm): AddressErrors => addressErrors(f, 'optional');

/** Datos de la empresa del Cliente (D-210): nombre, teléfono, email, dirección y notas. */
/** D-216: el teléfono es de EE. UU. con 10 dígitos; se guarda como (239) 555-0142. */
export const clientPhoneOk = (f: ClientForm) => isValidPhone(f.phone);
export const clientPayload = (f: ClientForm): ClientForm => ({ ...f, phone: normalizePhone(f.phone) });

export function ClientFields({ form, onChange, c, nameError, phoneError = false, addressErrors: addrErrors }: { form: ClientForm; onChange: (f: ClientForm) => void; c: ClientsStrings; nameError: boolean; phoneError?: boolean; addressErrors?: AddressErrors }) {
  const strings = useStrings();
  const addressT = useAddressStrings();
  const set = (k: keyof ClientForm) => (v: string) => onChange({ ...form, [k]: v });
  return (
    <>
      <AppField label={c.client.name} value={form.name} onChangeText={set('name')} autoCapitalize="words" error={nameError ? c.client.errorName : null} />
      <PhoneField label={c.client.phone} value={form.phone} onChange={set('phone')} error={phoneError ? strings.common.phoneError : null} />
      <AppField label={c.client.email} value={form.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" />
      <AddressFields form={form} onChange={onChange} t={addressT} errors={addrErrors} optional />
      <AppField label={c.client.notes} value={form.notes} onChangeText={set('notes')} multiline textAlignVertical="top" style={{ minHeight: 72 }} />
    </>
  );
}
