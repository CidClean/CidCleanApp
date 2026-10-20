# Cid Clean App

App para Cid Clean, compañía de limpieza comercial en Naples, Florida. Este repositorio es el registro y la memoria del proyecto: qué se decidió, qué está vigente y qué quedó atrás.

## Estructura

| Ruta | Contenido |
| --- | --- |
| `current/` | Solo la versión vigente de cada documento. Es la única fuente de verdad. |
| `archive/` | Lo que fue reemplazado, con su fecha. Se conserva, pero no se usa. |
| `decisions.md` | Registro de decisiones con fecha, estado y a cuál reemplazan. |
| `surveys/` | Respuestas de los surveys visual y de seguridad. |

## Reglas

1. **Lo vigente manda.** Si algo en `archive/` o en una decisión reemplazada contradice `current/`, gana `current/`.
2. **Cambiar es reemplazar.** Cuando una decisión cambia, en un mismo cambio: se registra la decisión nueva en `decisions.md` (indicando cuál reemplaza), se marca la anterior como reemplazada, se actualiza `current/` y la versión vieja pasa a `archive/`.
3. **Lo reemplazado nunca se aplica.** Una decisión reemplazada no se vuelve a usar, aunque aparezca en documentos o conversaciones antiguas.
4. **Una sola fuente por tema.** No se duplica el mismo contenido en dos archivos de `current/`.

## Estado

Flujo completo definido (`current/flujo.md`). Siguiente: survey visual, survey de seguridad y, al final, arquitectura.
