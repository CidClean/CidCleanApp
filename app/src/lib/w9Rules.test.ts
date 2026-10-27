import { addressText, classificationText, cleanW9, emptyW9, formatTin, maskTin, tinDigits, tinValid, w9Errors } from './w9Rules';

const base = { ...emptyW9('Karina López'), address: '1520 Golden Gate Pkwy', city: 'Naples, FL 34105' };

describe('número del W-9 (SSN, ITIN, EIN)', () => {
  test('SSN: 9 dígitos, no empieza con 9, 000 ni 666, sin grupo 00 ni serie 0000', () => {
    expect(tinValid('ssn', '123-45-6789')).toBe(true);
    expect(tinValid('ssn', '123456789')).toBe(true);
    for (const bad of ['12345678', '1234567890', '923456789', '000456789', '666456789', '123006789', '123450000', '12a456789']) {
      expect(tinValid('ssn', bad)).toBe(false);
    }
  });
  test('ITIN: 9 dígitos y empieza con 9', () => {
    expect(tinValid('itin', '900-70-0000')).toBe(true);
    expect(tinValid('itin', '123-45-6789')).toBe(false);
    expect(tinValid('itin', '9007')).toBe(false);
  });
  test('EIN: 9 dígitos y no empieza con 00', () => {
    expect(tinValid('ein', '12-3456789')).toBe(true);
    expect(tinValid('ein', '00-3456789')).toBe(false);
  });
  test('solo dígitos, hasta 9', () => {
    expect(tinDigits('12a-34 56789999')).toBe('123456789');
  });
  test('máscara al escribir: 123-45-6789 y 12-3456789', () => {
    expect(formatTin('ssn', '123')).toBe('123');
    expect(formatTin('ssn', '1234')).toBe('123-4');
    expect(formatTin('ssn', '123456789')).toBe('123-45-6789');
    expect(formatTin('itin', '912345678')).toBe('912-34-5678');
    expect(formatTin('ein', '12')).toBe('12');
    expect(formatTin('ein', '123456789')).toBe('12-3456789');
  });
  test('máscara oculta como la muestra (•••-••-4821): solo los últimos 4', () => {
    expect(maskTin('ssn', '123454821')).toBe('•••-••-4821');
    expect(maskTin('ein', '123456789')).toBe('••-•••6789');
    expect(maskTin('ssn', '1234')).toBe('123-4');
    expect(maskTin('ssn', '')).toBe('');
  });
});

describe('datos del W-9 (D-257, D-258)', () => {
  test('con nombre, dirección y ciudad se puede enviar', () => {
    expect(w9Errors(base)).toEqual([]);
  });
  test('faltan nombre, dirección o ciudad', () => {
    expect(w9Errors({ ...base, name: ' ', address: '', city: '' })).toEqual(['name', 'address', 'city']);
  });
  test('LLC pide la letra; Other pide el texto', () => {
    expect(w9Errors({ ...base, classification: 'llc' })).toEqual(['llc']);
    expect(w9Errors({ ...base, classification: 'llc', llc: 'S' })).toEqual([]);
    expect(w9Errors({ ...base, classification: 'other' })).toEqual(['other']);
    expect(w9Errors({ ...base, classification: 'other', other: 'Cooperative' })).toEqual([]);
  });
  test('línea 4: exempt payee del 1 al 13 y FATCA de la A a la M, con cualquier clasificación (D-258)', () => {
    expect(w9Errors({ ...base, exempt_payee: '13', fatca: 'm' })).toEqual([]);
    expect(w9Errors({ ...base, exempt_payee: '14' })).toEqual(['exempt']);
    expect(w9Errors({ ...base, fatca: 'Z' })).toEqual(['fatca']);
  });
  test('limpiar: la letra del LLC y Other solo con su clasificación; 3b, línea 4 y línea 7 siempre (D-258)', () => {
    const c = cleanW9({ ...base, llc: 'C', other: 'x', foreign_partners: true, exempt_payee: ' 5 ', fatca: 'a', accounts: ' A-1 ' });
    expect(c.llc).toBe('');
    expect(c.other).toBe('');
    expect(c.foreign_partners).toBe(true);
    expect(c.exempt_payee).toBe('5');
    expect(c.fatca).toBe('A');
    expect(c.accounts).toBe('A-1');
  });
  test('textos de la clasificación y la dirección', () => {
    expect(classificationText(base)).toBe('Individual/sole proprietor');
    expect(classificationText({ classification: 'llc', llc: 'P', other: '' })).toBe('LLC (P)');
    expect(classificationText({ classification: 'other', llc: '', other: 'Coop' })).toBe('Other: Coop');
    expect(addressText(base)).toBe('1520 Golden Gate Pkwy, Naples, FL 34105');
  });
});
