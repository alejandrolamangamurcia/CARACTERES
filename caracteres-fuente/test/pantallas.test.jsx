import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/main.jsx';
import * as vault from '../src/lib/vault.js';

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

    // Exportar: createObjectURL/click de descarga no están en jsdom por defecto.
    const urlEspia = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:falso');
    const revokeEspia = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const clickEspia = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    await u.type(screen.getByLabelText('PIN para cifrar la copia'), '1234');
    await u.click(screen.getByRole('button', { name: 'Exportar copia (.txt)' }));
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

  it('sin clave guardada, avisa en vez de romperse', async () => {
    const u = userEvent.setup();
    await entrar(u);
    await u.type(screen.getByLabelText('Lo que te dijeron'), 'Algo que dijeron');
    await u.click(screen.getByRole('button', { name: 'Sugerir adjetivos' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/clave/i);
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
