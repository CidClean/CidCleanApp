# Sitio web (cidclean.com)

Sitio nuevo de cidclean.com (D-307, D-308, D-309). Copia visual aprobada: `../surveys/sitio-web-aprobado.html`.

- Objetivo: posicionamiento en buscadores en Naples, Bonita Springs, Estero y Marco Island. Solo inglés. Solo limpieza comercial.
- Visual: dirección A "Luz de Naples" (fondo `#FBF6EF`, verde `#0F766E`, Manrope). Animaciones 3D hechas con Higgsfield (agua, superficies, espacios limpios), sin mascota.
- Páginas: las de D-309 (inicio, estimador, 5 servicios, 4 ciudades, about, contact, blog). Las páginas legales y `/delete-account` siguen como están (D-282).
- Afirmaciones permitidas: asegurado (general liability) y productos eco-friendly. No se dice "bonded" ni "background-checked" (D-310). Redes: Instagram, Facebook y LinkedIn con los enlaces de D-312 (sin TikTok).
- Sin reseñas ni testimonios inventados. Sin dirección física, solo "Naples, FL". Cid Clean ya tiene perfil de Google Business.
- Estimador: tarifas y fórmula de D-309, editables por el Super Admin en Ajustes de la app; el sitio usa siempre las vigentes. El rango se muestra después de dejar nombre, correo y teléfono, y siempre dice que es un estimado.
- Cada estimado: lead nuevo en Leads de la app, aviso a info@cidclean.com y correo al cliente con su estimado.

- Publicado el 2026-11-11 en el proyecto de Vercel `cidclean-portal` (dominio principal `www.cidclean.com`; `cidclean.com` redirige a www, así que las URL canónicas usan www). Se publica construido (`vercel build` + `vercel deploy --prebuilt --prod`) desde una carpeta sin historial de git, porque el plan gratis de Vercel rechaza despliegues cuyo autor de commit no es del equipo. Vista previa sin indexar: cidclean-site.pages.dev.
- Google Search Console: propiedad `https://www.cidclean.com/` verificada con etiqueta HTML (en `site/src/layouts/Base.astro`; no se borra) y sitemap enviado el 2026-11-11.
