// Direcciones (D-301): la misma línea única que la app (app/src/lib/address.ts) y la base (format_address):
// "calle, dirección 2, City, ST ZIP" con lo que haya. Sin llaves ni secretos.

export type PartesDireccion = {
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
};

export function lineaDireccion(a: PartesDireccion): string {
  const t = (v: string | null | undefined) => (v ?? '').trim();
  if (!t(a.addressLine1) && !t(a.addressLine2) && !t(a.city) && !t(a.zip)) return '';
  const estadoZip = [t(a.state), t(a.zip)].filter(Boolean).join(' ');
  return [t(a.addressLine1), t(a.addressLine2), t(a.city), estadoZip].filter(Boolean).join(', ');
}

/** Línea de un objeto con partes (walkthrough, filas de la base) o, si no las tiene, su texto `address`. */
export function direccionDe(o: (PartesDireccion & { address?: string | null }) | null | undefined): string {
  if (!o) return '';
  return lineaDireccion(o) || (o.address ?? '').trim();
}
