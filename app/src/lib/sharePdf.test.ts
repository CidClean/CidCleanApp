import { printTitle, withTitle } from './sharePdf';

jest.mock('expo', () => ({ requireOptionalNativeModule: () => null }));

describe('exportes en la web (D-319 7, D-296)', () => {
  it('el PDF guardado lleva el nombre legible como título', () => {
    expect(printTitle('Cid Clean - Schedule - 2026-10-26 a 2026-11-01.pdf')).toBe('Cid Clean - Schedule - 2026-10-26 a 2026-11-01');
    expect(withTitle('<html><head><title>x</title></head><body>a</body></html>', 'Cid Clean - P&L')).toContain('<title>Cid Clean - P&amp;L</title>');
    expect(withTitle('<html><head><style></style></head><body></body></html>', 'T')).toContain('<head><title>T</title>');
    expect(withTitle('<p>a</p>', 'T')).toMatch(/^<!doctype html><html><head><meta charset="utf-8"><title>T<\/title>/);
  });
});
