import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/main.jsx';
import * as vault from '../src/lib/vault.js';
import lexico from '../src/data/lexico.json';

async function entrar(u) {
  render(<App />);
  await screen.findByText(/Crear y entrar/);
  await u.type(screen.getByLabelText('PIN'), '4821');
  await u.type(screen.getByLabelText('Repítelo'), '4821');
  await u.click(screen.getByRole('button', { name: /Crear y entrar/ }));
  await screen.findByText('Registrar', { selector: 'h2' });
}

const irAMas = async (u, subEtiqueta) => {
  await u.click(screen.getByRole('button', { name: 'Más' }));
  await u.click(screen.getByRole('button', { name: subEtiqueta }));
};

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('navegación básica', () => {
  beforeEach(() => { vault.cerrar(); localStorage.clear(); });

  it('aterriza en Registrar y navega a Entradas, Personas y Guía', async () => {
    const u = userEvent.setup();
    await entrar(u);

    await u.click(screen.getByRole('button', { name: 'Entradas' }));
    expect(screen.getByText('Todavía no hay nada registrado.')).toBeInTheDocument();

    await u.click(screen.getByRole('button', { name: 'Personas' }));
    expect(screen.getByText('Yo', { selector: 'h2' })).toBeInTheDocument();

    await u.click(screen.getByRole('button', { name: 'Guía' }));
    expect(screen.getByText('Vocabulario sin estudiar')).toBeInTheDocument();
  });

  it('Más tiene Estadísticas, Estudio y Ajustes', async () => {
    const u = userEvent.setup();
    await entrar(u);
    await u.click(screen.getByRole('button', { name: 'Más' }));
    expect(screen.getByRole('button', { name: 'Estadísticas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Estudio' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ajustes' })).toBeInTheDocument();
  });
});

describe('Ajustes', () => {
  beforeEach(() => { vault.cerrar(); localStorage.clear(); });

  it('guarda la clave de la IA', async () => {
    const u = userEvent.setup();
    await entrar(u);
    await irAMas(u, 'Ajustes');
    await u.type(screen.getByLabelText(/Clave de Anthropic/), 'sk-ant-prueba');
    await u.click(screen.getByRole('button', { name: 'Guardar clave' }));
    expect(await screen.findByText('Guardada.')).toBeInTheDocument();
  });

  it('cambia el PIN y permite reabrir con el nuevo', async () => {
    const u = userEvent.setup();
    await entrar(u);
    await irAMas(u, 'Ajustes');

    await u.type(screen.getByLabelText('PIN actual'), '4821');
    await u.type(screen.getByLabelText('PIN nuevo'), '9999');
    await u.type(screen.getByLabelText('Repite el PIN nuevo'), '9999');
    await u.click(screen.getByRole('button', { name: 'Cambiar PIN' }));
    expect(await screen.findByText('PIN cambiado.')).toBeInTheDocument();

    await u.click(screen.getByRole('button', { name: 'Bloquear' }));
    await u.type(await screen.findByLabelText('PIN'), '9999');
    await u.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(await screen.findByRole('button', { name: 'Bloquear' })).toBeInTheDocument();
  });

  it('avisa si el PIN actual está mal al intentar cambiarlo', async () => {
    const u = userEvent.setup();
    await entrar(u);
    await irAMas(u, 'Ajustes');
    await u.type(screen.getByLabelText('PIN actual'), '0000');
    await u.type(screen.getByLabelText('PIN nuevo'), '9999');
    await u.type(screen.getByLabelText('Repite el PIN nuevo'), '9999');
    await u.click(screen.getByRole('button', { name: 'Cambiar PIN' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/PIN actual no es correcto/);
  });

  it('exporta e importa una copia de seguridad', async () => {
    const u = userEvent.setup();
    await entrar(u);

    // Registra algo para tener datos que exportar.
    await u.selectOptions(screen.getByLabelText('Quién te lo dijo'), '+ Añadir persona nueva');
    await u.type(screen.getByPlaceholderText('Nombre o iniciales'), 'Marta');
    await u.click(screen.getByRole('button', { name: 'Añadir persona' }));
    await u.type(screen.getByLabelText('Lo que te dijeron'), 'Una frase cualquiera');
    await u.click(screen.getByRole('button', { name: 'Guardar entrada' }));
    await screen.findByText('Guardada.');

    await irAMas(u, 'Ajustes');

    // Sin navigator.share (como en jsdom), cae al enlace de descarga.
    const urlEspia = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:falso');
    const revokeEspia = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const clickEspia = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    await u.type(screen.getByLabelText('PIN para cifrar la copia'), '1234');
    await u.click(screen.getByRole('button', { name: 'Compartir copia (.txt)' }));
    await screen.findByText('Copia exportada.');

    expect(urlEspia).toHaveBeenCalled();
    expect(clickEspia).toHaveBeenCalled();

    // Recupera el texto exportado a partir del blob pasado a createObjectURL.
    const blobExportado = urlEspia.mock.calls[0][0];
    const textoExportado = await blobExportado.text();

    urlEspia.mockRestore(); revokeEspia.mockRestore(); clickEspia.mockRestore();

    // Importar: simula elegir el archivo exportado.
    const archivo = new File([textoExportado], 'caracteres.txt', { type: 'text/plain' });
    const input = screen.getByLabelText('Importar una copia');
    await u.upload(input, archivo);

    await u.type(await screen.findByLabelText(/introduce su PIN/), '1234');
    await u.click(screen.getByRole('button', { name: 'Abrir copia' }));

    expect(await screen.findByText('Copia importada. Sustituye a los datos anteriores.')).toBeInTheDocument();
  });

  it('si el móvil sabe compartir archivos, abre el menú de compartir en vez de descargar', async () => {
    const u = userEvent.setup();
    await entrar(u);
    await irAMas(u, 'Ajustes');

    const shareEspia = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      ...navigator,
      canShare: () => true,
      share: shareEspia,
    });

    await u.type(screen.getByLabelText('PIN para cifrar la copia'), '1234');
    await u.click(screen.getByRole('button', { name: 'Compartir copia (.txt)' }));

    expect(await screen.findByText('Copia compartida.')).toBeInTheDocument();
    expect(shareEspia).toHaveBeenCalledTimes(1);
    const args = shareEspia.mock.calls[0][0];
    expect(args.files[0].name).toMatch(/^caracteres-.*\.txt$/);
  });

  it('si cancelas el menú de compartir, no muestra error ni marca la copia como hecha', async () => {
    const u = userEvent.setup();
    await entrar(u);
    await irAMas(u, 'Ajustes');

    const errorCancelado = Object.assign(new Error('cancelado'), { name: 'AbortError' });
    vi.stubGlobal('navigator', {
      ...navigator,
      canShare: () => true,
      share: vi.fn().mockRejectedValue(errorCancelado),
    });

    await u.type(screen.getByLabelText('PIN para cifrar la copia'), '1234');
    await u.click(screen.getByRole('button', { name: 'Compartir copia (.txt)' }));

    await screen.findByRole('button', { name: 'Compartir copia (.txt)' });
    expect(screen.queryByText('Copia compartida.')).toBeNull();
    expect(screen.queryByText(/No se pudo compartir/)).toBeNull();
  });
});

describe('Registrar (los cinco tipos)', () => {
  beforeEach(() => { vault.cerrar(); localStorage.clear(); });

  it('crea una persona nueva desde el selector', async () => {
    const u = userEvent.setup();
    await entrar(u);
    await u.selectOptions(screen.getByLabelText('Quién te lo dijo'), '+ Añadir persona nueva');
    await u.type(screen.getByPlaceholderText('Nombre o iniciales'), 'Marta');
    await u.click(screen.getByRole('button', { name: 'Añadir persona' }));
    expect(screen.getByRole('option', { name: 'Marta' })).toBeInTheDocument();
  });

  it('pide sugerencias a la IA, deja marcarlas y guarda la entrada de "me dijeron"', async () => {
    const u = userEvent.setup();
    const fetchEspia = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        content: [{
          type: 'text',
          text: JSON.stringify({
            candidatos: [{ palabra: 'Impaciente', razon: 'interrumpe', confianza: 'alta' }],
            aviso_estado: null,
          }),
        }],
      }),
    });
    vi.stubGlobal('fetch', fetchEspia);

    await entrar(u);

    await irAMas(u, 'Ajustes');
    await u.type(screen.getByLabelText(/Clave de Anthropic/), 'sk-ant-prueba');
    await u.click(screen.getByRole('button', { name: 'Guardar clave' }));
    await screen.findByText('Guardada.');

    await u.click(screen.getByRole('button', { name: 'Registrar' }));
    await u.selectOptions(screen.getByLabelText('Quién te lo dijo'), '+ Añadir persona nueva');
    await u.type(screen.getByPlaceholderText('Nombre o iniciales'), 'Marta');
    await u.click(screen.getByRole('button', { name: 'Añadir persona' }));

    await u.type(screen.getByLabelText('Lo que te dijeron'), 'Otra vez con las prisas');
    await u.click(screen.getByRole('button', { name: 'Sugerir adjetivos' }));

    const chip = await screen.findByText('Impaciente');
    await u.click(chip);
    expect(chip).toHaveClass('on');

    await u.click(screen.getByRole('button', { name: 'Guardar entrada' }));
    expect(await screen.findByText('Guardada.')).toBeInTheDocument();

    await u.click(screen.getByRole('button', { name: 'Entradas' }));
    expect(screen.getByText('Otra vez con las prisas')).toBeInTheDocument();
    expect(screen.getByText('Impaciente')).toBeInTheDocument();

    expect(fetchEspia).toHaveBeenCalledTimes(1);
  });

  it('mantener pulsado un adjetivo sugerido enseña su definición, con ✕ para cerrarla', async () => {
    const u = userEvent.setup();
    const fetchEspia = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        content: [{
          type: 'text',
          text: JSON.stringify({
            candidatos: [{ palabra: 'Extrovertido', razon: 'busca gente', confianza: 'alta' }],
            aviso_estado: null,
          }),
        }],
      }),
    });
    vi.stubGlobal('fetch', fetchEspia);

    await entrar(u);
    await irAMas(u, 'Ajustes');
    await u.type(screen.getByLabelText(/Clave de Anthropic/), 'sk-ant-prueba');
    await u.click(screen.getByRole('button', { name: 'Guardar clave' }));
    await screen.findByText('Guardada.');

    await u.click(screen.getByRole('button', { name: 'Registrar' }));
    await u.type(screen.getByLabelText('Lo que te dijeron'), 'Se puso a hablar con todos en la fiesta');
    await u.click(screen.getByRole('button', { name: 'Sugerir adjetivos' }));
    const chip = await screen.findByText('Extrovertido');

    vi.useFakeTimers();
    fireEvent.pointerDown(chip);
    act(() => { vi.advanceTimersByTime(500); });
    vi.useRealTimers();

    expect(await screen.findByText(/Se ve:/)).toBeInTheDocument();
    // Trae tres ejemplos, no uno solo.
    expect(screen.getByText(/con más energía de la que entró/)).toBeInTheDocument();
    expect(screen.getByText(/antes de que el grupo se haya despedido/)).toBeInTheDocument();
    expect(screen.getByText(/un viaje sin planes de gente nueva/)).toBeInTheDocument();

    // Soltar tras la definición no debe marcar el chip como elegido.
    fireEvent.pointerUp(chip);
    expect(chip).not.toHaveClass('on');

    await u.click(screen.getByRole('button', { name: '✕' }));
    expect(screen.queryByText(/Se ve:/)).toBeNull();
  });

  it('un toque corto (sin mantener pulsado) sigue marcando el adjetivo normalmente', async () => {
    const u = userEvent.setup();
    const fetchEspia = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        content: [{
          type: 'text',
          text: JSON.stringify({
            candidatos: [{ palabra: 'Extrovertido', razon: 'r', confianza: 'alta' }],
            aviso_estado: null,
          }),
        }],
      }),
    });
    vi.stubGlobal('fetch', fetchEspia);

    await entrar(u);
    await irAMas(u, 'Ajustes');
    await u.type(screen.getByLabelText(/Clave de Anthropic/), 'sk-ant-prueba');
    await u.click(screen.getByRole('button', { name: 'Guardar clave' }));
    await screen.findByText('Guardada.');

    await u.click(screen.getByRole('button', { name: 'Registrar' }));
    await u.type(screen.getByLabelText('Lo que te dijeron'), 'Se puso a hablar con todos en la fiesta');
    await u.click(screen.getByRole('button', { name: 'Sugerir adjetivos' }));
    const chip = await screen.findByText('Extrovertido');

    await u.click(chip);
    expect(chip).toHaveClass('on');
    expect(screen.queryByText(/Se ve:/)).toBeNull();
  });

  it('sin clave guardada, avisa en vez de romperse', async () => {
    const u = userEvent.setup();
    await entrar(u);
    await u.type(screen.getByLabelText('Lo que te dijeron'), 'Algo que dijeron');
    await u.click(screen.getByRole('button', { name: 'Sugerir adjetivos' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/clave/i);
  });

  it('un adjetivo añadido a mano se puede quitar antes de guardar', async () => {
    const u = userEvent.setup();
    await entrar(u);
    await u.type(screen.getByPlaceholderText('Añadir otro adjetivo a mano'), 'Tozudo');
    await u.click(screen.getByRole('button', { name: 'Añadir adjetivo' }));
    expect(await screen.findByText('Tozudo ✕')).toBeInTheDocument();

    await u.click(screen.getByText('Tozudo ✕'));
    expect(screen.queryByText('Tozudo ✕')).toBeNull();
  });

  it('registra un roce con quién, tema y cómo respondiste', async () => {
    const u = userEvent.setup();
    await entrar(u);
    await u.click(screen.getByRole('button', { name: 'Roce' }));
    await u.type(screen.getByLabelText('Tema (opcional)'), 'planes de última hora');
    await u.selectOptions(screen.getByLabelText('Cómo respondiste'), 'Puse un límite');
    await u.type(screen.getByLabelText('Qué pasó'), 'Canceló todo a última hora otra vez');
    await u.click(screen.getByRole('button', { name: 'Guardar entrada' }));
    await screen.findByText('Guardada.');

    await u.click(screen.getByRole('button', { name: 'Entradas' }));
    expect(screen.getByText('Canceló todo a última hora otra vez')).toBeInTheDocument();
    expect(screen.getByText('Puse un límite')).toBeInTheDocument();
  });

  it('la sugerencia de IA también funciona en Observación (y guarda los adjetivos elegidos)', async () => {
    const u = userEvent.setup();
    const fetchEspia = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        content: [{
          type: 'text',
          text: JSON.stringify({
            candidatos: [{ palabra: 'Puntual', razon: 'llegó a tiempo', confianza: 'alta' }],
            aviso_estado: null,
          }),
        }],
      }),
    });
    vi.stubGlobal('fetch', fetchEspia);

    await entrar(u);
    await irAMas(u, 'Ajustes');
    await u.type(screen.getByLabelText(/Clave de Anthropic/), 'sk-ant-prueba');
    await u.click(screen.getByRole('button', { name: 'Guardar clave' }));
    await screen.findByText('Guardada.');

    await u.click(screen.getByRole('button', { name: 'Registrar' }));
    await u.click(screen.getByRole('button', { name: 'Observación' }));
    await u.type(screen.getByLabelText('Qué observaste'), 'Llegó puntual sin que nadie se lo pidiera');
    await u.click(screen.getByRole('button', { name: 'Sugerir adjetivos' }));

    const chip = await screen.findByText('Puntual');
    await u.click(chip);
    await u.click(screen.getByRole('button', { name: 'Guardar entrada' }));
    await screen.findByText('Guardada.');

    await u.click(screen.getByRole('button', { name: 'Entradas' }));
    expect(screen.getByText('Llegó puntual sin que nadie se lo pidiera')).toBeInTheDocument();
    expect(screen.getByText('Puntual')).toBeInTheDocument();
  });

  it('al pedir sugerencias en "Me dijeron", le dice a la IA que es un testimonio de un tercero sobre el usuario', async () => {
    const u = userEvent.setup();
    const fetchEspia = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        content: [{ type: 'text', text: JSON.stringify({ candidatos: [], aviso_estado: null }) }],
      }),
    });
    vi.stubGlobal('fetch', fetchEspia);

    await entrar(u);
    await irAMas(u, 'Ajustes');
    await u.type(screen.getByLabelText(/Clave de Anthropic/), 'sk-ant-prueba');
    await u.click(screen.getByRole('button', { name: 'Guardar clave' }));
    await screen.findByText('Guardada.');

    await u.click(screen.getByRole('button', { name: 'Registrar' }));
    await u.type(screen.getByLabelText('Lo que te dijeron'), 'que yo era una persona muy sensata');
    await u.click(screen.getByRole('button', { name: 'Sugerir adjetivos' }));

    await waitFor(() => expect(fetchEspia).toHaveBeenCalled());
    const enviado = JSON.parse(fetchEspia.mock.calls[0][1].body).messages[0].content;
    expect(enviado).toMatch(/^CONTEXTO: .*tercero.*al usuario/);
    expect(enviado).toMatch(/NO es una autodescripción/);
    expect(enviado).toContain('Conducta: que yo era una persona muy sensata');
  });

  it('el campo de adjetivo a mano tiene la lista del léxico como sugerencia', async () => {
    const u = userEvent.setup();
    await entrar(u);
    const campo = screen.getByPlaceholderText('Añadir otro adjetivo a mano');
    expect(campo).toHaveAttribute('list', 'lexico-adjetivos');
    expect(document.getElementById('lexico-adjetivos').tagName).toBe('DATALIST');

    // Palabras únicas del léxico (algunas, como "Asertivo", están en dos
    // familias a la vez): el desplegable no debe repetirlas.
    const palabrasUnicas = new Set();
    for (const dim of lexico.dims) {
      for (const polo of dim.polos) for (const fam of polo.familias) for (const e of fam.entradas) palabrasUnicas.add(e.p);
    }

    const opciones = [...document.querySelectorAll('#lexico-adjetivos option')].map((o) => o.value);
    expect(opciones).toHaveLength(palabrasUnicas.size);
    expect(new Set(opciones).size).toBe(palabrasUnicas.size);
    expect(opciones).toContain('Asertivo');
    expect(opciones).toContain('Sensato');
  });

  it('registra una autoobservación (bien o mal) y alimenta el apartado "Yo"', async () => {
    const u = userEvent.setup();
    await entrar(u);
    await u.click(screen.getByRole('button', { name: 'Autoobservación' }));

    await u.click(screen.getByRole('button', { name: 'Mal' }));
    await u.type(
      screen.getByLabelText('Qué hiciste'),
      'Dejé para última hora un trabajo importante y lo perdí',
    );
    await u.type(screen.getByPlaceholderText('Añadir otro adjetivo a mano'), 'Procrastinador');
    await u.click(screen.getByRole('button', { name: 'Añadir adjetivo' }));
    await u.click(screen.getByRole('button', { name: 'Guardar entrada' }));
    await screen.findByText('Guardada.');

    // Aparece marcado como "Mal" en Entradas.
    await u.click(screen.getByRole('button', { name: 'Entradas' }));
    expect(screen.getByText(/Dejé para última hora/)).toBeInTheDocument();
    expect(screen.getByText('Mal')).toBeInTheDocument();

    // Y alimenta "Yo".
    await u.click(screen.getByRole('button', { name: 'Personas' }));
    expect(screen.getByText('Lo que observas de ti (mal)')).toBeInTheDocument();
    expect(screen.getByText('Procrastinador')).toBeInTheDocument();
  });

  it('registra un plan si→entonces y se puede marcar como cumplido desde Entradas', async () => {
    const u = userEvent.setup();
    await entrar(u);
    await u.click(screen.getByRole('button', { name: 'Plan si→entonces' }));
    await u.type(screen.getByLabelText('Si pasa esto'), 'Si vuelve a cancelar sin avisar');
    await u.type(screen.getByLabelText('Entonces haré esto'), 'Le propondré fechas con más margen');
    await u.click(screen.getByRole('button', { name: 'Guardar entrada' }));
    await screen.findByText('Guardada.');

    await u.click(screen.getByRole('button', { name: 'Entradas' }));
    expect(screen.getByText(/Le propondré fechas/)).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Cumplido' }));
    expect(screen.getByRole('button', { name: 'Cumplido' })).toHaveClass('on');
  });
});

