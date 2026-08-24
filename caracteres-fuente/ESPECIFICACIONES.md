# Qué falta por construir

Estado a 24 de agosto de 2026.

El núcleo lógico está hecho y probado (`src/lib/`, 56 pruebas pasando).
**Faltan las pantallas.** `src/main.jsx` es hoy solo un armazón: pantalla de
PIN y poco más. No debe publicarse hasta terminar lo de abajo.

La versión que funciona y está publicada es la **v7** (`referencia/v7.html`).
Sirve como referencia de todas las pantallas que ya existían y que hay que
reconstruir: registrar, entradas, personas, guía, más, ajustes, revisiones.

---

## 1. El problema que originó todo esto

En la v7 había dos sitios donde meter lo mismo y el usuario no sabía cuál
usar: una entrada de tipo "Me dijeron" en **Entradas**, y un adjetivo suelto
en **Personas → Yo**.

No estaban duplicados, eran dos capas (prueba y conclusión), pero la app no
lo explicaba y además permitía escribir conclusiones sin ninguna prueba
detrás. Eso es justo lo que la herramienta existe para evitar.

**La regla que resuelve esto y que gobierna todo el diseño nuevo:**

> Lo que otros dicen de ti no se escribe a mano en ningún sitio.
> Se registra como entrada y el perfil se calcula solo.

---

## 2. Registrar: adjetivos sugeridos, no elegidos a mano

Hoy, al registrar un "Me dijeron", el usuario tiene que buscar el adjetivo
en el léxico él mismo.

**Lo que debe hacer:** el usuario escribe la frase que le dijeron, y la app
propone entre 3 y 5 adjetivos del léxico que encajan, para que él marque
los que quiera. Puede marcar varios, ninguno, o añadir otro a mano.

El motor ya existe en la v7 — busca la función que recibe una conducta
descrita y devuelve adjetivos de la lista. Hay que portarla y conectarla al
formulario. La llamada a la API usa `claude-sonnet-4-6` con la clave que el
usuario guarda en Ajustes.

Campos que la entrada debe seguir guardando: quién lo dijo, cuándo
(con opción de fecha pasada), el contexto (**En discusión / En calma /
Delante de otros**) y la frase literal.

---

## 3. Personas → "Yo": cuatro apartados

Dos que rellena el usuario:

- **En condiciones normales** — lo que él cree de sí mismo
- **En tensión** — lo que él cree de sí mismo bajo presión

Dos que **NO se pueden rellenar a mano**, calculados desde las entradas:

- **Lo que me dicen (en calma)**
- **Lo que me dicen (en caliente)**

Los dos últimos son los importantes. Cada adjetivo debe mostrar quién lo
dijo, cuándo, y en qué contexto. El contexto decide el apartado: "En
discusión" va a *en caliente*; el resto va a *en calma*.

Ya implementado en `src/lib/perfil.js` → `loQueMeDicen()`. La pantalla solo
tiene que pintarlo. Un adjetivo dicho por dos o más personas distintas viene
marcado como `consolidado: true` — debe destacarse visualmente.

**Se elimina** el botón de añadir adjetivos sueltos a mano sin evidencia.

---

## 4. Mi ideal: lista libre

Además de los tres frentes abiertos que ya existen (situación → respuesta
objetivo), el usuario quiere una lista **sin límite** de adjetivos que le
gustaría integrar en sí mismo.

Ya implementado: `miIdeal()`, `ponerEnIdeal()`, `quitarDelIdeal()`.

---

## 5. Panel de estadísticas

Todas implementadas en `src/lib/estadisticas.js` (función `panel()`).
Falta la pantalla.

**Quién eres**
1. `consenso` — adjetivos por número de personas distintas que los dicen
2. `puntoCiego` — lo que dicen varios y el usuario no reconoce
3. `espejismo` — lo que el usuario se atribuye y nadie ha dicho
4. `brechaTension` — adjetivos que solo aparecen discutiendo

**Cómo te comportas**
5. `rocesPorPersona` y `concentracion` — si los roces se concentran en una
   sola relación, el problema es esa relación, no el carácter
