# Caracteres

Registro personal de rasgos de carácter. App web que funciona sin conexión,
con los datos cifrados en el propio móvil con un PIN.

## Cómo se trabaja

    npm install        una sola vez
    npm test           ejecuta todas las pruebas
    npm run build      genera dist/index.html (lo que se publica)
    npm run dev        igual pero sin minimizar, para poder leerlo

Lo que se sube a GitHub Pages es **dist/index.html** más **sw.js**.

## Qué hay en cada sitio

    src/data/lexico.json      278 adjetivos: 7 dimensiones, 36 familias
    src/data/constantes.json  contextos, tipos de entrada, textos de la guía
    src/lib/vault.js          cifrado con PIN y guardado local
    src/lib/backup.js         copias de seguridad y aviso por cantidad
    src/lib/perfil.js         el perfil "Yo" y sus cuatro apartados
    src/lib/estadisticas.js   consenso, punto ciego, patrones de roce
    src/lib/estudio.js        repetición espaciada sobre el léxico
    src/main.jsx              arranque y pantallas
    src/estilos.css           diseño
    src/cabecera.html         plantilla HTML (manifiesto, iconos, arranque)
    test/                     las pruebas

## Importante

El código fuente vive **aquí**, no en el archivo compilado. Nunca se debe
editar `dist/index.html` a mano: se regenera con `npm run build` y cualquier
cambio hecho sobre él se pierde en la siguiente compilación.
