# Genera el logo embebido de los PDFs (orden 33, D-248, D-250) desde brand/cid-clean-simbolo-512.png, reducido a
# 256 px (sobra para 58 px de ancho en el PDF) para que pese poco:
#   - supabase/functions/_shared/logo.ts: LOGO_PNG_BASE64 (pdf-lib en send-quote y walkthrough-pdf)
#   - app/src/components/brand/logoDataUri.ts: LOGO_DATA_URI (HTML de los PDFs de la app: horario y Accounting)
# Uso, desde la raíz del repositorio: python3 supabase/scripts/generar-logo.py
import base64, io, pathlib
from PIL import Image

raiz = pathlib.Path(__file__).resolve().parents[2]
img = Image.open(raiz / 'brand/cid-clean-simbolo-512.png').convert('RGBA').resize((256, 256), Image.LANCZOS)
buf = io.BytesIO()
img.save(buf, 'PNG', optimize=True)
b64 = base64.b64encode(buf.getvalue()).decode()
aviso = '// GENERADO por supabase/scripts/generar-logo.py desde brand/cid-clean-simbolo-512.png (256 px). No editar a mano.\n'
(raiz / 'supabase/functions/_shared/logo.ts').write_text(aviso + f"export const LOGO_PNG_BASE64 = '{b64}';\n")
(raiz / 'app/src/components/brand/logoDataUri.ts').write_text(aviso + f"export const LOGO_DATA_URI = 'data:image/png;base64,{b64}';\n")
print(f'logo de {len(buf.getvalue())} bytes')

# Capas vectoriales del logo para las animaciones (orden 34, D-250), desde brand/cid-clean-simbolo-vector-transparente.svg:
#   - app/src/components/brand/logoPaths.ts: los 5 paths (letra-c, letra-d, gota, ola-principal, ola-clara), el largo
#     de cada letra (para trazarla con strokeDashoffset) y las olas partidas en números para ondularlas en un worklet.
import json, math, re

svg = (raiz / 'brand/cid-clean-simbolo-vector-transparente.svg').read_text()
paths = {m.group(1): m.group(2) for m in re.finditer(r'id="([a-z-]+)" d="([^"]+)"', svg)}
NUM = r'-?\d+(?:\.\d+)?'

def largo(d):
    total = 0.0
    for sub in re.split(r'(?=M)', d):
        n = [float(x) for x in re.findall(NUM, sub)]
        if len(n) < 2:
            continue
        x0, y0 = n[0], n[1]
        sx, sy = x0, y0
        i = 2
        while i + 5 < len(n) + 0:
            x1, y1, x2, y2, x3, y3 = n[i:i + 6]
            px, py = x0, y0
            for k in range(1, 21):
                t = k / 20
                u = 1 - t
                qx = u**3 * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t**3 * x3
                qy = u**3 * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t**3 * y3
                total += math.hypot(qx - px, qy - py)
                px, py = qx, qy
            x0, y0 = x3, y3
            i += 6
        total += math.hypot(sx - x0, sy - y0)  # Z
    return round(total, 1)

def partes(d):
    nums = [float(x) for x in re.findall(NUM, d)]
    texto = re.split(NUM, d)
    return {'parts': texto, 'nums': nums}

claves = {'letra-c': 'letraC', 'letra-d': 'letraD', 'gota': 'gota', 'ola-principal': 'olaPrincipal', 'ola-clara': 'olaClara'}
salida = aviso.replace('brand/cid-clean-simbolo-512.png (256 px)', 'brand/cid-clean-simbolo-vector-transparente.svg')
salida += '/* eslint-disable */\n'
salida += 'export const LOGO_PATHS = ' + json.dumps({claves[k]: v for k, v in paths.items()}) + ' as const;\n\n'
salida += '/** Largo aproximado de cada letra en unidades del viewBox (1024). */\n'
salida += 'export const LETTER_LENGTHS = ' + json.dumps({'letraC': largo(paths['letra-c']), 'letraD': largo(paths['letra-d'])}) + ' as const;\n\n'
salida += '/** Olas partidas: d = parts[0] + nums[0] + parts[1] + ...; los números van en pares (x, y), solo M, C y Z. */\n'
salida += 'export const WAVE_PARTS = ' + json.dumps({'olaPrincipal': partes(paths['ola-principal']), 'olaClara': partes(paths['ola-clara'])}) + ';\n'
(raiz / 'app/src/components/brand/logoPaths.ts').write_text(salida)
print('logoPaths.ts', {k: largo(paths[k]) for k in ('letra-c', 'letra-d')})
