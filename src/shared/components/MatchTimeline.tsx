import React, { useEffect, useMemo, useRef } from 'react';
import { Zap, X as CloseIcon } from 'lucide-react';
import type { PointEvent, PointType } from '../../types';

type MatchTimelineElement =
  | { type: 'set-marker'; setNumber: number }
  | { type: 'score-start' }
  | { type: 'point'; winner: 1 | 2; pointType: PointType }
  | { type: 'game-score'; winner: 1 | 2; g1: number; g2: number }
  | { type: 'set-score'; winner: 1 | 2; s1: number; s2: number };

const BORDER_COLORS: Record<string, string> = {
  amarelo: 'border-yellow-500',
  azul: 'border-blue-600',
  laranja: 'border-orange-500',
  marrom: 'border-amber-800',
  lilas: 'border-violet-500',
  verde: 'border-green-600',
  vermelho: 'border-red-600',
  roxo: 'border-purple-600',
};

const TEXT_COLORS: Record<string, string> = {
  azul: 'text-blue-600',
  vermelho: 'text-red-600',
  verde: 'text-green-600',
  amarelo: 'text-yellow-600',
  laranja: 'text-orange-600',
  lilas: 'text-violet-600',
  marrom: 'text-amber-800',
  roxo: 'text-purple-600',
};

interface MatchTimelineProps {
  history: PointEvent[];
  p1Sets: number[];
  p2Sets: number[];
  isMatchOver?: boolean;
  p1Color?: string;
  p2Color?: string;
}

