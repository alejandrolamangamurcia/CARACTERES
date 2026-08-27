import { describe, it, expect } from 'vitest';
import lexico from '../src/data/lexico.json';
import * as S from '../src/lib/estudio.js';

const mazo = S.construirMazo(lexico);

const contarEntradasDelLexico = () => {
  let n = 0;
  for (const dim of lexico.dims) for (const polo of dim.polos) for (const fam of polo.familias) n += fam.entradas.length;
  return n;
};

describe('el mazo sale del léxico real', () => {
  it('tiene una tarjeta por cada entrada del léxico', () => {
    expect(mazo).toHaveLength(contarEntradasDelLexico());
  });

  it('cada tarjeta trae categoría, familia y situación', () => {
    for (const t of mazo) {
      expect(t.dimension).toBeTruthy();
      expect(t.familia).toBeTruthy();
      expect(t.situacion).toBeTruthy();
      expect(t.definicion).toBeTruthy();
    }
  });

  it('las opciones falsas salen de la misma familia', () => {
    const t = mazo.find((x) => x.hermanas.length >= 3);
    const p = S.montarPregunta(t, () => 0.5);
    expect(p.opciones).toContain(p.correcta);
    for (const o of p.opciones) expect(t.hermanas).toContain(o);
  });

  it('cada tarjeta trae tres ejemplos de "Ejemplo:", no uno solo', () => {
    for (const t of mazo) {
      expect(Array.isArray(t.situacion)).toBe(true);
      expect(t.situacion).toHaveLength(3);
    }
  });

  it('la pregunta muestra los tres ejemplos de la tarjeta', () => {
    const t = mazo[0];
    const p = S.montarPregunta(t, () => 0.5);
    expect(p.situaciones).toEqual(t.situacion);
    expect(p.situaciones).toHaveLength(3);
  });

  it('no hay tarjetas sin alternativas', () => {
    const solitarias = mazo.filter((t) => t.hermanas.length < 2);
    expect(solitarias.map((t) => `${t.familia}/${t.palabra}`)).toEqual([]);
  });

  it('los identificadores son únicos', () => {
    expect(new Set(mazo.map((t) => t.id)).size).toBe(mazo.length);
  });
});

describe('repetición espaciada', () => {
  const id = mazo[0].id;

  it('al principio todo está pendiente', () => {
    expect(S.siguienteTanda(mazo, {}, 10)).toHaveLength(10);
  });

  it('acertar aleja la tarjeta en el tiempo', () => {
    let p = S.responder({}, id, true, '2026-08-23');
    expect(p[id].caja).toBe(1);
    expect(p[id].proxima).toBe('2026-08-24');
    p = S.responder(p, id, true, '2026-08-24');
    expect(p[id].caja).toBe(2);
    expect(p[id].proxima).toBe('2026-08-26');
  });

  it('fallar la devuelve al día siguiente y rompe la racha', () => {
    let p = S.responder({}, id, true, '2026-08-23');
    p = S.responder(p, id, true, '2026-08-24');
    expect(p[id].racha).toBe(2);
    p = S.responder(p, id, false, '2026-08-26');
    expect(p[id].caja).toBe(0);
    expect(p[id].racha).toBe(0);
    expect(S.toca(p[id], '2026-08-26')).toBe(true);
  });

  it('una tarjeta bien sabida no reaparece hoy', () => {
    let p = {};
    let dia = new Date('2026-08-23');
    for (let i = 0; i < 3; i++) {
      p = S.responder(p, id, true, S.hoyISO(dia));
      dia = new Date(p[id].proxima);
    }
    expect(S.toca(p[id], '2026-08-24')).toBe(false);
  });

  it('las falladas se repiten más que las sabidas', () => {
    let p = {};
    const fallada = mazo[5].id;
    const sabida = mazo[6].id;
    for (let i = 0; i < 3; i++) p = S.responder(p, fallada, false, '2026-08-20');
    for (let i = 0; i < 3; i++) p = S.responder(p, sabida, true, '2026-08-20');
    const tanda = S.siguienteTanda(mazo, p, 40, '2026-09-30').map((t) => t.id);
    expect(tanda.indexOf(fallada)).toBeLessThan(tanda.indexOf(sabida));
  });

  it('el resumen cuenta bien lo estudiado', () => {
    let p = {};
    for (let i = 0; i < 5; i++) p = S.responder(p, mazo[i].id, i % 2 === 0, '2026-08-23');
    const r = S.resumenEstudio(mazo, p, '2026-08-23');
    expect(r.total).toBe(mazo.length);
    expect(r.empezadas).toBe(5);
    expect(r.sinVer).toBe(mazo.length - 5);
    expect(r.acierto).toBeCloseTo(3 / 5);
  });

  it('lista las que más se resisten', () => {
    let p = {};
    p = S.responder(p, mazo[1].id, false, '2026-08-23');
    p = S.responder(p, mazo[2].id, true, '2026-08-23');
    const m = S.masFalladas(mazo, p);
    expect(m[0].tarjeta.id).toBe(mazo[1].id);
  });
});

describe('prioridad manual (palabras que la IA identificó en una conducta real)', () => {
  it('una palabra prioritaria sale primero aunque no le tocara todavía', () => {
    let p = {};
    // La dejamos "bien sabida", sin turno hoy.
    let dia = new Date('2026-08-01');
    for (let i = 0; i < 4; i++) { p = S.responder(p, mazo[0].id, true, S.hoyISO(dia)); dia = new Date(p[mazo[0].id].proxima); }
    const hoy = '2026-08-10';
    expect(S.toca(p[mazo[0].id], hoy)).toBe(false);

    const tanda = S.siguienteTanda(mazo, p, 5, hoy, new Set([mazo[0].palabra]));
    expect(tanda[0].id).toBe(mazo[0].id);
  });

  it('sin marcar nada, el comportamiento no cambia', () => {
    const tanda = S.siguienteTanda(mazo, {}, 10, '2026-08-10');
    expect(tanda).toHaveLength(10);
  });
});
