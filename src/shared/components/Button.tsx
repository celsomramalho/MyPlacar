import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'circle-primary' | 'circle-secondary';
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({ variant = 'primary', className = '', children, ...props }) => {
  const baseStyles = 'transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center font-semibold';

  const variants = {
    primary: 'bg-blue-500 text-white rounded-xl py-3 px-6 shadow-md hover:bg-blue-600',
    secondary: 'bg-white text-blue-500 rounded-xl py-3 px-6 shadow-sm border border-gray-200 hover:bg-gray-50',
    danger: 'bg-red-50 text-red-500 rounded-xl py-3 px-6 hover:bg-red-100 border border-red-100',
    ghost: 'bg-transparent text-gray-500 hover:text-gray-900',
    'circle-primary': 'bg-blue-500 text-white rounded-full w-16 h-16 md:w-20 md:h-20 shadow-lg flex-col text-xs gap-1',
    'circle-secondary': 'bg-green-500 text-white rounded-full w-16 h-16 md:w-20 md:h-20 shadow-lg flex-col text-xs gap-1',
  };

  return (
    <button className={`${baseStyles} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
};
