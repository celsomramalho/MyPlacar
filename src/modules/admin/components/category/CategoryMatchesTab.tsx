import React, { useState, useMemo } from 'react';
import { Sparkles, FileText, Trash2, Upload } from 'lucide-react';
import type { EventCategory, TournamentEvent, TournamentMatch, TournamentPair } from '@modules/events/types';
import { MatchCard } from '@modules/events/components/matches/MatchCard';
import { RankingMatchImportModal } from './RankingMatchImportModal';
import { ParticipantSearchInput } from '@modules/events/components/ParticipantSearchInput';
import { filterMatchesBySearch, sortMatchesByDateDesc } from '@modules/events/domain/brackets';

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
    () => sortMatchesByDateDesc(filterMatchesBySearch(categoryMatches, searchQuery, pairsById)),
    [categoryMatches, searchQuery, pairsById]
  );

  const renderItem = (match: TournamentMatch, idx?: number) => (
    <MatchCard
      key={match.id}
      match={match}
      colorIndex={idx}
      pairsById={pairsById}
      variant="detailed"
      isRanking={isRanking}
      totalSets={totalSets}
      gamesPerSet={category.gamesPerSet ?? ((isSuper8 || isSuper8Duplas) ? 4 : 6)}
      queuePosition={queuePosByMatchId?.get(match.id) ?? 0}
      canSubmitScore={!isReadOnly}
      canManage={!isReadOnly}
      isReadOnly={isReadOnly}
      allCategoryFinished={allCategoryFinished}
      onScoreChange={onScoreChange}
      onMatchDateChange={onMatchDateChange}
      onFinishMatch={onFinishMatch}
      onReopenMatch={onReopenMatch}
      onDeleteMatch={onDeleteMatch}
    />
  );

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

        {/* Campo de pesquisa */}
        {categoryMatches.length > 0 && (
          <ParticipantSearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Pesquisar partida por nome..."
          />
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
      ) : filteredMatches.length === 0 ? (
        <div className="p-10 text-center text-sm font-bold text-slate-400">Nenhuma partida encontrada.</div>
      ) : isRanking ? (
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-1 gap-2.5">
            {filteredMatches.map((m, idx) => renderItem(m, idx))}
          </div>
        </div>
      ) : isSuper8Duplas ? (
        searchQuery ? (
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-1 gap-2.5">
              {filteredMatches.map((m, idx) => renderItem(m, idx))}
            </div>
          </div>
        ) : (
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
        )
      ) : isSuper8 ? (
        searchQuery ? (
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-1 gap-2.5">
              {filteredMatches.map((m, idx) => renderItem(m, idx))}
            </div>
          </div>
        ) : (
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
        )
      ) : (
        searchQuery ? (
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-1 gap-2.5">
              {filteredMatches.map((m, idx) => renderItem(m, idx))}
            </div>
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
                <h4 className="text-xs font-black text-slate-800">Outras Partidas</h4>
                <span className="text-[10px] font-black text-slate-400">{otherMatches.length} jogos</span>
              </div>
              <div className="grid grid-cols-1 gap-2.5">
                {otherMatches.map((m, idx) => renderItem(m, idx))}
              </div>
            </div>
          )}
        </div>
        )
      )}
      {isImportOpen && <RankingMatchImportModal event={event} category={category} onClose={() => setIsImportOpen(false)} onImport={onImportMatches}/>}
    </section>
  );
};
