// ---------------------------------------------------------------------------
// COPIAS DE SEGURIDAD
//
// El archivo sale cifrado con tu PIN y se comparte como .txt, porque Android
// no deja compartir .json. Al importar se aceptan los tres formatos que han
// existido, para que ninguna copia antigua se quede inservible.
// ---------------------------------------------------------------------------

import { aBase64, deBase64, derivarClave, cifrar, descifrar } from './vault.js';

export const FORMATO = 4;

/** Empaqueta y cifra. Devuelve el texto del archivo. */
export async function crearCopia({ clave, sal, datos, fecha = new Date() }) {
  const { iv, ct } = await cifrar(clave, {
    version: FORMATO,
    exportado: fecha.toISOString(),
    entries: datos.entries || [],
    people: datos.people || [],
    config: datos.config || {},
  });
  return JSON.stringify({
    app: 'caracteres',
    v: FORMATO,
    cifrado: true,
    exportado: fecha.toISOString(),
    salt: aBase64(sal),
    iv,
    ct,
  }, null, 1);
}

export const nombreArchivo = (fecha = new Date()) =>
  `caracteres-${fecha.toISOString().slice(0, 10)}.txt`;

/** ¿Hace falta PIN para abrir este archivo? */
export function necesitaPin(texto) {
  try { return JSON.parse(texto)?.cifrado === true; }
  catch { return false; }
}

/**
 * Abre una copia. `pin` solo se usa si viene cifrada.
 * Devuelve {ok, datos} o {ok:false, causa}.
 *   causa: 'ilegible' | 'pin' | 'formato'
 */
export async function abrirCopia(texto, pin) {
  let bruto;
  try { bruto = JSON.parse(texto); }
  catch { return { ok: false, causa: 'ilegible' }; }

  if (bruto && bruto.cifrado === true) {
    if (!pin) return { ok: false, causa: 'pin' };
    try {
      const clave = await derivarClave(pin, deBase64(bruto.salt));
      bruto = await descifrar(clave, bruto.iv, bruto.ct);
    } catch {
      return { ok: false, causa: 'pin' };
    }
  }

  if (!bruto || !Array.isArray(bruto.entries) || !Array.isArray(bruto.people)) {
    return { ok: false, causa: 'formato' };
  }

  return {
    ok: true,
    datos: {
      entries: bruto.entries,
      people: bruto.people,
      config: bruto.config || {},
    },
  };
}

// --- Aviso por cantidad de datos sin respaldar -------------------------------

/** Cuenta todo lo que has metido: entradas, personas y adjetivos asignados. */
export const contarDatos = (entries, people) =>
  (entries || []).length
  + (people || []).length
  + (people || []).reduce((n, p) => n + ((p && p.adjetivos) ? p.adjetivos.length : 0), 0);

export const sinRespaldar = (entries, people, config) =>
  Math.max(0, contarDatos(entries, people) - ((config && config.lastExportN) || 0));

export const limiteAviso = (config) => (config && config.avisoCada) || 5;

/** ¿Toca enseñar el aviso a pantalla completa? */
export function tocaAvisar(entries, people, config) {
  const pendientes = sinRespaldar(entries, people, config);
  const limite = limiteAviso(config);
  if (pendientes < limite) return false;
  const pospuesto = config && config.avisoPospuestoN;
  if (pospuesto != null && pendientes < pospuesto + limite) return false;
  return true;
}

/** Config actualizada tras exportar con éxito. */
export const selloDeCopia = (config, entries, people, fecha = new Date()) => ({
  ...config,
  lastExport: fecha.toISOString(),
  lastExportN: contarDatos(entries, people),
  avisoPospuestoN: null,
});
