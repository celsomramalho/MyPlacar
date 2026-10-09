import React, { useEffect, useState } from 'react';
import { ScreenOnboardingConfig } from './onboardingConfig';
import { Check, Sparkles } from 'lucide-react';

interface ScreenIntroCardProps {
  config: ScreenOnboardingConfig;
  isOpen: boolean;
  onDismiss: () => void;
}

export const ScreenIntroCard: React.FC<ScreenIntroCardProps> = ({
  config,
  isOpen,
  onDismiss,
}) => {
  const [progress, setProgress] = useState(100);
  const duration = config.intro.durationMs || 5000;

  useEffect(() => {
    if (!isOpen) {
      setProgress(100);
      return;
    }

    const intervalTime = 50;
    const stepDecrement = (intervalTime / duration) * 100;

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev <= 0) {
          clearInterval(timer);
          onDismiss();
          return 0;
        }
        return Math.max(0, prev - stepDecrement);
      });
    }, intervalTime);

    return () => clearInterval(timer);
  }, [isOpen, duration, onDismiss]);

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-6 left-4 right-4 max-w-sm mx-auto z-[9999] animate-in slide-in-from-bottom duration-300">
      <div className="bg-white rounded-3xl p-5 shadow-2xl border-l-4 border-l-brand-500 border border-slate-100 flex flex-col gap-3 relative overflow-hidden">
        {/* Barra de auto-dismiss */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-slate-100 overflow-hidden">
          <div
            className="h-full bg-brand-500 transition-all duration-75 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex items-start gap-3 mt-1">
          <div className="w-9 h-9 rounded-2xl bg-brand-50 flex items-center justify-center text-brand-500 shrink-0 shadow-inner">
            <Sparkles size={18} />
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-black text-slate-800 tracking-tight leading-tight">
              {config.intro.title}
            </h4>
            <p className="text-xs font-medium text-slate-500 leading-relaxed mt-1">
              {config.intro.description}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <span className="text-[10px] font-bold text-slate-400">
            Dica rápida
          </span>
          <button
            onClick={onDismiss}
            className="px-3.5 py-1.5 text-xs font-black text-brand-600 bg-brand-50 hover:bg-brand-100 rounded-xl transition-all active:scale-95 flex items-center gap-1"
          >
            Entendido <Check size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};
