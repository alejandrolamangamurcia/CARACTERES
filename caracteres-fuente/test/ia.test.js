import { describe, it, expect, vi, afterEach } from 'vitest';
import { sugerirAdjetivos, buscarPatrones } from '../src/lib/ia.js';

const respuestaOk = (candidatos, aviso_estado = null) => ({
  ok: true,
  status: 200,
  json: async () => ({
    content: [{ type: 'text', text: JSON.stringify({ candidatos, aviso_estado }) }],
  }),
});

describe('sugerirAdjetivos', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('sin clave, falla antes de llamar a la red', async () => {
    const fetchEspia = vi.fn();
    vi.stubGlobal('fetch', fetchEspia);
    await expect(sugerirAdjetivos('', 'algo')).rejects.toThrow(/clave/i);
    expect(fetchEspia).not.toHaveBeenCalled();
  });

  it('manda la conducta y devuelve los candidatos', async () => {
    const candidatos = [{ palabra: 'Extrovertido', razon: 'busca gente', confianza: 'alta' }];
    const fetchEspia = vi.fn().mockResolvedValue(respuestaOk(candidatos));
    vi.stubGlobal('fetch', fetchEspia);

    const r = await sugerirAdjetivos('clave-de-prueba', 'se puso a hablar con todos');

    expect(r.candidatos).toEqual(candidatos);
    const [url, opts] = fetchEspia.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(opts.headers['x-api-key']).toBe('clave-de-prueba');
    const body = JSON.parse(opts.body);
    expect(body.messages[0].content).toBe('Conducta: se puso a hablar con todos');
  });

  it('con marco, antepone el CONTEXTO a la conducta', async () => {
    const fetchEspia = vi.fn().mockResolvedValue(respuestaOk([]));
    vi.stubGlobal('fetch', fetchEspia);

    await sugerirAdjetivos('k', 'que yo era muy sensata', 'Un tercero se lo dijo al usuario, sobre el usuario');

    const body = JSON.parse(fetchEspia.mock.calls[0][1].body);
    expect(body.messages[0].content).toBe(
      'CONTEXTO: Un tercero se lo dijo al usuario, sobre el usuario\nConducta: que yo era muy sensata',
    );
  });

  it('quita las marcas de bloque de código si la IA las incluye', async () => {
    const fetchEspia = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ content: [{ type: 'text', text: '```json\n{"candidatos":[],"aviso_estado":null}\n```' }] }),
    });
    vi.stubGlobal('fetch', fetchEspia);
    const r = await sugerirAdjetivos('k', 'algo');
    expect(r.candidatos).toEqual([]);
  });

  it('clave rechazada (401) da un mensaje claro', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    await expect(sugerirAdjetivos('mala', 'algo')).rejects.toThrow(/clave/i);
  });

  it('límite de peticiones (429) da un mensaje claro', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }));
    await expect(sugerirAdjetivos('k', 'algo')).rejects.toThrow(/límite/i);
  });

  it('fallo de red da un mensaje claro', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')));
    await expect(sugerirAdjetivos('k', 'algo')).rejects.toThrow(/red/i);
  });
});

describe('buscarPatrones', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  const respuestaPatrones = (patrones) => ({
    ok: true,
    status: 200,
    json: async () => ({
      content: [{ type: 'text', text: JSON.stringify({ patrones }) }],
    }),
  });

  it('manda las frases numeradas por id y devuelve los patrones', async () => {
    const patrones = [{ palabra: 'Despistado', evidencias: ['a', 'b'], razon: 'la confunde dos veces' }];
    const fetchEspia = vi.fn().mockResolvedValue(respuestaPatrones(patrones));
    vi.stubGlobal('fetch', fetchEspia);

    const r = await buscarPatrones('clave', [
      { id: 'a', texto: 'la confundió con su ex' },
      { id: 'b', texto: 'volvió a confundirla' },
    ]);

    expect(r.patrones).toEqual(patrones);
    const [, opts] = fetchEspia.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.messages[0].content).toBe(
      '[a] la confundió con su ex\n[b] volvió a confundirla',
    );
  });

  it('sin clave, falla antes de llamar a la red', async () => {
    const fetchEspia = vi.fn();
    vi.stubGlobal('fetch', fetchEspia);
    await expect(buscarPatrones('', [{ id: 'a', texto: 'x' }])).rejects.toThrow(/clave/i);
    expect(fetchEspia).not.toHaveBeenCalled();
  });

  it('con marco, antepone el CONTEXTO a las frases', async () => {
    const fetchEspia = vi.fn().mockResolvedValue(respuestaPatrones([]));
    vi.stubGlobal('fetch', fetchEspia);

    await buscarPatrones('k', [{ id: 'a', texto: 'x' }], 'Frases de Luis, no del usuario');

    const body = JSON.parse(fetchEspia.mock.calls[0][1].body);
    expect(body.messages[0].content).toBe('CONTEXTO: Frases de Luis, no del usuario\n[a] x');
  });
});
