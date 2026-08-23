import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/main.jsx';
import * as vault from '../src/lib/vault.js';

describe('arranque de la app', () => {
  beforeEach(() => { vault.cerrar(); localStorage.clear(); });

  it('la primera vez pide crear un PIN, con confirmación', async () => {
    render(<App />);
    expect(await screen.findByText(/Crear y entrar/)).toBeInTheDocument();
    expect(screen.getByLabelText('Repítelo')).toBeInTheDocument();
  });

  it('avisa si los dos PIN no coinciden y no deja continuar', async () => {
    const u = userEvent.setup();
    render(<App />);
    await screen.findByText(/Crear y entrar/);
    await u.type(screen.getByLabelText('PIN'), '4821');
    await u.type(screen.getByLabelText('Repítelo'), '4822');
    expect(screen.getByText(/no coinciden/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Crear y entrar/ })).toBeDisabled();
  });

  it('crea la caja y entra', async () => {
    const u = userEvent.setup();
    render(<App />);
    await screen.findByText(/Crear y entrar/);
    await u.type(screen.getByLabelText('PIN'), '4821');
    await u.type(screen.getByLabelText('Repítelo'), '4821');
    await u.click(screen.getByRole('button', { name: /Crear y entrar/ }));
    expect(await screen.findByText('Caja abierta')).toBeInTheDocument();
  });

  it('si ya hay caja, pide abrir en vez de crear', async () => {
    await vault.crear('4821');
    vault.cerrar();
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Abrir' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Repítelo')).toBeNull();
  });

  it('rechaza el PIN incorrecto con un aviso visible', async () => {
    const u = userEvent.setup();
    await vault.crear('4821');
    vault.cerrar();
    render(<App />);
    await u.type(await screen.findByLabelText('PIN'), '0000');
    await u.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/PIN incorrecto/);
  });

  it('ciclo completo: crear, guardar, bloquear y recuperar', async () => {
    const u = userEvent.setup();
    render(<App />);
    await screen.findByText(/Crear y entrar/);
    await u.type(screen.getByLabelText('PIN'), '4821');
    await u.type(screen.getByLabelText('Repítelo'), '4821');
    await u.click(screen.getByRole('button', { name: /Crear y entrar/ }));
    await screen.findByText('Caja abierta');

    await vault.guardar('entries', [{ id: '1', tipo: 'roce' }, { id: '2', tipo: 'acierto' }]);
    await u.click(screen.getByRole('button', { name: 'Bloquear' }));

    await u.type(await screen.findByLabelText('PIN'), '4821');
    await u.click(screen.getByRole('button', { name: 'Abrir' }));
    await waitFor(() => expect(screen.getByText(/2 entradas/)).toBeInTheDocument());
  });
});
