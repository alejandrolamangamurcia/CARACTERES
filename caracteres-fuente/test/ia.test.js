import { describe, it, expect, vi, afterEach } from 'vitest';
import { sugerirAdjetivos } from '../src/lib/ia.js';

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
