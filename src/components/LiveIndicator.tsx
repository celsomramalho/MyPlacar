import React from 'react';
import { ShieldCheck, Eye } from 'lucide-react';

interface Props {
  className?: string;
  onClick?: () => void;
  variant?: 'header' | 'card';
  role?: 'owner' | 'observer' | 'spectator';
}

export const LiveIndicator: React.FC<Props> = ({ className = "", onClick, variant = 'header', role = 'spectator' }) => (
  <button 
    onClick={onClick}
    className={`flex flex-col items-center justify-center gap-0.5 group transition-all duration-300 ${onClick ? 'active:scale-90 cursor-pointer' : 'cursor-default'} ${className}`}
    disabled={!onClick}
  >
    <div className={`relative flex items-center justify-center ${variant === 'header' ? 'w-14 h-7' : 'w-16 h-8'}`}>
      {/* Ondas de sinal azul claro (#7dd3fc) */}
      <svg 
        width={variant === 'header' ? "32" : "40"} 
        height={variant === 'header' ? "20" : "24"} 
        viewBox="0 0 24 18" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg" 
        className="absolute"
      >
        <path d="M4 4C2.5 6 2.5 12 4 14" stroke="#7dd3fc" strokeWidth="2.5" strokeLinecap="round"/>
        <path d="M20 4C21.5 6 21.5 12 20 14" stroke="#7dd3fc" strokeWidth="2.5" strokeLinecap="round"/>
        <path d="M7 6.5C6.5 7.5 6.5 10.5 7 11.5" stroke="#7dd3fc" strokeWidth="2.5" strokeLinecap="round"/>
        <path d="M17 6.5C17.5 7.5 17.5 10.5 17 11.5" stroke="#7dd3fc" strokeWidth="2.5" strokeLinecap="round"/>
      </svg>
      
      {/* Ícone central dinâmico */}
      <div className={`relative z-10 flex items-center justify-center ${variant === 'header' ? '-mt-0.5' : '-mt-1'}`}>
        {role === 'owner' ? (
          <ShieldCheck size={variant === 'header' ? 18 : 22} className="text-blue-600 fill-white" strokeWidth={2.5} />
        ) : role === 'observer' ? (
          <Eye size={variant === 'header' ? 18 : 22} className="text-[#00FFFF]" strokeWidth={3} />
        ) : (
          <svg 
            width={variant === 'header' ? "12" : "14"} 
            height={variant === 'header' ? "14" : "16"} 
            viewBox="0 0 10 12" 
            fill="none" 
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M1 1.5L8.5 6L1 10.5V1.5Z" stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round" fill="white"/>
          </svg>
        )}
      </div>
    </div>
    {/* Badge LIVE laranja (#f59e0b) com texto branco em Sentence case */}
    <div className="bg-[#f59e0b] rounded-[4px] px-1.5 py-0.5 shadow-sm -mt-0.5">
      <span className="text-[8px] font-black text-white tracking-tighter leading-none block">Live</span>
    </div>
  </button>
);