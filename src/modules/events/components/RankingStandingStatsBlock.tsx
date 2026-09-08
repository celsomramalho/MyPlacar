import React from 'react';
import type { PlayerStanding } from '../types';

interface Props {
  standing: PlayerStanding;
}

const formatNumCell = (val: number): string => {
  const s = String(val);
  if (s.length === 1) return `[  ${s} ]`;
  if (s.length === 2) return `[ ${s} ]`;
  return `[${s} ]`;
};

const formatSaldoCell = (val: number): string => {
  if (val > 0) {
    const s = String(val);
    return s.length === 1 ? `[ + ${s} ]` : `[ +${s} ]`;
  }
  if (val < 0) {
    const s = String(Math.abs(val));
    return s.length === 1 ? `[ - ${s} ]` : `[ -${s} ]`;
  }
  return `[   0 ]`;
};

export const RankingStandingStatsBlock: React.FC<Props> = ({ standing }) => {
  const partidas = standing.played ?? 0;
  const vitorias = standing.wins ?? 0;
  const derrotas = standing.losses ?? 0;
  const saldoPartidas = vitorias - derrotas;

  const gamesPro = standing.gamesWon ?? 0;
  const gamesContra = standing.gamesLost ?? 0;
  const gamesTotal = gamesPro + gamesContra;
  const saldoGames = standing.gamesDiff ?? (gamesPro - gamesContra);

  const saldoPartidasColor =
    saldoPartidas > 0 ? 'text-emerald-600' : saldoPartidas < 0 ? 'text-rose-600' : 'text-slate-700';
  const saldoGamesColor =
    saldoGames > 0 ? 'text-emerald-600' : saldoGames < 0 ? 'text-rose-600' : 'text-slate-700';

  return (
    <div className="mt-2.5 bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 shadow-xs">
      <div className="overflow-x-auto">
        <table className="font-mono text-[10px] sm:text-[11px] leading-tight border-collapse whitespace-pre select-text">
          <tbody>
            <tr>
              <td className="text-slate-500 font-bold p-0">[Partidas]</td>
              <td className="text-slate-500 font-bold p-0">[Saldo]</td>
              <td className="text-slate-500 font-bold p-0">[Vitórias]</td>
              <td className="text-slate-500 font-bold p-0">[Derrotas]:</td>
              <td className="text-slate-900 font-black p-0">{formatNumCell(partidas)}</td>
              <td className={`font-black p-0 ${saldoPartidasColor}`}>{formatSaldoCell(saldoPartidas)}</td>
              <td className="text-slate-900 font-black p-0">{formatNumCell(vitorias)}</td>
              <td className="text-slate-900 font-black p-0">{formatNumCell(derrotas)}</td>
            </tr>
            <tr>
              <td className="text-slate-500 font-bold p-0">[Games   ]</td>
              <td className="text-slate-500 font-bold p-0">[Saldo]</td>
              <td className="text-slate-500 font-bold p-0">[Pró     ]</td>
              <td className="text-slate-500 font-bold p-0">[Contra  ]:</td>
              <td className="text-slate-900 font-black p-0">{formatNumCell(gamesTotal)}</td>
              <td className={`font-black p-0 ${saldoGamesColor}`}>{formatSaldoCell(saldoGames)}</td>
              <td className="text-slate-900 font-black p-0">{formatNumCell(gamesPro)}</td>
              <td className="text-slate-900 font-black p-0">{formatNumCell(gamesContra)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {standing.tieBreakNote && (
        <div className="mt-2 pt-2 border-t border-slate-200/60">
          <span className="inline-flex items-center gap-1 text-[10px] font-black text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg">
            {standing.tieBreakNote}
          </span>
        </div>
      )}
    </div>
  );
};
