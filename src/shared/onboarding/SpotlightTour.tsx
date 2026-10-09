import React, { useEffect, useRef, useState } from 'react';
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
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [tooltipHeight, setTooltipHeight] = useState(210);

  const step = steps[currentStepIndex];

  // Observa a altura real do balão de forma reativa
  useEffect(() => {
    if (!tooltipRef.current) return;
    const updateHeight = () => {
      if (tooltipRef.current) {
        const h = tooltipRef.current.offsetHeight;
        if (h > 0) setTooltipHeight(h);
      }
    };
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(tooltipRef.current);
    return () => observer.disconnect();
  }, [step, currentStepIndex]);

  useEffect(() => {
    if (!isActive || !step) return;

    const el = document.getElementById(step.targetId);
    if (!el) {
      setTargetRect(null);
      return;
    }

    // Rola suavemente até o elemento apenas uma vez ao mudar de passo
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });

    const updatePosition = () => {
      const target = document.getElementById(step.targetId);
      if (target) {
        setTargetRect(target.getBoundingClientRect());
      } else {
        setTargetRect(null);
      }
    };

    updatePosition();

    // Sincroniza com as fases da animação de scroll
    const timer1 = setTimeout(updatePosition, 100);
    const timer2 = setTimeout(updatePosition, 250);
    const timer3 = setTimeout(updatePosition, 450);

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
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

  // Calcula melhor posição para o balão com folga segura para nunca sobrepor o elemento focado
  const gap = 16;
  const spaceAbove = targetRect ? targetRect.top : 0;
  const spaceBelow = targetRect ? window.innerHeight - targetRect.bottom : 0;

  let placeAbove = false;
  if (step?.placement === 'top') {
    placeAbove = true;
  } else if (step?.placement === 'bottom') {
    placeAbove = false;
  } else {
    // Decisão inteligente automática:
    // Se o elemento estiver na metade inferior da tela E couber acima com folga:
    if (spaceAbove >= tooltipHeight + gap + 10 && targetRect && targetRect.top > window.innerHeight / 2) {
      placeAbove = true;
    } else if (spaceBelow >= tooltipHeight + gap + 10) {
      // Se couber abaixo com folga suficiente:
      placeAbove = false;
    } else {
      // Caso contrário, fica no lado com mais espaço
      placeAbove = spaceAbove > spaceBelow;
    }
  }

  // Cálculo da coordenada top do balão
  let tooltipTop: number | undefined;
  if (targetRect) {
    if (placeAbove) {
      // Fica acima: o rodapé do balão fica a `gap` pixels do topo do alvo.
      tooltipTop = Math.max(16, targetRect.top - tooltipHeight - gap);
    } else {
      // Fica abaixo: o topo do balão fica a `gap` pixels do rodapé do alvo.
      tooltipTop = Math.min(window.innerHeight - tooltipHeight - 16, targetRect.bottom + gap);
    }
  }

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
        ref={tooltipRef}
        className="fixed z-20 w-[92%] max-w-sm bg-white rounded-2xl p-4 shadow-2xl border border-slate-100 flex flex-col gap-3 transition-all duration-300 animate-in fade-in zoom-in-95 pointer-events-auto"
        style={{
          left: '50%',
          transform: 'translateX(-50%)',
          top: tooltipTop !== undefined ? `${tooltipTop}px` : 'auto',
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