describe('Personas → Yo', () => {
  beforeEach(() => { vault.cerrar(); localStorage.clear(); });

  it('deja añadir y quitar adjetivos propios', async () => {
    const u = userEvent.setup();
    await entrar(u);
    await u.click(screen.getByRole('button', { name: 'Personas' }));

    await u.type(screen.getByPlaceholderText('Añadir adjetivo (normal)'), 'Paciente');
    await u.click(screen.getByRole('button', { name: 'Añadir a normal' }));

    expect(await screen.findByText('Paciente ✕')).toBeInTheDocument();
    await u.click(screen.getByText('Paciente ✕'));
    expect(screen.queryByText('Paciente ✕')).toBeNull();
  });

  it('lo que me dicen se calcula desde las entradas de "me dijeron"', async () => {
    const u = userEvent.setup();
    await entrar(u);

    await u.selectOptions(screen.getByLabelText('Quién te lo dijo'), '+ Añadir persona nueva');
    await u.type(screen.getByPlaceholderText('Nombre o iniciales'), 'Ana');
    await u.click(screen.getByRole('button', { name: 'Añadir persona' }));
    await u.type(screen.getByLabelText('Lo que te dijeron'), 'Me dijo que era tozudo');
    await u.type(screen.getByPlaceholderText('Añadir otro adjetivo a mano'), 'Tozudo');
    await u.click(screen.getByRole('button', { name: 'Añadir adjetivo' }));
    await u.click(screen.getByRole('button', { name: 'Guardar entrada' }));
    await screen.findByText('Guardada.');

    await u.click(screen.getByRole('button', { name: 'Personas' }));
    expect(screen.getByText('Tozudo')).toBeInTheDocument();
    expect(screen.getByText(/Ana ·/)).toBeInTheDocument();
  });
});

