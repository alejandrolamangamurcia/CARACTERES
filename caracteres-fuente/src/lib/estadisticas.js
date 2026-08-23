// ---------------------------------------------------------------------------
// ESTADÍSTICAS
//
// Regla que gobierna este archivo: nada de recuentos absolutos cuando la
// pregunta es "¿voy a peor?". Si registras más de todo, todos los recuentos
// suben y parecerá que empeoras sin haber cambiado nada. Por eso lo que
// evoluciona se mide siempre en PROPORCIÓN sobre el total del periodo.
// ---------------------------------------------------------------------------

import { loQueMeDicen, yoDe, PERFIL_NORMAL, PERFIL_TENSION } from './perfil.js';

const norm = (s) => (s || '').trim().toLowerCase();
const fechaDe = (e) => e.fechaEvento || e.ts;
const mesDe = (e) => String(fechaDe(e) || '').slice(0, 7); // "2026-08"

// --- 1. Consenso: qué te dice más gente -------------------------------------

export function consenso(entries, people) {
  const { normal, tension } = loQueMeDicen(entries, people);
  return [...normal, ...tension]
    .sort((a, b) => b.vocesDistintas - a.vocesDistintas || b.veces - a.veces);
}

// --- 2. Punto ciego: lo que dicen y tú no reconoces --------------------------

export function puntoCiego(entries, people) {
  const mios = new Set((yoDe(people).adjetivos || []).map((a) => norm(a.palabra)));
  return consenso(entries, people)
    .filter((x) => x.consolidado && !mios.has(norm(x.palabra)));
}

// --- 3. Espejismo: lo que tú dices de ti y nadie ha dicho nunca --------------

export function espejismo(entries, people) {
  const dichos = new Set(consenso(entries, people).map((x) => norm(x.palabra)));
  return (yoDe(people).adjetivos || [])
    .filter((a) => !dichos.has(norm(a.palabra)))
    .map((a) => ({ palabra: a.palabra, perfil: a.perfil }));
}

// --- 4. Brecha calma / tensión ----------------------------------------------

/** Adjetivos que SOLO aparecen cuando hay discusión: quién eres al apretarte. */
export function brechaTension(entries, people) {
  const { normal, tension } = loQueMeDicen(entries, people);
  const enCalma = new Set(normal.map((x) => norm(x.palabra)));
  return tension.filter((x) => !enCalma.has(norm(x.palabra)));
}

// --- 5. Con quién chocas ----------------------------------------------------

/**
 * Reparto de roces por persona. La cifra que importa es `cuota`: si una sola
 * persona concentra la mayoría, el problema es esa relación, no tu carácter.
 */
export function rocesPorPersona(entries, people) {
  const roces = entries.filter((e) => e.tipo === 'roce');
  const total = roces.length;
  const cuenta = new Map();
  for (const r of roces) {
    const id = r.conQuien || '__sin__';
    cuenta.set(id, (cuenta.get(id) || 0) + 1);
  }
  const nombre = (id) => (id === '__sin__'
    ? 'Sin identificar'
    : (people.find((p) => p.id === id) || {}).nombre || 'Alguien');

  return [...cuenta.entries()]
    .map(([id, n]) => ({
      id, nombre: nombre(id), roces: n,
      cuota: total ? n / total : 0,
    }))
    .sort((a, b) => b.roces - a.roces);
}

/** Aviso honesto: ¿está todo concentrado en una sola relación? */
export function concentracion(entries, people) {
  const reparto = rocesPorPersona(entries, people);
  const total = reparto.reduce((n, r) => n + r.roces, 0);
  if (total < 5) return { suficiente: false, total };
  const top = reparto[0];
  return {
    suficiente: true,
    total,
    principal: top.nombre,
    cuota: top.cuota,
    concentrado: top.cuota >= 0.5,
  };
}

// --- 6. Temas que se repiten ------------------------------------------------

export function temasRecurrentes(entries, minimo = 2) {
  const cuenta = new Map();
  for (const e of entries) {
    const t = (e.tema || '').trim();
    if (!t) continue;
    const k = norm(t);
    if (!cuenta.has(k)) cuenta.set(k, { tema: t, veces: 0 });
    cuenta.get(k).veces += 1;
  }
  return [...cuenta.values()].filter((x) => x.veces >= minimo)
    .sort((a, b) => b.veces - a.veces);
}

// --- 7. Cómo respondes, y si eso cambia -------------------------------------

export const RESPUESTAS = ['Entré a rebatir', 'Lo dejé pasar', 'Puse un límite', 'Me callé y me quedé mal'];

