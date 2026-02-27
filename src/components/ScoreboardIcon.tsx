import React from 'react';

// Added style prop to allow custom animations like the one used in the splash screen
export const ScoreboardIcon = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <svg 
    viewBox="0 0 32 32" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg" 
    className={className}
    style={style}
  >
    {/* Frame */}
    <rect x="2" y="6" width="28" height="20" rx="4" fill="#1e293b" />
    <path d="M2 10C2 7.79086 3.79086 6 6 6H26C28.2091 6 30 7.79086 30 10V11H2V10Z" fill="#334155" />
    
    {/* Hinges */}
    <rect x="8" y="4" width="2" height="4" rx="1" fill="#94a3b8" />
    <rect x="22" y="4" width="2" height="4" rx="1" fill="#94a3b8" />
    
    {/* Left Card (Red) */}
    <rect x="5" y="13" width="10" height="10" rx="1" fill="#ef4444" />
    <rect x="9" y="15" width="2" height="6" rx="1" stroke="white" strokeWidth="1.5" fill="none"/> {/* 0 */}

    {/* Right Card (Blue) */}
    <rect x="17" y="13" width="10" height="10" rx="1" fill="#3b82f6" />
    <path d="M21 16H23L21 20H23" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/> {/* 2 */}
  </svg>
);