import React from 'react';
import type { TeamStanding } from '../services/matchProgression';

interface Props {
  standing: TeamStanding;
}

interface StatCellProps {
  label: string;
  value: number;
  isLast?: boolean;
  colorClass?: string;
  formatValue?: (v: number) => string;
}

const defaultFormat = (v: number) => String(v);
const saldoFormat = (v: number) => (v > 0 ? `+${v}` : String(v));

const StatCell: React.FC<StatCellProps> = ({
  label,
  value,
  isLast,
  colorClass = 'text-slate-800',
  formatValue = defaultFormat,
}) => (
  <div
    className={`flex flex-col items-center justify-center min-w-0 py-1.5 ${
      !isLast ? 'border-r border-slate-300' : ''
    }`}
  >
    <span className="text-[10px] font-semibold text-slate-500 leading-tight tracking-wide uppercase truncate px-1">
      {label}
    </span>
    <span className={`text-sm font-black leading-tight mt-0.5 ${colorClass}`}>
      {formatValue(value)}
    </span>
  </div>
);

export const BracketTeamStatsBlock: React.FC<Props> = ({ standing }) => {
  const partidas = standing.played ?? 0;
  const vitorias = standing.wins ?? 0;
  const derrotas = standing.losses ?? 0;
  const saldoPartidas = vitorias - derrotas;

  const gamesPro = standing.gamesWon ?? 0;
  const gamesContra = standing.gamesLost ?? 0;
  const gamesTotal = gamesPro + gamesContra;
  const saldoGames = standing.gamesDiff ?? (gamesPro - gamesContra);

  const setsPro = standing.setsWon ?? 0;
  const setsContra = standing.setsLost ?? 0;
  const setsTotal = setsPro + setsContra;
  const saldoSets = standing.setsDiff ?? (setsPro - setsContra);

  const hasSets = setsTotal > 0;

  const saldoPartidasColor =
    saldoPartidas > 0 ? 'text-emerald-600' : saldoPartidas < 0 ? 'text-rose-600' : 'text-slate-700';
  const saldoGamesColor =
    saldoGames > 0 ? 'text-emerald-600' : saldoGames < 0 ? 'text-rose-600' : 'text-slate-700';
  const saldoSetsColor =
    saldoSets > 0 ? 'text-emerald-600' : saldoSets < 0 ? 'text-rose-600' : 'text-slate-700';

  return (
    <div className="mt-2 bg-slate-50 border border-slate-200/80 rounded-xl p-2 shadow-xs space-y-2">
      {/* Partidas row */}
      <div className="grid grid-cols-4 divide-x divide-slate-300 rounded-lg border border-slate-200 bg-white overflow-hidden">
        <StatCell label="Partidas" value={partidas} />
        <StatCell label="Saldo" value={saldoPartidas} colorClass={saldoPartidasColor} formatValue={saldoFormat} />
        <StatCell label="Vitórias" value={vitorias} />
        <StatCell label="Derrotas" value={derrotas} isLast />
      </div>

      {/* Games row */}
      <div className="grid grid-cols-4 divide-x divide-slate-300 rounded-lg border border-slate-200 bg-white overflow-hidden">
        <StatCell label="Games" value={gamesTotal} />
        <StatCell label="Saldo" value={saldoGames} colorClass={saldoGamesColor} formatValue={saldoFormat} />
        <StatCell label="Pró" value={gamesPro} />
        <StatCell label="Contra" value={gamesContra} isLast />
      </div>

      {/* Sets row — only when event has sets */}
      {hasSets && (
        <div className="grid grid-cols-4 divide-x divide-slate-300 rounded-lg border border-slate-200 bg-white overflow-hidden">
          <StatCell label="Sets" value={setsTotal} />
          <StatCell label="Saldo" value={saldoSets} colorClass={saldoSetsColor} formatValue={saldoFormat} />
          <StatCell label="Pró" value={setsPro} />
          <StatCell label="Contra" value={setsContra} isLast />
        </div>
      )}

      {standing.tieBreakNote && (
        <div className="pt-1 border-t border-slate-200/60">
          <span className="inline-flex items-center gap-1 text-[10px] font-black text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg">
            ⚖️ {standing.tieBreakNote}
          </span>
        </div>
      )}
    </div>
  );
};
