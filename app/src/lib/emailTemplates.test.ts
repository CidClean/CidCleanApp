import {
  buildEmail,
  buildEmailHtml,
  buildMailto,
  FOOTER_CLIENT,
  FOOTER_PROSPECT,
  initialValues,
  insertAt,
  missingFields,
  usedPlaceholders,
  validateTemplate,
  type TemplateContext,
} from './emailTemplates';

const body =
  "Hi {nombre},\n\nI'm reaching out from Cid Clean, a commercial cleaning company here in Naples. We clean offices, medical offices, showrooms and warehouses on the schedule that suits each business, usually after hours.\n\nIf you'd like, I can visit {dirección} for a free 30-minute walkthrough and send you an exact quote. Would that be useful?\n\n{firma}";
const ctx: TemplateContext = {
  company: 'Superior Pool Products',
  address: '280 Commercial Blvd',
  contacts: [{ name: 'Armando Zerquera', email: 'armando.zerquera@poolcorp.com', address: '280 Commercial Blvd' }],
  sender: { name: 'Humberto Villiva', phone: '(786) 250-1324' },
};

describe('plantillas de correo (orden 120)', () => {
  it('llena como la vista previa del survey, con el pie A al final', () => {
    const v = initialValues(ctx, ctx.contacts[0]);
    const e = buildEmail({ subject: 'Commercial cleaning for {empresa}', body, audience: 'prospect' }, v);
    expect(e.subject).toBe('Commercial cleaning for Superior Pool Products');
    expect(e.body.startsWith('Hi Armando,\n\n')).toBe(true);
    expect(e.body).toContain('I can visit 280 Commercial Blvd for a free 30-minute walkthrough');
    expect(e.body).toContain('Would that be useful?\n\nHumberto Villiva\nCid Clean LLC | Commercial Cleaning\n(786) 250-1324 | cidclean.com\n\n______________________________\n\n');
    expect(e.body.endsWith('Privacy Policy: cidclean.com/privacy')).toBe(true);
    const html = buildEmailHtml({ subject: 'S', body, audience: 'prospect' }, v);
    expect(html).toContain('font-size:11px');
    expect(html).toContain('This message is an advertisement from Cid Clean LLC.');
  });

  it('pie A con los textos del abogado (D-323 (3))', () => {
    for (const s of [
      'you are receiving this email because your business is located in our service area'.replace(/^y/, 'Y'),
      'This message is an advertisement from Cid Clean LLC.',
      '3727 Milano Lakes Cir, Naples, FL 34114',
      'info@cidclean.com',
      '(786) 250-1324',
      'Don\'t want these emails? Reply with "UNSUBSCRIBE". We will remove you within 10 business days.',
      'Privacy Policy: cidclean.com/privacy',
    ])
      expect(FOOTER_PROSPECT).toContain(s);
  });

  it('pie C a clientes: mensaje de servicio de la cuenta', () => {
    const e = buildEmail({ subject: 'S', body: 'B', audience: 'client' }, initialValues(ctx, null));
    expect(e.body.endsWith(FOOTER_CLIENT.split('\n')[1])).toBe(true);
    expect(FOOTER_CLIENT).toContain('This is a service message about your account with Cid Clean LLC.');
    expect(FOOTER_CLIENT).not.toContain('advertisement');
  });

  it('marca lo que falta solo si la plantilla lo usa', () => {
    const v = initialValues({ ...ctx, address: null, sender: { name: 'Humberto', phone: null } }, { name: null, email: null, address: null });
    expect(missingFields(usedPlaceholders('Closing the loop', 'Hi {nombre},\n{firma}'), v)).toEqual(['nombre', 'telefono']);
    expect(missingFields(usedPlaceholders('x {empresa}', 'visit {dirección}'), v)).toEqual(['dirección']);
  });

  it('mailto con to, subject y body codificados', () => {
    const url = buildMailto('ana@x.com', 'Hi & bye', 'Line 1\nLine 2');
    expect(url).toBe('mailto:ana@x.com?subject=Hi%20%26%20bye&body=Line%201%0D%0ALine%202');
  });

  it('inserta en el cursor y sin cursor al final', () => {
    expect(insertAt('Hi ,', { start: 3, end: 3 }, 'nombre')).toEqual({ text: 'Hi {nombre},', cursor: 11 });
    expect(insertAt('Hi', null, 'firma').text).toBe('Hi{firma}');
    expect(insertAt('Hi XX!', { start: 3, end: 5 }, 'empresa').text).toBe('Hi {empresa}!');
  });

  it('valida nombre, asunto y texto', () => {
    expect(validateTemplate({ name: ' ', audience: 'client', subject: '', body: 'x', active: true })).toEqual({ name: true, subject: true });
  });
});
