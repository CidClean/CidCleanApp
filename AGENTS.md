# Reglas del repositorio

Estas reglas son obligatorias para toda persona o AI que lea o modifique este repositorio. Son la única fuente de estas reglas.

## Antes de actuar

Lee `README.md`, `current/` y `decisions.md`. No trabajes de memoria ni a partir de conversaciones antiguas.

## Reglas

1. **Lo vigente manda.** `current/` es la única fuente de verdad. Si algo en `archive/`, en una decisión reemplazada o en una conversación contradice `current/`, gana `current/`.
2. **Lo reemplazado nunca se aplica.** No uses valores, formatos ni criterios que una decisión posterior reemplazó, aunque aparezcan en documentos antiguos. Esto incluye lo que escribas: no produzcas nada con una versión reemplazada.
3. **Cambiar es reemplazar.** Cuando una decisión cambia, en un mismo commit:
    - agrega la decisión nueva en `decisions.md`, indicando a cuál reemplaza;
    - marca la anterior como **Reemplazada**;
    - actualiza `current/`;
    - mueve la versión vieja a `archive/` con su fecha.
4. **Una sola fuente por tema.** No dupliques el mismo contenido en dos archivos de `current/`.
5. **No inventes decisiones.** Solo se registran en `decisions.md` y `current/` las decisiones que el dueño del proyecto dijo o confirmó. Las propuestas sin confirmar no entran.
6. **No borres `archive/`.** Lo reemplazado se conserva.
7. **Ante un conflicto o una duda, pregunta al dueño.** No elijas por tu cuenta entre dos versiones.
8. **Registrar antes de construir.** Toda elección aprobada por el dueño se guarda en el mismo turno en que la aprueba, con valores exactos (hex, px, nombres de fuente, opciones elegidas) en `surveys/` y `decisions.md`. Si la elección es visual, se guarda también una copia visual en HTML de lo aprobado. Se le muestra al dueño el commit como prueba.
9. **No se construye lo que no está registrado.** Antes de construir cualquier pantalla o componente, se compara contra el repositorio. Si falta una elección, se pregunta; nunca se decide por el dueño.