describe('la ficha de cada persona', () => {
  beforeEach(() => { vault.cerrar(); localStorage.clear(); });

  it('se añade una persona nueva desde la propia pestaña Personas', async () => {
    const u = userEvent.setup();
    await entrar(u);
    await u.click(screen.getByRole('button', { name: 'Personas' }));

    await u.type(screen.getByPlaceholderText('Nombre o iniciales'), 'Luis');
    await u.click(screen.getByRole('button', { name: 'Añadir persona' }));

    expect(await screen.findByText('Luis')).toBeInTheDocument();
    // Al crearla se abre su ficha directamente.
    expect(screen.getByText('Adjetivos (en calma)')).toBeInTheDocument();
    expect(screen.getByText('Adjetivos (en discusión)')).toBeInTheDocument();
  });

  it('registra una frase, la IA saca adjetivos y quedan en la ficha', async () => {
    const u = userEvent.setup();
    const fetchEspia = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        content: [{
          type: 'text',
          text: JSON.stringify({
            candidatos: [{ palabra: 'Generoso', razon: 'invitó a todos', confianza: 'alta' }],
            aviso_estado: null,
          }),
        }],
      }),
    });
    vi.stubGlobal('fetch', fetchEspia);

    await entrar(u);
    await irAMas(u, 'Ajustes');
    await u.type(screen.getByLabelText(/Clave de Anthropic/), 'sk-ant-prueba');
    await u.click(screen.getByRole('button', { name: 'Guardar clave' }));
    await screen.findByText('Guardada.');

    await u.click(screen.getByRole('button', { name: 'Personas' }));
    await u.type(screen.getByPlaceholderText('Nombre o iniciales'), 'Luis');
    await u.click(screen.getByRole('button', { name: 'Añadir persona' }));

    await u.type(screen.getByLabelText('Añadir algo nuevo'), 'Invitó a toda la mesa sin que nadie se lo pidiera');
    await u.click(screen.getByRole('button', { name: 'Sugerir adjetivos' }));

    const chip = await screen.findByText('Generoso');
    await u.click(chip);
    expect(chip).toHaveClass('on');

    await u.click(screen.getByRole('button', { name: 'Guardar' }));
    await screen.findByText('Guardada.');

    expect(screen.getByText('1 vez')).toBeInTheDocument();
    expect(screen.getByText(/Dijo: Invitó a toda la mesa/)).toBeInTheDocument();
    expect(fetchEspia).toHaveBeenCalledTimes(1);

    // También aparece en el registro general de Entradas.
    await u.click(screen.getByRole('button', { name: 'Entradas' }));
    expect(screen.getByText('Invitó a toda la mesa sin que nadie se lo pidiera')).toBeInTheDocument();
  });

  it('sin clave guardada, avisa en la ficha en vez de romperse', async () => {
    const u = userEvent.setup();
    await entrar(u);
    await u.click(screen.getByRole('button', { name: 'Personas' }));
    await u.type(screen.getByPlaceholderText('Nombre o iniciales'), 'Luis');
    await u.click(screen.getByRole('button', { name: 'Añadir persona' }));

    await u.type(screen.getByLabelText('Añadir algo nuevo'), 'Algo que hizo');
    await u.click(screen.getByRole('button', { name: 'Sugerir adjetivos' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/clave/i);
  });

  it('un adjetivo elegido se puede quitar antes de guardar', async () => {
    const u = userEvent.setup();
    await entrar(u);
    await u.click(screen.getByRole('button', { name: 'Personas' }));
    await u.type(screen.getByPlaceholderText('Nombre o iniciales'), 'Luis');
    await u.click(screen.getByRole('button', { name: 'Añadir persona' }));

    await u.type(screen.getByPlaceholderText('Añadir otro adjetivo a mano'), 'Tozudo');
    await u.click(screen.getByRole('button', { name: 'Añadir adjetivo' }));
    expect(await screen.findByText('Tozudo ✕')).toBeInTheDocument();

    await u.click(screen.getByText('Tozudo ✕'));
    expect(screen.queryByText('Tozudo ✕')).toBeNull();

    // Al guardar sin adjetivos elegidos, no se cuela ninguno.
    await u.type(screen.getByLabelText('Añadir algo nuevo'), 'No dio su brazo a torcer');
    await u.click(screen.getByRole('button', { name: 'Guardar' }));
    await screen.findByText('Guardada.');
    expect(screen.getAllByText('Todavía no hay nada registrado.')).toHaveLength(4);
  });

  it('registrar un gesto (no una frase textual) también saca adjetivos y queda marcado como tal', async () => {
    const u = userEvent.setup();
    await entrar(u);
    await u.click(screen.getByRole('button', { name: 'Personas' }));
    await u.type(screen.getByPlaceholderText('Nombre o iniciales'), 'Luis');
    await u.click(screen.getByRole('button', { name: 'Añadir persona' }));

    await u.selectOptions(screen.getByLabelText('Tipo de entrada'), 'Hizo o gesto');
    await u.type(
      screen.getByLabelText('Añadir algo nuevo'),
      'Puso los ojos en blanco cuando le llevé la contraria',
    );
    await u.type(screen.getByPlaceholderText('Añadir otro adjetivo a mano'), 'Desdeñoso');
    await u.click(screen.getByRole('button', { name: 'Añadir adjetivo' }));
    await u.click(screen.getByRole('button', { name: 'Guardar' }));
    await screen.findByText('Guardada.');

    expect(screen.getByText(/Gesto: Puso los ojos en blanco/)).toBeInTheDocument();
  });

  it('un gesto deja elegir cómo te hizo sentir, y queda a la vista en la entrada', async () => {
    const u = userEvent.setup();
    await entrar(u);
    await u.click(screen.getByRole('button', { name: 'Personas' }));
    await u.type(screen.getByPlaceholderText('Nombre o iniciales'), 'Luis');
    await u.click(screen.getByRole('button', { name: 'Añadir persona' }));

    // Con "Dijo" (por defecto) no aparece el selector de sentir.
    expect(screen.queryByText('Cómo me hizo sentir')).toBeNull();

    await u.selectOptions(screen.getByLabelText('Tipo de entrada'), 'Hizo o gesto');
    expect(screen.getByText('Cómo me hizo sentir')).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Mal' }));

    await u.type(screen.getByLabelText('Añadir algo nuevo'), 'Dio un portazo al salir');
    await u.type(screen.getByPlaceholderText('Añadir otro adjetivo a mano'), 'Impulsivo');
    await u.click(screen.getByRole('button', { name: 'Añadir adjetivo' }));
    await u.click(screen.getByRole('button', { name: 'Guardar' }));
    await screen.findByText('Guardada.');

    expect(screen.getByText(/Dio un portazo al salir/)).toBeInTheDocument();
    expect(screen.getByText(/· Mal/)).toBeInTheDocument();
  });

  it('separa los adjetivos en calma y en discusión según el contexto', async () => {
    const u = userEvent.setup();
    await entrar(u);
    await u.click(screen.getByRole('button', { name: 'Personas' }));
    await u.type(screen.getByPlaceholderText('Nombre o iniciales'), 'Luis');
    await u.click(screen.getByRole('button', { name: 'Añadir persona' }));

    const selectContexto = screen.getByLabelText('Contexto');

    // Por defecto ya es "En discusión" (primera opción de la lista).
    await u.type(screen.getByLabelText('Añadir algo nuevo'), 'Contestó de malas formas');
    await u.type(screen.getByPlaceholderText('Añadir otro adjetivo a mano'), 'Cortante');
    await u.click(screen.getByRole('button', { name: 'Añadir adjetivo' }));
    await u.click(screen.getByRole('button', { name: 'Guardar' }));
    await screen.findByText('Guardada.');

    // La segunda, explícitamente en calma.
    await u.selectOptions(selectContexto, 'En calma');
    await u.type(screen.getByLabelText('Añadir algo nuevo'), 'Ayudó sin que se lo pidieran');
    await u.type(screen.getByPlaceholderText('Añadir otro adjetivo a mano'), 'Generoso');
    await u.click(screen.getByRole('button', { name: 'Añadir adjetivo' }));
    await u.click(screen.getByRole('button', { name: 'Guardar' }));
    await screen.findByText('Guardada.');

    // "Generoso" debe caer bajo "Adjetivos (en calma)" y "Cortante" bajo "(en discusión)".
    const texto = document.body.textContent;
    const iCalma = texto.indexOf('Adjetivos (en calma)');
    const iDiscusion = texto.indexOf('Adjetivos (en discusión)');
    const iGeneroso = texto.indexOf('Generoso');
    const iCortante = texto.indexOf('Cortante');
    expect(iGeneroso).toBeGreaterThan(iCalma);
    expect(iGeneroso).toBeLessThan(iDiscusion);
    expect(iCortante).toBeGreaterThan(iDiscusion);
  });

  it('una entrada registrada se puede abrir, quitarle un adjetivo, y borrarla', async () => {
    const u = userEvent.setup();
    await entrar(u);
    await u.click(screen.getByRole('button', { name: 'Personas' }));
    await u.type(screen.getByPlaceholderText('Nombre o iniciales'), 'Luis');
    await u.click(screen.getByRole('button', { name: 'Añadir persona' }));

    await u.type(screen.getByLabelText('Añadir algo nuevo'), 'No dio su brazo a torcer');
    await u.type(screen.getByPlaceholderText('Añadir otro adjetivo a mano'), 'Tozudo');
    await u.click(screen.getByRole('button', { name: 'Añadir adjetivo' }));
    await u.click(screen.getByRole('button', { name: 'Guardar' }));
    await screen.findByText('Guardada.');

    // Se abre al tocarla.
    await u.click(screen.getByText(/No dio su brazo a torcer/));
    expect(await screen.findByText('Tozudo ✕')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Borrar entrada' })).toBeInTheDocument();

    // Quitarle el adjetivo la deja sin ninguno.
    await u.click(screen.getByText('Tozudo ✕'));
    expect(screen.queryByText('Tozudo ✕')).toBeNull();
    expect(screen.getAllByText('Todavía no hay nada registrado.')).toHaveLength(4);

    // Borrarla la saca del todo.
    await u.click(screen.getByRole('button', { name: 'Borrar entrada' }));
    expect(screen.queryByText(/No dio su brazo a torcer/)).toBeNull();
  });

  it('Tendencias: dos frases sin adjetivo, la IA detecta el patrón y al confirmarlo pasa a la ficha', async () => {
    const u = userEvent.setup();

    // IDs controlados: 1º la persona, 2º y 3º sus dos frases de tendencia.
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('id-persona')
      .mockReturnValueOnce('id-frase-1')
      .mockReturnValueOnce('id-frase-2');

    await entrar(u);
    await irAMas(u, 'Ajustes');
    await u.type(screen.getByLabelText(/Clave de Anthropic/), 'sk-ant-prueba');
    await u.click(screen.getByRole('button', { name: 'Guardar clave' }));
    await screen.findByText('Guardada.');

    await u.click(screen.getByRole('button', { name: 'Personas' }));
    await u.type(screen.getByPlaceholderText('Nombre o iniciales'), 'Luis');
    await u.click(screen.getByRole('button', { name: 'Añadir persona' }));

    // Se dejan sin adjetivo: caen en Tendencias en vez de en la ficha etiquetada.
    await u.type(screen.getByLabelText('Añadir algo nuevo'), 'La confundió con su ex en la fiesta');
    await u.click(screen.getByRole('button', { name: 'Guardar' }));
    await screen.findByText('Guardada.');

    await u.type(screen.getByLabelText('Añadir algo nuevo'), 'Otra vez la llamó por el nombre de su ex');
    await u.click(screen.getByRole('button', { name: 'Guardar' }));
    await screen.findByText('Guardada.');

    expect(screen.getByText(/La confundió con su ex en la fiesta/)).toBeInTheDocument();
    expect(screen.getByText(/Otra vez la llamó por el nombre de su ex/)).toBeInTheDocument();

    const fetchEspia = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        content: [{
          type: 'text',
          text: JSON.stringify({
            patrones: [{
              palabra: 'Despistado',
              evidencias: ['id-frase-1', 'id-frase-2'],
              razon: 'la confunde con su ex dos veces',
            }],
          }),
        }],
      }),
    });
    vi.stubGlobal('fetch', fetchEspia);
    await u.click(screen.getByRole('button', { name: 'Buscar patrones' }));

    expect(await screen.findByText('Despistado')).toBeInTheDocument();
    expect(screen.getByText('la confunde con su ex dos veces')).toBeInTheDocument();

    const [, opts] = fetchEspia.mock.calls[0];
    const enviado = JSON.parse(opts.body).messages[0].content;
    expect(enviado).toBe(
      'CONTEXTO: Estas frases describen la conducta de Luis (no la del usuario).\n'
      + '[id-frase-1] La confundió con su ex en la fiesta\n[id-frase-2] Otra vez la llamó por el nombre de su ex',
    );

    await u.click(screen.getByRole('button', { name: 'Confirmar Despistado' }));

    // El adjetivo queda confirmado en la ficha (contexto por defecto: en discusión),
    // respaldado por las dos frases.
    await waitFor(() => {
      expect(screen.getByText('2 veces')).toBeInTheDocument();
    });
    expect(screen.getAllByText('Despistado').length).toBeGreaterThan(0);

    // Las frases ya no están pendientes de patrón: el botón "Buscar patrones" se
    // desactiva porque Tendencias se quedó sin frases.
    expect(screen.getByRole('button', { name: 'Buscar patrones' })).toBeDisabled();

    // Y siguen visibles, ahora bajo "Lo que llevas registrado" en vez de Tendencias.
    expect(screen.getByText(/La confundió con su ex en la fiesta/)).toBeInTheDocument();
    expect(screen.getByText(/Otra vez la llamó por el nombre de su ex/)).toBeInTheDocument();
  });
});

