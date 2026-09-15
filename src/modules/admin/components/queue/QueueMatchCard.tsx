import React from 'react';
import {
  Play,
  Snowflake,
  AlertTriangle,
  AlertCircle,
  Clock,
  Zap,
  ChevronDown,
} from 'lucide-react';
import type { QueueMatchItem } from '@modules/events/services/queueManager';

export interface QueueMatchCardProps {
  item: QueueMatchItem;
  queueIndex: number;
  freeCourts: string[];
  isReadOnly: boolean;
  isSelectingCourt: boolean;
  onToggleFreezeMatch: (matchId: string) => void;
  onToggleSelectCourt: (matchId: string) => void;
  onAssignMatchToCourt: (matchId: string, courtName: string) => void;
}

export const QueueMatchCard: React.FC<QueueMatchCardProps> = ({
  item,
  queueIndex,
  freeCourts,
  isReadOnly,
  isSelectingCourt,
  onToggleFreezeMatch,
  onToggleSelectCourt,
  onAssignMatchToCourt,
}) => {
  const { match, category, queueStatus, conflictReason, pair1Name, pair2Name, phaseLabel } = item;

  const isGreen = queueStatus === 'green';
  const isYellow = queueStatus === 'yellow';
  const isRed = queueStatus === 'red';

  return (
    <div
      className={`p-4 rounded-3xl border-2 transition-all shadow-xs space-y-3 overflow-hidden ${
        isGreen
          ? 'bg-emerald-50/40 border-emerald-300'
          : isYellow
          ? 'bg-amber-50/30 border-amber-300'
          : isRed
          ? 'bg-red-50/30 border-red-300'
          : 'bg-white border-slate-200'
      }`}
    >
      {/* Topo do Card */}
      <div className="flex items-center justify-between gap-3 w-full flex-wrap">
        <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
          {/* Posição na Fila */}
          <div
            className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs shrink-0 whitespace-nowrap ${
              isGreen
                ? 'bg-emerald-500 text-white shadow-xs'
                : isYellow
                ? 'bg-amber-500 text-white shadow-xs'
                : isRed
                ? 'bg-red-500 text-white shadow-xs'
                : 'bg-slate-200 text-slate-700'
            }`}
          >
            #{queueIndex + 1}
          </div>

          {/* Código e Fase */}
          <span className="text-xs font-black text-slate-800 whitespace-nowrap shrink-0">
            [{match.matchCode || String(match.matchNumber || queueIndex + 1).padStart(2, '0')}]
            {phaseLabel ? ` [${phaseLabel}]` : ''}
          </span>

          {/* Categoria e Prioridade */}
          {category && (
            <span className="text-[10px] font-black text-slate-600 bg-white/90 border border-slate-200 px-2 py-0.5 rounded-lg whitespace-nowrap shrink-0">
              {category.name} (Prio {category.priority ?? 1})
            </span>
          )}

          {/* Status Badge */}
          {isGreen && (
            <span className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 whitespace-nowrap shrink-0">
              Pronta para Quadra
            </span>
          )}
          {isYellow && (
            <span className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-300 whitespace-nowrap shrink-0">
              Aguardando Chamada
            </span>
          )}
          {isRed && (
            <span className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-red-100 text-red-800 border border-red-300 flex items-center gap-1 whitespace-nowrap shrink-0">
              <AlertTriangle size={10} />
              {conflictReason
                ? conflictReason.includes('fase anterior')
                  ? 'Aguardando Fase'
                  : 'Conflito de Jogador'
                : 'Congelada'}
            </span>
          )}

          {/* Previsão de Chamada */}
          {!isRed && (
            item.estimatedWaitMinutes === 0 ? (
              <span className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1 whitespace-nowrap shrink-0">
                <Zap size={10} className="fill-emerald-600 text-emerald-600" />
                Chamada Imediata
              </span>
            ) : item.estimatedWaitMinutes !== undefined ? (
              <span className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-sky-100 text-sky-800 border border-sky-300 flex items-center gap-1 whitespace-nowrap shrink-0">
                <Clock size={10} />
                Previsão: em ~{item.estimatedWaitMinutes} min (~{item.estimatedCallTimeStr})
              </span>
            ) : null
          )}
        </div>

        {/* Botões de Ação */}
        <div className="flex flex-col items-stretch gap-1.5 shrink-0 min-w-[100px]">
          <button
            type="button"
            disabled={isReadOnly}
            onClick={() => onToggleFreezeMatch(match.id)}
            className={`px-3 py-1.5 rounded-2xl text-xs font-black border transition-all active:scale-95 flex items-center justify-center gap-1.5 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none ${
              match.frozen
                ? 'bg-red-500 text-white border-red-600 shadow-xs'
                : 'bg-white text-slate-600 border-slate-200 hover:border-red-300 hover:text-red-600'
            }`}
            title={match.frozen ? 'Descongelar esta partida' : 'Congelar esta partida'}
          >
            <Snowflake size={13} />
            <span>{match.frozen ? 'Congelado' : 'Congelar'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (isReadOnly || isRed) return;
              if (freeCourts.length === 0) {
                window.alert('Não há quadras livres disponíveis no momento.');
                return;
              }
              if (freeCourts.length === 1) {
                onAssignMatchToCourt(match.id, freeCourts[0]);
              } else {
                onToggleSelectCourt(match.id);
              }
            }}
            disabled={isReadOnly || freeCourts.length === 0 || isRed}
            className={`px-3.5 py-1.5 rounded-2xl text-xs font-black transition-all active:scale-95 flex items-center justify-center gap-1.5 shadow-xs whitespace-nowrap ${
              isSelectingCourt
                ? 'bg-slate-200 text-slate-700 border border-slate-300'
                : (isReadOnly || isRed)
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200 opacity-60'
                : freeCourts.length > 0
                ? isGreen
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
            }`}
            title={
              isRed
                ? (conflictReason || 'Partida bloqueada ou congelada')
                : freeCourts.length > 0
                ? 'Vincular esta partida a uma quadra livre'
                : 'Nenhuma quadra livre disponível'
            }
          >
            <Play size={12} className="fill-current" />
            <span>Quadra</span>
            {!isRed && freeCourts.length > 1 && (
              <ChevronDown
                size={12}
                className={isSelectingCourt ? 'rotate-180 transition-transform' : 'transition-transform'}
              />
            )}
          </button>
        </div>
      </div>

      {/* Dropdown de seleção de quadra */}
      {isSelectingCourt && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-md overflow-hidden">
          {freeCourts.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onAssignMatchToCourt(match.id, c)}
              className="w-full text-left px-4 py-2.5 text-xs font-black text-slate-800 hover:bg-emerald-50 hover:text-emerald-800 transition-colors border-b border-slate-100 last:border-b-0 flex items-center gap-2"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              {c}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onToggleSelectCourt(match.id)}
            className="w-full text-center px-4 py-2 text-xs font-bold text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Cancelar
          </button>
        </div>
      )}

      {/* Nomes dos Times */}
      <div className="text-xs font-black text-slate-800 space-y-1 w-full">
        <p className="whitespace-nowrap truncate w-full">
          {pair1Name}{' '}
          {match.pair1?.teamCode && (
            <span className="text-[10px] text-slate-400 font-bold">
              [{match.pair1.teamCode}]
            </span>
          )}
        </p>
        <p className="whitespace-nowrap truncate w-full">
          {pair2Name}{' '}
          {match.pair2?.teamCode && (
            <span className="text-[10px] text-slate-400 font-bold">
              [{match.pair2.teamCode}]
            </span>
          )}
        </p>
      </div>

      {/* Alerta de Conflito */}
      {conflictReason && (
        <div className="pt-1 border-t border-red-200/60">
          <p className="text-[11px] text-red-700 font-black flex items-center gap-1.5 whitespace-nowrap truncate w-full">
            <AlertCircle size={13} className="shrink-0 text-red-600" />
            <span>{conflictReason}</span>
          </p>
        </div>
      )}
    </div>
  );
};
