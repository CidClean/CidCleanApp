// Sitio de cidclean.com (D-307, D-309). Salida 100% estática; Vercel sirve los .html con cleanUrls (site/vercel.json).
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://www.cidclean.com',
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'file', inlineStylesheets: 'always' },
  // Sin scripts en línea: la CSP de site/vercel.json usa script-src 'self'.
  vite: { build: { assetsInlineLimit: 0 } },
  devToolbar: { enabled: false },
});