export const MatchTimeline: React.FC<MatchTimelineProps> = ({
  history,
  p1Sets,
  p2Sets,
  isMatchOver,
  p1Color,
  p2Color,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [history]);

  const timelineElements = useMemo(() => {
    const elements: MatchTimelineElement[] = [];
    if (!history) return elements;

    elements.push({ type: 'set-marker', setNumber: 1 });
    elements.push({ type: 'score-start' });

    const setsP1 = p1Sets || [];
    const setsP2 = p2Sets || [];
    let setCounter = 0;

    history.forEach((event) => {
      elements.push({ type: 'point', winner: event.winner, pointType: event.type });
      if (!event.resultingScore) return;

      const [g1Str, g2Str] = event.resultingScore.split('-');
      const g1 = Number(g1Str);
      const g2 = Number(g2Str);
      elements.push({ type: 'game-score', winner: event.winner, g1, g2 });

      if (setCounter >= setsP1.length) return;
      if (g1 !== setsP1[setCounter] || g2 !== setsP2[setCounter]) return;

      setCounter++;
      elements.push({
        type: 'set-score',
        winner: event.winner,
        s1: setsP1.slice(0, setCounter).filter((s, i) => s > (setsP2[i] ?? 0)).length,
        s2: setsP2.slice(0, setCounter).filter((s, i) => s > (setsP1[i] ?? 0)).length,
      });

      if (!isMatchOver) {
        elements.push({ type: 'set-marker', setNumber: setCounter + 1 });
        elements.push({ type: 'score-start' });
      }
    });

    return elements;
  }, [history, p1Sets, p2Sets, isMatchOver]);

  return (
    <div className="bg-white rounded-5xl p-6 shadow-xl shadow-slate-200/50 border border-slate-100 w-full overflow-hidden">
      <div ref={scrollRef} className="flex-1 overflow-x-auto py-2 timeline-scrollbar scroll-smooth no-scrollbar">
        <div className="flex items-start gap-1 min-w-max px-2 relative h-20 pt-4">
          <div className="absolute top-1/2 left-0 right-0 h-[1.5px] bg-gray-50 -translate-y-1/2" />
          {timelineElements.map((el, idx) => {
            if (el.type === 'set-marker') {
              return (
                <div key={idx} className="relative flex flex-col items-center justify-center px-2 shrink-0 z-20">
                  <div className="bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                    <span className="text-[9px] font-black text-slate-600 whitespace-nowrap">Set {el.setNumber}</span>
                  </div>
                </div>
              );
            }

            if (el.type === 'score-start') {
              return (
                <div key={idx} className="relative flex flex-col items-center justify-start shrink-0 mx-2 z-10">
                  <div className={`flex flex-col items-center justify-center min-w-[24px] h-[38px] rounded-lg border bg-opacity-30 shadow-xs ${BORDER_COLORS[p1Color || 'azul']} ${p1Color === 'amarelo' ? 'bg-yellow-50' : p1Color === 'verde' ? 'bg-green-50' : 'bg-blue-50'}`}>
                    <span className={`text-[10px] font-black ${TEXT_COLORS[p1Color || 'azul']}`}>0</span>
                    <span className="text-[10px] font-black text-gray-400">0</span>
                  </div>
                </div>
              );
            }

            if (el.type === 'point') {
              return (
                <div key={idx} className="relative flex flex-col items-center justify-center w-6 shrink-0 z-10 pt-2.5">
                  <div className={`transition-transform ${el.winner === 1 ? '-translate-y-4' : 'translate-y-4'}`}>
                    {el.pointType === 'rally' && <div className="w-3 h-3 rounded-full bg-[#d9f99d] border border-green-300 shadow-sm" />}
                    {el.pointType === 'ace' && <Zap size={14} className="text-amber-400" fill="currentColor" />}
                    {el.pointType === 'fault' && <CloseIcon size={16} className="text-red-400 stroke-[4]" />}
                  </div>
                </div>
              );
            }

            if (el.type === 'game-score') {
              return (
                <div key={idx} className="relative flex flex-col items-center justify-start shrink-0 mx-1 z-20">
                  <div className={`flex flex-col items-center justify-center min-w-[22px] h-[36px] rounded-lg border shadow-sm ${el.winner === 1 ? `${p1Color === 'amarelo' ? 'bg-yellow-50' : 'bg-blue-50'} ${BORDER_COLORS[p1Color || 'azul']}` : `${p2Color === 'vermelho' ? 'bg-red-50' : 'bg-slate-50'} ${BORDER_COLORS[p2Color || 'vermelho']}`}`}>
                    <span className={`text-[10px] font-black leading-none mb-0.5 ${el.winner === 1 ? TEXT_COLORS[p1Color || 'azul'] : 'text-gray-400'}`}>{el.g1}</span>
                    <span className={`text-[10px] font-black leading-none mt-0.5 ${el.winner === 2 ? TEXT_COLORS[p2Color || 'vermelho'] : 'text-gray-400'}`}>{el.g2}</span>
                  </div>
                </div>
              );
            }

            if (el.type === 'set-score') {
              return (
                <div key={idx} className="relative flex flex-col items-center justify-start shrink-0 ml-1 mr-2 z-20 animate-in zoom-in duration-300">
                  <div className={`flex flex-col items-center justify-center min-w-[26px] h-[40px] rounded-lg border shadow-md ${el.winner === 1 ? `${p1Color === 'amarelo' ? 'bg-yellow-100' : 'bg-blue-100'} ${BORDER_COLORS[p1Color || 'azul']}` : `${p2Color === 'vermelho' ? 'bg-red-100' : 'bg-slate-100'} ${BORDER_COLORS[p2Color || 'vermelho']}`}`}>
                    <span className={`text-[11px] font-black leading-none mb-0.5 ${el.winner === 1 ? TEXT_COLORS[p1Color || 'azul'] : 'text-gray-600'}`}>{el.s1}</span>
                    <span className={`text-[11px] font-black leading-none mt-0.5 ${el.winner === 2 ? TEXT_COLORS[p2Color || 'vermelho'] : 'text-gray-600'}`}>{el.s2}</span>
                  </div>
                  <div className="absolute -bottom-4 text-[7px] font-black text-gray-400 tracking-tighter">Set</div>
                </div>
              );
            }

            return null;
          })}
        </div>
      </div>
    </div>
  );
};
