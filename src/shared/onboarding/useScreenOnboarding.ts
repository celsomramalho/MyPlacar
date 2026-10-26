import { useState, useEffect, useCallback } from 'react';
import { ONBOARDING_CONFIG } from './onboardingConfig';
import { isAppInstalled, isAndroidDevice, isAppleDevice } from '@pwa/installPrompt';

export type OnboardingStatus = 'unseen' | 'partial' | 'completed';

export function getOnboardingStatus(screenKey: string): OnboardingStatus {
  try {
    const val = localStorage.getItem(`myplacar_onboarding_status_${screenKey}`);
    const legacy = localStorage.getItem(`myplacar_onboarding_seen_${screenKey}`);
    const rawStatus = (val === 'completed' || val === 'partial') ? val : (legacy === 'true' ? 'completed' : 'unseen');

    // Se o usuário tinha a tela home concluída (quando havia 9 passos), mas o aparelho exibe o botão instalar (passo 10) e ele ainda não leu
    if (screenKey === 'home' && rawStatus === 'completed') {
      const canShowInstall = !isAppInstalled() && (isAndroidDevice() || isAppleDevice());
      const step10Completed = localStorage.getItem('myplacar_onboarding_home_step10_completed') === 'true';
      if (canShowInstall && !step10Completed) {
        return 'partial';
      }
    }

    return rawStatus;
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
      if (screenKey === 'home') {
        localStorage.setItem('myplacar_onboarding_home_step10_completed', 'true');
      }
    } catch {}
  }, [screenKey, statusKey]);

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
