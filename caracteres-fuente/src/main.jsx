import { createRoot } from 'react-dom/client';
import { useState, useEffect } from 'react';
import * as vault from './lib/vault.js';

export const VERSION = typeof __VERSION__ !== 'undefined' ? __VERSION__ : 'dev';

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

// --- Armazón ----------------------------------------------------------------

export function App() {
  const [fase, setFase] = useState('cargando'); // cargando | crear | abrir | dentro
  const [error, setError] = useState(null);
  const [datos, setDatos] = useState(vault.datosVacios());

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

  if (fase === 'cargando') return <div className="crx" />;
  if (fase !== 'dentro') {
    return <Cerradura modo={fase} onCrear={crear} onAbrir={abrir} error={error} />;
  }

  return (
    <div className="crx">
      <div className="wrap">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Caja abierta</h2>
          <p className="muted small">
            {datos.entries.length} entradas · {datos.people.length} personas
          </p>
          <button className="btn" onClick={() => { vault.cerrar(); setFase('abrir'); }}>
            Bloquear
          </button>
        </div>
      </div>
    </div>
  );
}

if (typeof document !== 'undefined' && document.getElementById('root')) {
  createRoot(document.getElementById('root')).render(<App />);
}
