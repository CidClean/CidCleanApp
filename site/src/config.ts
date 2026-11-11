// Datos del negocio que se muestran en el sitio (D-249, D-309, D-310).
// googleBusinessUrl y social se llenan cuando el dueño pase los enlaces; vacíos no se muestran.
export const SITE = {
  url: 'https://cidclean.com',
  name: 'Cid Clean',
  legalName: 'Cid Clean LLC',
  phone: '(786) 250-1324',
  phoneHref: 'tel:+17862501324',
  phoneIntl: '+1-786-250-1324',
  email: 'info@cidclean.com',
  city: 'Naples, FL',
  // Estimador: Edge Function pública site-estimate (orden 91). Las tarifas viven en la base, no aquí.
  estimateEndpoint: 'https://noammaqhtdfgbheeiugo.supabase.co/functions/v1/site-estimate',
  googleBusinessUrl: '',
  social: {
    instagram: '',
    facebook: '',
    tiktok: '',
    linkedin: '',
  } as Record<string, string>,
};

export const CITIES = ['Naples', 'Bonita Springs', 'Estero', 'Marco Island'] as const;

export function socialLinks(): { name: string; url: string }[] {
  const names: Record<string, string> = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', linkedin: 'LinkedIn' };
  return Object.entries(SITE.social)
    .filter(([, url]) => url.trim() !== '')
    .map(([k, url]) => ({ name: names[k] ?? k, url }));
}
