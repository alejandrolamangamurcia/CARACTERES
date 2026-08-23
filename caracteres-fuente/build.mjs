// Compila todo el proyecto en un único index.html listo para GitHub Pages.
//   node build.mjs            -> dist/index.html
//   node build.mjs --dev      -> sin minimizar, para leerlo
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.dirname(fileURLToPath(import.meta.url));
const dev = process.argv.includes('--dev');
const VERSION = fs.readFileSync(path.join(raiz, 'VERSION'), 'utf8').trim();

const r = await esbuild.build({
  entryPoints: [path.join(raiz, 'src/main.jsx')],
  bundle: true,
  write: false,
  format: 'iife',
  target: ['es2020'],
  minify: !dev,
  jsx: 'automatic',
  loader: { '.json': 'json' },
  define: { __VERSION__: JSON.stringify(VERSION) },
});

const js = r.outputFiles[0].text;
const css = fs.readFileSync(path.join(raiz, 'src/estilos.css'), 'utf8');
const cabecera = fs.readFileSync(path.join(raiz, 'src/cabecera.html'), 'utf8');

const html = cabecera
  .replaceAll('<!--VERSION-->', VERSION)
  .replace('/*ESTILOS*/', css)
  .replace('//CODIGO', () => js);

fs.mkdirSync(path.join(raiz, 'dist'), { recursive: true });
fs.writeFileSync(path.join(raiz, 'dist/index.html'), html);

const kb = (n) => (n / 1024).toFixed(1) + ' KB';
console.log(`dist/index.html  ${kb(html.length)}   (js ${kb(js.length)}, css ${kb(css.length)})`);
console.log(`version ${VERSION}${dev ? '  [sin minimizar]' : ''}`);
