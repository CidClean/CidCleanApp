import { formatPhone, formatPhoneInput, isValidPhone, normalizePhone, phoneDigits } from './phone';

describe('teléfonos de EE. UU. (D-216)', () => {
  it('se muestran como (239) 555-0142', () => {
    expect(formatPhone('2395550142')).toBe('(239) 555-0142');
    expect(formatPhone('239-555-0142')).toBe('(239) 555-0142');
    expect(formatPhone('+1 239 555 0142')).toBe('(239) 555-0142');
    expect(formatPhone(null)).toBe('');
    // Un dato viejo que no se puede leer se muestra tal cual.
    expect(formatPhone('ext 12')).toBe('ext 12');
  });

  it('10 dígitos; el 1 del país sobra; vacío vale (es opcional)', () => {
    expect(isValidPhone('(239) 555-0142')).toBe(true);
    expect(isValidPhone('1 239 555 0142')).toBe(true);
    expect(isValidPhone('')).toBe(true);
    expect(isValidPhone('239555014')).toBe(false);
    expect(isValidPhone('23955501421')).toBe(false);
    expect(isValidPhone('(039) 555-0142')).toBe(false);
    expect(isValidPhone('(239) 055-0142')).toBe(false);
    expect(phoneDigits('12395550142')).toBe('2395550142');
  });

  it('se formatea mientras se escribe y se guarda formateado', () => {
    expect(formatPhoneInput('2')).toBe('(2');
    expect(formatPhoneInput('2395')).toBe('(239) 5');
    expect(formatPhoneInput('2395550')).toBe('(239) 555-0');
    expect(formatPhoneInput('239555014299')).toBe('(239) 555-0142');
    expect(formatPhoneInput('')).toBe('');
    expect(normalizePhone('239.555.0142')).toBe('(239) 555-0142');
    expect(normalizePhone('  ')).toBe('');
  });
});