6. `temas` — sobre qué se discute de verdad
7. `respuestas` — reparto de cómo responde, y su evolución
8. `tendencia` — **importante, ver abajo**
9. `balance` — ratio aciertos/roces
10. `planes` — qué planes si→entonces funcionan
11. `saturacion` — si ya no aparece nada nuevo, el retrato está hecho

### La trampa del denominador

`tendencia` NO cuenta roces absolutos: mide **qué proporción de lo
registrado son roces**. Si el usuario registra más de todo, el recuento
sube y parecería que discute más sin haber cambiado nada.

Esto no es un detalle de implementación: es la diferencia entre una
estadística que informa y una que le hace sacar una conclusión falsa sobre
sí mismo. No sustituir por recuentos absolutos.

Con menos de 4 entradas al mes devuelve `concluyente: false`. Respetarlo en
la pantalla: si no es concluyente, decir que faltan datos, no dibujar una
tendencia igualmente.

### Equilibrio del panel

Debe mostrar también aciertos, rachas y adjetivos positivos con consenso.
Una herramienta que solo enseña defectos acaba en el cajón, y además miente
por omisión.

---

## 6. Apartado de estudio

Los 278 adjetivos, ordenados y navegables, con menús desplegables:
dimensión → polo → familia → adjetivo, con su definición y su frase de
"Se ve:".

Datos en `src/data/lexico.json`. 7 dimensiones, 15 polos, 36 familias.

---

## 7. Anki (repetición espaciada)

Ya implementado en `src/lib/estudio.js`. Falta la pantalla.

**Formato de la pregunta**, tal como lo pidió el usuario:

> Categoría: *mente y curiosidad* · Familia: *agudeza*
> Se ve: *desmonta el aparato aunque ya haya comprado el nuevo*
> → tres botones: **curioso · inquieto intelectualmente · ávido**

Las opciones falsas salen **siempre de la misma familia**. Distinguir
"curioso" de "ávido" enseña; distinguir "curioso" de "tacaño" no enseña
nada. Ya garantizado por `montarPregunta()`.

Cajas de Leitner: aciertas y la palabra tarda más en volver (0, 1, 2, 4, 7,
15, 30 días); fallas y vuelve al día siguiente. Las más falladas se repiten
más — ya lo hace `siguienteTanda()`.

Estadísticas de estudio: `resumenEstudio()` y `masFalladas()`.

El progreso se guarda en `config` y **no debe romper las copias antiguas**:
una copia sin historial de estudio simplemente empieza de cero.

---

## 8. Copias de seguridad (ya hecho, no romper)

- Archivo cifrado con el PIN, extensión **`.txt`** — Android no permite
  compartir `.json`
- Se comparte por el menú de Android para guardarlo en Drive
- Al importar se aceptan los tres formatos que han existido
- Aviso a pantalla completa al acumular N cambios sin respaldar
  (ajustable: 3 / 5 / 10 / 20, por defecto 5)

**Los apartados de "lo que me dicen" se calculan, no se guardan.** Por eso
una copia antigua los reconstruye sin haberlos guardado nunca.

### Bug ya corregido en la v7 — no repetirlo

El aviso a pantalla completa llevaba un botón "Guardar copia ahora" que
navegaba a la pantalla de exportar, pero **la ventana seguía cumpliendo su
condición y se quedaba encima tapándolo todo**. Parecía que el botón no
hacía nada.

Cualquier aviso modal necesita un interruptor de sesión que lo cierre al
pulsar, además de la condición de datos.

---

## 9. Cómo trabajar

- El usuario **no tiene formación en programación**. Explicar cada paso:
  qué se está haciendo y por qué, en lenguaje llano.
- **Preguntar antes de escribir o reescribir código**, explicando primero
  qué se va a cambiar.
- Nunca editar `dist/index.html` a mano: se regenera con `npm run build`.
- Lanzar `npm test` después de cada cambio.
- El usuario valora la franqueza por encima de la cortesía. Si algo está
  mal planteado, decírselo.
