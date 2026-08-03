'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import CRM from './CRM';

const inputCls =
  'w-full bg-white border border-[#D8D2C4] rounded-sm px-3 py-2 text-sm text-[#2A2118] placeholder-[#A69C88] focus:outline-none focus:ring-2 focus:ring-[#E8871E] focus:border-transparent';

export default function AuthGate() {
  const [session, setSession] = useState(undefined); // undefined = cargando, null = sin sesión
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setInfoMsg('');
    setLoading(true);
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setError(error.message);
      else setInfoMsg('Cuenta creada. Si Supabase pide confirmación, revisá tu email y después iniciá sesión.');
    }
    setLoading(false);
  };

  if (session === undefined) {
    return (
      <div className="min-h-screen bg-[#F7F5F0] flex items-center justify-center text-sm text-[#A69C88]">
        Cargando...
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-[#F7F5F0] flex items-center justify-center p-4">
        <form onSubmit={submit} className="w-full max-w-sm bg-white border border-[#E4DECF] rounded-sm p-6">
          <h1 className="text-xl font-extrabold text-[#2A2118] mb-1">Seguimiento comercial</h1>
          <p className="text-sm text-[#8A8272] mb-4">{mode === 'login' ? 'Iniciá sesión' : 'Creá tu cuenta'}</p>

          <label className="block mb-3">
            <span className="block text-[11px] font-bold uppercase tracking-wide text-[#6B6352] mb-1">Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
            />
          </label>

          <label className="block mb-4">
            <span className="block text-[11px] font-bold uppercase tracking-wide text-[#6B6352] mb-1">Contraseña</span>
            <input
              type="password"
              required
              minLength={6}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputCls}
            />
          </label>

          {error && <p className="text-sm text-[#B0452E] mb-3">{error}</p>}
          {infoMsg && <p className="text-sm text-[#3F6B4A] mb-3">{infoMsg}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#E8871E] text-[#2A2118] rounded-sm px-3.5 py-2.5 font-bold text-sm disabled:opacity-60"
          >
            {loading ? 'Un momento...' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
          </button>

          <button
            type="button"
            onClick={() => {
              setMode(mode === 'login' ? 'signup' : 'login');
              setError('');
              setInfoMsg('');
            }}
            className="w-full text-center text-xs font-bold text-[#B0452E] mt-3"
          >
            {mode === 'login' ? '¿No tenés cuenta? Creá una' : '¿Ya tenés cuenta? Iniciá sesión'}
          </button>
        </form>
      </div>
    );
  }

  return <CRM userId={session.user.id} onLogout={() => supabase.auth.signOut()} />;
}
