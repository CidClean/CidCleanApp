import type { Locale } from './index';

/**
 * Textos de los campos de dirección (D-301): los mismos del formulario del empleado (D-264) en todos los formularios.
 * APROBADO = de la decisión citada; D-200 = detalle menor.
 */
export const addressEs = {
  address1: 'Dirección', // APROBADO (D-264, D-301)
  address2: 'Dirección 2', // APROBADO (D-264, D-301)
  state: 'State', // APROBADO (D-264, D-301)
  city: 'City', // APROBADO (D-264, D-301)
  zip: 'ZIP code', // APROBADO (D-264, D-301)
  noState: '—', // D-200 (opción para dejar State vacío donde la dirección es opcional)
  errorAddress1: 'Escribe la dirección.', // D-200
  errorCity: 'Escribe la ciudad.', // D-200
  errorState: 'Elige el estado.', // D-200
  errorZip: 'Escribe un ZIP code de 5 dígitos, por ejemplo 34105.', // D-200 (patrón de D-219, el mismo del empleado)
  needsReviewTitle: 'Completa la dirección.', // D-200 (D-301: "se marca para completar")
  needsReview: 'Falta separar City, State o ZIP code.', // D-200
  edit: 'Editar', // D-200
};

export type AddressStrings = typeof addressEs;

export const addressEn: AddressStrings = {
  address1: 'Address', // D-200 (translation of D-264)
  address2: 'Address 2', // D-200
  state: 'State', // D-264
  city: 'City', // D-264
  zip: 'ZIP code', // D-264
  noState: '—', // D-200
  errorAddress1: 'Enter the address.', // D-200
  errorCity: 'Enter the city.', // D-200
  errorState: 'Choose the state.', // D-200
  errorZip: 'Enter a 5-digit ZIP code, for example 34105.', // D-200
  needsReviewTitle: 'Complete the address.', // D-200
  needsReview: 'City, State, or ZIP code still needs to be filled in.', // D-200
  edit: 'Edit', // D-200
};

export function getAddressStrings(locale: Locale): AddressStrings {
  return locale === 'en' ? addressEn : addressEs;
}
