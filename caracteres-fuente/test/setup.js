// El navegador simulado (jsdom) no trae criptografía ni un almacenamiento
// que se comporte como el real. Aquí le enchufamos los de Node, para que las
// pruebas ejerciten el MISMO código que correrá en el móvil.
import { webcrypto } from 'node:crypto';
import '@testing-library/jest-dom/vitest';

if (!globalThis.crypto || !globalThis.crypto.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

// localStorage de verdad, con su límite de solo-texto
class Almacen {
  #d = new Map();
  get length() { return this.#d.size; }
  key(i) { return [...this.#d.keys()][i] ?? null; }
  getItem(k) { return this.#d.has(String(k)) ? this.#d.get(String(k)) : null; }
  setItem(k, v) { this.#d.set(String(k), String(v)); }
  removeItem(k) { this.#d.delete(String(k)); }
  clear() { this.#d.clear(); }
}

Object.defineProperty(globalThis, 'localStorage', {
  value: new Almacen(), configurable: true, writable: true,
});

beforeEach(() => { globalThis.localStorage.clear(); });
