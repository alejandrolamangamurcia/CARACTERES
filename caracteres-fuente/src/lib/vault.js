// ---------------------------------------------------------------------------
// LA CAJA FUERTE
//
// Todo lo que escribes se guarda cifrado en el navegador con una clave que
// nace de tu PIN. El PIN no se guarda en ningún sitio: sin él, ni la app ni
// nadie puede abrir los datos.
// ---------------------------------------------------------------------------

export const CLAVE_ALMACEN = 'caracteres:vault';
export const ITERACIONES = 250000; // coste de derivar la clave desde el PIN

const aBytes = (txt) => new TextEncoder().encode(txt);
const aTexto = (bytes) => new TextDecoder().decode(bytes);

export const aBase64 = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)));
export const deBase64 = (txt) =>
  Uint8Array.from(atob(txt), (c) => c.charCodeAt(0));

export const datosVacios = () => ({ entries: [], people: [], config: {} });

/** Convierte un PIN en una clave de cifrado. Lento a propósito: así, quien
 *  robe el archivo no puede probar millones de PINes por segundo. */
export async function derivarClave(pin, sal) {
  const base = await crypto.subtle.importKey('raw', aBytes(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: sal, iterations: ITERACIONES, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function cifrar(clave, objeto) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, clave, aBytes(JSON.stringify(objeto)),
  );
  return { iv: aBase64(iv), ct: aBase64(ct) };
}

export async function descifrar(clave, iv, ct) {
  const plano = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: deBase64(iv) }, clave, deBase64(ct),
  );
  return JSON.parse(aTexto(plano));
}

// --- Estado abierto en memoria ------------------------------------------------

let clave = null;
let sal = null;
let datos = datosVacios();

export const estaAbierta = () => clave !== null;
export const leer = () => datos;
export const cerrar = () => { clave = null; sal = null; datos = datosVacios(); };

export const hayVault = () => localStorage.getItem(CLAVE_ALMACEN) !== null;

async function volcar() {
  const { iv, ct } = await cifrar(clave, datos);
  localStorage.setItem(CLAVE_ALMACEN, JSON.stringify({
    v: 1, sal: aBase64(sal), iv, ct,
  }));
}

/** Primera vez: crea la caja con un PIN nuevo. */
export async function crear(pin) {
  sal = crypto.getRandomValues(new Uint8Array(16));
  clave = await derivarClave(pin, sal);
  datos = datosVacios();
  await volcar();
  return true;
}

/** Abre la caja existente. Devuelve false si el PIN no es el correcto. */
export async function abrir(pin) {
  const crudo = localStorage.getItem(CLAVE_ALMACEN);
  if (!crudo) return false;
  let posible, salGuardada, datosDescifrados;
  try {
    const caja = JSON.parse(crudo);
    salGuardada = deBase64(caja.sal);
    posible = await derivarClave(pin, salGuardada);
    datosDescifrados = await descifrar(posible, caja.iv, caja.ct);
  } catch {
    return false; // PIN incorrecto o caja corrupta: no se puede abrir
  }
  clave = posible;
  sal = salGuardada;
  datos = { ...datosVacios(), ...datosDescifrados };
  return true;
}

/** Guarda una sección (entries, people, config) y la persiste cifrada. */
export async function guardar(seccion, valor) {
  if (!clave) throw new Error('La caja está cerrada');
  datos = { ...datos, [seccion]: valor };
  await volcar();
  return datos;
}

export async function cambiarPin(pinViejo, pinNuevo) {
  if (!(await abrir(pinViejo))) return false;
  const copia = JSON.parse(JSON.stringify(datos));
  sal = crypto.getRandomValues(new Uint8Array(16));
  clave = await derivarClave(pinNuevo, sal);
  datos = copia;
  await volcar();
  return true;
}
