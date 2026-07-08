import React from 'react';
import { Eye, Crown, User, UserCheck, Gamepad2 } from 'lucide-react';

interface Props {
  className?: string;
  onClick?: () => void;
  variant?: 'header' | 'card';
  role?: 'owner' | 'judge' | 'observer' | 'spectator';
  status?: 'controller' | 'watcher';
  progress?: number;
  onPointerDown?: (e: any) => void;
  onPointerUp?: (e: any) => void;
  onPointerLeave?: (e: any) => void;
}

export const LiveIndicator: React.FC<Props> = ({ 
  className = "", onClick, variant = 'header', role = 'spectator', status,
  progress = 0, onPointerDown, onPointerUp, onPointerLeave 
}) => (
  <button 
    onClick={onClick}
    onPointerDown={onPointerDown}
    onPointerUp={onPointerUp}
    onPointerLeave={onPointerLeave}
    className={`flex flex-col items-center justify-center gap-0.5 group transition-all duration-300 relative overflow-hidden ${onClick ? 'active:scale-90 cursor-pointer' : 'cursor-default'} ${className}`}
    disabled={!onClick}
  >
    {progress > 0 && (
      <div 
        className="absolute inset-0 bg-white/10 origin-left transition-all duration-75 z-0" 
        style={{ transform: `scaleX(${progress / 100})` }} 
      />
    )}
    <div className={`relative z-10 flex items-center justify-center ${variant === 'header' ? 'w-14 h-7' : 'w-16 h-8'}`}>
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
        {status === 'controller' ? (
          <Gamepad2 size={variant === 'header' ? 18 : 22} className="text-orange-500" strokeWidth={2.5} />
        ) : status === 'watcher' ? (
          <Eye size={variant === 'header' ? 18 : 22} className="text-slate-400" strokeWidth={3} />
        ) : role === 'owner' ? (
          <Crown size={variant === 'header' ? 18 : 22} className="text-blue-600 fill-white" strokeWidth={2.5} />
        ) : role === 'judge' ? (
          <UserCheck size={variant === 'header' ? 18 : 22} className="text-emerald-500" strokeWidth={3} />
        ) : role === 'observer' ? (
          <User size={variant === 'header' ? 18 : 22} className="text-[#00FFFF]" strokeWidth={3} />
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
