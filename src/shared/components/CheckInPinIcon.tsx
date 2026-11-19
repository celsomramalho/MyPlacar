import React from 'react';

interface CheckInPinIconProps {
  checked: boolean;
  size?: number;
  className?: string;
}

/** Shared check-in marker used in participant and admin views. */
export const CheckInPinIcon: React.FC<CheckInPinIconProps> = ({ checked, size = 20, className = '' }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    width={size}
    height={size}
    className={className}
    fill={checked ? '#10b981' : '#eef2ff'}
    stroke={checked ? '#059669' : '#818cf8'}
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
    {checked ? (
      <>
        <path d="m6.8 10.9 3.6 3.7 7.2-8" fill="none" stroke="#fff" strokeWidth="5.8" />
        <path d="m6.8 10.9 3.6 3.7 7.2-8" fill="none" stroke="#00c853" strokeWidth="4.2" />
      </>
    ) : (
        <circle cx="12" cy="10" r="2.8" fill="#fff" stroke="#6366f1" strokeWidth="1.2" />
    )}
  </svg>
);
