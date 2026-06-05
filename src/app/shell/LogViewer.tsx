import React from 'react';
import { AlertCircle, X } from 'lucide-react';
import type { LogEntry } from '@app/hooks/useAppLogger';

export interface LogViewerProps {
  logs: LogEntry[];
  onClose: () => void;
  onClear: () => void;
}

export const LogViewer: React.FC<LogViewerProps> = ({ logs, onClose, onClear }) => (
  <div className="fixed inset-0 z-[2000] bg-black/95 text-white p-6 flex flex-col font-mono text-[10px] animate-in fade-in duration-300">
    <div className="flex justify-between items-center mb-6 border-b border-white/10 pb-4">
      <div className="flex flex-col">
        <h3 className="text-sm font-black uppercase tracking-widest text-blue-400">Registros do sistema</h3>
        <p className="text-[9px] font-bold text-slate-500 mt-1">Captura de logs em tempo real</p>
      </div>
      <button type="button" onClick={onClose} className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl transition-colors">
        <X size={24} />
      </button>
    </div>
    <div className="flex-1 overflow-y-auto space-y-3 no-scrollbar">
      {logs.length === 0 && (
        <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-2">
          <AlertCircle size={40} opacity={0.2} />
          <p className="italic">Nenhum registro capturado ainda.</p>
        </div>
      )}
      {logs.map((log, i) => (
        <div
          key={i}
          className={`p-3 rounded-2xl border-l-4 ${
            log.type === 'error'
              ? 'bg-red-500/5 border-red-500/50'
              : log.type === 'warn'
                ? 'bg-amber-500/5 border-amber-500/50'
                : 'bg-blue-500/5 border-blue-500/50'
          }`}
        >
          <div className="flex justify-between items-center opacity-40 mb-2 text-[8px] font-black uppercase tracking-tighter">
            <span
              className={
                log.type === 'error' ? 'text-red-400' : log.type === 'warn' ? 'text-amber-400' : 'text-blue-400'
              }
            >
              {log.type}
            </span>
            <span>{log.time}</span>
          </div>
          <div className="break-all whitespace-pre-wrap text-[11px] font-medium leading-relaxed text-slate-300">
            {log.msg}
          </div>
        </div>
      ))}
    </div>
    <div className="mt-6 flex gap-3">
      <button
        type="button"
        onClick={onClear}
        className="flex-1 py-4 bg-white/5 hover:bg-white/10 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all active:scale-95"
      >
        Limpar
      </button>
      <button
        type="button"
        onClick={onClose}
        className="flex-1 py-4 bg-blue-600 hover:bg-blue-700 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all active:scale-95 shadow-lg shadow-blue-900/20"
      >
        Fechar
      </button>
    </div>
  </div>
);
