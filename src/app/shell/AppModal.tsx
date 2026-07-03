import React from 'react';
import type { ModalConfig } from '@modules/ui/types';

export interface AppModalProps {
  modalConfig: ModalConfig | null;
}

export const AppModal: React.FC<AppModalProps> = ({ modalConfig }) => {
  if (!modalConfig) return null;

  const pulseAlertClasses = modalConfig.pulseAlert
    ? 'animate-pulse border-4 border-orange-400 shadow-orange-300/80 ring-8 ring-orange-200/70'
    : '';
  const iconPulseClasses = modalConfig.pulseAlert ? 'animate-bounce' : '';

  return (
    <div className="fixed inset-0 z-[999999] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
      <div className={`bg-white rounded-[2.5rem] p-8 w-full max-xs shadow-2xl animate-in zoom-in duration-300 space-y-6 flex flex-col items-center ${pulseAlertClasses}`}>
        {modalConfig.icon && <div className={`mb-2 ${iconPulseClasses}`}>{modalConfig.icon}</div>}
        <h3 className="text-2xl font-black mb-4 text-center">{modalConfig.title}</h3>
        <p className="text-black font-black mb-6 leading-tight text-center">{modalConfig.message}</p>
        <div className="flex gap-3 w-full">
          {modalConfig.onCancel && (
            <button
              type="button"
              onClick={() => modalConfig.onCancel!()}
              className={`flex-1 py-4 rounded-[1.5rem] font-black text-xs tracking-widest active:scale-95 transition-all ${
                modalConfig.cancelLabel
                  ? 'bg-green-500 text-white shadow-lg shadow-green-100'
                  : 'bg-gray-200 text-gray-700'
              }`}
            >
              {modalConfig.cancelLabel || 'Cancelar'}
            </button>
          )}
          <button
            type="button"
            onClick={() => modalConfig.onConfirm()}
            className={`flex-1 py-4 rounded-[1.5rem] font-black text-xs tracking-widest active:scale-95 transition-all ${
              modalConfig.variant === 'danger'
                ? 'bg-red-600 text-white shadow-lg shadow-red-200'
                : 'bg-blue-600 text-white shadow-lg shadow-blue-100'
            }`}
          >
            {modalConfig.confirmLabel || 'Ok'}
          </button>
        </div>
      </div>
    </div>
  );
};