export function repartoRespuestas(entries) {
  const roces = entries.filter((e) => e.tipo === 'roce' && e.respuesta);
  const total = roces.length;
  const cuenta = Object.fromEntries(RESPUESTAS.map((r) => [r, 0]));
  for (const r of roces) if (cuenta[r.respuesta] != null) cuenta[r.respuesta] += 1;
  return {
    total,
    reparto: RESPUESTAS.map((r) => ({
      respuesta: r, veces: cuenta[r], cuota: total ? cuenta[r] / total : 0,
    })),
  };
}

// --- 8. Proporción de roces por mes (la trampa del denominador) -------------

/**
 * NO devuelve "cuántos roces al mes", sino "qué parte de lo que registras son
 * roces". Si subes de 3 a 12 entradas al mes y la proporción no se mueve,
 * no estás discutiendo más: estás registrando más.
 */
export function proporcionRoces(entries) {
  const meses = new Map();
  for (const e of entries) {
    const m = mesDe(e);
    if (!m) continue;
    if (!meses.has(m)) meses.set(m, { mes: m, total: 0, roces: 0, aciertos: 0 });
    const x = meses.get(m);
    x.total += 1;
    if (e.tipo === 'roce') x.roces += 1;
    if (e.tipo === 'acierto') x.aciertos += 1;
  }
  return [...meses.values()]
    .map((x) => ({ ...x, cuotaRoce: x.total ? x.roces / x.total : 0 }))
    .sort((a, b) => a.mes.localeCompare(b.mes));
}

/** Compara los dos últimos meses con datos y dice si el cambio es interpretable. */
export function tendenciaRoces(entries, minimoPorMes = 4) {
  const serie = proporcionRoces(entries);
  if (serie.length < 2) return { concluyente: false, motivo: 'Hacen falta dos meses con datos.' };
  const [previo, actual] = serie.slice(-2);
  if (previo.total < minimoPorMes || actual.total < minimoPorMes) {
    return { concluyente: false, motivo: 'Muy pocas entradas para comparar meses.', previo, actual };
  }
  const delta = actual.cuotaRoce - previo.cuotaRoce;
  return {
    concluyente: true,
    previo,
    actual,
    delta,
    sentido: Math.abs(delta) < 0.05 ? 'igual' : (delta > 0 ? 'sube' : 'baja'),
  };
}

// --- 9. Ratio acierto / roce ------------------------------------------------

export function balance(entries) {
  const roces = entries.filter((e) => e.tipo === 'roce').length;
  const aciertos = entries.filter((e) => e.tipo === 'acierto').length;
  return { roces, aciertos, ratio: roces ? aciertos / roces : (aciertos ? Infinity : 0) };
}

// --- 10. Planes si→entonces: ¿funcionan? ------------------------------------

export function eficaciaPlanes(entries) {
  const planes = entries.filter((e) => e.tipo === 'plan');
  const cerrados = planes.filter((p) => p.planEstado && p.planEstado !== 'activo');
  const cumplidos = cerrados.filter((p) => p.planEstado === 'cumplido').length;
  return {
    total: planes.length,
    activos: planes.filter((p) => !p.planEstado || p.planEstado === 'activo').length,
    cerrados: cerrados.length,
    cumplidos,
    tasa: cerrados.length ? cumplidos / cerrados.length : null,
  };
}

// --- 11. ¿Sigue apareciendo información nueva? ------------------------------

/**
 * Si hace meses que no aparece ningún adjetivo nuevo, tu retrato se ha
 * estabilizado: ya sabes lo que tenías que saber y toca actuar, no registrar.
 */
export function saturacion(entries, people) {
  const lista = consenso(entries, people);
  if (!lista.length) return { suficiente: false };
  const primeras = new Map();
  for (const adj of lista) {
    const f = adj.testimonios.map((t) => t.cuando).sort()[0];
    primeras.set(norm(adj.palabra), f);
  }
  const fechas = [...primeras.values()].filter(Boolean).sort();
  return {
    suficiente: true,
    adjetivosDistintos: fechas.length,
    ultimoNuevo: fechas[fechas.length - 1] || null,
  };
}

// --- Panel completo ---------------------------------------------------------

export function panel(entries = [], people = []) {
  return {
    consenso: consenso(entries, people),
    puntoCiego: puntoCiego(entries, people),
    espejismo: espejismo(entries, people),
    brechaTension: brechaTension(entries, people),
    rocesPorPersona: rocesPorPersona(entries, people),
    concentracion: concentracion(entries, people),
    temas: temasRecurrentes(entries),
    respuestas: repartoRespuestas(entries),
    tendencia: tendenciaRoces(entries),
    balance: balance(entries),
    planes: eficaciaPlanes(entries),
    saturacion: saturacion(entries, people),
  };
}

export { PERFIL_NORMAL, PERFIL_TENSION };
