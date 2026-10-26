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
