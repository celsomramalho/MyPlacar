import React, { useState, useMemo } from 'react';
import { Sparkles, FileText, Trash2, Upload, Clock, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import type { EventCategory, TournamentEvent, TournamentMatch, TournamentPair } from '@modules/events/types';
import { MatchCard } from '@modules/events/components/matches/MatchCard';
import { RankingMatchImportModal } from './RankingMatchImportModal';
import { ParticipantSearchInput } from '@modules/events/components/ParticipantSearchInput';
import { filterMatchesBySearch, sortMatchesByDateDesc } from '@modules/events/domain/brackets';
import { resolveMatchRules } from '@modules/events/domain/rules/eventMatchRules';

export interface CategoryMatchesTabProps {
  event: TournamentEvent;
  category: EventCategory;
  categoryMatches: TournamentMatch[];
  pairsById: Record<string, TournamentPair>;
  isRanking: boolean;
  isSuper8: boolean;
  isSuper8Duplas?: boolean;
  isReadOnly: boolean;
  totalSets: number;
  allCategoryFinished: boolean;
  queuePosByMatchId?: Map<string, number>;
  onScoreChange: (matchId: string, setIndex: number, player: 'p1' | 'p2', rawVal: string) => void;
  onUndoScore?: (matchId: string, setIndex: number, p1Val: string, p2Val: string) => void;
  onMatchDateChange: (matchId: string, matchDate: string) => void;
  onFinishMatch: (matchId: string) => void;
  onReopenMatch: (matchId: string) => void;
  onDeleteMatch: (matchId: string) => void;
  onGenerateMatches: () => void;
  onGenerateBlankPdf: () => void;
  onDeleteAllCategoryMatches: () => void;
  onImportMatches: (pairs: TournamentPair[], matches: TournamentMatch[]) => Promise<void>;
}

export const CategoryMatchesTab: React.FC<CategoryMatchesTabProps> = ({
  event,
  category,
  categoryMatches,
  pairsById,
  isRanking,
  isSuper8,
  isSuper8Duplas = false,
  isReadOnly,
  totalSets,
  allCategoryFinished,
  queuePosByMatchId,
  onScoreChange,
  onUndoScore,
  onMatchDateChange,
  onFinishMatch,
  onReopenMatch,
  onDeleteMatch,
  onGenerateMatches,
  onGenerateBlankPdf,
  onDeleteAllCategoryMatches,
  onImportMatches,
}) => {
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'status' | 'phase'>('status');
  const [isFinishedOpen, setIsFinishedOpen] = useState(true);

  const rawFilteredMatches = useMemo(
    () => filterMatchesBySearch(categoryMatches, searchQuery, pairsById),
    [categoryMatches, searchQuery, pairsById]
  );

  const liveMatches = useMemo(() => {
    return rawFilteredMatches
      .filter((m) => m.status === 'live')
      .sort((a, b) => {
        const courtA = a.court || '';
        const courtB = b.court || '';
        if (courtA && courtB) return courtA.localeCompare(courtB, undefined, { numeric: true });
        if (courtA) return -1;
        if (courtB) return 1;
        return (a.matchNumber || 0) - (b.matchNumber || 0);
      });
  }, [rawFilteredMatches]);

  const waitingMatches = useMemo(() => {
    return rawFilteredMatches
      .filter((m) => m.status === 'waiting')
      .sort((a, b) => {
        const posA = queuePosByMatchId?.get(a.id) ?? 9999;
        const posB = queuePosByMatchId?.get(b.id) ?? 9999;
        if (posA !== posB) return posA - posB;
        return (a.matchNumber || 0) - (b.matchNumber || 0);
      });
  }, [rawFilteredMatches, queuePosByMatchId]);

  const finishedMatches = useMemo(() => {
    return rawFilteredMatches
      .filter((m) => m.status === 'finished')
      .sort((a, b) => {
        const timeA = a.finishedAt
          ? new Date(a.finishedAt).getTime()
          : a.startedAt
          ? new Date(a.startedAt).getTime()
          : 0;
        const timeB = b.finishedAt
          ? new Date(b.finishedAt).getTime()
          : b.startedAt
          ? new Date(b.startedAt).getTime()
          : 0;
        if (timeA !== timeB && timeA > 0 && timeB > 0) {
          return timeB - timeA; // Mais recente primeiro
        }
        const dateA = a.matchDate || '';
        const dateB = b.matchDate || '';
        if (dateA !== dateB) return dateB.localeCompare(dateA);
        return (b.matchNumber || 0) - (a.matchNumber || 0);
      });
  }, [rawFilteredMatches]);

  const sortedCategoryMatches = useMemo(
    () => sortMatchesByDateDesc(categoryMatches),
    [categoryMatches]
  );

  const b1Matches = useMemo(
    () => sortedCategoryMatches.filter((m) => m.phase === 'chave1'),
    [sortedCategoryMatches]
  );
  const b2Matches = useMemo(
    () => sortedCategoryMatches.filter((m) => m.phase === 'chave2'),
    [sortedCategoryMatches]
  );
  const semiMatches = useMemo(
    () => sortedCategoryMatches.filter((m) => m.phase === 'semifinal'),
    [sortedCategoryMatches]
  );
  const finalMatches = useMemo(
    () => sortedCategoryMatches.filter((m) => m.phase === 'final' || m.phase === '3lugar'),
    [sortedCategoryMatches]
  );
  const otherMatches = useMemo(
    () =>
      sortedCategoryMatches.filter(
        (m) =>
          m.phase !== 'chave1' &&
          m.phase !== 'chave2' &&
          m.phase !== 'semifinal' &&
          m.phase !== 'final' &&
          m.phase !== '3lugar' &&
          !m.phase?.startsWith('rodada') &&
          !m.phase?.startsWith('super8d_')
      ),
    [sortedCategoryMatches]
  );

  const filteredMatches = useMemo(
    () => sortMatchesByDateDesc(rawFilteredMatches),
    [rawFilteredMatches]
  );

  const renderItem = (match: TournamentMatch, idx?: number) => {
    const sportId = event.sportId || event.config?.sportType;
    const rules = resolveMatchRules(
      event.sportRules,
      match.phase,
      (event.setsCount || event.config?.sets || totalSets) as 1 | 3 | 5,
      Number(category.gamesPerSet || event.gamesPerSet || event.config?.gamesPerSet || ((isSuper8 || isSuper8Duplas) ? 4 : 6)),
      sportId
    );
    const isTotalGamesSet = sportId === 'beach-tennis' && rules.gamesPerSet === 7;
    return (
    <MatchCard
      key={match.id}
      match={match}
      colorIndex={idx}
      pairsById={pairsById}
      variant="detailed"
      isRanking={isRanking}
      totalSets={rules.setsCount}
      gamesPerSet={rules.gamesPerSet}
      isTotalGamesSet={isTotalGamesSet}
      tieBreak={rules.tieBreak}
      tieBreakAt={rules.tieBreakAt}
      queuePosition={queuePosByMatchId?.get(match.id) ?? 0}
      canSubmitScore={!isReadOnly}
      canManage={!isReadOnly}
      isReadOnly={isReadOnly}
      allCategoryFinished={allCategoryFinished}
      onScoreChange={onScoreChange}
      onUndoScore={onUndoScore}
      onMatchDateChange={onMatchDateChange}
      onFinishMatch={onFinishMatch}
      onReopenMatch={onReopenMatch}
      onDeleteMatch={onDeleteMatch}
    />
    );
  };

  const renderStatusBlocks = () => {
    const isSearching = searchQuery.trim().length > 0;
    return (
      <div className="p-4 space-y-6">
        {/* 1. Ao vivo */}
        {(liveMatches.length > 0 || !isSearching) && (
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <span className="flex h-2.5 w-2.5 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
                </span>
                <h4 className="text-xs font-black tracking-wide text-rose-700">Ao vivo</h4>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-rose-100 text-rose-700 border border-rose-200">
                  {liveMatches.length}
                </span>
              </div>
            </div>

            {liveMatches.length === 0 ? (
              <div className="text-xs text-slate-400 font-bold bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-4 text-center">
                Nenhuma partida em andamento no momento.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2.5">
                {liveMatches.map((m, idx) => renderItem(m, idx))}
              </div>
            )}
          </div>
        )}

        {/* 2. Aguardando */}
        {(waitingMatches.length > 0 || !isSearching) && (
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <Clock size={14} className="text-amber-500" />
                <h4 className="text-xs font-black tracking-wide text-amber-800">Aguardando</h4>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-amber-100 text-amber-800 border border-amber-200">
                  {waitingMatches.length}
                </span>
              </div>
            </div>

            {waitingMatches.length === 0 ? (
              <div className="text-xs text-slate-400 font-bold bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-4 text-center">
                Nenhuma partida aguardando na fila.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2.5">
                {waitingMatches.map((m, idx) => renderItem(m, idx))}
              </div>
            )}
          </div>
        )}

        {/* 3. Finalizadas */}
        {(finishedMatches.length > 0 || !isSearching) && (
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-emerald-600" />
                <h4 className="text-xs font-black tracking-wide text-emerald-800">Finalizadas</h4>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                  {finishedMatches.length}
                </span>
              </div>
              {finishedMatches.length > 0 && (
                <button
                  type="button"
                  onClick={() => setIsFinishedOpen((prev) => !prev)}
                  className="flex items-center gap-1.5 text-[11px] font-black text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-xl transition-all cursor-pointer"
                >
                  <span>{isFinishedOpen ? 'Recolher' : 'Expandir'}</span>
                  {isFinishedOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              )}
            </div>

            {finishedMatches.length === 0 ? (
              <div className="text-xs text-slate-400 font-bold bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-4 text-center">
                Nenhuma partida finalizada ainda.
              </div>
            ) : isFinishedOpen ? (
              <div className="grid grid-cols-1 gap-2.5">
                {finishedMatches.map((m, idx) => renderItem(m, idx))}
              </div>
            ) : null}
          </div>
        )}
      </div>
    );
  };

  const descriptionText = isRanking
    ? 'Confrontos gerados para o ranking. Registre os placares ou reabra partidas.'
    : isSuper8Duplas
    ? 'Fase 1: round-robin individual por grupo. Fases 2 e 3: duplas fixas formadas automaticamente.'
    : isSuper8
    ? 'Rodadas do Super 8 organizadas por fases.'
    : 'Confrontos de chaves e fases eliminatórias (Semifinais e Finais).';

  return (
    <section className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden animate-in fade-in">
      <div className="p-5 border-b border-slate-100 flex flex-col gap-3.5">
        <div>
          <h3 className="text-base font-black text-slate-800">Partidas ({category.name})</h3>
          <p className="text-xs text-slate-400 font-bold mt-0.5">{descriptionText}</p>
        </div>

        {/* Botões de Ação */}
        <div className="flex flex-wrap items-center gap-2">
          {isRanking && !isReadOnly && <button type="button" onClick={() => setIsImportOpen(true)} className="flex items-center justify-center gap-2 border-2 border-emerald-500 text-emerald-600 bg-white hover:bg-emerald-50 px-4 py-2.5 rounded-2xl text-xs font-black"><Upload size={16}/><span>Importar partidas</span></button>}
          {!isRanking && !isReadOnly && categoryMatches.length > 0 && (
            <button
              type="button"
              onClick={onGenerateMatches}
              className="flex items-center justify-center gap-2 border-2 border-emerald-500 text-emerald-600 bg-white hover:bg-emerald-50 px-4 py-2.5 rounded-2xl text-xs font-black shadow-xs transition-all active:scale-95 shrink-0 cursor-pointer"
              title="Regerar partidas da categoria"
            >
              <Sparkles size={16} className="text-emerald-500" />
              <span>Regerar partidas</span>
            </button>
          )}
          <button
            type="button"
            onClick={onGenerateBlankPdf}
            className="flex items-center justify-center gap-2 border-2 border-orange-400 text-orange-600 bg-white hover:bg-orange-50 px-4 py-2.5 rounded-2xl text-xs font-black shadow-xs transition-all active:scale-95 shrink-0 cursor-pointer"
            title="Gerar PDF com todas as partidas em branco para anotações manuais"
          >
            <FileText size={16} className="text-orange-500" />
            <span>Gerar PDF</span>
          </button>
          {!isReadOnly && categoryMatches.length > 0 && (
            <button
              type="button"
              onClick={onDeleteAllCategoryMatches}
              className="flex items-center justify-center gap-2 border-2 border-red-500 text-red-600 bg-white hover:bg-red-50 px-4 py-2.5 rounded-2xl text-xs font-black shadow-xs transition-all active:scale-95 shrink-0 cursor-pointer"
              title="Deletar todas as partidas geradas desta categoria"
            >
              <Trash2 size={16} className="text-red-500" />
              <span>Deletar</span>
            </button>
          )}
        </div>

        {/* Toggle de visualização e Campo de pesquisa */}
        {categoryMatches.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex-1">
              <ParticipantSearchInput
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Pesquisar partida por nome..."
              />
            </div>
            {!isRanking && (
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl shrink-0 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setViewMode('status')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                    viewMode === 'status'
                      ? 'bg-white text-slate-800 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Por Status (Fila)
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('phase')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                    viewMode === 'phase'
                      ? 'bg-white text-slate-800 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Por Fases
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {categoryMatches.length === 0 ? (
        <div className="p-10 text-center space-y-3">
          <p className="text-sm font-bold text-slate-400">Nenhuma partida gerada para esta categoria.</p>
          {!isRanking && !isReadOnly && (
            <button
              type="button"
              onClick={onGenerateMatches}
              className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2.5 rounded-xl text-xs font-black shadow-md active:scale-95 transition-all cursor-pointer"
            >
              <Sparkles size={16} />
              <span>Gerar partidas</span>
            </button>
          )}
        </div>
      ) : rawFilteredMatches.length === 0 ? (
        <div className="p-10 text-center text-sm font-bold text-slate-400">Nenhuma partida encontrada.</div>
      ) : isRanking || viewMode === 'status' || searchQuery ? (
        renderStatusBlocks()
      ) : isSuper8Duplas ? (
        <div className="p-4 space-y-5">
          {/* Fase 1: agrupado por grupo (A1, A2, B1, B2, ...) */}
          {(() => {
            const fase1Matches = categoryMatches.filter((m) => m.phase?.startsWith('super8d_fase1_'));
            const groupMap = new Map<string, TournamentMatch[]>();
            fase1Matches.forEach((m) => {
              const parts = m.phase!.replace('super8d_fase1_', '').split('_r');
              const groupKey = parts[0]?.toUpperCase() || 'G?';
              if (!groupMap.has(groupKey)) groupMap.set(groupKey, []);
              groupMap.get(groupKey)!.push(m);
            });
            const groups = Array.from(groupMap.entries()).sort(([a], [b]) => a.localeCompare(b));

            return groups.length > 0 ? (
              <div className="space-y-3">
                <h4 className="text-xs font-black text-slate-700 px-1">Fase 1 — Grupos (individual)</h4>
                <div className="space-y-3">
                  {groups.map(([groupKey, gMatches]) => (
                    <div key={groupKey} className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <h5 className="text-[11px] font-black text-slate-700">Grupo {groupKey}</h5>
                        <span className="text-[10px] font-black text-slate-400">{gMatches.length} jogos</span>
                      </div>
                      <div className="grid grid-cols-1 gap-2">
                        {sortMatchesByDateDesc(gMatches).map((m, idx) => renderItem(m, idx))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null;
          })()}

          {/* Fase 2: Semifinais */}
          {(() => {
            const semiOuro = categoryMatches.filter((m) => m.phase?.startsWith('super8d_semi_ouro'));
            const semiPrata = categoryMatches.filter((m) => m.phase?.startsWith('super8d_semi_prata'));
            if (semiOuro.length === 0 && semiPrata.length === 0) return null;
            return (
              <div className="space-y-3">
                <h4 className="text-xs font-black text-amber-700 px-1">Fase 2 — Semifinais</h4>
                {semiOuro.length > 0 && (
                  <div className="rounded-2xl border border-yellow-100 bg-yellow-50/50 p-4 space-y-2.5">
                    <h5 className="text-[11px] font-black text-yellow-700">🥇 Chave Ouro</h5>
                    <div className="grid grid-cols-1 gap-2">
                      {sortMatchesByDateDesc(semiOuro).map((m, idx) => renderItem(m, idx))}
                    </div>
                  </div>
                )}
                {semiPrata.length > 0 && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-2.5">
                    <h5 className="text-[11px] font-black text-slate-600">🥈 Chave Prata</h5>
                    <div className="grid grid-cols-1 gap-2">
                      {sortMatchesByDateDesc(semiPrata).map((m, idx) => renderItem(m, idx))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Fase 3: Finais */}
          {(() => {
            const finalOuro = categoryMatches.filter((m) => m.phase === 'super8d_final_ouro' || m.phase === 'super8d_3lugar_ouro');
            const finalPrata = categoryMatches.filter((m) => m.phase === 'super8d_final_prata' || m.phase === 'super8d_3lugar_prata');
            if (finalOuro.length === 0 && finalPrata.length === 0) return null;
            return (
              <div className="space-y-3">
                <h4 className="text-xs font-black text-emerald-700 px-1">Fase 3 — Finais</h4>
                {finalOuro.length > 0 && (
                  <div className="rounded-2xl border border-yellow-100 bg-yellow-50/50 p-4 space-y-2.5">
                    <h5 className="text-[11px] font-black text-yellow-700">🥇 Final Ouro</h5>
                    <div className="grid grid-cols-1 gap-2">
                      {sortMatchesByDateDesc(finalOuro).map((m, idx) => renderItem(m, idx))}
                    </div>
                  </div>
                )}
                {finalPrata.length > 0 && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-2.5">
                    <h5 className="text-[11px] font-black text-slate-600">🥈 Final Prata</h5>
                    <div className="grid grid-cols-1 gap-2">
                      {sortMatchesByDateDesc(finalPrata).map((m, idx) => renderItem(m, idx))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      ) : isSuper8 ? (
        <div className="p-4 space-y-6">
          {(() => {
            const roundMap = new Map<string, { label: string; matches: TournamentMatch[] }>();
            categoryMatches.forEach((m) => {
              const phase = m.phase || 'rodada1';
              const num = phase.replace(/\D/g, '') || '1';
              const roundKey = `rodada${num}`;
              if (!roundMap.has(roundKey)) {
                roundMap.set(roundKey, { label: `Rodada ${num}`, matches: [] });
              }
              roundMap.get(roundKey)!.matches.push(m);
            });
            const rounds = Array.from(roundMap.entries())
              .sort(([k1], [k2]) => {
                const n1 = Number(k1.replace(/\D/g, '')) || 0;
                const n2 = Number(k2.replace(/\D/g, '')) || 0;
                return n1 - n2;
              })
              .map(([, v]) => v);

            return rounds.map((round) => (
              <div key={round.label} className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-slate-800">{round.label}</h4>
                  <span className="text-[10px] font-black text-slate-400">{round.matches.length} {round.matches.length === 1 ? 'jogo' : 'jogos'}</span>
                </div>
                <div className="grid grid-cols-1 gap-2.5">
                  {sortMatchesByDateDesc(round.matches).map((m, idx) => renderItem(m, idx))}
                </div>
              </div>
            ));
          })()}
        </div>
      ) : (
        <div className="p-4 space-y-6">
          {b1Matches.length > 0 && (
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black text-slate-800">Primeira fase — Chave 1</h4>
                <span className="text-[10px] font-black text-slate-400">{b1Matches.length} jogos</span>
              </div>
              <div className="grid grid-cols-1 gap-2.5">
                {b1Matches.map((m, idx) => renderItem(m, idx))}
              </div>
            </div>
          )}
          {b2Matches.length > 0 && (
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black text-slate-800">Primeira fase — Chave 2</h4>
                <span className="text-[10px] font-black text-slate-400">{b2Matches.length} jogos</span>
              </div>
              <div className="grid grid-cols-1 gap-2.5">
                {b2Matches.map((m, idx) => renderItem(m, idx))}
              </div>
            </div>
          )}
          {semiMatches.length > 0 && (
            <div className="rounded-2xl border border-amber-100 bg-amber-50/50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black text-amber-900">Semifinais</h4>
                <span className="text-[10px] font-black text-amber-600">{semiMatches.length} jogos</span>
              </div>
              <div className="grid grid-cols-1 gap-2.5">
                {semiMatches.map((m, idx) => renderItem(m, idx))}
              </div>
            </div>
          )}
          {finalMatches.length > 0 && (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black text-emerald-900">Finais & 3º lugar</h4>
                <span className="text-[10px] font-black text-emerald-600">{finalMatches.length} jogos</span>
              </div>
              <div className="grid grid-cols-1 gap-2.5">
                {finalMatches.map((m, idx) => renderItem(m, idx))}
              </div>
            </div>
          )}
          {otherMatches.length > 0 && (
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black text-slate-800">Outras partidas</h4>
                <span className="text-[10px] font-black text-slate-400">{otherMatches.length} jogos</span>
              </div>
              <div className="grid grid-cols-1 gap-2.5">
                {otherMatches.map((m, idx) => renderItem(m, idx))}
              </div>
            </div>
          )}
        </div>
      )}
      {isImportOpen && <RankingMatchImportModal event={event} category={category} onClose={() => setIsImportOpen(false)} onImport={onImportMatches}/>}
    </section>
  );
};
