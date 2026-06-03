"use client";

import React, { useState } from 'react';
import { supabase } from '@infra/supabase';
import { ScoreboardIcon } from '@shared/components/ScoreboardIcon';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'sign_in' | 'sign_up'>('sign_in');

  const handleSubmit = async () => {
    if (!email || !password) {
      setError('Preencha e-mail e senha.');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const { error: authError } =
        mode === 'sign_in'
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({ email, password });
      if (authError) setError(authError.message);
    } catch (_e) {
      setError('Erro ao autenticar. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-[2.5rem] p-8 shadow-xl border border-gray-100">
        <div className="flex flex-col items-center mb-8">
          <ScoreboardIcon className="w-20 h-20 mb-4" />
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">MyPlacar Pro</h1>
          <p className="text-sm font-bold text-gray-500">Entre com sua conta Supabase</p>
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-600">E-mail</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="seu@email.com"
              className="w-full h-12 px-4 border border-gray-200 rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-600">Senha</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full h-12 px-4 border border-gray-200 rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-2xl text-xs font-bold text-red-600">
              {error}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={isLoading}
            className="w-full h-12 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-black rounded-2xl transition-colors"
          >
            {isLoading ? 'Aguarde...' : mode === 'sign_in' ? 'Entrar' : 'Cadastrar'}
          </button>

          <button
            onClick={() => { setMode(m => m === 'sign_in' ? 'sign_up' : 'sign_in'); setError(null); }}
            className="w-full text-center text-xs font-bold text-gray-400 hover:text-blue-500 transition-colors py-2"
          >
            {mode === 'sign_in' ? 'Não tem conta? Cadastre-se' : 'Já tem conta? Entrar'}
          </button>
        </div>
      </div>
    </div>
  );
};
