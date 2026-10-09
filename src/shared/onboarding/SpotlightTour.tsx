import React, { useEffect, useState } from 'react';
import { OnboardingStep } from './onboardingConfig';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';

interface SpotlightTourProps {
  steps: OnboardingStep[];
  isActive: boolean;
  onComplete: () => void;
  onSkip: () => void;
  onStepChange?: (stepIndex: number) => void;
}

export const SpotlightTour: React.FC<SpotlightTourProps> = ({
  steps,
  isActive,
  onComplete,
  onSkip,
  onStepChange,
}) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  const step = steps[currentStepIndex];

  useEffect(() => {
    if (!isActive || !step) return;

    const updatePosition = () => {
      const el = document.getElementById(step.targetId);
      if (el) {
        setTargetRect(el.getBoundingClientRect());
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        setTargetRect(null);
      }
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isActive, step, currentStepIndex]);

  if (!isActive || !step) return null;

  const isLast = currentStepIndex === steps.length - 1;

  const handleNext = () => {
    if (isLast) {
      onComplete();
    } else {
      const nextIdx = currentStepIndex + 1;
      setCurrentStepIndex(nextIdx);
      onStepChange?.(nextIdx);
    }
  };

  const handlePrev = () => {
    if (currentStepIndex > 0) {
      const prevIdx = currentStepIndex - 1;
      setCurrentStepIndex(prevIdx);
      onStepChange?.(prevIdx);
    }
  };

  // Calcula melhor posição para o balão (acima ou abaixo do elemento focado)
  const isTargetInBottomHalf = targetRect ? targetRect.top > window.innerHeight / 2 : false;

  return (
    <div className="fixed inset-0 z-[10000] overflow-hidden pointer-events-auto">
      {/* Backdrop com "recorte" limpo através de box-shadow gigante ao redor do alvo */}
      {targetRect ? (
        <div
          onClick={onSkip}
          className="fixed rounded-3xl pointer-events-auto transition-all duration-300 border-2 border-sky-400"
          style={{
            top: Math.max(0, targetRect.top - 6),
            left: Math.max(0, targetRect.left - 6),
            width: targetRect.width + 12,
            height: targetRect.height + 12,
            /* O recorte transparente: o elemento em si fica 100% visível, nítido e sem blur, enquanto tudo ao redor escurece */
            boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.72), 0 0 15px rgba(14, 165, 233, 0.5)',
          }}
        />
      ) : (
        <div 
          className="fixed inset-0 bg-slate-950/70 transition-opacity duration-300"
          onClick={onSkip}
        />
      )}

      {/* Balão do Tour */}
      <div
        className="fixed z-20 w-[92%] max-w-sm bg-white rounded-2xl p-4 shadow-2xl border border-slate-100 flex flex-col gap-3 transition-all duration-300 animate-in fade-in zoom-in-95 pointer-events-auto"
        style={{
          left: '50%',
          transform: 'translateX(-50%)',
          top: targetRect
            ? isTargetInBottomHalf
              ? Math.max(20, targetRect.top - 170)
              : Math.min(window.innerHeight - 200, targetRect.bottom + 12)
            : 'auto',
          bottom: !targetRect ? '24px' : undefined,
        }}
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-sky-700 bg-sky-50 px-2.5 py-0.5 rounded-full border border-sky-100">
            Passo {currentStepIndex + 1} de {steps.length}
          </span>
          <button
            onClick={onSkip}
            className="text-slate-400 hover:text-slate-600 text-xs font-semibold px-2 py-1 rounded transition-colors"
          >
            Pular
          </button>
        </div>

        <div>
          <h4 className="text-base font-black text-slate-800 tracking-tight">{step.title}</h4>
          <p className="text-xs font-semibold text-slate-600 leading-relaxed mt-1">
            {step.description}
          </p>
          {step.example && (
            <p className="text-[11px] font-semibold text-sky-600 bg-sky-50/70 px-2 py-1 rounded-md mt-2">
              {step.example}
            </p>
          )}
        </div>

        {/* Rodapé: indicadores e botões */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100 mt-0.5">
          <div className="flex gap-1.5 items-center">
            {steps.map((_, idx) => (
              <span
                key={idx}
                className={`h-2 rounded-full transition-all duration-300 ${
                  idx === currentStepIndex ? 'w-5 bg-sky-600' : 'w-2 bg-slate-200'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            {currentStepIndex > 0 && (
              <button
                onClick={handlePrev}
                className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-full transition-all active:scale-90 border border-slate-200"
                title="Passo anterior"
                aria-label="Voltar"
              >
                <ChevronLeft size={18} strokeWidth={2.5} />
              </button>
            )}
            <button
              onClick={handleNext}
              className={`flex items-center justify-center transition-all active:scale-95 shadow-md cursor-pointer ${
                isLast
                  ? 'px-3.5 h-8 gap-1 text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 rounded-full'
                  : 'w-8 h-8 text-white bg-sky-600 hover:bg-sky-700 rounded-full'
              }`}
              title={isLast ? 'Concluir tour' : 'Próximo passo'}
              aria-label={isLast ? 'Concluir' : 'Próximo'}
            >
              {isLast ? (
                <>
                  <span>Concluir</span>
                  <Check size={14} strokeWidth={3} />
                </>
              ) : (
                <ChevronRight size={18} strokeWidth={2.5} />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
