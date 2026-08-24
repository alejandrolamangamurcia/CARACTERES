import { describe, it, expect } from 'vitest';
import * as P from '../src/lib/perfil.js';
import * as E from '../src/lib/estadisticas.js';

const gente = [
  { id: 'yo', nombre: 'Yo', adjetivos: [], ideal: [] },
  { id: 'p1', nombre: 'Ana' },
  { id: 'p2', nombre: 'Luis' },
  { id: 'p3', nombre: 'Marta' },
];

const dijo = (id, quien, adjetivos, contexto, cuando) => ({
  id, tipo: 'medijeron', conQuien: quien, adjetivos,
  contextoFrase: contexto, fechaEvento: cuando, frase: 'una frase',
});

describe('lo que me dicen (calculado, no guardado)', () => {
  it('separa lo dicho en calma de lo dicho en discusión', () => {
    const entries = [
      dijo('1', 'p1', ['Tozudo'], 'En discusión', '2026-08-01'),
      dijo('2', 'p2', ['Atento'], 'En calma', '2026-08-02'),
    ];
    const r = P.loQueMeDicen(entries, gente);
    expect(r.tension.map((x) => x.palabra)).toEqual(['Tozudo']);
    expect(r.normal.map((x) => x.palabra)).toEqual(['Atento']);
  });

  it('"delante de otros" cuenta como normal, no como tensión', () => {
    const r = P.loQueMeDicen([dijo('1', 'p1', ['Reservado'], 'Delante de otros', '2026-08-01')], gente);
    expect(r.normal).toHaveLength(1);
    expect(r.tension).toHaveLength(0);
  });

  it('guarda quién y cuándo lo dijo', () => {
    const r = P.loQueMeDicen([dijo('1', 'p1', ['Tozudo'], 'En discusión', '2026-08-01')], gente);
    const t = r.tension[0].testimonios[0];
    expect(t.quienNombre).toBe('Ana');
    expect(t.cuando).toBe('2026-08-01');
    expect(t.enCaliente).toBe(true);
  });

  it('un adjetivo dicho por dos personas queda consolidado', () => {
    const entries = [
      dijo('1', 'p1', ['Tozudo'], 'En discusión', '2026-08-01'),
      dijo('2', 'p2', ['Tozudo'], 'En discusión', '2026-08-05'),
    ];
    const r = P.loQueMeDicen(entries, gente);
    expect(r.tension[0].vocesDistintas).toBe(2);
    expect(r.tension[0].consolidado).toBe(true);
  });

  it('la misma persona repitiéndose NO consolida', () => {
    const entries = [
      dijo('1', 'p1', ['Tozudo'], 'En discusión', '2026-08-01'),
      dijo('2', 'p1', ['Tozudo'], 'En discusión', '2026-08-09'),
    ];
    const r = P.loQueMeDicen(entries, gente);
    expect(r.tension[0].veces).toBe(2);
    expect(r.tension[0].vocesDistintas).toBe(1);
    expect(r.tension[0].consolidado).toBe(false);
  });

  it('ordena primero lo que dice más gente distinta', () => {
    const entries = [
      dijo('1', 'p1', ['Impaciente'], 'En calma', '2026-08-01'),
      dijo('2', 'p1', ['Impaciente'], 'En calma', '2026-08-02'),
      dijo('3', 'p1', ['Generoso'], 'En calma', '2026-08-03'),
      dijo('4', 'p2', ['Generoso'], 'En calma', '2026-08-04'),
    ];
    expect(P.loQueMeDicen(entries, gente).normal[0].palabra).toBe('Generoso');
  });

  it('ignora las entradas que no son "me dijeron"', () => {
    const entries = [{ id: 'x', tipo: 'roce', adjetivos: ['Agresivo'], conQuien: 'p1' }];
    const r = P.loQueMeDicen(entries, gente);
    expect(r.normal).toHaveLength(0);
    expect(r.tension).toHaveLength(0);
  });
});

