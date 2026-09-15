import React from 'react';
import { Layers, Clock } from 'lucide-react';

export interface QueueHeaderStatsProps {
  visibleMatchesCount: number;
  totalPendingCount: number;
  freeCourtsCount: number;
  busyCourtsCount: number;
  interdictedCourtsCount: number;
  totalCourtsCount: number;
  averageMatchDurationMinutes: number;
  isDurationEstimated: boolean;
  finishedMatchesCountWithDuration: number;
  nextCourtFreeWaitMinutes?: number;
  nextCourtFreeTimeStr?: string;
}

export const QueueHeaderStats: React.FC<QueueHeaderStatsProps> = ({
  visibleMatchesCount,
  totalPendingCount,
  freeCourtsCount,
  busyCourtsCount,
  interdictedCourtsCount,
  averageMatchDurationMinutes,
  isDurationEstimated,
  finishedMatchesCountWithDuration,
  nextCourtFreeWaitMinutes,
  nextCourtFreeTimeStr,
}) => {
  return (
    <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="flex items-start gap-2.5 min-w-0">
        <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-sm shrink-0 mt-0.5">
          <Layers size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-black text-slate-800 tracking-tight whitespace-nowrap truncate">
            Gerenciar fila
          </h2>
          <p className="text-xs text-slate-400 font-bold mt-0.5 whitespace-nowrap truncate">
            Controle de quadras ao vivo e fila única dinâmica de partidas.
          </p>

          {/* Volumetria da fila */}
          <p className="text-xs font-bold text-slate-500 mt-1.5">
            Exibindo{' '}
            <span className="font-black text-slate-700">{visibleMatchesCount}</span>
            {' '}de{' '}
            <span className="font-black text-slate-700">{totalPendingCount}</span>
            {' '}partidas pendentes na fila
            {totalPendingCount > visibleMatchesCount && (
              <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">
                +{totalPendingCount - visibleMatchesCount} não exibidas
              </span>
            )}
          </p>

          {/* Indicativos de status das quadras */}
          <div className="flex items-center gap-2 flex-wrap mt-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              {freeCourtsCount} {freeCourtsCount === 1 ? 'Livre' : 'Livres'}
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              {busyCourtsCount} {busyCourtsCount === 1 ? 'Ocupada' : 'Ocupadas'}
            </span>
            {interdictedCourtsCount > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black bg-red-50 text-red-700 border border-red-200 whitespace-nowrap">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                {interdictedCourtsCount} {interdictedCourtsCount === 1 ? 'Interditada' : 'Interditadas'}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 text-[10px] font-black px-2.5 py-1 rounded-xl bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap">
              <Clock size={11} className="text-slate-500" />
              Duração média: {averageMatchDurationMinutes} min {isDurationEstimated ? '(estimada)' : `(${finishedMatchesCountWithDuration} jogos)`}
            </span>
            {freeCourtsCount === 0 && nextCourtFreeWaitMinutes !== undefined && (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-black px-2.5 py-1 rounded-xl bg-sky-50 text-sky-800 border border-sky-200 whitespace-nowrap">
                <Clock size={11} className="text-sky-600" />
                Próxima liberação: ~{nextCourtFreeWaitMinutes} min (~{nextCourtFreeTimeStr})
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
