import type { APIRoute } from 'astro';
export const GET: APIRoute = () => new Response('User-agent: *\nAllow: /\n\nSitemap: https://www.cidclean.com/sitemap.xml\n', { headers: { 'Content-Type': 'text/plain' } });