describe('mis apartados y mi ideal', () => {
  it('añade y quita adjetivos propios sin tocar los otros perfiles', () => {
    let g = P.ponerAdjetivoMio(gente, 'Paciente', P.PERFIL_NORMAL);
    g = P.ponerAdjetivoMio(g, 'Impulsivo', P.PERFIL_TENSION);
    expect(P.misAdjetivos(g, P.PERFIL_NORMAL).map((a) => a.palabra)).toEqual(['Paciente']);
    g = P.quitarAdjetivoMio(g, 'Paciente', P.PERFIL_NORMAL);
    expect(P.misAdjetivos(g, P.PERFIL_NORMAL)).toHaveLength(0);
    expect(P.misAdjetivos(g, P.PERFIL_TENSION)).toHaveLength(1);
  });

  it('el ideal admite todos los adjetivos que quieras', () => {
    let g = gente;
    for (const p of ['Sereno', 'Curioso', 'Firme', 'Generoso', 'Constante']) {
      g = P.ponerEnIdeal(g, p);
    }
    expect(P.miIdeal(g)).toHaveLength(5);
  });

  it('el ideal no admite duplicados', () => {
    let g = P.ponerEnIdeal(gente, 'Sereno');
    g = P.ponerEnIdeal(g, 'sereno');
    expect(P.miIdeal(g)).toHaveLength(1);
  });
});

describe('la ficha de una persona (a partir de sus "Observación")', () => {
  const obs = (id, quien, adjetivos, frase, cuando) => ({
    id, tipo: 'observacion', conQuien: quien, adjetivos, frase, fechaEvento: cuando,
  });

  it('agrupa los adjetivos por frecuencia', () => {
    const entries = [
      obs('1', 'p1', ['Tozudo'], 'no dio su brazo a torcer', '2026-08-01'),
      obs('2', 'p1', ['Tozudo', 'Generoso'], 'invitó a todos', '2026-08-05'),
    ];
    const ficha = P.fichaDePersona(entries, 'p1');
    expect(ficha[0]).toMatchObject({ palabra: 'Tozudo', veces: 2 });
    expect(ficha[1]).toMatchObject({ palabra: 'Generoso', veces: 1 });
  });

  it('cada adjetivo guarda de qué frase salió', () => {
    const entries = [obs('1', 'p1', ['Tozudo'], 'no dio su brazo a torcer', '2026-08-01')];
    const ficha = P.fichaDePersona(entries, 'p1');
    expect(ficha[0].testimonios[0]).toMatchObject({ entryId: '1', frase: 'no dio su brazo a torcer' });
  });

  it('ignora entradas de otras personas o de otro tipo', () => {
    const entries = [
      obs('1', 'p2', ['Tozudo'], 'x', '2026-08-01'),
      dijo('2', 'p1', ['Impaciente'], 'En calma', '2026-08-01'),
    ];
    expect(P.fichaDePersona(entries, 'p1')).toEqual([]);
  });

  it('lista las frases literales, más recientes primero', () => {
    const entries = [
      obs('1', 'p1', ['Tozudo'], 'primera', '2026-08-01'),
      obs('2', 'p1', [], 'segunda', '2026-08-10'),
    ];
    const frases = P.frasesDePersona(entries, 'p1');
    expect(frases.map((f) => f.frase)).toEqual(['segunda', 'primera']);
  });
});

