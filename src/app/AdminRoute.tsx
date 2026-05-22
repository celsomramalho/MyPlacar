import React from 'react';
import { AdminScreen } from '@modules/admin';
import { useGame } from '@modules/game';
import { useUI } from '@modules/ui';
import type { AdminTab, Tab } from '../types';

interface AdminRouteProps {
  adminTab: AdminTab;
  setActiveTab: (tab: Tab) => void;
  handleImportData: (jsonStr: string) => void;
  handleClearAllHistory: () => void;
  onOpenMenu: () => void;
}

export function AdminRoute({
  adminTab,
  setActiveTab,
  handleImportData,
  handleClearAllHistory,
  onOpenMenu,
}: AdminRouteProps) {
  const { setCurrentScreen, setModalConfig } = useUI();
  const { handleExportData } = useGame();

  return (
    <AdminScreen
      onBack={() => setCurrentScreen('settings')}
      onNavigateToTab={t => { setActiveTab(t); setCurrentScreen('settings'); }}
      onOpenRules={() => setCurrentScreen('new-game')}
      onExportData={handleExportData}
      onImportData={handleImportData}
      onClearAllHistory={() =>
        setModalConfig({
          title: 'Limpar histórico?',
          message: 'Apagará permanentemente os registros locais e na nuvem.',
          confirmLabel: 'Sim, apagar',
          variant: 'danger',
          onConfirm: () => handleClearAllHistory(),
          onCancel: () => setModalConfig(null),
        })
      }
      initialTab={adminTab}
      onOpenMenu={onOpenMenu}
    />
  );
}
