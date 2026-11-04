import React, { useState, useEffect, useMemo } from 'react';
import { X, Trophy, Dices, RotateCcw, Check, AlertCircle } from 'lucide-react';
import type { PlayerStanding, TournamentEntry } from '../types';
import { formatRegistrationId } from '../types';

export interface TechnicalTieDrawModalProps {
  isOpen: boolean;
  categoryName?: string;
  standings: PlayerStanding[];
  currentWinnerKeys?: string[];
  onClose: () => void;
  onConfirm: (winnerKeys: string[]) => void;
}

interface TieGroup {
  id: string;
  rankRange: string;
  baseRank: number;
  standings: PlayerStanding[];
}

const getPlayerCandidateKey = (entry: TournamentEntry): string => {
  return (entry.pin || entry.email || String(entry.registrationId || '') || entry.name || '').trim();
};

export const TechnicalTieDrawModal: React.FC<TechnicalTieDrawModalProps> = ({
  isOpen,
  categoryName,
  standings,
  currentWinnerKeys = [],
  onClose,
  onConfirm,
}) => {
  const [selectedWinners, setSelectedWinners] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) {
      setSelectedWinners(currentWinnerKeys || []);
    }
  }, [isOpen, currentWinnerKeys]);

  // Filtra atletas que estão em empate técnico ou já envolvidos em desempate por sorteio
  const tiedCandidates = useMemo(() => {
    return standings.filter(
      (st) => st.isTechnicalTie || Boolean(st.tieBreakNote && st.tieBreakNote.toLowerCase().includes('sorteio'))
    );
  }, [standings]);

  const rawCandidates = tiedCandidates.length >= 2 ? tiedCandidates : standings;

  // Deduplica rigorosamente os candidatos para evitar duplicações e keys repetidas
  const candidates = useMemo(() => {
    const seen = new Set<string>();
    return rawCandidates.filter((st) => {
      const key = (
        st.entry.pin ||
        st.entry.email ||
        (st.entry.registrationId ? `reg_${st.entry.registrationId}` : '') ||
        st.entry.name ||
        ''
      )
        .toLowerCase()
        .trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [rawCandidates]);

  // Agrupa os atletas por empate real (mesmas estatísticas de jogo)
  const tieGroups: TieGroup[] = useMemo(() => {
    const groupMap = new Map<string, PlayerStanding[]>();
    candidates.forEach((st) => {
      const statKey = `${st.wins}_${st.gamesDiff}_${st.gamesWon}_${st.gamesLost}_${st.played}`;
      const list = groupMap.get(statKey) || [];
      list.push(st);
      groupMap.set(statKey, list);
    });

    const groups: TieGroup[] = [];
    groupMap.forEach((groupStandings, statKey) => {
      const baseRank = Math.min(...groupStandings.map((s) => s.rank || 1));
      const count = groupStandings.length;
      let rankRange = '';
      if (count === 2) {
        rankRange = `${baseRank}º e ${baseRank + 1}º lugar`;
      } else if (count > 2) {
        rankRange = `${baseRank}º ao ${baseRank + count - 1}º lugar`;
      } else {
        rankRange = `${baseRank}º lugar`;
      }

      groups.push({
        id: statKey,
        rankRange,
        baseRank,
        standings: groupStandings,
      });
    });

    return groups.sort((a, b) => a.baseRank - b.baseRank);
  }, [candidates]);

  if (!isOpen) return null;

  const isSelected = (entry: TournamentEntry): boolean => {
    const key = getPlayerCandidateKey(entry).toLowerCase();
    const pin = (entry.pin || '').toLowerCase();
    const email = (entry.email || '').toLowerCase();
    const regId = String(entry.registrationId || '').toLowerCase();

    return selectedWinners.some((w) => {
      const target = (w || '').toLowerCase().trim();
      return target === key || target === pin || target === email || target === regId;
    });
  };

  const getWinnerOrderInGroup = (entry: TournamentEntry, groupStandings: PlayerStanding[]): number => {
    const groupKeys = groupStandings.map((s) => getPlayerCandidateKey(s.entry).toLowerCase());
    const groupSelected = selectedWinners.filter((w) => groupKeys.includes(w.toLowerCase()));

    const key = getPlayerCandidateKey(entry).toLowerCase();
    const pin = (entry.pin || '').toLowerCase();
    const email = (entry.email || '').toLowerCase();
    const regId = String(entry.registrationId || '').toLowerCase();

    for (let i = 0; i < groupSelected.length; i++) {
      const target = groupSelected[i].toLowerCase().trim();
      if (target === key || target === pin || target === email || target === regId) {
        return i + 1;
      }
    }
    return 0;
  };

  const handleToggleCandidateInGroup = (entry: TournamentEntry, groupStandings: PlayerStanding[]) => {
    const primaryKey = getPlayerCandidateKey(entry);
    if (!primaryKey) return;

    const groupKeys = new Set(
      groupStandings.map((s) => getPlayerCandidateKey(s.entry).toLowerCase())
    );

    const isAlreadySelected = isSelected(entry);

    if (groupStandings.length === 2) {
      setSelectedWinners((prev) => {
        const withoutGroup = prev.filter((k) => !groupKeys.has(k.toLowerCase()));
        if (isAlreadySelected) {
          return withoutGroup;
        }
        return [...withoutGroup, primaryKey];
      });
    } else {
      setSelectedWinners((prev) => {
        if (isAlreadySelected) {
          return prev.filter(
            (k) =>
              k.toLowerCase() !== primaryKey.toLowerCase() &&
              k.toLowerCase() !== (entry.pin || '').toLowerCase() &&
              k.toLowerCase() !== (entry.email || '').toLowerCase()
          );
        }
        return [...prev, primaryKey];
      });
    }
  };

  const handleRandomDrawGroup = (groupStandings: PlayerStanding[]) => {
    const shuffled = [...groupStandings];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const groupKeys = new Set(
      groupStandings.map((s) => getPlayerCandidateKey(s.entry).toLowerCase())
    );

    const newGroupWinners = shuffled.map((st) => getPlayerCandidateKey(st.entry));

    setSelectedWinners((prev) => {
      const withoutGroup = prev.filter((k) => !groupKeys.has(k.toLowerCase()));
      return [...withoutGroup, ...newGroupWinners];
    });
  };

  const handleClearGroup = (groupStandings: PlayerStanding[]) => {
    const groupKeys = new Set(
      groupStandings.map((s) => getPlayerCandidateKey(s.entry).toLowerCase())
    );
    setSelectedWinners((prev) => prev.filter((k) => !groupKeys.has(k.toLowerCase())));
  };

  const handleRandomDrawAll = () => {
    tieGroups.forEach((g) => {
      handleRandomDrawGroup(g.standings);
    });
  };

  const handleClearAll = () => {
    setSelectedWinners([]);
  };

  const handleSave = () => {
    onConfirm(selectedWinners);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-xl w-full shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-amber-100/80 text-amber-700 rounded-2xl">
              <Dices size={20} className="animate-spin-slow" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-800">
                Desempate técnico por sorteio
              </h3>
              <p className="text-xs text-slate-400 font-bold">
                {categoryName ? `Categoria: ${categoryName}` : 'Apontar ganhador do sorteio manual'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-5">
          <div className="p-3.5 bg-amber-50 border border-amber-200/80 rounded-2xl text-xs text-amber-900 leading-relaxed font-medium flex items-start gap-2.5">
            <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Como funciona:</span> O sorteio dos inscritos em empate técnico ocorre manualmente. Clique nos atletas na ordem em que foram sorteados para cada colocação.
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-black text-slate-700">
              {tieGroups.length > 1
                ? `${tieGroups.length} empates separados encontrados`
                : `Atletas em empate (${candidates.length})`}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRandomDrawAll}
                className="text-xs font-bold text-amber-600 hover:text-amber-700 hover:bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200 flex items-center gap-1 transition-colors whitespace-nowrap"
                title="Sorteia aleatoriamente todas as disputas no app"
              >
                <Dices size={13} />
                <span>Sortear todos</span>
              </button>
              {selectedWinners.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="text-xs font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200 flex items-center gap-1 transition-colors whitespace-nowrap"
                  title="Limpar todos os sorteios e manter empates técnicos"
                >
                  <RotateCcw size={12} />
                  <span>Limpar todos</span>
                </button>
              )}
            </div>
          </div>

          {/* Lista de grupos de empate */}
          <div className="space-y-6">
            {tieGroups.map((group) => {
              const sample = group.standings[0];
              const groupKeys = group.standings.map((s) => getPlayerCandidateKey(s.entry).toLowerCase());
              const hasAnySelectedInGroup = selectedWinners.some((w) => groupKeys.includes(w.toLowerCase()));

              return (
                <div
                  key={group.id}
                  className="bg-slate-50/70 border border-slate-200 rounded-2xl p-4 space-y-3"
                >
                  {/* Cabeçalho do Grupo */}
                  <div className="flex flex-col gap-2 border-b border-slate-200/80 pb-2.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-slate-800">
                          Disputa do {group.rankRange}
                        </span>
                        <span className="text-[10px] font-bold text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded-md">
                          {group.standings.length} atletas
                        </span>
                      </div>
                      <p className="text-[11px] font-bold text-slate-500 mt-0.5">
                        {sample.wins} vitórias • Saldo: {sample.gamesDiff > 0 ? `+${sample.gamesDiff}` : sample.gamesDiff} ({sample.gamesWon}-{sample.gamesLost})
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleRandomDrawGroup(group.standings)}
                        className="text-[11px] font-bold text-amber-700 hover:bg-amber-100/60 px-2 py-1 rounded-lg border border-amber-200 flex items-center gap-1 transition-colors whitespace-nowrap"
                        title="Sortear apenas esta disputa"
                      >
                        <Dices size={12} />
                        <span>Sortear</span>
                      </button>
                      {hasAnySelectedInGroup && (
                        <button
                          type="button"
                          onClick={() => handleClearGroup(group.standings)}
                          className="text-[11px] font-bold text-slate-500 hover:bg-slate-200/60 px-2 py-1 rounded-lg border border-slate-200 transition-colors whitespace-nowrap"
                          title="Limpar seleção deste grupo"
                        >
                          Limpar
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Cards dos atletas deste grupo */}
                  <div className="space-y-2">
                    {group.standings.map((st, idx) => {
                      const entry = st.entry;
                      const selected = isSelected(entry);
                      const orderInGroup = getWinnerOrderInGroup(entry, group.standings);
                      const regId = formatRegistrationId(entry.registrationId);
                      const candidateKey = getPlayerCandidateKey(entry) || `cand_${group.id}_${idx}`;

                      return (
                        <div
                          key={`${candidateKey}_${idx}`}
                          onClick={() => handleToggleCandidateInGroup(entry, group.standings)}
                          className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                            selected
                              ? 'border-emerald-500 bg-emerald-50/70 shadow-xs ring-2 ring-emerald-500/20'
                              : 'border-slate-200 hover:border-slate-300 hover:bg-white bg-white/90'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs shrink-0 ${
                                selected
                                  ? 'bg-emerald-500 text-white shadow-xs'
                                  : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {selected ? (
                                orderInGroup === 1 ? (
                                  <Trophy size={15} />
                                ) : (
                                  `#${orderInGroup}`
                                )
                              ) : (
                                regId || st.rank || '—'
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-black text-slate-800 truncate">
                                  {entry.name || entry.nickname || 'Atleta sem nome'}
                                </p>
                                {regId && (
                                  <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                                    #{regId}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="shrink-0 pl-2">
                            {selected ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-black text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-lg">
                                <Check size={13} />
                                {orderInGroup === 1
                                  ? 'Ganhador (1º sorteado)'
                                  : `${orderInGroup}º sorteado`}
                              </span>
                            ) : (
                              <span className="text-[11px] font-bold text-slate-400 border border-slate-200 px-2 py-1 rounded-lg">
                                Selecionar
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-end gap-2.5 bg-slate-50/50 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2.5 text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer"
          >
            <Check size={15} />
            <span>Confirmar e atualizar classificação</span>
          </button>
        </div>
      </div>
    </div>
  );
};
