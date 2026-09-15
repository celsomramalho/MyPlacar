import React from 'react';
import { Sparkles, FileText, Trash2 } from 'lucide-react';
import type { EventCategory, TournamentMatch, TournamentPair } from '@modules/events/types';
import { MatchCard } from '@modules/events/components/matches/MatchCard';

export interface CategoryMatchesTabProps {
  category: EventCategory;
  categoryMatches: TournamentMatch[];
  pairsById: Record<string, TournamentPair>;
  isRanking: boolean;
  isSuper8: boolean;
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
}

export const CategoryMatchesTab: React.FC<CategoryMatchesTabProps> = ({
  category,
  categoryMatches,
  pairsById,
  isRanking,
  isSuper8,
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
}) => {
  const b1Matches = categoryMatches.filter((m) => m.phase === 'chave1');
  const b2Matches = categoryMatches.filter((m) => m.phase === 'chave2');
  const semiMatches = categoryMatches.filter((m) => m.phase === 'semifinal');
  const finalMatches = categoryMatches.filter((m) => m.phase === 'final' || m.phase === '3lugar');
  const otherMatches = categoryMatches.filter(
    (m) =>
      m.phase !== 'chave1' &&
      m.phase !== 'chave2' &&
      m.phase !== 'semifinal' &&
      m.phase !== 'final' &&
      m.phase !== '3lugar' &&
      !m.phase?.startsWith('rodada')
  );

  const renderItem = (match: TournamentMatch) => (
    <MatchCard
      key={match.id}
      match={match}
      pairsById={pairsById}
      variant="detailed"
      isRanking={isRanking}
      totalSets={totalSets}
      gamesPerSet={category.gamesPerSet ?? (isSuper8 ? 4 : 6)}
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

  return (
    <section className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden animate-in fade-in">
      <div className="p-5 border-b border-slate-100 flex flex-col gap-3.5">
        <div>
          <h3 className="text-base font-black text-slate-800">Jogos ({category.name})</h3>
          <p className="text-xs text-slate-400 font-bold mt-0.5">
            {isRanking
              ? 'Confrontos gerados para o ranking. Registre os placares ou reabra partidas.'
              : isSuper8
              ? 'Rodadas do Super 8 organizadas por fases.'
              : 'Confrontos de chaves e fases eliminatórias (Semifinais e Finais).'}
          </p>
        </div>

        {/* Botões de Ação */}
        <div className="flex flex-wrap items-center gap-2">
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
      ) : isRanking ? (
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-1 gap-2.5">
            {categoryMatches.map(renderItem)}
          </div>
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
                  {round.matches.map(renderItem)}
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
                {b1Matches.map(renderItem)}
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
                {b2Matches.map(renderItem)}
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
                {semiMatches.map(renderItem)}
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
                {finalMatches.map(renderItem)}
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
                {otherMatches.map(renderItem)}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