describe('estadísticas', () => {
  const entries = [
    dijo('1', 'p1', ['Tozudo'], 'En discusión', '2026-07-02'),
    dijo('2', 'p2', ['Tozudo'], 'En discusión', '2026-07-10'),
    dijo('3', 'p3', ['Generoso'], 'En calma', '2026-07-15'),
    { id: 'r1', tipo: 'roce', conQuien: 'p1', tema: 'planes de última hora', respuesta: 'Entré a rebatir', fechaEvento: '2026-07-03' },
    { id: 'r2', tipo: 'roce', conQuien: 'p1', tema: 'planes de última hora', respuesta: 'Puse un límite', fechaEvento: '2026-07-08' },
    { id: 'r3', tipo: 'roce', conQuien: 'p1', tema: 'dinero', respuesta: 'Lo dejé pasar', fechaEvento: '2026-07-20' },
    { id: 'r4', tipo: 'roce', conQuien: 'p2', tema: 'dinero', respuesta: 'Puse un límite', fechaEvento: '2026-07-22' },
    { id: 'a1', tipo: 'acierto', fechaEvento: '2026-07-25' },
    { id: 'a2', tipo: 'acierto', fechaEvento: '2026-07-26' },
  ];

  it('el punto ciego muestra lo que dicen varios y tú no reconoces', () => {
    const pc = E.puntoCiego(entries, gente);
    expect(pc.map((x) => x.palabra)).toEqual(['Tozudo']);
  });

  it('si ya lo reconoces, deja de ser punto ciego', () => {
    const g = P.ponerAdjetivoMio(gente, 'Tozudo', P.PERFIL_TENSION);
    expect(E.puntoCiego(entries, g)).toHaveLength(0);
  });

  it('el espejismo muestra lo que tú dices y nadie ha dicho', () => {
    const g = P.ponerAdjetivoMio(gente, 'Diplomático', P.PERFIL_NORMAL);
    expect(E.espejismo(entries, g).map((x) => x.palabra)).toEqual(['Diplomático']);
  });

  it('la brecha de tensión aísla lo que solo sale discutiendo', () => {
    expect(E.brechaTension(entries, gente).map((x) => x.palabra)).toEqual(['Tozudo']);
  });

  it('detecta si los roces se concentran en una sola persona', () => {
    const c = E.concentracion(entries, gente);
    expect(c.suficiente).toBe(false); // solo 4 roces: no opina con tan poco
    const mas = [...entries, { id: 'r5', tipo: 'roce', conQuien: 'p1', fechaEvento: '2026-07-28' }];
    const c2 = E.concentracion(mas, gente);
    expect(c2.principal).toBe('Ana');
    expect(c2.concentrado).toBe(true);
  });

  it('saca los temas que se repiten', () => {
    expect(E.temasRecurrentes(entries).map((t) => t.tema))
      .toEqual(expect.arrayContaining(['planes de última hora', 'dinero']));
  });

  it('reparte cómo respondes', () => {
    const r = E.repartoRespuestas(entries);
    expect(r.total).toBe(4);
    expect(r.reparto.find((x) => x.respuesta === 'Puse un límite').veces).toBe(2);
  });
});

describe('la trampa del denominador', () => {
  const mes = (m, roces, otros) => [
    ...Array.from({ length: roces }, (_, i) => ({ id: `r${m}${i}`, tipo: 'roce', fechaEvento: `${m}-05` })),
    ...Array.from({ length: otros }, (_, i) => ({ id: `o${m}${i}`, tipo: 'observacion', fechaEvento: `${m}-06` })),
  ];

  it('registrar más NO se interpreta como discutir más', () => {
    // Julio: 2 roces de 4 entradas. Agosto: 6 roces de 12. Misma proporción.
    const t = E.tendenciaRoces([...mes('2026-07', 2, 2), ...mes('2026-08', 6, 6)]);
    expect(t.concluyente).toBe(true);
    expect(t.sentido).toBe('igual');
    expect(t.actual.roces).toBeGreaterThan(t.previo.roces); // el bruto sí sube
  });

  it('un aumento real de proporción sí se detecta', () => {
    const t = E.tendenciaRoces([...mes('2026-07', 1, 9), ...mes('2026-08', 8, 2)]);
    expect(t.sentido).toBe('sube');
  });

  it('con pocos datos no se pronuncia', () => {
    const t = E.tendenciaRoces([...mes('2026-07', 1, 1), ...mes('2026-08', 2, 0)]);
    expect(t.concluyente).toBe(false);
  });
});
