import React from 'react';
import { Layers, Clock, RotateCcw } from 'lucide-react';
import { formatWaitDuration } from '../utils/formatWaitDuration';

export interface QueueHeaderStatsProps {
  visibleMatchesCount: number;
  totalUnfinishedCount: number;
  freeCourtsCount: number;
  busyCourtsCount: number;
  interdictedCourtsCount: number;
  totalCourtsCount: number;
  averageMatchDurationMinutes: number;
  isDurationEstimated: boolean;
  finishedMatchesCountWithDuration: number;
  isReadOnly?: boolean;
  onResetDurationHistory?: () => void;
  nextCourtFreeWaitMinutes?: number;
  nextCourtFreeTimeStr?: string;
  title?: string;
  subtitle?: string;
  compact?: boolean;
}

export const QueueHeaderStats: React.FC<QueueHeaderStatsProps> = ({
  visibleMatchesCount,
  totalUnfinishedCount,
  freeCourtsCount,
  busyCourtsCount,
  interdictedCourtsCount,
  averageMatchDurationMinutes,
  isDurationEstimated,
  finishedMatchesCountWithDuration,
  isReadOnly = false,
  onResetDurationHistory,
  nextCourtFreeWaitMinutes,
  nextCourtFreeTimeStr,
  title = 'Gerenciar fila',
  subtitle = 'Controle de quadras ao vivo e fila única dinâmica de partidas.',
  compact = false,
}) => {
  return (
    <div className={`bg-white ${compact ? 'p-2.5 rounded-2xl' : 'p-4 sm:p-5 rounded-3xl'} border border-slate-100 shadow-sm overflow-hidden`}>
      <div className="flex items-start gap-2.5 min-w-0">
        {!compact && (
        <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-sm shrink-0 mt-0.5">
          <Layers size={20} />
        </div>
        )}
        <div className="min-w-0 flex-1">
          {!compact && <>
          <h2 className="text-xl font-black text-slate-800 tracking-tight whitespace-nowrap truncate">
            {title}
          </h2>
          <p className="text-xs text-slate-400 font-bold mt-0.5 whitespace-nowrap truncate">
            {subtitle}
          </p>
          </>}

          {/* Indicativos de status das quadras */}
          <div className={`flex items-center gap-1.5 flex-wrap ${compact ? 'mt-1.5' : 'mt-2'}`}>
            <span className={`inline-flex items-center gap-1.5 rounded-xl font-black bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap ${compact ? 'px-2 py-1 text-[10px]' : 'px-3 py-1.5 text-xs'}`}>
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              {freeCourtsCount} {freeCourtsCount === 1 ? 'livre' : 'livres'}
            </span>
            <span className={`inline-flex items-center gap-1.5 rounded-xl font-black bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap ${compact ? 'px-2 py-1 text-[10px]' : 'px-3 py-1.5 text-xs'}`}>
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              {busyCourtsCount} {busyCourtsCount === 1 ? 'ocupada' : 'ocupadas'}
            </span>
            {interdictedCourtsCount > 0 && (
              <span className={`inline-flex items-center gap-1.5 rounded-xl font-black bg-red-50 text-red-700 border border-red-200 whitespace-nowrap ${compact ? 'px-2 py-1 text-[10px]' : 'px-3 py-1.5 text-xs'}`}>
                <span className="w-2 h-2 rounded-full bg-red-500" />
                {interdictedCourtsCount} {interdictedCourtsCount === 1 ? 'interditada' : 'interditadas'}
              </span>
            )}
            {!compact && <span className="inline-flex items-center gap-1.5 text-[10px] font-black px-2.5 py-1 rounded-xl bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap">
              <Clock size={11} className="text-slate-500" />
              Duração média: {averageMatchDurationMinutes} min {isDurationEstimated ? '(estimada)' : `(${finishedMatchesCountWithDuration} jogos)`}
            </span>}
            {!compact && !isReadOnly && !isDurationEstimated && onResetDurationHistory && (
              <button
                type="button"
                onClick={onResetDurationHistory}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-black text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 transition-colors whitespace-nowrap"
                title="Descartar a amostra de durações e voltar ao tempo configurado no evento"
              >
                <RotateCcw size={11} />
                Zerar histórico
              </button>
            )}
            {freeCourtsCount === 0 && nextCourtFreeWaitMinutes !== undefined && (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-black px-2.5 py-1 rounded-xl bg-sky-50 text-sky-800 border border-sky-200 whitespace-nowrap">
                <Clock size={11} className="text-sky-600" />
                Próxima liberação: ~{nextCourtFreeWaitMinutes} min (~{formatWaitDuration(nextCourtFreeWaitMinutes)})
              </span>
            )}
          </div>

          {/* Volume de partidas da fila, logo abaixo dos indicadores das quadras */}
          <p className={`font-bold text-slate-500 ${compact ? 'text-[10px] mt-1.5' : 'text-xs mt-2'}`}>
            Exibindo{' '}
            <span className="font-black text-slate-700">{visibleMatchesCount}</span>
            {' '}de{' '}
            <span className="font-black text-slate-700">{totalUnfinishedCount}</span>
            {' '}partidas não finalizadas
            {totalUnfinishedCount > visibleMatchesCount && (
              <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">
                +{totalUnfinishedCount - visibleMatchesCount} não exibidas
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
};