describe('Estadísticas y Estudio', () => {
  beforeEach(() => { vault.cerrar(); localStorage.clear(); });

  it('el panel de estadísticas se renderiza sin datos', async () => {
    const u = userEvent.setup();
    await entrar(u);
    await irAMas(u, 'Estadísticas');
    expect(screen.getByText('Quién eres')).toBeInTheDocument();
    expect(screen.getByText('Cómo te comportas')).toBeInTheDocument();
  });

  it('el léxico se puede consultar en cascada', async () => {
    const u = userEvent.setup();
    await entrar(u);
    await irAMas(u, 'Estudio');
    await u.click(screen.getByRole('button', { name: 'Consultar léxico' }));
    expect(screen.getByLabelText('Dimensión')).toBeInTheDocument();
    expect(screen.getByText('Se ve:', { exact: false })).toBeInTheDocument();
  });

  it('se puede buscar un adjetivo directamente y salta a su sitio en los desplegables', async () => {
    const u = userEvent.setup();
    await entrar(u);
    await irAMas(u, 'Estudio');
    await u.click(screen.getByRole('button', { name: 'Consultar léxico' }));

    await u.type(screen.getByLabelText('Buscar un adjetivo'), 'Sensato');
    await u.click(screen.getByRole('button', { name: 'Buscar' }));

    const textoSeleccionado = (etiqueta) => {
      const select = screen.getByLabelText(etiqueta);
      return select.options[select.selectedIndex].text;
    };
    expect(textoSeleccionado('Dimensión')).toBe('Honestidad y ego');
    expect(textoSeleccionado('Polo')).toBe('Polo íntegro');
    expect(textoSeleccionado('Familia')).toBe('fondo moral');
    expect(textoSeleccionado('Adjetivo')).toBe('Sensato');
    expect(screen.getByText(/toma decisiones razonables/)).toBeInTheDocument();

    // El "Se ve:" trae tres ejemplos, no uno solo.
    expect(screen.getByText(/pensemos esto con calma/)).toBeInTheDocument();
    expect(screen.getByText(/la opción menos vistosa/)).toBeInTheDocument();
    expect(screen.getByText(/el entusiasmo del grupo/)).toBeInTheDocument();
  });

  it('buscar un adjetivo que no existe avisa en vez de romperse', async () => {
    const u = userEvent.setup();
    await entrar(u);
    await irAMas(u, 'Estudio');
    await u.click(screen.getByRole('button', { name: 'Consultar léxico' }));

    await u.type(screen.getByLabelText('Buscar un adjetivo'), 'Palabroinventada');
    await u.click(screen.getByRole('button', { name: 'Buscar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/No se encontró/);
  });

  it('el repaso responde y guarda el progreso', async () => {
    const u = userEvent.setup();
    await entrar(u);
    await irAMas(u, 'Estudio');
    await u.click(screen.getByRole('button', { name: 'Empezar repaso' }));

    const botonesConocidos = new Set([
      'Bloquear', 'Registrar', 'Entradas', 'Personas', 'Guía', 'Más',
      'Estadísticas', 'Estudio', 'Ajustes', 'Repasar', 'Consultar léxico',
      'Preguntar a la IA', 'Empezar repaso',
    ]);
    const opciones = screen.getAllByRole('button').filter((b) => !botonesConocidos.has(b.textContent));
    expect(opciones.length).toBeGreaterThan(0);
    await u.click(opciones[0]);

    expect(await screen.findByRole('button', { name: /Siguiente|Terminar/ })).toBeInTheDocument();
  });

  it('preguntar a la IA por una conducta da prioridad a los adjetivos elegidos en el repaso', async () => {
    const u = userEvent.setup();
    const fetchEspia = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        content: [{
          type: 'text',
          text: JSON.stringify({
            candidatos: [{ palabra: 'Extrovertido', razon: 'busca gente', confianza: 'alta' }],
            aviso_estado: null,
          }),
        }],
      }),
    });
    vi.stubGlobal('fetch', fetchEspia);

    await entrar(u);
    await irAMas(u, 'Ajustes');
    await u.type(screen.getByLabelText(/Clave de Anthropic/), 'sk-ant-prueba');
    await u.click(screen.getByRole('button', { name: 'Guardar clave' }));
    await screen.findByText('Guardada.');

    await irAMas(u, 'Estudio');
    await u.click(screen.getByRole('button', { name: 'Preguntar a la IA' }));
    await u.type(
      screen.getByPlaceholderText(/se pasó media hora/),
      'Se puso a hablar con todo el mundo en la fiesta',
    );
    await u.click(screen.getByRole('button', { name: 'Buscar adjetivos' }));

    const chip = await screen.findByText('Extrovertido');
    expect(chip).toHaveClass('on'); // preseleccionado

    await u.click(screen.getByRole('button', { name: 'Dar prioridad en el repaso' }));
    expect(await screen.findByText('Guardado.')).toBeInTheDocument();

    await u.click(screen.getByRole('button', { name: 'Repasar' }));
    expect(screen.getByText(/1 palabra con prioridad/)).toBeInTheDocument();
  });
});
