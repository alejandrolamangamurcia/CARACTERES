# Caracteres — notas para cualquier sesión de Claude Code en este repo

## ⚠️ IMPORTANTE: cómo publicar cambios (NO uses `git add`/`git commit`/`git push` normales)

Este directorio de trabajo **no es un checkout git normal**. La rama local `master`
no tiene commits propios (`git log` da "does not have any commits yet") y el índice
está en un estado heredado y roto (entradas `AD` con prefijo `caracteres-fuente/`
que no reflejan los archivos reales). Un `git add -A && git commit && git push`
normal **fallará silenciosamente, se rechazará como non-fast-forward, o creará un
commit sin relación con `origin/main`** — y parecerá que ha funcionado sin haberlo
hecho. Esto ya ha pasado más de una vez.

**El despliegue real va directo a `origin/main` (GitHub Pages) mediante plumbing
de bajo nivel**, sin tocar el índice/working tree roto:

```bash
# 1. Verifica el estado real y actualiza la referencia remota
git fetch origin --quiet
git log origin/main --oneline -3

# 2. Construye un árbol nuevo a partir de origin/main, sustituyendo:
#    - el subárbol "caracteres-fuente/" por el contenido actual de ESTE directorio
#      (todo excepto node_modules, dist, .git, .claude)
#    - "index.html" (raíz del árbol) por el dist/index.html recién compilado
#    - "sw.js" se deja tal cual (no hay fuente local que lo edite)
export GIT_INDEX_FILE=/tmp/caracteres_idx
rm -f "$GIT_INDEX_FILE"
git read-tree origin/main
git rm -r --cached --quiet caracteres-fuente
while IFS= read -r f; do
  rel="${f#./}"
  blob=$(git hash-object -w "$f")
  git update-index --add --cacheinfo 100644,"$blob","caracteres-fuente/$rel"
done < <(find . -path ./node_modules -prune -o -path ./dist -prune -o -path ./.git -prune -o -path ./.claude -prune -o -type f -print)
blob_index_html=$(git hash-object -w dist/index.html)
git update-index --cacheinfo 100644,"$blob_index_html",index.html
tree=$(git write-tree)

# 3. Crea el commit con origin/main como padre (nunca la rama local master)
commit=$(git commit-tree "$tree" -p $(git rev-parse origin/main) -m "Mensaje del cambio")

# 4. Push directo del commit-object a main (Bash suele fallar aquí: usa PowerShell)
git push origin "$commit":main
```

**El `git push` necesita una terminal real interactiva** (Git Credential Manager
abre un popup de navegador para OAuth). Si falla con `could not read Username...
/dev/tty`, repite el mismo `git push` desde PowerShell en vez de Bash.

## Antes de cada push: build y versión

1. `npm test` (o `npx vitest run`) — todo en verde antes de tocar nada más.
2. Sube en 1 el número de `VERSION` (texto plano, p. ej. `v21` → `v22`). Se
   incrusta en el bundle vía `define` de esbuild y se muestra en la pantalla de
   PIN de la app — sirve para confirmar que un despliegue concreto llegó a
   producción.
3. `npm run build` genera `dist/index.html` (minificado). `npm run dev` genera
   una versión sin minificar, útil para depurar en el navegador.
4. Tras el push, confirma el despliegue real (GitHub Pages puede tardar o
   quedarse "queued" — si tarda más de 1-2 min, un commit vacío con el mismo
   árbol suele desatascarlo):
   ```bash
   git fetch origin --quiet
   git show origin/main:index.html | grep -o "Cargando Caracteres[^<]*"
   curl -s https://alejandrolamangamurcia.github.io/CARACTERES/ | grep -o "Cargando Caracteres[^<]*"
   ```

## Estructura del repo (por qué el "árbol nuevo" del paso 2 tiene esa forma)

El repo real en GitHub (`origin/main`) tiene, en su raíz:
- `caracteres-fuente/` — el código fuente (coincide con el contenido de ESTE
  directorio de trabajo, sin el prefijo).
- `index.html` y `sw.js` — el bundle ya compilado que sirve GitHub Pages.

Es decir: este directorio de trabajo **es** `caracteres-fuente/`, pero el árbol
remoto lo anida un nivel más y añade los artefactos de build al lado.

## Otras notas

- PWA sin backend: toda la app (React + esbuild) se empaqueta en un único
  `dist/index.html` autocontenido. Cifrado local con PIN (PBKDF2 + AES-GCM,
  `src/lib/vault.js`) — los datos nunca salen del dispositivo sin cifrar.
- La IA (sugerir adjetivos, buscar patrones) llama directo a la API de Claude
  desde el navegador con una clave que el usuario guarda cifrada en Ajustes
  (`src/lib/ia.js`). No hay servidor propio.
- Filosofía de diseño (de `ESPECIFICACIONES.md`): los adjetivos de una persona
  (incluido "Yo") **nunca se escriben a mano** en un resumen — se derivan de
  entradas registradas (`src/lib/perfil.js`). No rompas ese patrón añadiendo
  campos de adjetivo editables directamente en una vista calculada.
