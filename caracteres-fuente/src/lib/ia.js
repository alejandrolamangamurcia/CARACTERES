// ---------------------------------------------------------------------------
// SUGERENCIA DE ADJETIVOS POR IA
//
// Portado de referencia/v7.html (función `pu`). Dada una frase o conducta,
// pide a Claude que elija de la lista de 278 adjetivos los 3 a 5 que mejor
// encajan. La clave la guarda el usuario en Ajustes; la llamada sale directa
// desde el navegador (sin servidor propio), igual que en la v7.
// ---------------------------------------------------------------------------

import lexico from '../data/lexico.json';

function listaLexico() {
  const lineas = [];
  for (const dim of lexico.dims) {
    for (const polo of dim.polos) {
      for (const familia of polo.familias) {
        for (const e of familia.entradas) {
          lineas.push(`${e.p} [${dim.titulo}/${polo.nombre}] — ${e.d} | Se ve: ${e.v}`);
        }
      }
    }
  }
  return lineas.join('\n');
}

const SISTEMA = `Eres el motor de consulta de un léxico español de rasgos de personalidad. Tu ÚNICA salida es JSON válido, sin marcas de código.
Dada una conducta descrita, elige de la LISTA los 3 a 5 adjetivos que mejor la describen. Palabras EXACTAS de la lista.
Un momento no es un rasgo: si la conducta puede explicarse por un estado transitorio, dilo en "aviso_estado"; si no, null.
Formato: {"candidatos":[{"palabra":"...","razon":"...","confianza":"alta|media|baja"}],"aviso_estado":null}
LISTA:
${listaLexico()}`;

/**
 * Pide a Claude entre 3 y 5 adjetivos que encajen con la conducta descrita.
 * Devuelve { candidatos: [{palabra, razon, confianza}], aviso_estado }.
 * Lanza un Error con un mensaje legible si algo falla (sin clave, red, límite...).
 */
export async function sugerirAdjetivos(clave, conducta) {
  if (!clave) throw new Error('Sin clave: ponla en Ajustes.');

  let resp;
  try {
    resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': clave,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1200,
        system: SISTEMA,
        messages: [{ role: 'user', content: `Conducta: ${conducta}` }],
      }),
    });
  } catch {
    throw new Error('Red o CORS bloqueado — inténtalo de nuevo.');
  }

  if (resp.status === 401) throw new Error('Clave rechazada: revísala en Ajustes.');
  if (resp.status === 429) throw new Error('Límite de peticiones, prueba en un minuto.');
  if (!resp.ok) throw new Error('Servicio ' + resp.status);

  const datos = await resp.json();
  const texto = (datos.content || [])
    .filter((n) => n.type === 'text')
    .map((n) => n.text)
    .join('\n');

  try {
    return JSON.parse(texto.replace(/```json|```/g, '').trim());
  } catch {
    throw new Error('La IA devolvió algo ilegible. Inténtalo de nuevo.');
  }
}
