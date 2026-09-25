import React, { useState, useEffect } from 'react';
import { X, Shuffle, ArrowUp, ArrowDown, RotateCcw, Sparkles, AlertTriangle, Shield } from 'lucide-react';
import type { EventCategory, TournamentEntry } from '@modules/events/types';

export interface Super8DuplasDrawModalProps {
  isOpen: boolean;
  category: EventCategory;
  categoryEntries: TournamentEntry[];
  groupsPerBracket?: number;
  initialDrawType?: string;
  onClose: () => void;
  onConfirm: (orderedPlayers: TournamentEntry[]) => void;
}

export const Super8DuplasDrawModal: React.FC<Super8DuplasDrawModalProps> = ({
  isOpen,
  category,
  categoryEntries,
  groupsPerBracket = 2,
  initialDrawType,
  onClose,
  onConfirm,
}) => {
  const [players, setPlayers] = useState<TournamentEntry[]>([]);

  // Inicializa a lista de jogadores ao abrir o modal
  useEffect(() => {
    if (!isOpen) return;
    const initialList = [...categoryEntries];
    if (initialDrawType === 'Sistema') {
      // Se configurado como sorteio pelo sistema, já inicia embaralhado
      for (let i = initialList.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [initialList[i], initialList[j]] = [initialList[j], initialList[i]];
      }
    }
    setPlayers(initialList);
  }, [isOpen, categoryEntries, initialDrawType]);

  if (!isOpen) return null;

  const brackets = ['A', 'B'] as const;
  const playersPerGroup = 4;
  const totalRequired = brackets.length * groupsPerBracket * playersPerGroup;

  const handleShuffle = () => {
    const shuffled = [...players];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    setPlayers(shuffled);
  };

  const handleResetToRegistrationOrder = () => {
    setPlayers([...categoryEntries]);
  };

  const handleMove = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= players.length) return;
    const updated = [...players];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;
    setPlayers(updated);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl border border-slate-100 flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                Super 8 duplas
              </span>
              <h2 className="text-base font-black text-slate-900">Sorteio e Distribuição dos Grupos</h2>
            </div>
            <p className="text-xs text-slate-500 font-bold mt-1">
              Categoria: <span className="text-slate-800">{category.name}</span> ({players.length} atletas inscritos)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Info & Toolbar */}
        <div className="p-4 bg-amber-50/50 border-b border-amber-100/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="space-y-0.5">
            <p className="font-bold text-amber-900">
              Cada grupo tem 4 jogadores que disputam 3 jogos em duplas rotativas.
            </p>
            <p className="text-[11px] text-amber-700">
              🥇 1º e 2º de cada grupo → <span className="font-black">Chave Ouro</span> · 🥈 3º e 4º → <span className="font-black">Chave Prata</span>
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleShuffle}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50 font-black text-xs shadow-2xs transition-all active:scale-95"
            >
              <Shuffle size={14} />
              <span>Sortear aleatório</span>
            </button>
            <button
              type="button"
              onClick={handleResetToRegistrationOrder}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 font-black text-xs shadow-2xs transition-all active:scale-95"
              title="Restaurar a ordem de inscrição"
            >
              <RotateCcw size={14} />
              <span>Ordem inscrição</span>
            </button>
          </div>
        </div>

        {/* Players count warning if not enough */}
        {players.length < totalRequired && (
          <div className="px-5 py-2.5 bg-amber-50 border-b border-amber-100 flex items-center gap-2 text-amber-800 text-xs font-bold">
            <AlertTriangle size={15} className="text-amber-600 shrink-0" />
            <span>
              Atenção: A configuração atual prevê {totalRequired} jogadores ({brackets.length * groupsPerBracket} grupos de 4). Atualmente há {players.length} atletas inscritos.
            </span>
          </div>
        )}

        {/* Group Cards Grid */}
        <div className="p-5 overflow-y-auto space-y-6 flex-1">
          {brackets.map((bracket) => (
            <div key={bracket} className="space-y-3">
              <div className="flex items-center gap-2">
                <Shield size={16} className="text-blue-600" />
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">
                  Chave {bracket}
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Array.from({ length: groupsPerBracket }, (_, gIdx) => {
                  const gNumber = gIdx + 1;
                  const groupKey = `${bracket}${gNumber}`;
                  // Bracket A starts at 0, Bracket B starts after Bracket A groups
                  const bracketOffset = bracket === 'A' ? 0 : groupsPerBracket * playersPerGroup;
                  const groupStartIndex = bracketOffset + gIdx * playersPerGroup;
                  const groupPlayers = players.slice(groupStartIndex, groupStartIndex + playersPerGroup);

                  return (
                    <div
                      key={groupKey}
                      className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3.5 space-y-2.5 shadow-2xs"
                    >
                      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                        <span className="font-black text-xs text-slate-800 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-blue-500" />
                          Grupo {groupKey}
                        </span>
                        <span className="text-[10px] font-bold text-slate-500">
                          {groupPlayers.length} de {playersPerGroup} atletas
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        {Array.from({ length: playersPerGroup }, (_, slotIdx) => {
                          const player = groupPlayers[slotIdx];
                          const globalIndex = groupStartIndex + slotIdx;
                          const isGold = slotIdx < 2;

                          return (
                            <div
                              key={slotIdx}
                              className={`flex items-center justify-between gap-2 p-2 rounded-xl border transition-colors ${
                                player
                                  ? 'bg-white border-slate-200/80 shadow-2xs'
                                  : 'bg-dashed border-slate-200 text-slate-400 bg-slate-100/50'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span
                                  className={`text-[9px] font-black px-1.5 py-0.5 rounded-md shrink-0 ${
                                    isGold
                                      ? 'bg-amber-100 text-amber-800'
                                      : 'bg-slate-200 text-slate-700'
                                  }`}
                                  title={isGold ? '1º ou 2º colocado -> Chave Ouro' : '3º ou 4º colocado -> Chave Prata'}
                                >
                                  {isGold ? 'Ouro' : 'Prata'} #{slotIdx + 1}
                                </span>
                                {player ? (
                                  <div className="min-w-0 flex-1">
                                    <p className="text-xs font-black text-slate-800 truncate">
                                      {player.nickname || player.name}
                                    </p>
                                    {player.nickname && (
                                      <p className="text-[10px] text-slate-400 truncate">{player.name}</p>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-xs italic text-slate-400">Vaga livre</span>
                                )}
                              </div>

                              {player && (
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => handleMove(globalIndex, 'up')}
                                    disabled={globalIndex === 0}
                                    className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                                    title="Mover para cima"
                                  >
                                    <ArrowUp size={13} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleMove(globalIndex, 'down')}
                                    disabled={globalIndex >= players.length - 1}
                                    className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                                    title="Mover para baixo"
                                  >
                                    <ArrowDown size={13} />
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-white transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onConfirm(players)}
            disabled={players.length < 4}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow-md transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
          >
            <Sparkles size={16} />
            <span>Confirmar e gerar partidas</span>
          </button>
        </div>
      </div>
    </div>
  );
};
