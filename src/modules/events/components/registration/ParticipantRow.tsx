import React from 'react';
import { User, Users, UsersRound, Check } from 'lucide-react';
import { MarsIcon, VenusIcon } from '@shared/components/GenderIcons';
import { maskPin } from '@shared/utils/formatters';
import type { TournamentEntry, TournamentPair, EventCategory, TournamentMatch, PlayerStanding } from '../../types';
import { formatRegistrationId } from '../../types';

import { RankingStandingStatsBlock } from '../RankingStandingStatsBlock';
import { Super8StandingStatsBlock } from '../Super8StandingStatsBlock';

export interface ParticipantRowProps {
  entry: TournamentEntry;
  category?: EventCategory;
  isCurrentUser?: boolean;
  pair?: TournamentPair | null;
  standing?: PlayerStanding | null;
  isIndividualRanking?: boolean;
  isRanking?: boolean;
  isSuper8?: boolean;
  isSelected?: boolean;
  canSelect?: boolean;
  hasCategoryMatches?: boolean;
  onToggleSelect?: (entry: TournamentEntry) => void;
  onEdit?: (entry: TournamentEntry) => void;
}

export const ParticipantRow: React.FC<ParticipantRowProps> = ({
  entry,
  category,
  isCurrentUser = false,
  pair,
  standing,
  isIndividualRanking = false,
  isRanking = false,
  isSuper8 = false,
  isSelected = false,
  canSelect = false,
  hasCategoryMatches = false,
  onToggleSelect,
  onEdit,
}) => {
  const partner = pair
    ? (pair.p1.email && entry.email && pair.p1.email.toLowerCase().trim() === entry.email.toLowerCase().trim()) ||
      (pair.p1.pin && entry.pin && pair.p1.pin.toUpperCase().trim() === entry.pin.toUpperCase().trim())
      ? pair.p2
      : pair.p1
    : null;

  const isCancelled = Boolean(entry.disabled || entry.paymentStatus === 'Cancelado');

  return (
    <div
      onClick={() => canSelect && !isCancelled && onToggleSelect?.(entry)}
      className={`p-3.5 transition-all border-b border-slate-100 last:border-b-0 ${
        isCancelled
          ? 'bg-red-50/40 opacity-70'
          : isSelected
          ? isRanking && !pair
            ? 'bg-emerald-100/90 ring-2 ring-inset ring-emerald-500 border-l-4 border-l-emerald-600'
            : 'bg-sky-100/90 ring-2 ring-inset ring-sky-500 border-l-4 border-l-sky-600'
          : isRanking && pair
          ? 'bg-sky-50/40 hover:bg-sky-50/70 border-l-4 border-l-sky-400'
          : isRanking && !pair
          ? 'bg-emerald-50/25 hover:bg-emerald-50/60 border-l-4 border-l-emerald-400'
          : 'odd:bg-white even:bg-slate-50/40 hover:bg-slate-50'
      } ${canSelect && !isCancelled ? 'cursor-pointer' : isCancelled ? 'cursor-not-allowed' : ''}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          {/* Avatar e Ícone de Gênero */}
          <div className="flex flex-col items-center gap-1.5 shrink-0">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                isCurrentUser
                  ? 'bg-[#4B0082] text-white'
                  : entry.gender === 'F'
                  ? 'bg-pink-50 text-pink-500'
                  : 'bg-sky-50 text-sky-500'
              }`}
            >
              <User size={20} fill={isCurrentUser ? 'currentColor' : 'none'} />
            </div>
            <div
              className={`p-1.5 rounded-xl border flex items-center justify-center shrink-0 ${
                entry.gender === 'F'
                  ? 'bg-pink-50 text-pink-500 border-pink-100'
                  : 'bg-sky-50 text-sky-500 border-sky-100'
              }`}
            >
              {entry.gender === 'F' ? <VenusIcon size={14} /> : <MarsIcon size={14} />}
            </div>
          </div>

          {/* Dados Textuais */}
          <div className="min-w-0 space-y-1 flex-1">
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              {canSelect && !isCancelled && (
                <div
                  className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                    isSelected ? 'bg-sky-500 border-sky-600 text-white' : 'border-slate-300 bg-white'
                  }`}
                >
                  {isSelected && <Check size={10} className="stroke-[3]" />}
                </div>
              )}
              <p className={`text-sm font-black truncate ${isCancelled ? 'text-slate-500 line-through' : 'text-slate-900'}`}>
                {entry.name || entry.nickname}
                {isCurrentUser && <span className="text-[10px] text-indigo-600 font-bold ml-1">(você)</span>}
              </p>

              {/* Badge CANCELADO / DESATIVADO */}
              {isCancelled && (
                <span
                  className="bg-red-100 text-red-700 border border-red-200 text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider"
                  title={entry.disabledReason ? `Motivo: ${entry.disabledReason}` : 'Inscrição cancelada ou desativada'}
                >
                  {entry.paymentStatus === 'Cancelado' ? 'CANCELADO' : 'DESATIVADO'}
                </span>
              )}

              {isIndividualRanking && standing?.rank !== undefined && (
                <span
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${
                    standing.rank === 1
                      ? 'bg-amber-100 text-amber-800 border border-amber-200'
                      : standing.rank === 2
                      ? 'bg-slate-200 text-slate-700 border border-slate-300'
                      : standing.rank === 3
                      ? 'bg-amber-50 text-amber-700 border border-amber-200/80'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {standing.rank === 1 ? '🥇 1º' : standing.rank === 2 ? '🥈 2º' : standing.rank === 3 ? '🥉 3º' : `${standing.rank}º`}
                </span>
              )}

              {isRanking && standing && (
                <span className="text-[10px] font-black text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-lg">
                  {standing.points || 0} pts
                </span>
              )}

              {pair ? (
                <span className="font-mono text-sky-800 bg-sky-100 border border-sky-300 px-2 py-0.5 rounded-lg text-[10px] font-black inline-flex items-center gap-1">
                  <Users size={11} /> {pair.teamCode || 'Time formado'}
                </span>
              ) : entry.registrationId && !isSuper8 && !isRanking ? (
                <span className="font-mono text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded-lg text-[10px] font-black">
                  {formatRegistrationId(entry.registrationId)}
                </span>
              ) : null}
            </div>

            <p className="text-[10px] font-bold text-slate-400 uppercase truncate">
              {(entry.nickname || entry.name).toUpperCase()} - {maskPin(entry.pin)}
            </p>

            {isRanking && partner && (
              <p className="text-[11px] font-bold text-sky-700 flex items-center gap-1">
                <UsersRound size={12} /> Parceiro(a):{' '}
                <span className="font-black text-slate-800">{partner.nickname || partner.name}</span>
              </p>
            )}

            {category && (
              <span className="inline-flex bg-slate-100 text-slate-700 font-black px-2.5 py-0.5 rounded-lg text-[10px] border border-slate-200/60">
                {category.abbreviation || category.name}
              </span>
            )}
          </div>
        </div>

        {/* Lado Direito: Número de Inscrição Super 8 */}
        {isSuper8 && (
          <div className="flex items-center gap-3 shrink-0">
            <span className="font-mono font-black text-emerald-600 text-sm tracking-wider">
              {formatRegistrationId(entry.registrationId)}
            </span>
          </div>
        )}
      </div>

      {/* Estatísticas de Ranking ou Super 8 Individual */}
      {isIndividualRanking && standing && hasCategoryMatches && (
        <div className="mt-2">
          {isRanking ? (
            <RankingStandingStatsBlock standing={standing} />
          ) : (
            <Super8StandingStatsBlock standing={standing} />
          )}
        </div>
      )}
    </div>
  );
};
