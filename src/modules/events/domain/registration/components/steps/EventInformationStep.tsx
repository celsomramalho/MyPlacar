import React from 'react';
import { Info, MapPin, ExternalLink, Calendar, FileText, CheckSquare, Square } from 'lucide-react';
import type { TournamentEvent } from '@modules/events/types';
import { openPdfOrUrl } from '@modules/events/services/openRegulationPdf';

export interface EventInformationStepProps {
  event: TournamentEvent;
  accepted: boolean;
  onToggleAccept: () => void;
  readOnly?: boolean;
}

const formatIsoDate = (dateStr?: string) => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts;
    return `${day}/${month}/${year}`;
  }
  return dateStr;
};

const formatDateRange = (start?: string, end?: string) => {
  const fStart = formatIsoDate(start);
  const fEnd = formatIsoDate(end);
  if (fStart && fEnd) {
    if (fStart === fEnd) return fStart;
    return `${fStart} a ${fEnd}`;
  }
  if (fStart) return `A partir de ${fStart}`;
  if (fEnd) return `Até ${fEnd}`;
  return '';
};

export const EventInformationStep: React.FC<EventInformationStepProps> = ({
  event,
  accepted,
  onToggleAccept,
  readOnly = false,
}) => {
  const hasInformation = Boolean(event.information && event.information.trim().length > 0);
  const hasLocation = Boolean(event.location && event.location.trim().length > 0);
  const hasRegulation = Boolean(event.regulationUrl || event.regulationFileName);

  const registrationPeriodText = formatDateRange(event.startDate, event.endDate);
  const tournamentPeriodText =
    formatDateRange(event.tournamentStartDate, event.tournamentEndDate) || event.eventDateText || '';

  const mapUrl =
    event.locationMapUrl ||
    (event.location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}` : '');

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Cabeçalho do Bloco */}
      <div className="border-b border-slate-100 pb-3">
        <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
          <Info size={18} className="text-blue-600" />
          Informações do evento
        </h3>
        <p className="text-xs text-slate-400 font-bold mt-0.5">
          Orientações gerais, local, datas e regulamento da competição.
        </p>
      </div>

      {/* 1. Campo Informações do Cadastro do Evento */}
      {hasInformation && (
        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1.5">
          <span className="text-[10px] font-black text-slate-400 tracking-wider block">
            Orientações do organizador
          </span>
          <p className="text-xs font-bold text-slate-700 whitespace-pre-line leading-relaxed">
            {event.information}
          </p>
        </div>
      )}

      {/* 2. Local do Evento + Ver no Mapa */}
      {hasLocation && (
        <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
              <MapPin size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-black text-slate-400 tracking-wider block">
                Local do evento
              </span>
              <p className="text-xs font-black text-slate-800 truncate" title={event.location}>
                {event.location}
              </p>
            </div>
          </div>

          {mapUrl && (
            <a
              href={mapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-xl border border-rose-200 bg-white hover:bg-rose-50 text-rose-600 text-xs font-black flex items-center gap-1.5 transition-all shadow-xs shrink-0"
            >
              <ExternalLink size={12} />
              <span>Ver no mapa</span>
            </a>
          )}
        </div>
      )}

      {/* 3. Datas (Inscrição e Torneio) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Período de Inscrição */}
        <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
            <Calendar size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[10px] font-black text-slate-400 tracking-wider block">
              Período de inscrições
            </span>
            <p className="text-xs font-black text-slate-800">
              {registrationPeriodText || 'Datas a definir'}
            </p>
          </div>
        </div>

        {/* Período do Torneio */}
        <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
            <Calendar size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[10px] font-black text-slate-400 tracking-wider block">
              Período do torneio
            </span>
            <p className="text-xs font-black text-slate-800">
              {tournamentPeriodText || 'Datas a definir'}
            </p>
          </div>
        </div>
      </div>

      {/* 4. Regulamento (Arquivo + Visualização) e 5. Li e concordo */}
      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
        {hasRegulation ? (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center font-black shrink-0">
                <FileText size={16} />
              </div>
              <div>
                <h4 className="text-xs font-black text-slate-800">
                  {event.regulationFileName || 'Regulamento oficial'}
                </h4>
                <p className="text-[11px] font-bold text-slate-400">
                  Documento em PDF com todas as diretrizes do evento.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                if (event.regulationUrl) openPdfOrUrl(event.regulationUrl);
              }}
              className="px-3 py-1.5 rounded-xl border border-blue-200 bg-white hover:bg-blue-50 text-blue-600 text-xs font-black flex items-center gap-1.5 transition-all shadow-xs"
            >
              <ExternalLink size={13} />
              <span>Visualizar regulamento</span>
            </button>
          </div>
        ) : (
          <p className="text-xs font-bold text-slate-500">
            Ao se inscrever, você declara concordar com as regras gerais e horários definidos pela organização de {event.name}.
          </p>
        )}

        {/* Checkbox de Aceite */}
        <div
          onClick={() => {
            if (readOnly) return;
            onToggleAccept();
          }}
          className="pt-2 border-t border-slate-200/80 flex items-start gap-2.5 cursor-pointer select-none"
        >
          <div className="mt-0.5 text-blue-600 shrink-0">
            {accepted ? (
              <CheckSquare size={18} className="fill-blue-50 text-blue-600" />
            ) : (
              <Square size={18} className="text-slate-400" />
            )}
          </div>
          <span className="text-xs font-black text-slate-700 leading-snug">
            Li e concordo com o regulamento e regras de participação deste torneio.
          </span>
        </div>
      </div>
    </div>
  );
};
