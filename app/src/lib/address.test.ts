import {
  addressBody,
  addressErrors,
  addressFromRow,
  cityStateZipLine,
  emptyAddress,
  formatAddressLine,
  parseAddress,
  partsFromTwoLines,
} from './address';

/** D-301: misma composición y mismas reglas que format_address y parse_us_address (supabase/tests/direcciones.sql). */
describe('Direcciones (D-301)', () => {
  test('una línea "calle, dirección 2, City, ST ZIP"', () => {
    expect(formatAddressLine({ addressLine1: '1250 Pine Ridge Rd', addressLine2: 'Suite 202', city: 'Naples', state: 'FL', zip: '34108' }))
      .toBe('1250 Pine Ridge Rd, Suite 202, Naples, FL 34108');
    expect(formatAddressLine({ addressLine1: ' 10 Main St ', city: 'Naples', state: 'FL' })).toBe('10 Main St, Naples, FL');
    expect(formatAddressLine(emptyAddress())).toBe('');
  });

  test('separa el texto libre cuando reconoce ciudad, estado y ZIP', () => {
    expect(parseAddress('1250 Pine Ridge Rd Suite 202, Naples, FL 34108')).toEqual({
      parts: { addressLine1: '1250 Pine Ridge Rd', addressLine2: 'Suite 202', city: 'Naples', state: 'FL', zip: '34108' },
      needsReview: false,
    });
    expect(parseAddress('10 Palm Ave,  Naples FL 34102-1234, USA').parts).toEqual({
      addressLine1: '10 Palm Ave', addressLine2: '', city: 'Naples', state: 'FL', zip: '34102-1234',
    });
    expect(parseAddress('9 Bay St, Marco Island, Florida 34145').parts.state).toBe('FL');
  });

  test.each([
    ['sin ZIP', '100 Main St, Naples, FL'],
    ['sin ciudad', '20 Bay St FL 34102'],
    ['estado que no existe', '1 Main St, Naples, XX 34102'],
    ['texto raro', 'Frente al Publix, local 3 (preguntar por Ana)'],
  ])('%s: todo en Dirección y para revisar', (_c, text) => {
    const r = parseAddress(text);
    expect(r.needsReview).toBe(true);
    expect(r.parts.addressLine1).toBe(text);
    expect([r.parts.city, r.parts.zip]).toEqual(['', '']);
  });

  test('errores: obligatoria y completa; opcional vacía vale; ZIP 5 o 5+4', () => {
    expect(addressErrors(emptyAddress(), 'required')).toEqual({ addressLine1: true, city: true, zip: true });
    expect(addressErrors(emptyAddress(), 'optional')).toEqual({});
    expect(addressErrors({ ...emptyAddress(), addressLine1: '1 A St' }, 'optional')).toEqual({ city: true, zip: true });
    expect(addressErrors({ ...emptyAddress(), zip: '3410' }, 'partial')).toEqual({ zip: true });
    expect(addressErrors({ addressLine1: '1 A St', addressLine2: '', city: 'Naples', state: 'FL', zip: '34102-0001' }, 'required')).toEqual({});
  });

  test('cuerpo para la base con la línea de compatibilidad; sin calle no hay State', () => {
    expect(addressBody({ addressLine1: '1 A St', addressLine2: '', city: 'Naples', state: 'FL', zip: '34102' })).toEqual({
      address_line1: '1 A St', address_line2: '', city: 'Naples', state: 'FL', zip: '34102', address: '1 A St, Naples, FL 34102',
    });
    expect(addressBody(emptyAddress())).toMatchObject({ state: '', address: '' });
  });

  test('desde la fila: partes, línea y marca; sin columnas nuevas se separa aquí', () => {
    const r = addressFromRow({ address: 'x', address_line1: '1 A St', city: 'Naples', state: 'FL', zip: '34102', address_needs_review: false });
    expect(r.line).toBe('1 A St, Naples, FL 34102');
    expect(addressFromRow({ address: '200 Main St, Naples' })).toMatchObject({ line: '200 Main St, Naples', needsReview: true });
  });

  test('líneas 5 y 6 del W-9 ida y vuelta', () => {
    const p = partsFromTwoLines('1520 Golden Gate Pkwy, Apt 4', 'Naples, FL 34105');
    expect(p).toEqual({ addressLine1: '1520 Golden Gate Pkwy', addressLine2: 'Apt 4', city: 'Naples', state: 'FL', zip: '34105' });
    expect(cityStateZipLine(p)).toBe('Naples, FL 34105');
    expect(cityStateZipLine(emptyAddress())).toBe('');
  });
});
