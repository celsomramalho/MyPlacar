"use client";

import React from 'react';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '../integrations/supabase/client.ts';
import { ScoreboardIcon } from '../components/ScoreboardIcon.tsx';

export const Login: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-[2.5rem] p-8 shadow-xl border border-gray-100">
        <div className="flex flex-col items-center mb-8">
          <ScoreboardIcon className="w-20 h-20 mb-4" />
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">MyPlacar Pro</h1>
          <p className="text-sm font-bold text-gray-500">Entre com sua conta Supabase</p>
        </div>
        
        <Auth
          supabaseClient={supabase}
          appearance={{
            theme: ThemeSupa,
            variables: {
              default: {
                colors: {
                  brand: '#3b82f6',
                  brandAccent: '#2563eb',
                },
                radii: {
                  buttonBorderRadius: '1rem',
                  inputBorderRadius: '1rem',
                }
              }
            }
          }}
          providers={[]}
          theme="light"
          localization={{
            variables: {
              sign_in: {
                email_label: 'E-mail',
                password_label: 'Senha',
                button_label: 'Entrar',
              },
              sign_up: {
                email_label: 'E-mail',
                password_label: 'Crie uma senha',
                button_label: 'Cadastrar',
              }
            }
          }}
        />
      </div>
    </div>
  );
};