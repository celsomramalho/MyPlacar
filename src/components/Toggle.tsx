
import React from 'react';

interface ToggleProps {
  id: string; // ID único obrigatório para evitar bugs de clique
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  // Adicionada a propriedade disabled para resolver erro de tipagem no ScoreboardScreen
  disabled?: boolean;
}

export const Toggle: React.FC<ToggleProps> = ({ id, checked, onChange, label, disabled }) => {
  return (
    // Adicionado controle de opacidade e eventos de ponteiro quando desabilitado
    <div className={`flex items-center justify-between ${label ? 'w-full' : ''} py-2 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      {label && <span className="text-black text-[11px] font-black">{label}</span>}
      <div className="relative inline-block w-12 h-7 align-middle select-none transition duration-200 ease-in">
        <input 
          type="checkbox" 
          name="toggle" 
          id={id} 
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer transition-all duration-300 ease-in-out shadow-sm top-0.5 left-0.5 checked:translate-x-full"
        />
        <label 
          htmlFor={id} 
          className={`toggle-label block overflow-hidden h-7 rounded-full cursor-pointer transition-colors duration-300 ease-in-out ${checked ? 'bg-blue-500' : 'bg-gray-200'}`}
        ></label>
      </div>
    </div>
  );
};
