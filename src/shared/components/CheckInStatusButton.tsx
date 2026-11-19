import React from 'react';
import { Loader2 } from 'lucide-react';
import { CheckInPinIcon } from './CheckInPinIcon';

interface CheckInStatusButtonProps {
  checked: boolean;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  loading?: boolean;
  compact?: boolean;
  compactOnMobile?: boolean;
  athleteName?: string;
  className?: string;
}

/** Shared check-in toggle used by athletes and event operators. */
export const CheckInStatusButton: React.FC<CheckInStatusButtonProps> = ({
  checked,
  onClick,
  disabled = false,
  loading = false,
  compact = false,
  compactOnMobile = false,
  athleteName,
  className = '',
}) => {
  const label = loading ? 'Salvando…' : checked ? 'Check-in feito' : 'Fazer check-in';
  const stateClasses = checked
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
    : 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100';

  return (
    <button
      type="button"
      disabled={disabled || loading}
      onClick={(event) => onClick(event)}
      aria-label={athleteName ? `${label}: ${athleteName}` : label}
      aria-pressed={checked}
      title={disabled ? `${label} indisponível` : athleteName ? `${label}: ${athleteName}` : label}
      className={`inline-flex shrink-0 items-center justify-center border font-black transition-all disabled:cursor-not-allowed disabled:opacity-50 ${compact ? 'h-8 w-8 rounded-xl p-1' : compactOnMobile ? 'h-8 w-8 rounded-xl p-1 sm:h-auto sm:w-auto sm:gap-1.5 sm:rounded-xl sm:px-3 sm:py-1.5 sm:text-[11px] sm:active:scale-95' : 'gap-1.5 rounded-xl px-3 py-1.5 text-[11px] active:scale-95'} ${stateClasses} ${className}`}
    >
      {loading ? <Loader2 size={compact || compactOnMobile ? 14 : 15} className="animate-spin" /> : <CheckInPinIcon checked={checked} size={compact || compactOnMobile ? 17 : 18} />}
      {!compact && <span className={compactOnMobile ? 'hidden sm:inline' : ''}>{label}</span>}
    </button>
  );
};
