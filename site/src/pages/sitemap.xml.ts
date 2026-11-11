// sitemap.xml con todas las páginas públicas (sin /404).
import type { APIRoute } from 'astro';
import { SERVICES } from '../data/services';
import { LOCATIONS } from '../data/locations';
import { POSTS } from '../data/posts';

export const GET: APIRoute = () => {
  const base = 'https://cidclean.com';
  const paths = ['', '/estimate', ...SERVICES.map((s) => `/services/${s.slug}`), ...LOCATIONS.map((l) => `/locations/${l.slug}`), '/about', '/contact', '/blog', ...POSTS.map((p) => `/blog/${p.slug}`)];
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map((p) => `  <url><loc>${base}${p}</loc></url>`).join('\n')}\n</urlset>\n`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml' } });
};
