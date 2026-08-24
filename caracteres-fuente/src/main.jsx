import { createRoot } from 'react-dom/client';
import { useState, useEffect, useMemo } from 'react';
import * as vault from './lib/vault.js';
import { sugerirAdjetivos } from './lib/ia.js';
import * as perfil from './lib/perfil.js';
import * as estadisticas from './lib/estadisticas.js';
import * as estudio from './lib/estudio.js';
import * as backup from './lib/backup.js';
import constantes from './data/constantes.json';
import lexico from './data/lexico.json';

export const VERSION = typeof __VERSION__ !== 'undefined' ? __VERSION__ : 'dev';

const uid = () => crypto.randomUUID();
const hoyISO = () => new Date().toISOString().slice(0, 10);
const nombreDe = (people, id) => (people.find((p) => p.id === id) || {}).nombre || 'Sin identificar';

// --- Pantalla de PIN --------------------------------------------------------

export function Cerradura({ modo, onCrear, onAbrir, error }) {
  const [pin, setPin] = useState('');
  const [repe, setRepe] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const creando = modo === 'crear';

  const enviar = async () => {
    if (pin.length < 4) return;
    if (creando && pin !== repe) return;
    setOcupado(true);
    await (creando ? onCrear(pin) : onAbrir(pin));
    setOcupado(false);
    setPin(''); setRepe('');
  };

  const desajuste = creando && repe.length > 0 && pin !== repe;

  return (
    <div className="crx">
      <div className="wrap" style={{ paddingTop: 60 }}>
        <div className="card">
          <h1 className="serif" style={{ marginTop: 0, fontSize: 24 }}>Caracteres</h1>
          <p className="muted small">
            {creando
              ? 'Elige un PIN. Cifra todo lo que escribas. Si lo olvidas, no hay forma de recuperar los datos: apúntalo fuera del móvil.'
              : 'Introduce tu PIN para abrir tus datos.'}
          </p>

          <label className="lbl" htmlFor="pin">PIN</label>
          <input
            id="pin" className="fld" type="password" inputMode="numeric"
            autoComplete={creando ? 'new-password' : 'current-password'}
            value={pin} onChange={(e) => setPin(e.target.value)}
          />

          {creando && (
            <>
              <label className="lbl" htmlFor="repe">Repítelo</label>
              <input
                id="repe" className="fld" type="password" inputMode="numeric"
                autoComplete="new-password"
                value={repe} onChange={(e) => setRepe(e.target.value)}
              />
            </>
          )}

          {desajuste && <div className="aviso">Los dos PIN no coinciden.</div>}
          {error && <div className="aviso" role="alert">{error}</div>}

          <button
            className="btn btn-p btn-full" style={{ marginTop: 12 }}
            onClick={enviar}
            disabled={ocupado || pin.length < 4 || (creando && pin !== repe)}
          >
            {ocupado ? 'Un momento…' : (creando ? 'Crear y entrar' : 'Abrir')}
          </button>

          <div className="muted small" style={{ marginTop: 10 }}>
            Mínimo 4 cifras · versión {VERSION}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Navegación inferior -----------------------------------------------------

const PESTANAS = [
  { id: 'registrar', etiqueta: 'Registrar' },
  { id: 'entradas', etiqueta: 'Entradas' },
  { id: 'personas', etiqueta: 'Personas' },
  { id: 'guia', etiqueta: 'Guía' },
  { id: 'mas', etiqueta: 'Más' },
];

function Nav({ vista, onCambiar }) {
  return (
    <nav className="nav">
      {PESTANAS.map((p) => (
        <button
          key={p.id} type="button"
          className={vista === p.id ? 'on' : ''}
          onClick={() => onCambiar(p.id)}
        >
          {p.etiqueta}
        </button>
      ))}
    </nav>
  );
}

// --- Selector de persona, con alta rápida ------------------------------------

function SelectorPersona({ people, personaId, onElegir, onCrear, etiqueta, requerido }) {
  const [creando, setCreando] = useState(false);
  const [nuevo, setNuevo] = useState('');

  const crear = async () => {
    const nombre = nuevo.trim();
    if (!nombre) return;
    const persona = { id: uid(), nombre };
    await onCrear(persona);
    setNuevo('');
    setCreando(false);
    onElegir(persona.id);
  };

  return (
    <>
      <label className="lbl" htmlFor="persona">{etiqueta}</label>
      <select
        id="persona" className="fld" value={personaId}
        onChange={(e) => {
          if (e.target.value === '__nueva__') { setCreando(true); return; }
          onElegir(e.target.value);
        }}
      >
        <option value="">{requerido ? 'Elige una persona…' : 'Sin identificar'}</option>
        {people.filter((p) => p.id !== 'yo').map((p) => (
          <option key={p.id} value={p.id}>{p.nombre}</option>
        ))}
        <option value="__nueva__">+ Añadir persona nueva</option>
      </select>

      {creando && (
        <div className="row" style={{ marginTop: 8 }}>
          <input
            className="fld grow" placeholder="Nombre o iniciales"
            value={nuevo} onChange={(e) => setNuevo(e.target.value)}
          />
          <button type="button" className="btn btn-sm" onClick={crear}>Añadir persona</button>
        </div>
      )}
    </>
  );
}

// --- Registrar: los cinco tipos de entrada -----------------------------------

const TIPOS = Object.keys(constantes.ut);
const ORDEN_REGISTRO = ['medijeron', 'roce', 'observacion', 'acierto', 'plan'];

function Registrar({ datos, config, onGuardarEntries, onGuardarPeople }) {
  const [tipo, setTipo] = useState('medijeron');
  const [personaId, setPersonaId] = useState('');
  const [fecha, setFecha] = useState(hoyISO);
  const [contexto, setContexto] = useState(constantes.lf[0]);
  const [tema, setTema] = useState('');
  const [frase, setFrase] = useState('');
  const [respuesta, setRespuesta] = useState(constantes.nf[0]);
  const [si, setSi] = useState('');
  const [entonces, setEntonces] = useState('');

  const [pidiendo, setPidiendo] = useState(false);
  const [error, setError] = useState('');
  const [avisoEstado, setAvisoEstado] = useState(null);
  const [candidatos, setCandidatos] = useState([]);
  const [elegidos, setElegidos] = useState(new Set());
  const [manual, setManual] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [guardadoOk, setGuardadoOk] = useState(false);

  const cambiarTipo = (t) => {
    setTipo(t);
    setError(''); setCandidatos([]); setElegidos(new Set()); setAvisoEstado(null);
  };

  const pedirSugerencias = async () => {
    if (!frase.trim()) return;
    setPidiendo(true); setError(''); setAvisoEstado(null);
    try {
      const r = await sugerirAdjetivos(config.apiKey, frase.trim());
      setCandidatos(r.candidatos || []);
      setAvisoEstado(r.aviso_estado || null);
      setElegidos(new Set());
    } catch (e) {
      setError(e.message);
    } finally {
      setPidiendo(false);
    }
  };

  const alternar = (palabra) => {
    setElegidos((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(palabra)) nuevo.delete(palabra); else nuevo.add(palabra);
      return nuevo;
    });
  };

  const anadirManual = () => {
    const palabra = manual.trim();
    if (!palabra) return;
    setElegidos((prev) => new Set(prev).add(palabra));
    setManual('');
  };

  const limpiar = () => {
    setPersonaId(''); setTema(''); setFrase(''); setSi(''); setEntonces('');
    setCandidatos([]); setElegidos(new Set()); setAvisoEstado(null); setError('');
  };

  const puedeGuardar = (() => {
    if (tipo === 'medijeron') return Boolean(personaId && frase.trim());
    if (tipo === 'plan') return Boolean(si.trim() && entonces.trim());
    return Boolean(frase.trim());
  })();

  const guardar = async () => {
    if (!puedeGuardar) return;
    setGuardando(true);
    const base = { id: uid(), tipo, ts: new Date().toISOString(), fechaEvento: fecha };
    if (personaId) base.conQuien = personaId;
    if (tema.trim()) base.tema = tema.trim();

    let entrada;
    if (tipo === 'medijeron') {
      entrada = { ...base, contextoFrase: contexto, frase: frase.trim(), adjetivos: [...elegidos] };
    } else if (tipo === 'roce') {
      entrada = { ...base, respuesta, frase: frase.trim() };
    } else if (tipo === 'plan') {
      entrada = { ...base, si: si.trim(), entonces: entonces.trim(), planEstado: 'activo' };
    } else {
      entrada = { ...base, frase: frase.trim() };
    }

    await onGuardarEntries([...(datos.entries || []), entrada]);
    setGuardando(false);
    setGuardadoOk(true);
    setTimeout(() => setGuardadoOk(false), 2000);
    limpiar();
  };

  const etiquetaFrase = {
    medijeron: 'Lo que te dijeron',
    roce: 'Qué pasó',
    observacion: 'Qué observaste',
    acierto: 'Qué salió bien',
  }[tipo];

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Registrar</h2>

      <div className="subtabs">
        {ORDEN_REGISTRO.map((t) => (
          <span
            key={t} role="button" tabIndex={0}
            className={`chip${tipo === t ? ' on' : ''}`}
            style={tipo === t ? { borderColor: constantes.ut[t].c, color: constantes.ut[t].c } : undefined}
            onClick={() => cambiarTipo(t)}
          >
            {constantes.ut[t].l}
          </span>
        ))}
      </div>

      <SelectorPersona
        people={datos.people}
        personaId={personaId}
        onElegir={setPersonaId}
        onCrear={(p) => onGuardarPeople([...(datos.people || []), p])}
        etiqueta={tipo === 'medijeron' ? 'Quién te lo dijo' : 'Con quién (opcional)'}
        requerido={tipo === 'medijeron'}
      />

      <label className="lbl" htmlFor="fecha">Cuándo</label>
      <input
        id="fecha" className="fld" type="date"
        value={fecha} onChange={(e) => setFecha(e.target.value)}
      />

      {tipo === 'medijeron' && (
        <>
          <label className="lbl" htmlFor="contexto">Contexto</label>
          <select
            id="contexto" className="fld"
            value={contexto} onChange={(e) => setContexto(e.target.value)}
          >
            {constantes.lf.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </>
      )}

      {tipo === 'roce' && (
        <>
          <label className="lbl" htmlFor="respuesta">Cómo respondiste</label>
          <select
            id="respuesta" className="fld"
            value={respuesta} onChange={(e) => setRespuesta(e.target.value)}
          >
            {constantes.nf.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </>
      )}

      {tipo !== 'plan' && (
        <>
          <label className="lbl" htmlFor="tema">Tema (opcional)</label>
          <input
            id="tema" className="fld" value={tema}
            onChange={(e) => setTema(e.target.value)}
            placeholder="Sobre qué iba"
          />
        </>
      )}

      {tipo === 'plan' && (
        <>
          <label className="lbl" htmlFor="tema">Tema (opcional)</label>
          <input
            id="tema" className="fld" value={tema}
            onChange={(e) => setTema(e.target.value)}
          />
          <label className="lbl" htmlFor="si">Si pasa esto</label>
          <textarea id="si" className="fld" value={si} onChange={(e) => setSi(e.target.value)} />
          <label className="lbl" htmlFor="entonces">Entonces haré esto</label>
          <textarea
            id="entonces" className="fld" value={entonces}
            onChange={(e) => setEntonces(e.target.value)}
          />
        </>
      )}

      {tipo !== 'plan' && (
        <>
          <label className="lbl" htmlFor="frase">{etiquetaFrase}</label>
          <textarea
            id="frase" className="fld"
            value={frase} onChange={(e) => setFrase(e.target.value)}
            placeholder={tipo === 'medijeron' ? 'La frase, tal cual te la dijeron' : ''}
          />
        </>
      )}

      {tipo === 'medijeron' && (
        <>
          <button
            type="button" className="btn" style={{ marginTop: 10 }}
            onClick={pedirSugerencias}
            disabled={!frase.trim() || pidiendo}
          >
            {pidiendo ? 'Pensando…' : 'Sugerir adjetivos'}
          </button>

          {error && <div className="aviso" role="alert">{error}</div>}
          {avisoEstado && <div className="aviso">{avisoEstado}</div>}

          {candidatos.length > 0 && (
            <div style={{ marginTop: 10 }}>
              {candidatos.map((c) => (
                <span
                  key={c.palabra}
                  role="button" tabIndex={0}
                  className={`chip${elegidos.has(c.palabra) ? ' on' : ''}`}
                  onClick={() => alternar(c.palabra)}
                  title={c.razon}
                >
                  {c.palabra}
                </span>
              ))}
            </div>
          )}

          <div className="row" style={{ marginTop: 10 }}>
            <input
              className="fld grow" placeholder="Añadir otro adjetivo a mano"
              value={manual} onChange={(e) => setManual(e.target.value)}
            />
            <button type="button" className="btn btn-sm" onClick={anadirManual}>Añadir adjetivo</button>
          </div>

          {elegidos.size > 0 && (
            <p className="muted small" style={{ marginTop: 8 }}>
              Elegidos: {[...elegidos].join(', ')}
            </p>
          )}
        </>
      )}

      <button
        type="button" className="btn btn-p btn-full" style={{ marginTop: 14 }}
        onClick={guardar}
        disabled={guardando || !puedeGuardar}
      >
        {guardando ? 'Guardando…' : 'Guardar entrada'}
      </button>

      {guardadoOk && <div className="toast">Guardada.</div>}
    </div>
  );
}

// --- Entradas: lista de todo lo registrado -----------------------------------

const ESTADOS_PLAN = [
  { v: 'activo', l: 'Activo' },
  { v: 'cumplido', l: 'Cumplido' },
  { v: 'incumplido', l: 'No cumplido' },
];

function Entradas({ entries, people, onCambiarPlan }) {
  const [filtro, setFiltro] = useState('todas');

  const visibles = (filtro === 'todas' ? entries : entries.filter((e) => e.tipo === filtro));
  const ordenadas = [...visibles].sort((a, b) =>
    String(b.fechaEvento || b.ts || '').localeCompare(String(a.fechaEvento || a.ts || '')));

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Entradas</h2>

      <div className="subtabs">
        <span
          role="button" tabIndex={0}
          className={`chip${filtro === 'todas' ? ' on' : ''}`}
          onClick={() => setFiltro('todas')}
        >
          Todas
        </span>
        {ORDEN_REGISTRO.map((t) => (
          <span
            key={t} role="button" tabIndex={0}
            className={`chip${filtro === t ? ' on' : ''}`}
            onClick={() => setFiltro(t)}
          >
            {constantes.ut[t].l}
          </span>
        ))}
      </div>

      {ordenadas.length === 0 && (
        <p className="muted small">Todavía no hay nada registrado.</p>
      )}

      {ordenadas.map((e) => {
        const info = constantes.ut[e.tipo] || { l: e.tipo, c: 'var(--tx2)' };
        return (
          <div key={e.id} className="entry" style={{ borderLeftColor: info.c }}>
            <div className="row">
              <span className="tag">{info.l}</span>
              <span className="muted small">{e.fechaEvento || (e.ts || '').slice(0, 10)}</span>
              {e.conQuien && <span className="muted small">· {nombreDe(people, e.conQuien)}</span>}
              {e.tema && <span className="muted small">· {e.tema}</span>}
            </div>

            {e.tipo === 'plan' ? (
              <>
                <p style={{ margin: '6px 0 0' }}><strong>Si:</strong> {e.si}</p>
                <p style={{ margin: '4px 0 0' }}><strong>Entonces:</strong> {e.entonces}</p>
                <div className="row" style={{ marginTop: 6 }}>
                  {ESTADOS_PLAN.map((op) => (
                    <span
                      key={op.v} role="button" tabIndex={0}
                      className={`chip${(e.planEstado || 'activo') === op.v ? ' on' : ''}`}
                      onClick={() => onCambiarPlan(e.id, op.v)}
                    >
                      {op.l}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <>
                {e.frase && <p style={{ margin: '6px 0 0' }}>{e.frase}</p>}
                {e.respuesta && <p className="muted small" style={{ marginTop: 4 }}>{e.respuesta}</p>}
              </>
            )}

            {e.adjetivos && e.adjetivos.length > 0 && (
              <p className="muted small" style={{ marginTop: 4 }}>{e.adjetivos.join(', ')}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// --- Personas: "Yo" y el resto ------------------------------------------------

function ListaAdjetivos({ titulo, adjetivos, onQuitar }) {
  return (
    <>
      <h3 style={{ marginBottom: 6 }}>{titulo}</h3>
      {adjetivos.length === 0 && <p className="muted small">Nada todavía.</p>}
      {adjetivos.map((a) => (
        <span key={a.palabra} className="chip on" onClick={() => onQuitar(a.palabra)}>
          {a.palabra} ✕
        </span>
      ))}
    </>
  );
}

function ListaDicho({ titulo, lista }) {
  return (
    <>
      <h3 style={{ marginBottom: 6 }}>{titulo}</h3>
      {lista.length === 0 && <p className="muted small">Todavía no hay suficientes entradas.</p>}
      {lista.map((x) => (
        <div key={x.palabra} className="card2" style={{ marginBottom: 8 }}>
          <div className="row">
            <strong>{x.palabra}</strong>
            {x.consolidado && <span className="tag" style={{ borderColor: 'var(--ok)', color: 'var(--ok)' }}>consolidado</span>}
          </div>
          <p className="muted small" style={{ margin: '4px 0 0' }}>
            {x.vocesDistintas} persona{x.vocesDistintas === 1 ? '' : 's'} · {x.veces} vez{x.veces === 1 ? '' : 'es'}
          </p>
          {x.testimonios.map((t, i) => (
            <p key={i} className="muted small" style={{ margin: '2px 0 0' }}>
              {t.quienNombre} · {t.cuando} · {t.contexto || '—'}
            </p>
          ))}
        </div>
      ))}
    </>
  );
}

function Personas({ datos, onGuardarPeople }) {
  const { entries, people } = datos;
  const [nuevoNormal, setNuevoNormal] = useState('');
  const [nuevoTension, setNuevoTension] = useState('');
  const [nuevoIdeal, setNuevoIdeal] = useState('');

  const dicho = perfil.loQueMeDicen(entries, people);
  const misNormal = perfil.misAdjetivos(people, perfil.PERFIL_NORMAL);
  const misTension = perfil.misAdjetivos(people, perfil.PERFIL_TENSION);
  const ideal = perfil.miIdeal(people);

  const anadirMio = async (perfilId, valor, limpiar) => {
    const palabra = valor.trim();
    if (!palabra) return;
    await onGuardarPeople(perfil.ponerAdjetivoMio(people, palabra, perfilId));
    limpiar('');
  };

  const quitarMio = (perfilId, palabra) => onGuardarPeople(perfil.quitarAdjetivoMio(people, palabra, perfilId));

  const anadirIdeal = async () => {
    const palabra = nuevoIdeal.trim();
    if (!palabra) return;
    await onGuardarPeople(perfil.ponerEnIdeal(people, palabra));
    setNuevoIdeal('');
  };

  const quitarIdeal = (palabra) => onGuardarPeople(perfil.quitarDelIdeal(people, palabra));

  const otras = people.filter((p) => p.id !== 'yo');
  const entradasDe = (id) => entries.filter((e) => e.conQuien === id).length;

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Yo</h2>
      <p className="muted small">
        Lo que crees de ti mismo lo escribes. Lo que te dicen los demás se calcula
        solo, a partir de las entradas de "Me dijeron".
      </p>

      <ListaAdjetivos titulo="En condiciones normales" adjetivos={misNormal} onQuitar={(p) => quitarMio(perfil.PERFIL_NORMAL, p)} />
      <div className="row" style={{ marginTop: 8 }}>
        <input
          className="fld grow" placeholder="Añadir adjetivo (normal)" value={nuevoNormal}
          onChange={(e) => setNuevoNormal(e.target.value)}
        />
        <button type="button" className="btn btn-sm" onClick={() => anadirMio(perfil.PERFIL_NORMAL, nuevoNormal, setNuevoNormal)}>
          Añadir a normal
        </button>
      </div>

      <hr className="sep" />

      <ListaAdjetivos titulo="En tensión" adjetivos={misTension} onQuitar={(p) => quitarMio(perfil.PERFIL_TENSION, p)} />
      <div className="row" style={{ marginTop: 8 }}>
        <input
          className="fld grow" placeholder="Añadir adjetivo (tensión)" value={nuevoTension}
          onChange={(e) => setNuevoTension(e.target.value)}
        />
        <button type="button" className="btn btn-sm" onClick={() => anadirMio(perfil.PERFIL_TENSION, nuevoTension, setNuevoTension)}>
          Añadir a tensión
        </button>
      </div>

      <hr className="sep" />

      <ListaDicho titulo="Lo que me dicen (en calma)" lista={dicho.normal} />
      <hr className="sep" />
      <ListaDicho titulo="Lo que me dicen (en caliente)" lista={dicho.tension} />

      <hr className="sep" />

      <h3 style={{ marginBottom: 6 }}>Mi ideal</h3>
      <p className="muted small">Adjetivos que te gustaría integrar en ti mismo. Sin límite.</p>
      {ideal.length === 0 && <p className="muted small">Nada todavía.</p>}
      {ideal.map((x) => (
        <span key={x.palabra} className="chip on" onClick={() => quitarIdeal(x.palabra)}>
          {x.palabra} ✕
        </span>
      ))}
      <div className="row" style={{ marginTop: 8 }}>
        <input
          className="fld grow" placeholder="Añadir al ideal" value={nuevoIdeal}
          onChange={(e) => setNuevoIdeal(e.target.value)}
        />
        <button type="button" className="btn btn-sm" onClick={anadirIdeal}>Añadir al ideal</button>
      </div>

      {otras.length > 0 && (
        <>
          <hr className="sep" />
          <h3 style={{ marginBottom: 6 }}>Personas registradas</h3>
          {otras.map((p) => (
            <div key={p.id} className="row" style={{ marginBottom: 6 }}>
              <span className="grow">{p.nombre}</span>
              <span className="muted small">{entradasDe(p.id)} entrada{entradasDe(p.id) === 1 ? '' : 's'}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// --- Guía --------------------------------------------------------------------

function Guia() {
  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Guía</h2>
      {constantes.lu.map((g) => (
        <div key={g.t} className="card2" style={{ marginBottom: 10 }}>
          <strong>{g.t}</strong>
          <p className="muted small" style={{ margin: '4px 0 0' }}>{g.d}</p>
        </div>
      ))}
    </div>
  );
}

// --- Estadísticas --------------------------------------------------------------

function calcularRacha(entries) {
  const ordenadas = [...entries].sort((a, b) =>
    String(b.fechaEvento || b.ts || '').localeCompare(String(a.fechaEvento || a.ts || '')));
  let n = 0;
  for (const e of ordenadas) {
    if (e.tipo === 'roce') break;
    n += 1;
  }
  return n;
}

function Estadisticas({ entries, people }) {
  const panel = estadisticas.panel(entries, people);
  const racha = calcularRacha(entries);

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Estadísticas</h2>

      <h3>Quién eres</h3>
      <p className="muted small"><strong>Consenso</strong> — lo que dice más gente distinta</p>
      {panel.consenso.slice(0, 12).map((x) => (
        <div key={x.palabra} className="row">
          <span className="grow">{x.palabra}</span>
          <span className="muted small">{x.vocesDistintas} pers. · {x.veces}v</span>
        </div>
      ))}

      {panel.puntoCiego.length > 0 && (
        <div className="aviso">
          <div>
            <strong>Punto ciego:</strong> {panel.puntoCiego.map((x) => x.palabra).join(', ')}
          </div>
        </div>
      )}
      {panel.espejismo.length > 0 && (
        <div className="aviso">
          <div>
            <strong>Espejismo:</strong> {panel.espejismo.map((x) => x.palabra).join(', ')}
          </div>
        </div>
      )}
      {panel.brechaTension.length > 0 && (
        <div className="aviso">
          <div>
            <strong>Solo sale en tensión:</strong> {panel.brechaTension.map((x) => x.palabra).join(', ')}
          </div>
        </div>
      )}

      <hr className="sep" />
      <h3>Cómo te comportas</h3>

      <p className="muted small"><strong>Con quién chocas</strong></p>
      {panel.rocesPorPersona.map((r) => (
        <div key={r.id} className="row">
          <span className="grow">{r.nombre}</span>
          <span className="muted small">{r.roces} ({Math.round(r.cuota * 100)}%)</span>
        </div>
      ))}
      {panel.concentracion.suficiente && panel.concentracion.concentrado && (
        <div className="aviso">
          El {Math.round(panel.concentracion.cuota * 100)}% de los roces son con {panel.concentracion.principal}:
          puede que el problema sea esa relación, no tu carácter.
        </div>
      )}

      {panel.temas.length > 0 && (
        <>
          <p className="muted small" style={{ marginTop: 10 }}><strong>Temas que se repiten</strong></p>
          {panel.temas.map((t) => (
            <div key={t.tema} className="row">
              <span className="grow">{t.tema}</span>
              <span className="muted small">{t.veces}</span>
            </div>
          ))}
        </>
      )}

      {panel.respuestas.total > 0 && (
        <>
          <p className="muted small" style={{ marginTop: 10 }}><strong>Cómo respondes</strong></p>
          {panel.respuestas.reparto.map((r) => (
            <div key={r.respuesta} className="row">
              <span className="grow">{r.respuesta}</span>
              <span className="muted small">{Math.round(r.cuota * 100)}%</span>
            </div>
          ))}
        </>
      )}

      <p className="muted small" style={{ marginTop: 10 }}><strong>Tendencia</strong></p>
      {panel.tendencia.concluyente ? (
        <p className="small">
          La proporción de roces {panel.tendencia.sentido === 'igual' ? 'se mantiene igual' : (panel.tendencia.sentido === 'sube' ? 'sube' : 'baja')}.
        </p>
      ) : (
        <p className="muted small">{panel.tendencia.motivo}</p>
      )}

      <p className="muted small" style={{ marginTop: 10 }}><strong>Balance</strong></p>
      <p className="small">{panel.balance.aciertos} aciertos · {panel.balance.roces} roces</p>
      <p className="muted small">Racha actual sin roces: {racha} entrada{racha === 1 ? '' : 's'}</p>

      {panel.planes.total > 0 && (
        <>
          <p className="muted small" style={{ marginTop: 10 }}><strong>Planes si→entonces</strong></p>
          <p className="small">
            {panel.planes.activos} activos · {panel.planes.cerrados} cerrados
            {panel.planes.tasa != null && ` · ${Math.round(panel.planes.tasa * 100)}% cumplidos`}
          </p>
        </>
      )}

      <p className="muted small" style={{ marginTop: 10 }}><strong>Saturación</strong></p>
      {panel.saturacion.suficiente ? (
        <p className="small">
          {panel.saturacion.adjetivosDistintos} adjetivos distintos con evidencia.
          {panel.saturacion.ultimoNuevo && ` Último nuevo: ${panel.saturacion.ultimoNuevo}.`}
        </p>
      ) : (
        <p className="muted small">Todavía no hay datos suficientes.</p>
      )}
    </div>
  );
}

// --- Estudio: léxico y repaso (Anki) -------------------------------------------

function ConsultarLexico() {
  const [dim, setDim] = useState(0);
  const [polo, setPolo] = useState(0);
  const [fam, setFam] = useState(0);
  const [ent, setEnt] = useState(0);

  const dims = lexico.dims;
  const polos = dims[dim]?.polos || [];
  const familias = polos[polo]?.familias || [];
  const entradas = familias[fam]?.entradas || [];
  const actual = entradas[ent];

  return (
    <div>
      <label className="lbl" htmlFor="dim">Dimensión</label>
      <select id="dim" className="fld" value={dim} onChange={(e) => { setDim(+e.target.value); setPolo(0); setFam(0); setEnt(0); }}>
        {dims.map((d, i) => <option key={d.titulo} value={i}>{d.titulo}</option>)}
      </select>

      <label className="lbl" htmlFor="polo">Polo</label>
      <select id="polo" className="fld" value={polo} onChange={(e) => { setPolo(+e.target.value); setFam(0); setEnt(0); }}>
        {polos.map((p, i) => <option key={p.nombre} value={i}>{p.nombre}</option>)}
      </select>

      <label className="lbl" htmlFor="fam">Familia</label>
      <select id="fam" className="fld" value={fam} onChange={(e) => { setFam(+e.target.value); setEnt(0); }}>
        {familias.map((f, i) => <option key={f.nombre} value={i}>{f.nombre}</option>)}
      </select>

      <label className="lbl" htmlFor="adj">Adjetivo</label>
      <select id="adj" className="fld" value={ent} onChange={(e) => setEnt(+e.target.value)}>
        {entradas.map((e, i) => <option key={e.p} value={i}>{e.p}</option>)}
      </select>

      {actual && (
        <div className="card2" style={{ marginTop: 12 }}>
          <strong>{actual.p}</strong>
          <p className="small" style={{ margin: '6px 0 0' }}>{actual.d}</p>
          <p className="muted small" style={{ marginTop: 6 }}>Se ve: {actual.v}</p>
        </div>
      )}
    </div>
  );
}

function Repaso({ config, onGuardarConfig }) {
  const mazo = useMemo(() => estudio.construirMazo(lexico), []);
  const progreso = config.estudioProgreso || {};
  const [tanda, setTanda] = useState(null);
  const [indice, setIndice] = useState(0);
  const [resultado, setResultado] = useState(null); // { acertada, correcta } | null
  const [aciertosSesion, setAciertosSesion] = useState(0);

  const resumen = estudio.resumenEstudio(mazo, progreso);
  const falladas = estudio.masFalladas(mazo, progreso, 5);

  const empezar = () => {
    setTanda(estudio.siguienteTanda(mazo, progreso, 10));
    setIndice(0);
    setResultado(null);
    setAciertosSesion(0);
  };

  const tarjeta = tanda ? tanda[indice] : null;
  const pregunta = tarjeta ? estudio.montarPregunta(tarjeta) : null;

  const responder = async (opcion) => {
    const acertada = opcion === pregunta.correcta;
    const nuevoProgreso = estudio.responder(progreso, tarjeta.id, acertada);
    await onGuardarConfig({ ...config, estudioProgreso: nuevoProgreso });
    if (acertada) setAciertosSesion((n) => n + 1);
    setResultado({ acertada, correcta: pregunta.correcta });
  };

  const siguiente = () => {
    setResultado(null);
    if (indice + 1 < tanda.length) setIndice(indice + 1);
    else setTanda(null);
  };

  if (!tanda) {
    return (
      <div>
        <p className="small">
          {resumen.pendientesHoy} tarjeta{resumen.pendientesHoy === 1 ? '' : 's'} para hoy ·
          {' '}{resumen.dominadas} dominadas de {resumen.total}
          {resumen.acierto != null && ` · ${Math.round(resumen.acierto * 100)}% de aciertos`}
        </p>
        <button type="button" className="btn btn-p" onClick={empezar} disabled={resumen.pendientesHoy === 0}>
          Empezar repaso
        </button>
        {falladas.length > 0 && (
          <>
            <p className="muted small" style={{ marginTop: 14 }}>Las que más se resisten</p>
            {falladas.map((f) => (
              <div key={f.tarjeta.id} className="row">
                <span className="grow">{f.tarjeta.palabra}</span>
                <span className="muted small">{f.estado.fallos} fallos</span>
              </div>
            ))}
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      <p className="muted small">{indice + 1} de {tanda.length} · aciertos: {aciertosSesion}</p>
      <div className="card2">
        <p className="muted small">{pregunta.categoria} · {pregunta.familia}</p>
        <p className="small" style={{ margin: '6px 0 0' }}>Se ve: {pregunta.situacion}</p>
      </div>

      {!resultado ? (
        <div style={{ marginTop: 10 }}>
          {pregunta.opciones.map((o) => (
            <button
              key={o} type="button" className="btn btn-full"
              style={{ marginBottom: 8 }}
              onClick={() => responder(o)}
            >
              {o}
            </button>
          ))}
        </div>
      ) : (
        <div style={{ marginTop: 10 }}>
          <div className={resultado.acertada ? 'aviso' : 'aviso'} role="status">
            {resultado.acertada ? '¡Correcto!' : `No era esa. Era: ${resultado.correcta}`}
          </div>
          <button type="button" className="btn btn-p btn-full" style={{ marginTop: 8 }} onClick={siguiente}>
            {indice + 1 < tanda.length ? 'Siguiente' : 'Terminar'}
          </button>
        </div>
      )}
    </div>
  );
}

function Estudio({ config, onGuardarConfig }) {
  const [sub, setSub] = useState('repaso');
  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Estudio</h2>
      <div className="subtabs">
        <span role="button" tabIndex={0} className={`chip${sub === 'repaso' ? ' on' : ''}`} onClick={() => setSub('repaso')}>Repasar</span>
        <span role="button" tabIndex={0} className={`chip${sub === 'lexico' ? ' on' : ''}`} onClick={() => setSub('lexico')}>Consultar léxico</span>
      </div>
      {sub === 'repaso'
        ? <Repaso config={config} onGuardarConfig={onGuardarConfig} />
        : <ConsultarLexico />}
    </div>
  );
}

// --- Ajustes: clave IA, PIN, aviso y copias de seguridad -----------------------

function AjustesClave({ config, onGuardar }) {
  const [clave, setClave] = useState(config.apiKey || '');
  const [guardado, setGuardado] = useState(false);

  const guardar = async () => {
    await onGuardar({ ...config, apiKey: clave.trim() });
    setGuardado(true);
    setTimeout(() => setGuardado(false), 2000);
  };

  return (
    <div className="card2" style={{ marginBottom: 12 }}>
      <h3 style={{ marginTop: 0 }}>Clave de la IA</h3>
      <label className="lbl" htmlFor="apiKey">Clave de Anthropic (para sugerir adjetivos)</label>
      <input
        id="apiKey" className="fld" type="password" autoComplete="off"
        value={clave} onChange={(e) => setClave(e.target.value)}
        placeholder="sk-ant-..."
      />
      <p className="muted small">Se guarda cifrada dentro de tu caja, junto al resto de tus datos.</p>
      <button className="btn btn-p" style={{ marginTop: 10 }} onClick={guardar}>Guardar clave</button>
      {guardado && <span className="muted small" style={{ marginLeft: 10 }}>Guardada.</span>}
    </div>
  );
}

function AjustesPin() {
  const [actual, setActual] = useState('');
  const [nuevo, setNuevo] = useState('');
  const [repe, setRepe] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const cambiar = async () => {
    setError(''); setOk(false);
    if (nuevo.length < 4) { setError('El PIN nuevo es demasiado corto.'); return; }
    if (nuevo !== repe) { setError('El PIN nuevo no coincide.'); return; }
    setOcupado(true);
    const bien = await vault.cambiarPin(actual, nuevo);
    setOcupado(false);
    if (!bien) { setError('El PIN actual no es correcto.'); return; }
    setActual(''); setNuevo(''); setRepe('');
    setOk(true);
    setTimeout(() => setOk(false), 2500);
  };

  return (
    <div className="card2" style={{ marginBottom: 12 }}>
      <h3 style={{ marginTop: 0 }}>Cambiar PIN</h3>
      <p className="muted small">Los datos se vuelven a cifrar con el PIN nuevo. Si lo olvidas, se pierden.</p>

      <label className="lbl" htmlFor="pinActual">PIN actual</label>
      <input id="pinActual" className="fld" type="password" inputMode="numeric" value={actual} onChange={(e) => setActual(e.target.value)} />

      <label className="lbl" htmlFor="pinNuevo">PIN nuevo</label>
      <input id="pinNuevo" className="fld" type="password" inputMode="numeric" value={nuevo} onChange={(e) => setNuevo(e.target.value)} />

      <label className="lbl" htmlFor="pinRepe">Repite el PIN nuevo</label>
      <input id="pinRepe" className="fld" type="password" inputMode="numeric" value={repe} onChange={(e) => setRepe(e.target.value)} />

      {error && <div className="aviso" role="alert">{error}</div>}

      <button className="btn btn-p" style={{ marginTop: 10 }} onClick={cambiar} disabled={ocupado || !actual || nuevo.length < 4}>
        {ocupado ? 'Un momento…' : 'Cambiar PIN'}
      </button>
      {ok && <span className="muted small" style={{ marginLeft: 10 }}>PIN cambiado.</span>}
    </div>
  );
}

function AjustesAviso({ config, onGuardar }) {
  const guardar = (avisoCada) => onGuardar({ ...config, avisoCada });
  return (
    <div className="card2" style={{ marginBottom: 12 }}>
      <h3 style={{ marginTop: 0 }}>Aviso de copia de seguridad</h3>
      <label className="lbl" htmlFor="avisoCada">Avisar cada</label>
      <select
        id="avisoCada" className="fld"
        value={config.avisoCada || 5}
        onChange={(e) => guardar(+e.target.value)}
      >
        {[3, 5, 10, 20].map((n) => <option key={n} value={n}>{n} cambios</option>)}
      </select>
    </div>
  );
}

function AjustesCopias({ datos, onGuardarEntries, onGuardarPeople, onGuardarConfig }) {
  const [pinExportar, setPinExportar] = useState('');
  const [exportando, setExportando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [pinImportar, setPinImportar] = useState('');
  const [pendienteImportar, setPendienteImportar] = useState(null); // texto que necesita PIN
  const [errorImportar, setErrorImportar] = useState('');

  const exportar = async () => {
    if (pinExportar.length < 4) return;
    setExportando(true);
    setMensaje('');
    try {
      const clave = await vault.derivarClave(pinExportar, vault.salActual());
      const texto = await backup.crearCopia({
        clave, sal: vault.salActual(), datos, fecha: new Date(),
      });
      const blob = new Blob([texto], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = backup.nombreArchivo(new Date());
      a.click();
      URL.revokeObjectURL(url);
      await onGuardarConfig(backup.selloDeCopia(datos.config, datos.entries, datos.people, new Date()));
      setMensaje('Copia exportada.');
      setPinExportar('');
    } finally {
      setExportando(false);
    }
  };

  const leerArchivo = (archivo) => {
    const lector = new FileReader();
    lector.onload = () => procesarImportacion(String(lector.result || ''));
    lector.readAsText(archivo);
  };

  const procesarImportacion = async (texto, pin) => {
    setErrorImportar('');
    if (backup.necesitaPin(texto) && !pin) {
      setPendienteImportar(texto);
      return;
    }
    const r = await backup.abrirCopia(texto, pin);
    if (!r.ok) {
      setErrorImportar(
        r.causa === 'pin' ? 'PIN incorrecto para esa copia.'
          : r.causa === 'formato' ? 'Ese archivo no tiene el formato esperado.'
            : 'No se pudo leer el archivo.',
      );
      return;
    }
    await onGuardarEntries(r.datos.entries);
    await onGuardarPeople(r.datos.people);
    await onGuardarConfig(r.datos.config);
    setPendienteImportar(null);
    setPinImportar('');
    setMensaje('Copia importada. Sustituye a los datos anteriores.');
  };

  return (
    <div className="card2">
      <h3 style={{ marginTop: 0 }}>Copia de seguridad</h3>
      <p className="muted small">
        El archivo sale cifrado con un PIN (puede ser el mismo que usas para entrar, u otro).
        Se guarda como .txt porque Android no permite compartir .json.
      </p>

      <label className="lbl" htmlFor="pinExportar">PIN para cifrar la copia</label>
      <input
        id="pinExportar" className="fld" type="password" inputMode="numeric"
        value={pinExportar} onChange={(e) => setPinExportar(e.target.value)}
      />
      <button
        className="btn btn-p" style={{ marginTop: 10 }}
        onClick={exportar} disabled={exportando || pinExportar.length < 4}
      >
        {exportando ? 'Exportando…' : 'Exportar copia (.txt)'}
      </button>

      <hr className="sep" />

      <label className="lbl" htmlFor="archivoImportar">Importar una copia</label>
      <input
        id="archivoImportar" className="fld" type="file" accept=".txt,.json"
        onChange={(e) => e.target.files[0] && leerArchivo(e.target.files[0])}
      />

      {pendienteImportar && (
        <div style={{ marginTop: 8 }}>
          <label className="lbl" htmlFor="pinImportar">Esa copia está cifrada: introduce su PIN</label>
          <input
            id="pinImportar" className="fld" type="password" inputMode="numeric"
            value={pinImportar} onChange={(e) => setPinImportar(e.target.value)}
          />
          <button
            className="btn btn-sm" style={{ marginTop: 8 }}
            onClick={() => procesarImportacion(pendienteImportar, pinImportar)}
          >
            Abrir copia
          </button>
        </div>
      )}

      {errorImportar && <div className="aviso" role="alert">{errorImportar}</div>}
      {mensaje && <p className="muted small" style={{ marginTop: 8 }}>{mensaje}</p>}
    </div>
  );
}

function Ajustes({ datos, onGuardarEntries, onGuardarPeople, onGuardarConfig }) {
  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Ajustes</h2>
      <AjustesClave config={datos.config} onGuardar={onGuardarConfig} />
      <AjustesPin />
      <AjustesAviso config={datos.config} onGuardar={onGuardarConfig} />
      <AjustesCopias
        datos={datos}
        onGuardarEntries={onGuardarEntries}
        onGuardarPeople={onGuardarPeople}
        onGuardarConfig={onGuardarConfig}
      />
    </div>
  );
}

// --- Más: estadísticas, estudio y ajustes -------------------------------------

const SUBTABS_MAS = [
  { id: 'estadisticas', etiqueta: 'Estadísticas' },
  { id: 'estudio', etiqueta: 'Estudio' },
  { id: 'ajustes', etiqueta: 'Ajustes' },
];

function Mas({ sub, onCambiarSub, datos, onGuardarEntries, onGuardarPeople, onGuardarConfig }) {
  return (
    <div>
      <div className="subtabs">
        {SUBTABS_MAS.map((t) => (
          <span
            key={t.id} role="button" tabIndex={0}
            className={`chip${sub === t.id ? ' on' : ''}`}
            onClick={() => onCambiarSub(t.id)}
          >
            {t.etiqueta}
          </span>
        ))}
      </div>
      {sub === 'estadisticas' && <Estadisticas entries={datos.entries} people={datos.people} />}
      {sub === 'estudio' && <Estudio config={datos.config} onGuardarConfig={onGuardarConfig} />}
      {sub === 'ajustes' && (
        <Ajustes
          datos={datos}
          onGuardarEntries={onGuardarEntries}
          onGuardarPeople={onGuardarPeople}
          onGuardarConfig={onGuardarConfig}
        />
      )}
    </div>
  );
}

// --- Aviso a pantalla completa de copia de seguridad --------------------------

function AvisoCopia({ pendientes, onGuardarAhora, onAhoraNo }) {
  return (
    <div className="bkd">
      <div className="bmd">
        <h3>Copia de seguridad</h3>
        <span className="n">{pendientes}</span>
        <p>
          Llevas {pendientes} cambios sin respaldar. Exporta una copia: es tu única
          forma de recuperar los datos si algo falla.
        </p>
        <button className="btn btn-p btn-full" style={{ marginBottom: 8 }} onClick={onGuardarAhora}>
          Guardar copia ahora
        </button>
        <button className="btn btn-full" onClick={onAhoraNo}>Ahora no</button>
      </div>
    </div>
  );
}

// --- Armazón ----------------------------------------------------------------

export function App() {
  const [fase, setFase] = useState('cargando'); // cargando | crear | abrir | dentro
  const [error, setError] = useState(null);
  const [datos, setDatos] = useState(vault.datosVacios());
  const [vista, setVista] = useState('registrar');
  const [masVista, setMasVista] = useState('estadisticas');
  const [avisoCerrado, setAvisoCerrado] = useState(false);

  useEffect(() => {
    setFase(vault.hayVault() ? 'abrir' : 'crear');
  }, []);

  const crear = async (pin) => {
    await vault.crear(pin);
    setDatos(vault.leer());
    setFase('dentro');
  };

  const abrir = async (pin) => {
    if (await vault.abrir(pin)) {
      setError(null);
      setDatos(vault.leer());
      setFase('dentro');
    } else {
      setError('PIN incorrecto.');
    }
  };

  const guardarEntries = async (entries) => setDatos(await vault.guardar('entries', entries));
  const guardarPeople = async (people) => setDatos(await vault.guardar('people', people));
  const guardarConfig = async (config) => setDatos(await vault.guardar('config', config));

  if (fase === 'cargando') return <div className="crx" />;
  if (fase !== 'dentro') {
    return <Cerradura modo={fase} onCrear={crear} onAbrir={abrir} error={error} />;
  }

  const pendientes = backup.sinRespaldar(datos.entries, datos.people, datos.config);
  const tocaAvisar = !avisoCerrado && backup.tocaAvisar(datos.entries, datos.people, datos.config);

  return (
    <div className="crx">
      <div className="wrap">
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
          <p className="muted small" style={{ margin: 0 }}>
            {datos.entries.length} entradas · {datos.people.length} personas
          </p>
          <button type="button" className="btn btn-sm" onClick={() => { vault.cerrar(); setFase('abrir'); }}>
            Bloquear
          </button>
        </div>

        {vista === 'registrar' && (
          <Registrar
            datos={datos} config={datos.config}
            onGuardarEntries={guardarEntries} onGuardarPeople={guardarPeople}
          />
        )}
        {vista === 'entradas' && (
          <Entradas
            entries={datos.entries} people={datos.people}
            onCambiarPlan={(id, planEstado) => guardarEntries(
              datos.entries.map((e) => (e.id === id ? { ...e, planEstado } : e)),
            )}
          />
        )}
        {vista === 'personas' && <Personas datos={datos} onGuardarPeople={guardarPeople} />}
        {vista === 'guia' && <Guia />}
        {vista === 'mas' && (
          <Mas
            sub={masVista} onCambiarSub={setMasVista}
            datos={datos}
            onGuardarEntries={guardarEntries} onGuardarPeople={guardarPeople} onGuardarConfig={guardarConfig}
          />
        )}
      </div>

      {tocaAvisar && (
        <AvisoCopia
          pendientes={pendientes}
          onGuardarAhora={() => { setVista('mas'); setMasVista('ajustes'); setAvisoCerrado(true); }}
          onAhoraNo={() => {
            guardarConfig({ ...datos.config, avisoPospuestoN: pendientes });
            setAvisoCerrado(true);
          }}
        />
      )}

      <Nav vista={vista} onCambiar={setVista} />
    </div>
  );
}

if (typeof document !== 'undefined' && document.getElementById('root')) {
  createRoot(document.getElementById('root')).render(<App />);
}
