import { useState, useEffect, useCallback } from 'react';
import { ONBOARDING_CONFIG } from './onboardingConfig';

export type OnboardingStatus = 'unseen' | 'partial' | 'completed';

export function getOnboardingStatus(screenKey: string): OnboardingStatus {
  try {
    const val = localStorage.getItem(`myplacar_onboarding_status_${screenKey}`);
    if (val === 'completed' || val === 'partial') return val;
    // Retrocompatibilidade se já houver 'seen' antigo
    const legacy = localStorage.getItem(`myplacar_onboarding_seen_${screenKey}`);
    if (legacy === 'true') return 'completed';
    return 'unseen';
  } catch {
    return 'unseen';
  }
}

export function useScreenOnboarding(screenKey: string) {
  const [showIntro, setShowIntro] = useState(false);
  const [showTour, setShowTour] = useState(false);

  const statusKey = `myplacar_onboarding_status_${screenKey}`;
  const config = ONBOARDING_CONFIG[screenKey];

  useEffect(() => {
    if (!config) return;
    try {
      const currentStatus = getOnboardingStatus(screenKey);
      if (currentStatus === 'unseen') {
        // Primeira vez nesta tela
        setShowIntro(true);
      }
    } catch {}
  }, [screenKey, config]);

  const handleDismissIntro = useCallback(() => {
    setShowIntro(false);
    // Após fechar o card de boas-vindas na 1ª vez, inicia o tour de elementos
    if (config?.steps && config.steps.length > 0) {
      setShowTour(true);
    } else {
      try {
        localStorage.setItem(statusKey, 'completed');
      } catch {}
    }
  }, [config, statusKey]);

  const handleStepChange = useCallback((stepIndex: number) => {
    try {
      const current = localStorage.getItem(statusKey);
      if (current !== 'completed') {
        // Se já avançou pelo menos um passo, marca como partial
        localStorage.setItem(statusKey, 'partial');
      }
    } catch {}
  }, [statusKey]);

  const handleCompleteTour = useCallback(() => {
    setShowTour(false);
    try {
      localStorage.setItem(statusKey, 'completed');
    } catch {}
  }, [statusKey]);

  const handleSkipTour = useCallback((fromStepIndex?: number) => {
    setShowTour(false);
    try {
      const current = localStorage.getItem(statusKey);
      if (current !== 'completed') {
        // Se pulou antes do fim, fica como 'partial' se já iniciou, ou se viu o intro
        localStorage.setItem(statusKey, 'partial');
      }
    } catch {}
  }, [statusKey]);

  // Função para relançar o tour sob demanda (acionada pelo botão "?" do menu ou ajuda)
  const replayTour = useCallback(() => {
    setShowIntro(false);
    setShowTour(true);
  }, []);

  return {
    config,
    showIntro,
    showTour,
    handleDismissIntro,
    handleStepChange,
    handleCompleteTour,
    handleSkipTour,
    replayTour,
  };
}
