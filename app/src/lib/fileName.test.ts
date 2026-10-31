import { cleanPart, extensionOf, periodPart, readableFileName } from './fileName';

describe('nombres legibles de los archivos (D-296)', () => {
  it('arma el formato con las partes que haya', () => {
    expect(readableFileName(['Quote Q-0012 v2', 'Naples Yacht Club'], 'pdf')).toBe('Cid Clean - Quote Q-0012 v2 - Naples Yacht Club.pdf');
    expect(readableFileName(['W-9', 'Estela Medina'], 'pdf')).toBe('Cid Clean - W-9 - Estela Medina.pdf');
    expect(readableFileName(['Schedule', null, periodPart('2026-10-26', '2026-11-01')], 'pdf')).toBe('Cid Clean - Schedule - 2026-10-26 a 2026-11-01.pdf');
    expect(readableFileName(['Gastos', '', periodPart('2026-10', '2026-10')], 'csv')).toBe('Cid Clean - Gastos - 2026-10.csv');
  });

  it('quita los caracteres que rompen nombres y deja los acentos', () => {
    expect(cleanPart('a/b\\c:d*e?f"g<h>i|j')).toBe('a b c d e f g h i j');
    expect(readableFileName(['Resumen', 'José Núñez', '2026'], 'pdf')).toBe('Cid Clean - Resumen - José Núñez - 2026.pdf');
    expect(readableFileName(['Walkthrough', 'A/B Corp: Main'], 'pdf')).toBe('Cid Clean - Walkthrough - A B Corp Main.pdf');
    expect(readableFileName(['..'], 'pdf')).toBe('Cid Clean.pdf');
  });

  it('no repite "Cid Clean", limita el largo y la extensión', () => {
    expect(readableFileName(['Cid Clean · Términos'], 'pdf')).toBe('Cid Clean - Términos.pdf');
    expect(readableFileName(['x'.repeat(400)], 'pdf').length).toBeLessThanOrEqual(154);
    expect(readableFileName(['Doc'], '../exe')).toBe('Cid Clean - Doc.pdf');
    expect(readableFileName(['Foto'], 'JPG')).toBe('Cid Clean - Foto.jpg');
    expect(extensionOf('Cid Clean - W-9.pdf')).toBe('pdf');
  });
});
