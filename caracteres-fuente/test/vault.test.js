import { describe, it, expect, beforeEach } from 'vitest';
import * as v from '../src/lib/vault.js';
import * as b from '../src/lib/backup.js';

describe('caja fuerte', () => {
  beforeEach(() => v.cerrar());

  it('crea la caja y queda abierta', async () => {
    await v.crear('4821');
    expect(v.estaAbierta()).toBe(true);
    expect(v.hayVault()).toBe(true);
    expect(v.leer().entries).toEqual([]);
  });

  it('lo guardado en el navegador no es legible', async () => {
    await v.crear('4821');
    await v.guardar('entries', [{ id: '1', frase: 'nunca reconoces un error' }]);
    const crudo = localStorage.getItem(v.CLAVE_ALMACEN);
    expect(crudo).not.toContain('nunca reconoces');
    expect(crudo).not.toContain('frase');
  });

  it('reabre con el PIN correcto y devuelve los datos', async () => {
    await v.crear('4821');
    await v.guardar('entries', [{ id: '1', tipo: 'roce' }]);
    v.cerrar();
    expect(await v.abrir('4821')).toBe(true);
    expect(v.leer().entries).toHaveLength(1);
  });

  it('rechaza el PIN incorrecto sin abrir nada', async () => {
    await v.crear('4821');
    v.cerrar();
    expect(await v.abrir('0000')).toBe(false);
    expect(v.estaAbierta()).toBe(false);
  });

  it('cambiar el PIN conserva los datos', async () => {
    await v.crear('1111');
    await v.guardar('people', [{ id: 'yo', nombre: 'Yo' }]);
    expect(await v.cambiarPin('1111', '2222')).toBe(true);
    v.cerrar();
    expect(await v.abrir('1111')).toBe(false);
    expect(await v.abrir('2222')).toBe(true);
    expect(v.leer().people).toHaveLength(1);
  });

  it('no deja guardar con la caja cerrada', async () => {
    await expect(v.guardar('entries', [])).rejects.toThrow();
  });

  it('expone la clave y la sal actuales solo mientras está abierta', async () => {
    expect(v.claveActual()).toBeNull();
    expect(v.salActual()).toBeNull();
    await v.crear('4821');
    expect(v.claveActual()).not.toBeNull();
    expect(v.salActual()).toBeInstanceOf(Uint8Array);
    v.cerrar();
    expect(v.claveActual()).toBeNull();
  });
});

describe('copias de seguridad', () => {
  const datos = {
    entries: [{ id: 'a', tipo: 'medijeron', frase: 'te cierras en banda' }],
    people: [{ id: 'yo', nombre: 'Yo', adjetivos: [] }],
    config: { avisoCada: 5 },
  };

  const hacerCopia = async (pin) => {
    const sal = crypto.getRandomValues(new Uint8Array(16));
    const clave = await v.derivarClave(pin, sal);
    return b.crearCopia({ clave, sal, datos });
  };

  it('el archivo sale cifrado, sin texto legible', async () => {
    const txt = await hacerCopia('4821');
    expect(txt).not.toContain('te cierras en banda');
    expect(JSON.parse(txt).cifrado).toBe(true);
    expect(b.necesitaPin(txt)).toBe(true);
  });

  it('se abre con el PIN correcto y devuelve lo mismo', async () => {
    const txt = await hacerCopia('4821');
    const r = await b.abrirCopia(txt, '4821');
    expect(r.ok).toBe(true);
    expect(r.datos.entries).toEqual(datos.entries);
    expect(r.datos.config).toEqual(datos.config);
  });

  it('rechaza el PIN equivocado', async () => {
    const txt = await hacerCopia('4821');
    expect(await b.abrirCopia(txt, '9999')).toMatchObject({ ok: false, causa: 'pin' });
  });

  it('avisa si falta el PIN', async () => {
    const txt = await hacerCopia('4821');
    expect(await b.abrirCopia(txt)).toMatchObject({ ok: false, causa: 'pin' });
  });

  it('sigue abriendo copias antiguas sin cifrar', async () => {
    const vieja = JSON.stringify({ version: 2, ...datos });
    expect(b.necesitaPin(vieja)).toBe(false);
    const r = await b.abrirCopia(vieja);
    expect(r.ok).toBe(true);
    expect(r.datos.entries).toHaveLength(1);
  });

  it('detecta archivos corruptos o ajenos', async () => {
    expect(await b.abrirCopia('esto no es json')).toMatchObject({ causa: 'ilegible' });
    expect(await b.abrirCopia('{"hola":1}')).toMatchObject({ causa: 'formato' });
  });

  it('el nombre del archivo acaba en .txt (Android no comparte .json)', () => {
    expect(b.nombreArchivo(new Date('2026-08-23'))).toBe('caracteres-2026-08-23.txt');
  });
});

describe('aviso de copia por cantidad', () => {
  const yo = [{ id: 'yo', nombre: 'Yo', adjetivos: [] }];
  const ents = (n) => Array.from({ length: n }, (_, i) => ({ id: 'e' + i }));

  it('cuenta entradas, personas y adjetivos', () => {
    expect(b.contarDatos([], yo)).toBe(1);
    expect(b.contarDatos(ents(3), yo)).toBe(4);
    expect(b.contarDatos(ents(2), [{ id: 'yo', adjetivos: ['a', 'b'] }])).toBe(5);
  });

  it('salta al llegar al límite, no antes', () => {
    const c = { lastExportN: 0, avisoCada: 5 };
    expect(b.tocaAvisar(ents(3), yo, c)).toBe(false);
    expect(b.tocaAvisar(ents(4), yo, c)).toBe(true);
  });

  it('"ahora no" lo calla hasta acumular otro tanto', () => {
    const c = { lastExportN: 0, avisoCada: 5, avisoPospuestoN: 5 };
    expect(b.tocaAvisar(ents(4), yo, c)).toBe(false);
    expect(b.tocaAvisar(ents(7), yo, c)).toBe(false);
    expect(b.tocaAvisar(ents(9), yo, c)).toBe(true);
  });

  it('tras exportar, el contador se pone a cero', () => {
    const c = b.selloDeCopia({ avisoCada: 5 }, ents(9), yo);
    expect(b.sinRespaldar(ents(9), yo, c)).toBe(0);
    expect(b.tocaAvisar(ents(9), yo, c)).toBe(false);
    expect(b.tocaAvisar(ents(14), yo, c)).toBe(true);
  });

  it('borrar datos no da números negativos', () => {
    expect(b.sinRespaldar(ents(1), yo, { lastExportN: 99 })).toBe(0);
  });
});
