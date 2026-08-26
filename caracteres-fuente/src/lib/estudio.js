// ---------------------------------------------------------------------------
// ESTUDIO (repetición espaciada, estilo Anki)
//
// Pregunta: se te da la categoría, la familia y la situación ("Se ve: ...")
// y eliges entre los adjetivos de ESA MISMA familia. Los señuelos salen de la
// familia porque son palabras casi iguales: distinguir "curioso" de "ávido"
// enseña; distinguir "curioso" de "tacaño" no enseña nada.
//
// Programación: cajas de Leitner. Aciertas y la palabra tarda más en volver;
// fallas y vuelve enseguida.
// ---------------------------------------------------------------------------

export const CAJAS = [0, 1, 2, 4, 7, 15, 30]; // días de espera por caja
export const CAJA_MAX = CAJAS.length - 1;

const DIA = 86400000;
export const hoyISO = (fecha = new Date()) => fecha.toISOString().slice(0, 10);
const diasEntre = (a, b) => Math.floor((new Date(b) - new Date(a)) / DIA);

/** Aplana el léxico a una lista de tarjetas con su ruta completa. */
export function construirMazo(lexico) {
  const mazo = [];
  for (const dim of lexico.dims || []) {
    for (const polo of dim.polos || []) {
      for (const fam of polo.familias || []) {
        const hermanas = (fam.entradas || []).map((e) => e.p);
        for (const ent of fam.entradas || []) {
          mazo.push({
            id: `${dim.titulo}|${polo.nombre}|${fam.nombre}|${ent.p}`,
            palabra: ent.p,
            definicion: ent.d,
            situacion: ent.v,
            dimension: dim.titulo,
            polo: polo.nombre,
            familia: fam.nombre,
            hermanas,
          });
        }
      }
    }
  }
  return mazo;
}

/** Estado inicial de una tarjeta que no se ha visto nunca. */
export const tarjetaNueva = (id) => ({
  id, caja: 0, vistas: 0, aciertos: 0, fallos: 0,
  ultima: null, proxima: null, racha: 0,
});

export const progresoDe = (progreso, id) => progreso[id] || tarjetaNueva(id);

/** ¿Toca repasar esta tarjeta hoy? */
export function toca(estado, hoy = hoyISO()) {
  if (!estado || !estado.proxima) return true;
  return diasEntre(estado.proxima, hoy) >= 0;
}

/**
 * Elige qué estudiar. Prioridad:
 *   1. Las marcadas como prioritarias (palabras que el usuario pidió a la IA
 *      identificar en una conducta real: las necesita aprender ya, se salen
 *      de su turno del Leitner)
 *   2. Las que fallaste y ya toca repasar (caja baja primero)
 *   3. Las que nunca has visto
 *   4. El resto que vence hoy
 */
export function siguienteTanda(mazo, progreso = {}, cantidad = 10, hoy = hoyISO(), prioritarias = new Set()) {
  const conEstado = mazo.map((t) => ({ tarjeta: t, estado: progresoDe(progreso, t.id) }));
  const candidatas = conEstado.filter((x) => toca(x.estado, hoy) || prioritarias.has(x.tarjeta.palabra));

  const peso = (x) => {
    const e = x.estado;
    let base;
    if (e.vistas === 0) base = 1000 + Math.random();          // nuevas
    else {
      const tasaFallo = e.vistas ? e.fallos / e.vistas : 0;
      base = 2000 + tasaFallo * 1000 - e.caja * 100 + Math.random(); // falladas primero
    }
    return prioritarias.has(x.tarjeta.palabra) ? base + 10000 : base;
  };

  return candidatas.sort((a, b) => peso(b) - peso(a)).slice(0, cantidad).map((x) => x.tarjeta);
}

/** Monta la pregunta: la situación y las opciones de su familia.
 *  Cada tarjeta trae varios "Se ve:" posibles; se elige uno al azar en cada
 *  pregunta para que el mismo repaso no enseñe siempre el mismo ejemplo. */
export function montarPregunta(tarjeta, aleatorio = Math.random) {
  const opciones = [...tarjeta.hermanas];
  for (let i = opciones.length - 1; i > 0; i--) {
    const j = Math.floor(aleatorio() * (i + 1));
    [opciones[i], opciones[j]] = [opciones[j], opciones[i]];
  }
  const ejemplos = Array.isArray(tarjeta.situacion) ? tarjeta.situacion : [tarjeta.situacion];
  const situacion = ejemplos[Math.floor(aleatorio() * ejemplos.length)];
  return {
    id: tarjeta.id,
    categoria: tarjeta.dimension,
    familia: tarjeta.familia,
    situacion,
    definicion: tarjeta.definicion,
    opciones,
    correcta: tarjeta.palabra,
  };
}

/** Registra la respuesta y reprograma la tarjeta. */
export function responder(progreso, id, acertada, hoy = hoyISO()) {
  const previo = progresoDe(progreso, id);
  const caja = acertada ? Math.min(previo.caja + 1, CAJA_MAX) : 0;
  const espera = CAJAS[caja];
  const proxima = hoyISO(new Date(new Date(hoy).getTime() + espera * DIA));

  return {
    ...progreso,
    [id]: {
      ...previo,
      caja,
      vistas: previo.vistas + 1,
      aciertos: previo.aciertos + (acertada ? 1 : 0),
      fallos: previo.fallos + (acertada ? 0 : 1),
      racha: acertada ? previo.racha + 1 : 0,
      ultima: hoy,
      proxima,
    },
  };
}

// --- Estadísticas de estudio ------------------------------------------------

export function resumenEstudio(mazo, progreso = {}, hoy = hoyISO()) {
  const estados = mazo.map((t) => progresoDe(progreso, t.id));
  const vistas = estados.filter((e) => e.vistas > 0);
  const totalIntentos = vistas.reduce((n, e) => n + e.vistas, 0);
  const totalAciertos = vistas.reduce((n, e) => n + e.aciertos, 0);

  return {
    total: mazo.length,
    empezadas: vistas.length,
    sinVer: mazo.length - vistas.length,
    dominadas: estados.filter((e) => e.caja >= 4).length,
    pendientesHoy: mazo.filter((t) => toca(progresoDe(progreso, t.id), hoy)).length,
    acierto: totalIntentos ? totalAciertos / totalIntentos : null,
    porCaja: CAJAS.map((_, i) => ({ caja: i, cuantas: estados.filter((e) => e.caja === i && e.vistas > 0).length })),
  };
}

/** Las que más se te resisten, para el apartado de estudio. */
export function masFalladas(mazo, progreso = {}, cuantas = 10) {
  return mazo
    .map((t) => ({ tarjeta: t, estado: progresoDe(progreso, t.id) }))
    .filter((x) => x.estado.fallos > 0)
    .sort((a, b) => (b.estado.fallos / b.estado.vistas) - (a.estado.fallos / a.estado.vistas)
      || b.estado.fallos - a.estado.fallos)
    .slice(0, cuantas);
}
