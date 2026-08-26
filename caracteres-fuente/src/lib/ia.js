// ---------------------------------------------------------------------------
// LA IA: SUGERIR ADJETIVOS Y BUSCAR PATRONES
//
// Dos motores, portados de referencia/v7.html:
//   sugerirAdjetivos  (función `pu`) — una conducta suelta -> 3 a 5 adjetivos
//   buscarPatrones    (función `lv`) — varias frases sueltas -> qué adjetivo
//                                       respalda el conjunto, y con qué frases
//
// La clave la guarda el usuario en Ajustes; la llamada sale directa desde el
// navegador (sin servidor propio), igual que en la v7.
// ---------------------------------------------------------------------------

import lexico from '../data/lexico.json';

function listaLexico() {
  const lineas = [];
  for (const dim of lexico.dims) {
    for (const polo of dim.polos) {
      for (const familia of polo.familias) {
        for (const e of familia.entradas) {
          lineas.push(`${e.p} [${dim.titulo}/${polo.nombre}] — ${e.d} | Se ve: ${e.v[0]}`);
        }
      }
    }
  }
  return lineas.join('\n');
}

/** Llama a Claude con un system prompt y un mensaje, y devuelve el JSON que responda. */
async function llamarClaude(clave, sistema, mensaje) {
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
        system: sistema,
        messages: [{ role: 'user', content: mensaje }],
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

const SISTEMA_SUGERIR = `Eres el motor de consulta de un léxico español de rasgos de personalidad. Tu ÚNICA salida es JSON válido, sin marcas de código.
Antes de la conducta recibirás una línea "CONTEXTO:" que dice de dónde sale la frase — quién es el sujeto real de la conducta y si es un testimonio de un tercero, una observación directa, o una autoobservación de conducta concreta. Léela con atención: una frase en primera persona ("me dijo que yo era...") puede describir a QUIEN LA REGISTRA relatando lo que otro dijo de él, no una autodescripción suya. El CONTEXTO te dice cuál es el caso; no lo asumas por la gramática de la frase sola.
Dada la conducta descrita, elige de la LISTA los 3 a 5 adjetivos que mejor la describen. Palabras EXACTAS de la lista.
Un momento no es un rasgo: si la conducta puede explicarse por un estado transitorio, dilo en "aviso_estado"; si no, null. Una autopercepción abstracta sin conducta detrás tampoco es un rasgo — pero una autoobservación de un ACTO concreto (algo que la persona hizo, no cómo se ve a sí misma) sí es evidencia válida, igual que un testimonio de un tercero.
Formato: {"candidatos":[{"palabra":"...","razon":"...","confianza":"alta|media|baja"}],"aviso_estado":null}
LISTA:
${listaLexico()}`;

/**
 * Pide a Claude entre 3 y 5 adjetivos que encajen con la conducta descrita.
 * `marco` explica de dónde sale la frase (quién es el sujeto, testimonio de
 * un tercero, observación directa, o autoobservación) para que la IA no
 * malinterprete una frase en primera persona como autodescripción.
 * Devuelve { candidatos: [{palabra, razon, confianza}], aviso_estado }.
 * Lanza un Error con un mensaje legible si algo falla (sin clave, red, límite...).
 */
export async function sugerirAdjetivos(clave, conducta, marco = '') {
  const mensaje = marco ? `CONTEXTO: ${marco}\nConducta: ${conducta}` : `Conducta: ${conducta}`;
  return llamarClaude(clave, SISTEMA_SUGERIR, mensaje);
}

const SISTEMA_PATRON = `Eres el motor de análisis periódico de un registro de relaciones. Tu ÚNICA salida es JSON válido, sin marcas de código.
Recibes una línea "CONTEXTO:" que explica de quién son estas frases (de un tercero sobre sí mismo, o autoobservaciones de quien registra), y luego una lista de frases sueltas, cada una con un identificador entre corchetes al principio: conductas registradas sin adjetivo todavía.
Agrupa las que, juntas, respalden el mismo adjetivo de la LISTA o uno muy cercano (misma familia). Propón un adjetivo solo si al menos DOS frases distintas lo evidencian: una frase suelta no es un patrón, es una anécdota.
Sé conservador: si las frases pueden explicarse por circunstancias distintas y no por un rasgo estable, no propongas nada para ellas.
Formato: {"patrones":[{"palabra":"...","evidencias":["id1","id2"],"razon":"una frase que explique el patrón"}]}
LISTA:
${listaLexico()}`;

/**
 * Busca patrones en un conjunto de frases sueltas sin adjetivo (las
 * "Tendencias" de una persona). `frases` es [{id, texto}]. `marco` explica de
 * quién son las frases. Devuelve { patrones: [{palabra, evidencias: [id...],
 * razon}] } — cada patrón respaldado por al menos dos frases distintas.
 */
export async function buscarPatrones(clave, frases, marco = '') {
  const cuerpo = frases.map((f) => `[${f.id}] ${f.texto}`).join('\n');
  const mensaje = marco ? `CONTEXTO: ${marco}\n${cuerpo}` : cuerpo;
  return llamarClaude(clave, SISTEMA_PATRON, mensaje);
}
