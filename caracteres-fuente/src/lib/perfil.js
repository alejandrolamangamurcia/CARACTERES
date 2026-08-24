// ---------------------------------------------------------------------------
// EL PERFIL "YO" — CUATRO APARTADOS
//
// Dos los rellenas tú (lo que crees de ti mismo):
//    · mio.normal      · mio.tension
// Dos NO se rellenan a mano: salen solos de las entradas "Me dijeron".
//    · dicho.normal    · dicho.tension
//
// Por qué calculados y no guardados: si se guardaran, podrían contradecir a
// las entradas que los originaron. Al derivarlos, siempre cuadran, y una copia
// de seguridad antigua los reconstruye sin haberlos guardado nunca.
// ---------------------------------------------------------------------------

/** Un contexto "En discusión" significa que te lo dijeron en caliente. */
export const esEnCaliente = (contexto) => contexto === 'En discusión';

export const PERFIL_NORMAL = 'normal';
export const PERFIL_TENSION = 'presion';

export const perfilDeContexto = (contexto) =>
  esEnCaliente(contexto) ? PERFIL_TENSION : PERFIL_NORMAL;

const norm = (s) => (s || '').trim().toLowerCase();

/**
 * Recorre las entradas "Me dijeron" y agrupa sus adjetivos.
 * Cada adjetivo acumula quién te lo dijo, cuándo y en qué contexto.
 *
 * Devuelve { normal: [...], tension: [...] }, ordenados por fuerza:
 * primero los que dice más gente distinta, luego los más repetidos.
 */
export function loQueMeDicen(entries = [], people = []) {
  const nombre = (id) => (people.find((p) => p.id === id) || {}).nombre || 'Alguien';
  const cubos = new Map();

  for (const e of entries) {
    if (e.tipo !== 'medijeron') continue;
    const perfil = perfilDeContexto(e.contextoFrase);
    for (const adj of e.adjetivos || []) {
      const llave = `${perfil}|${norm(adj)}`;
      if (!cubos.has(llave)) {
        cubos.set(llave, { palabra: adj, perfil, personas: new Set(), testimonios: [] });
      }
      const c = cubos.get(llave);
      if (e.conQuien) c.personas.add(e.conQuien);
      c.testimonios.push({
        entryId: e.id,
        quien: e.conQuien || null,
        quienNombre: e.conQuien ? nombre(e.conQuien) : 'Sin identificar',
        cuando: e.fechaEvento || e.ts,
        contexto: e.contextoFrase || null,
        enCaliente: esEnCaliente(e.contextoFrase),
        frase: e.frase || '',
      });
    }
  }

  const salida = [...cubos.values()].map((c) => ({
    palabra: c.palabra,
    perfil: c.perfil,
    vocesDistintas: c.personas.size,
    veces: c.testimonios.length,
    consolidado: c.personas.size >= 2,
    testimonios: c.testimonios.sort((a, b) => String(b.cuando).localeCompare(String(a.cuando))),
  }));

  const ordenar = (a, b) =>
    b.vocesDistintas - a.vocesDistintas
    || b.veces - a.veces
    || a.palabra.localeCompare(b.palabra);

  return {
    normal: salida.filter((x) => x.perfil === PERFIL_NORMAL).sort(ordenar),
    tension: salida.filter((x) => x.perfil === PERFIL_TENSION).sort(ordenar),
  };
}

// --- Los dos apartados que rellenas tú --------------------------------------

export const yoDe = (people = []) =>
  people.find((p) => p.id === 'yo') || { id: 'yo', nombre: 'Yo', adjetivos: [], ideal: [] };

export const misAdjetivos = (people, perfil) =>
  (yoDe(people).adjetivos || []).filter((a) => a.perfil === perfil);

export function ponerAdjetivoMio(people, palabra, perfil) {
  const yo = yoDe(people);
  const resto = (yo.adjetivos || []).filter(
    (a) => !(norm(a.palabra) === norm(palabra) && a.perfil === perfil),
  );
  const nuevoYo = {
    ...yo,
    adjetivos: [...resto, { palabra, perfil, fecha: new Date().toISOString() }],
  };
  return people.some((p) => p.id === 'yo')
    ? people.map((p) => (p.id === 'yo' ? nuevoYo : p))
    : [nuevoYo, ...people];
}

export function quitarAdjetivoMio(people, palabra, perfil) {
  return people.map((p) => (p.id !== 'yo' ? p : {
    ...p,
    adjetivos: (p.adjetivos || []).filter(
      (a) => !(norm(a.palabra) === norm(palabra) && a.perfil === perfil),
    ),
  }));
}

// --- Mi ideal: lista libre, sin límite --------------------------------------

export const miIdeal = (people) => yoDe(people).ideal || [];

export function ponerEnIdeal(people, palabra, nota = '') {
  const yo = yoDe(people);
  if ((yo.ideal || []).some((x) => norm(x.palabra) === norm(palabra))) return people;
  const nuevoYo = {
    ...yo,
    ideal: [...(yo.ideal || []), { palabra, nota, fecha: new Date().toISOString() }],
  };
  return people.some((p) => p.id === 'yo')
    ? people.map((p) => (p.id === 'yo' ? nuevoYo : p))
    : [nuevoYo, ...people];
}

export function quitarDelIdeal(people, palabra) {
  return people.map((p) => (p.id !== 'yo' ? p : {
    ...p,
    ideal: (p.ideal || []).filter((x) => norm(x.palabra) !== norm(palabra)),
  }));
}

// --- La ficha de cada persona: igual que "lo que me dicen", pero de ellos --
//
// Misma regla que gobierna "Yo": no se escribe el adjetivo a mano, se
// registra lo que dijo o hizo (entradas "Observación" con esa persona) y el
// adjetivo sale de ahí.

/**
 * Adjetivos que sostienen los actos de una persona, con cuántas veces se
 * han visto y en qué entradas. Ordenados por frecuencia.
 */
export function fichaDePersona(entries = [], personaId) {
  const cubos = new Map();

  for (const e of entries) {
    if (e.tipo !== 'observacion' || e.conQuien !== personaId) continue;
    for (const adj of e.adjetivos || []) {
      const llave = norm(adj);
      if (!cubos.has(llave)) cubos.set(llave, { palabra: adj, testimonios: [] });
      cubos.get(llave).testimonios.push({
        entryId: e.id,
        frase: e.frase || '',
        cuando: e.fechaEvento || e.ts,
      });
    }
  }

  return [...cubos.values()]
    .map((c) => ({
      palabra: c.palabra,
      veces: c.testimonios.length,
      testimonios: c.testimonios.sort((a, b) => String(b.cuando).localeCompare(String(a.cuando))),
    }))
    .sort((a, b) => b.veces - a.veces || a.palabra.localeCompare(b.palabra));
}

/** Las frases literales registradas de una persona, más recientes primero. */
export function frasesDePersona(entries = [], personaId) {
  return entries
    .filter((e) => e.tipo === 'observacion' && e.conQuien === personaId)
    .sort((a, b) => String(b.fechaEvento || b.ts || '').localeCompare(String(a.fechaEvento || a.ts || '')));
}
