"""Arma las páginas públicas de los textos legales (D-282) en app/public/, que la exportación web copia tal cual.

Uso: python3 legal/rev3/web/build.py  (desde la raíz del repositorio). Fuente: los .md de esta carpeta, con el texto
exacto de legal/rev3/*.pdf, sin la marca de borrador y con la fecha de publicación que eligió el dueño (2026-10-30).
"""
import html
import pathlib

import markdown

RAIZ = pathlib.Path(__file__).resolve().parents[3]
AQUI = pathlib.Path(__file__).resolve().parent
SALIDA = RAIZ / 'app' / 'public'

PAGINAS = [
    ('privacy.md', 'privacy', 'Privacy Policy'),
    ('terms-staff.md', 'terms/staff', 'Staff App Terms & Conditions'),
    ('terms-client-portal.md', 'terms/client-portal', 'Client Portal Terms'),
    ('delete-account.md', 'delete-account', 'Delete your account'),
]

ESTILO = """
:root{--bg:#FBF6EF;--card:#FFFFFF;--fg:#1E2A28;--sc:#6B5F52;--bd:#E8DCC9;--b:#0F766E;--head:#F6EFE6}
@media (prefers-color-scheme:dark){:root{--bg:#0E1312;--card:#18201F;--fg:#EEF2F1;--sc:#A9B5B2;--bd:#2A3533;--b:#4FB8AC;--head:#1F2928}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font-family:Manrope,system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.6;font-size:16px}
header{max-width:860px;margin:0 auto;padding:24px 16px 8px;display:flex;align-items:center;gap:10px}
header img{width:40px;height:40px}
header a{color:var(--b);font-weight:800;font-size:20px;text-decoration:none}
main{max-width:860px;width:calc(100% - 24px);margin:0 auto 32px;padding:24px 20px;background:var(--card);border-radius:24px}
@media (min-width:700px){main{padding:36px 44px}}
h1{font-size:28px;line-height:1.25;margin:0 0 12px}
h2{font-size:20px;margin:32px 0 8px}
h3{font-size:17px;margin:24px 0 6px}
p,li{color:var(--fg)}
main>p:nth-of-type(1),main>p:nth-of-type(2){color:var(--sc);font-size:14px;margin:4px 0}
a{color:var(--b)}
ul,ol{padding-left:22px}
.t{overflow-x:auto;margin:12px 0}
table{border-collapse:collapse;width:100%;font-size:14px;min-width:520px}
th,td{border:1px solid var(--bd);padding:8px 10px;text-align:left;vertical-align:top}
th{background:var(--head)}
footer{max-width:860px;margin:0 auto;padding:0 16px 32px;color:var(--sc);font-size:13px}
footer a{margin-right:14px}
"""

ENLACES = [('/privacy', 'Privacy Policy'), ('/terms/staff', 'Staff App Terms'), ('/terms/client-portal', 'Client Portal Terms'),
           ('/delete-account', 'Delete your account')]


def pagina(titulo: str, cuerpo: str) -> str:
    cuerpo = cuerpo.replace('<table>', '<div class="t"><table>').replace('</table>', '</table></div>')
    pie = ''.join(f'<a href="{u}">{html.escape(t)}</a>' for u, t in ENLACES)
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(titulo)} · Cid Clean</title>
<link rel="icon" href="/favicon.ico">
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>{ESTILO}</style></head>
<body><header><img src="https://noammaqhtdfgbheeiugo.supabase.co/storage/v1/object/public/brand/logo-192.png" alt=""><a href="https://cidclean.com">Cid Clean</a></header>
<main>{cuerpo}</main>
<footer><p>{pie}</p><p>Cid Clean LLC · 3727 Milano Lakes Cir, Naples, FL 34114 · info@cidclean.com · (786) 250-1324</p></footer>
</body></html>
"""


def main() -> None:
    for fuente, ruta, titulo in PAGINAS:
        texto = (AQUI / fuente).read_text(encoding='utf-8')
        cuerpo = markdown.markdown(texto, extensions=['tables'])
        destino = SALIDA / ruta / 'index.html'
        destino.parent.mkdir(parents=True, exist_ok=True)
        destino.write_text(pagina(titulo, cuerpo), encoding='utf-8')
        print('escrito', destino.relative_to(RAIZ))


if __name__ == '__main__':
    main()
