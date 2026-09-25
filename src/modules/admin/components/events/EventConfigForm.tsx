import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronUp,
  ExternalLink,
  Eye,
  FileText,
  Image as ImageIcon,
  Loader2,
  Save,
  X,
} from 'lucide-react';
import {
  EVENT_STATUS_OPTIONS,
  EVENT_TYPE_OPTIONS,
  DRAW_TYPE_OPTIONS,
  EVENT_PAYMENT_TYPE_OPTIONS,
  type EventStatusOption,
  type EventTypeOption,
  type DrawTypeOption,
  type EventPaymentTypeOption,
  type TournamentEvent,
} from '@modules/events/types';
import { Button } from '@shared/components/Button';
import { Toggle } from '@shared/components/Toggle';
import { isRankingEvent, isSuper8DuplasEvent } from '@modules/events/services/eventTypeHelpers';
import { openPdfOrUrl } from '@modules/events/services/openRegulationPdf';
import { EventCoAdminsManager } from './EventCoAdminsManager';

export interface EventConfigFormProps {
  editingEvent: TournamentEvent;
  isReadOnlyRegistration: boolean;
  canManageEventAdmins: boolean;
  isSavingEvent: boolean;
  bannerInputRef: React.RefObject<HTMLInputElement>;
  coAdminNamesByPin: Record<string, string>;
  adminEmail?: string;
  onChangeEditingEvent: (event: TournamentEvent | null) => void;
  onSaveEvent: () => void;
  onClose: () => void;
}

export const EventConfigForm: React.FC<EventConfigFormProps> = ({
  editingEvent,
  isReadOnlyRegistration,
  canManageEventAdmins,
  isSavingEvent,
  bannerInputRef,
  coAdminNamesByPin,
  adminEmail,
  onChangeEditingEvent,
  onSaveEvent,
  onClose,
}) => {
  const regulationInputRef = useRef<HTMLInputElement>(null);
  const [organizerStatus, setOrganizerStatus] = useState<{
    loading: boolean;
    connected?: boolean;
    userId?: string;
    checkedEmail?: string;
  }>({ loading: false });

  const currentOrganizerEmail = editingEvent.organizerEmail || (editingEvent.paymentType === 'mercadopago' && adminEmail ? adminEmail : '');

  // Consulta o status de conexão da conta Mercado Pago do organizador
  useEffect(() => {
    if (editingEvent.paymentType !== 'mercadopago') return;
    const targetEmail = (editingEvent.organizerEmail || adminEmail || '').trim().toLowerCase();
    if (!targetEmail) {
      setOrganizerStatus({ loading: false, connected: false, checkedEmail: '' });
      return;
    }

    setOrganizerStatus((prev) => ({ ...prev, loading: true, checkedEmail: targetEmail }));
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/mercadopago-organizer-status?email=${encodeURIComponent(targetEmail)}`);
        if (res.ok) {
          const data = await res.json();
          setOrganizerStatus({
            loading: false,
            connected: !!data.connected,
            userId: data.userId,
            checkedEmail: targetEmail,
          });
        } else {
          setOrganizerStatus({ loading: false, connected: false, checkedEmail: targetEmail });
        }
      } catch {
        setOrganizerStatus({ loading: false, connected: false, checkedEmail: targetEmail });
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [editingEvent.organizerEmail, editingEvent.paymentType, adminEmail]);

  const handleProtectedChange = (updated: TournamentEvent | null) => {
    if (isReadOnlyRegistration && updated !== null) {
      return;
    }
    onChangeEditingEvent(updated);
  };

  const handleAddCoAdmin = (pin: string) => {
    const currentAdmins = (editingEvent.coAdminPins || []).map((adminPin) => adminPin.toUpperCase().trim());
    if (currentAdmins.includes(pin)) return;
    handleProtectedChange({ ...editingEvent, coAdminPins: [...currentAdmins, pin] });
  };

  const handleRemoveCoAdmin = (pin: string) => {
    handleProtectedChange({
      ...editingEvent,
      coAdminPins: (editingEvent.coAdminPins || []).filter(
        (adminPin) => adminPin.toUpperCase().trim() !== pin.toUpperCase().trim()
      ),
    });
  };

  return (
    <div className="bg-slate-50 p-6 rounded-[2.5rem] border border-slate-200 space-y-5 animate-in slide-in-from-top-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <h4 className="text-sm font-black text-slate-800 tracking-tight">
          {isReadOnlyRegistration ? 'Visualizar cadastro do evento' : 'Configurar evento'}
        </h4>
        <button
          onClick={onClose}
          className="w-10 h-10 bg-slate-100 text-slate-700 rounded-full flex items-center justify-center hover:bg-slate-200 active:scale-95 transition-all cursor-pointer"
          title="Recolher configuração"
        >
          <ChevronUp size={18} />
        </button>
      </div>

      <div className="space-y-4">
        {/* Ativo */}
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-2">
          <Toggle
            id="event-active"
            label="Evento ativo"
            checked={editingEvent.active}
            disabled={isReadOnlyRegistration}
            onChange={(checked) => handleProtectedChange({ ...editingEvent, active: checked })}
          />
        </div>

        {/* Nome do Evento */}
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 ml-1">Nome do evento</label>
          <input
            type="text"
            value={editingEvent.name}
            disabled={isReadOnlyRegistration}
            onChange={(event) => handleProtectedChange({ ...editingEvent, name: event.target.value })}
            placeholder="Nome do evento"
            className="w-full h-12 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-xl px-4 font-black text-sm outline-none"
          />
        </div>

        {/* Regulamento PDF */}
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 ml-1">Regulamento (PDF)</label>
          {isReadOnlyRegistration ? (
            editingEvent.regulationUrl ? (
              <button
                type="button"
                onClick={() => openPdfOrUrl(editingEvent.regulationUrl!, editingEvent.regulationFileName || 'regulamento.pdf')}
                className="w-full h-12 bg-white border border-slate-200 rounded-xl px-4 flex items-center justify-center gap-2 font-black text-xs text-indigo-600 hover:underline cursor-pointer"
              >
                <FileText size={16} /> Ver regulamento ({editingEvent.regulationFileName || 'PDF'})
              </button>
            ) : (
              <div className="w-full h-12 bg-slate-100 border border-slate-200 rounded-xl px-4 flex items-center justify-center gap-2 font-black text-xs text-slate-400">
                <FileText size={16} /> Nenhum regulamento anexado
              </div>
            )
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => regulationInputRef.current?.click()}
                className="flex-1 h-12 bg-white border border-slate-200 rounded-xl px-4 flex items-center justify-center gap-2 font-black text-xs text-slate-500 hover:bg-slate-50 cursor-pointer"
              >
                <FileText size={16} /> {editingEvent.regulationFileName || 'Carregar regulamento'}
              </button>
              {editingEvent.regulationUrl && (
                <button
                  type="button"
                  onClick={() => openPdfOrUrl(editingEvent.regulationUrl!, editingEvent.regulationFileName || 'regulamento.pdf')}
                  className="w-12 h-12 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-center text-amber-700 hover:bg-amber-100 cursor-pointer transition-colors"
                  title="Visualizar regulamento anexado"
                >
                  <Eye size={18} />
                </button>
              )}
              <input
                ref={regulationInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () =>
                    handleProtectedChange({
                      ...editingEvent,
                      regulationUrl: String(reader.result),
                      regulationFileName: file.name,
                    });
                  reader.readAsDataURL(file);
                }}
              />
            </div>
          )}
        </div>

        {/* Informações */}
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 ml-1">Informações do evento</label>
          <textarea
            rows={5}
            value={editingEvent.information || ''}
            disabled={isReadOnlyRegistration}
            onChange={(event) => handleProtectedChange({ ...editingEvent, information: event.target.value })}
            placeholder="Orientações e informações para os participantes"
            className="w-full bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-xl px-4 py-3 font-bold text-xs outline-none resize-y"
          />
        </div>

        {/* PIN */}
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 ml-1">Pin exclusivo (ex: CarmoFev26)</label>
          <input
            type="text"
            value={editingEvent.pin}
            disabled={isReadOnlyRegistration}
            onChange={(event) => handleProtectedChange({ ...editingEvent, pin: event.target.value })}
            placeholder="Pin do evento"
            className="w-full h-12 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-xl px-4 font-black text-sm outline-none"
          />
        </div>

        {/* Local */}
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 ml-1">Local (Clube / Cidade)</label>
          <input
            type="text"
            value={editingEvent.location || ''}
            disabled={isReadOnlyRegistration}
            onChange={(event) => handleProtectedChange({ ...editingEvent, location: event.target.value })}
            placeholder="ex: Clube Carmo - Belo Horizonte"
            className="w-full h-12 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-xl px-4 font-black text-sm outline-none"
          />
        </div>

        {/* Link Google Maps */}
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 ml-1">Link do endereço (Google Maps)</label>
          <input
            type="url"
            value={editingEvent.locationMapUrl || ''}
            disabled={isReadOnlyRegistration}
            onChange={(event) => handleProtectedChange({ ...editingEvent, locationMapUrl: event.target.value })}
            placeholder="https://maps.google.com/..."
            className="w-full h-12 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-xl px-4 font-bold text-xs outline-none"
          />
        </div>

        {/* Data do Evento Texto */}
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 ml-1">Data do Evento</label>
          <input
            type="text"
            value={editingEvent.eventDateText || ''}
            disabled={isReadOnlyRegistration}
            onChange={(event) => handleProtectedChange({ ...editingEvent, eventDateText: event.target.value })}
            placeholder="ex: 15 a 17 de Março"
            className="w-full h-12 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-xl px-4 font-black text-sm outline-none"
          />
        </div>

        {/* Período de inscrição */}
        <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Período de inscrição</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 ml-1">Início</label>
              <input
                type="date"
                value={editingEvent.startDate || ''}
                disabled={isReadOnlyRegistration}
                onChange={(event) => handleProtectedChange({ ...editingEvent, startDate: event.target.value })}
                className="w-full h-12 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-xl px-3 font-black text-xs outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 ml-1">Fim</label>
              <input
                type="date"
                value={editingEvent.endDate || ''}
                disabled={isReadOnlyRegistration}
                onChange={(event) => handleProtectedChange({ ...editingEvent, endDate: event.target.value })}
                className="w-full h-12 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-xl px-3 font-black text-xs outline-none"
              />
            </div>
          </div>
        </div>

        {/* Período do torneio */}
        <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Período do torneio</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 ml-1">Início</label>
              <input
                type="date"
                value={editingEvent.tournamentStartDate || ''}
                disabled={isReadOnlyRegistration}
                onChange={(event) => handleProtectedChange({ ...editingEvent, tournamentStartDate: event.target.value })}
                className="w-full h-12 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-xl px-3 font-black text-xs outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 ml-1">Fim</label>
              <input
                type="date"
                value={editingEvent.tournamentEndDate || ''}
                disabled={isReadOnlyRegistration}
                onChange={(event) => handleProtectedChange({ ...editingEvent, tournamentEndDate: event.target.value })}
                className="w-full h-12 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-xl px-3 font-black text-xs outline-none"
              />
            </div>
          </div>
        </div>

        {/* Co-Admins Manager Sub-component */}
        <EventCoAdminsManager
          coAdminPins={editingEvent.coAdminPins || []}
          coAdminNamesByPin={coAdminNamesByPin}
          canManageEventAdmins={canManageEventAdmins}
          isReadOnlyRegistration={isReadOnlyRegistration}
          onAddCoAdmin={handleAddCoAdmin}
          onRemoveCoAdmin={handleRemoveCoAdmin}
        />

        {/* Valores de Inscrição */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 ml-1">Valor Inscrição (R$)</label>
            <input
              type="number"
              step="0.01"
              min={0}
              disabled={isReadOnlyRegistration}
              value={editingEvent.registrationFee ?? ''}
              onChange={(event) =>
                handleProtectedChange({
                  ...editingEvent,
                  registrationFee: event.target.value ? Number(event.target.value) : undefined,
                })
              }
              placeholder="0,00"
              className="w-full h-12 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-xl px-3 font-black text-xs outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 ml-1">Valor categoria extra (R$)</label>
            <input
              type="number"
              step="0.01"
              min={0}
              disabled={isReadOnlyRegistration}
              value={editingEvent.extraCategoryFee ?? ''}
              onChange={(event) =>
                handleProtectedChange({
                  ...editingEvent,
                  extraCategoryFee: event.target.value ? Number(event.target.value) : undefined,
                })
              }
              placeholder="0,00"
              className="w-full h-12 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-xl px-3 font-black text-xs outline-none"
            />
          </div>
        </div>

        {/* Limite de jogadores por categoria */}
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 ml-1">Limite de jogadores por categoria (padrão)</label>
          <input
            type="number"
            min={1}
            disabled={isReadOnlyRegistration}
            value={editingEvent.maxPlayersPerCategory ?? 8}
            onChange={(event) =>
              handleProtectedChange({
                ...editingEvent,
                maxPlayersPerCategory: event.target.value ? Math.max(1, Number(event.target.value)) : 8,
              })
            }
            placeholder="8"
            className="w-full h-12 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-xl px-4 font-black text-sm outline-none"
          />
        </div>

        {/* Status do Evento e Tipo de Evento */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 ml-1">Status</label>
            <select
              value={editingEvent.eventStatus || 'Em configuração'}
              disabled={isReadOnlyRegistration}
              onChange={(event) => handleProtectedChange({ ...editingEvent, eventStatus: event.target.value as EventStatusOption })}
              className="w-full h-12 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-xl px-3 font-black text-xs outline-none cursor-pointer text-slate-700"
            >
              {EVENT_STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 ml-1">Tipo de evento</label>
            <select
              value={editingEvent.eventType || (isRankingEvent(editingEvent) ? 'Ranking' : 'Chave mata-mata')}
              disabled={isReadOnlyRegistration}
              onChange={(event) => handleProtectedChange({ ...editingEvent, eventType: event.target.value as EventTypeOption })}
              className="w-full h-12 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-xl px-3 font-black text-xs outline-none cursor-pointer text-slate-700"
            >
              {EVENT_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 ml-1">Tipo pagamento</label>
          <select
            value={editingEvent.paymentType || 'manual'}
            disabled={isReadOnlyRegistration}
            onChange={(event) => handleProtectedChange({ ...editingEvent, paymentType: event.target.value as EventPaymentTypeOption })}
            className="w-full h-12 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-xl px-4 font-black text-sm outline-none cursor-pointer text-slate-700"
          >
            {EVENT_PAYMENT_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>

        {editingEvent.paymentType === 'mercadopago' && (
          <div className="space-y-4 rounded-2xl border border-sky-200 bg-sky-50/50 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-sky-900 flex items-center gap-1.5">
                ⚡ Mercado Pago Split & Marketplace
              </span>
              <span className="text-[10px] bg-sky-100 text-sky-700 font-bold px-2 py-0.5 rounded-full">
                Pix Automático
              </span>
            </div>

            {/* Organizador */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black text-slate-600 ml-1">
                  E-mail do Organizador (Recebedor principal)
                </label>
                {adminEmail && (!editingEvent.organizerEmail || editingEvent.organizerEmail !== adminEmail) && (
                  <button
                    type="button"
                    onClick={() => handleProtectedChange({ ...editingEvent, organizerEmail: adminEmail })}
                    className="text-[10px] font-bold text-sky-600 hover:text-sky-800 underline cursor-pointer"
                  >
                    Usar meu e-mail
                  </button>
                )}
              </div>
              <input
                type="email"
                value={editingEvent.organizerEmail ?? ''}
                disabled={isReadOnlyRegistration}
                onChange={(e) => handleProtectedChange({ ...editingEvent, organizerEmail: e.target.value.toLowerCase().trim() })}
                placeholder={adminEmail || 'organizador@email.com'}
                className="w-full h-11 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-xl px-4 font-bold text-xs outline-none focus:border-sky-400"
              />

              {/* Status do Organizador */}
              <div className="pt-1">
                {organizerStatus.loading ? (
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
                    <Loader2 size={13} className="animate-spin" />
                    <span>Verificando conexão Mercado Pago...</span>
                  </div>
                ) : organizerStatus.connected ? (
                  <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 text-xs text-emerald-800 font-bold">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                      <span>Conta Mercado Pago conectada</span>
                      {organizerStatus.userId && (
                        <span className="text-[10px] font-normal text-emerald-600">(ID: {organizerStatus.userId})</span>
                      )}
                    </div>
                    <a
                      href={`/api/mercadopago-oauth-start?adminEmail=${encodeURIComponent(
                        editingEvent.organizerEmail || adminEmail || ''
                      )}`}
                      className="text-[10px] text-emerald-700 underline font-bold"
                      title="Reconectar ou trocar conta"
                    >
                      Reconectar
                    </a>
                  </div>
                ) : (editingEvent.organizerEmail || '').trim().toLowerCase() === (adminEmail || '').trim().toLowerCase() && editingEvent.organizerEmail ? null : (
                  <div className="space-y-2 bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 font-bold">
                    <div className="flex items-center gap-1.5">
                      <AlertTriangle size={15} className="text-amber-600 shrink-0" />
                      <span>Organizador ainda não conectou o Mercado Pago</span>
                    </div>
                    <p className="text-[11px] font-medium text-amber-800 leading-relaxed">
                      Para que o dinheiro das inscrições caia direto na conta do organizador com o split da sua taxa, é necessário autorizar a conexão uma única vez.
                    </p>
                    <a
                      href={`/api/mercadopago-oauth-start?adminEmail=${encodeURIComponent(
                        editingEvent.organizerEmail || adminEmail || ''
                      )}`}
                      className="inline-flex items-center justify-center gap-2 w-full py-2.5 bg-sky-500 hover:bg-sky-600 active:scale-95 text-white font-black text-xs rounded-xl shadow transition-all"
                    >
                      <ExternalLink size={14} />
                      Conectar Mercado Pago deste Organizador
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* Taxa da Plataforma */}
            <div className="space-y-1.5 pt-1 border-t border-sky-100">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black text-slate-600 ml-1">
                  Taxa da plataforma (%)
                </label>
                <span className="text-[10px] font-black text-sky-700">
                  {editingEvent.marketplaceFeePercent ?? 10}% de comissão
                </span>
              </div>
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={editingEvent.marketplaceFeePercent ?? 10}
                disabled={isReadOnlyRegistration}
                onChange={(e) => {
                  const val = e.target.value === '' ? 10 : Math.max(0, Math.min(100, Number(e.target.value)));
                  handleProtectedChange({ ...editingEvent, marketplaceFeePercent: val });
                }}
                className="w-full h-11 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-xl px-4 font-bold text-xs outline-none focus:border-sky-400"
              />
              <p className="text-[10px] text-slate-500 leading-relaxed">
                Exemplo: em uma inscrição de R$ 100,00, R${' '}
                {(100 * ((editingEvent.marketplaceFeePercent ?? 10) / 100)).toFixed(2)} fica com você (plataforma) e R${' '}
                {(100 * (1 - (editingEvent.marketplaceFeePercent ?? 10) / 100)).toFixed(2)} vai direto para a conta do organizador.
              </p>
            </div>
          </div>
        )}

        {(editingEvent.eventType === 'Ranking' || isRankingEvent(editingEvent)) && (
          <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-emerald-700 ml-1">Quantas partidas por time</label>
              <input
                type="number"
                min={0}
                value={editingEvent.rankingMatchesPerTeam ?? ''}
                disabled={isReadOnlyRegistration}
                onChange={(event) => {
                  const value = event.target.value ? Math.max(0, Number(event.target.value)) : undefined;
                  handleProtectedChange({ ...editingEvent, rankingMatchesPerTeam: value });
                }}
                placeholder="Sem limite"
                className="w-full h-12 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-emerald-200 rounded-xl px-4 font-black text-sm outline-none"
              />
            </div>
            <div className="rounded-xl border border-emerald-200 bg-white px-4 py-3">
              <p className="text-[10px] font-black text-emerald-700 uppercase">Pontuação do ranking</p>
              <p className="text-xs font-bold text-slate-600 mt-1">
                Vitória = 5 pts + 1 ponto para o saldo de games da partida. Derrota = 2 pts.
              </p>
            </div>
          </div>
        )}

        {isSuper8DuplasEvent(editingEvent) && (
          <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-amber-700 ml-1">Grupos por chave</label>
              <input
                type="number"
                min={1}
                max={8}
                value={editingEvent.groupsPerBracket ?? 2}
                disabled={isReadOnlyRegistration}
                onChange={(event) => {
                  const value = Math.max(1, Math.min(8, Number(event.target.value) || 2));
                  handleProtectedChange({ ...editingEvent, groupsPerBracket: value });
                }}
                placeholder="2"
                className="w-full h-12 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-amber-200 rounded-xl px-4 font-black text-sm outline-none"
              />
            </div>
            <div className="rounded-xl border border-amber-200 bg-white px-4 py-3 space-y-1">
              <p className="text-[10px] font-black text-amber-700 uppercase">Estrutura dos grupos</p>
              <p className="text-xs font-bold text-slate-600">
                {(() => {
                  const g = editingEvent.groupsPerBracket ?? 2;
                  const groupsA = Array.from({ length: g }, (_, i) => `A${i + 1}`).join(', ');
                  const groupsB = Array.from({ length: g }, (_, i) => `B${i + 1}`).join(', ');
                  return `Chave A: ${groupsA} · Chave B: ${groupsB} · ${g * 2} grupos · ${g * 2 * 4} jogadores`;
                })()}
              </p>
              <p className="text-[10px] text-slate-500">
                1° e 2° de cada grupo → Chave Ouro · 3° e 4° → Chave Prata
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 h-12">
          <span className="text-sm font-black text-slate-700">Set melhor de</span>
          <div className={`flex bg-slate-100 rounded-xl p-1 gap-1 ${isReadOnlyRegistration ? 'pointer-events-none opacity-80' : ''}`}>
            {([1, 3, 5] as const).map((num) => (
              <button
                key={num}
                type="button"
                disabled={isReadOnlyRegistration}
                onClick={() => handleProtectedChange({ ...editingEvent, setsCount: num })}
                className={`w-10 h-8 rounded-lg text-xs font-black transition-all ${(editingEvent.setsCount ?? 1) === num ? 'bg-blue-600 text-white shadow-md' : 'text-slate-700'}`}
              >
                {num}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 h-12">
          <span className="text-sm font-black text-slate-700">Games por set</span>
          <div className={`flex bg-slate-100 rounded-xl p-1 gap-1 ${isReadOnlyRegistration ? 'pointer-events-none opacity-80' : ''}`}>
            {([4, 6] as const).map((num) => (
              <button
                key={num}
                type="button"
                disabled={isReadOnlyRegistration}
                onClick={() => handleProtectedChange({
                  ...editingEvent,
                  gamesPerSet: num,
                  config: { ...editingEvent.config, gamesPerSet: num } as any,
                })}
                className={`w-10 h-8 rounded-lg text-xs font-black transition-all ${(editingEvent.gamesPerSet ?? (editingEvent.eventType === 'Super 8' ? 4 : 6)) === num ? 'bg-blue-600 text-white shadow-md' : 'text-slate-700'}`}
              >
                {num}
              </button>
            ))}
          </div>
        </div>

        {/* Sorteios */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 ml-1">Sorteio formação times</label>
            <select
              value={editingEvent.teamDrawType || 'Manual'}
              disabled={isReadOnlyRegistration}
              onChange={(event) => handleProtectedChange({ ...editingEvent, teamDrawType: event.target.value as DrawTypeOption })}
              className="w-full h-12 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-xl px-3 font-black text-xs outline-none cursor-pointer text-slate-700"
            >
              {DRAW_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 ml-1">Sorteio das chaves</label>
            <select
              value={editingEvent.bracketDrawType || 'Manual'}
              disabled={isReadOnlyRegistration}
              onChange={(event) => handleProtectedChange({ ...editingEvent, bracketDrawType: event.target.value as DrawTypeOption })}
              className="w-full h-12 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-xl px-3 font-black text-xs outline-none cursor-pointer text-slate-700"
            >
              {DRAW_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 ml-1">Sorteio das partidas</label>
          <select
            value={editingEvent.matchDrawType || 'Manual'}
            disabled={isReadOnlyRegistration}
            onChange={(event) => handleProtectedChange({ ...editingEvent, matchDrawType: event.target.value as DrawTypeOption })}
            className="w-full h-12 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-xl px-4 font-black text-sm outline-none cursor-pointer text-slate-700"
          >
            {DRAW_TYPE_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>

        {/* Toggles */}
        <div className="grid grid-cols-1 gap-3">
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-2">
            <Toggle
              id="event-show-registered-participants"
              label="Categoria com Inscrito"
              checked={editingEvent.showRegisteredParticipants === true}
              disabled={isReadOnlyRegistration}
              onChange={(checked) => handleProtectedChange({ ...editingEvent, showRegisteredParticipants: checked })}
            />
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-2">
            <Toggle
              id="event-allow-user-score-entry"
              label="Usuário lança placar"
              checked={editingEvent.allowUserScoreEntry === true}
              disabled={isReadOnlyRegistration}
              onChange={(checked) => handleProtectedChange({ ...editingEvent, allowUserScoreEntry: checked })}
            />
          </div>
        </div>

        {/* Banner do Evento */}
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 ml-1">Banner do evento (imagem)</label>
          <div className="flex gap-3">
            {!isReadOnlyRegistration && (
              <button
                type="button"
                onClick={() => bannerInputRef.current?.click()}
                className="flex-1 h-12 bg-white border border-slate-200 rounded-xl px-4 flex items-center justify-center gap-2 font-black text-xs text-slate-500 hover:bg-slate-50 active:scale-95"
              >
                <ImageIcon size={16} /> Carregar capa
              </button>
            )}
            {editingEvent.bannerUrl ? (
              <div className="w-12 h-12 rounded-xl overflow-hidden border border-slate-200 shrink-0">
                <img src={editingEvent.bannerUrl} className="w-full h-full object-cover" alt="Banner" />
              </div>
            ) : isReadOnlyRegistration ? (
              <p className="text-xs font-bold text-slate-400 italic">Nenhuma capa anexada</p>
            ) : null}
          </div>
        </div>

        {/* Quantidade de quadras e nomes */}
        <div className="space-y-1 pt-2 border-t border-slate-200">
          <label className="text-[10px] font-black text-slate-400 ml-1">Quantidade de quadras</label>
          <input
            type="number"
            min={0}
            value={editingEvent.courtsCount ?? ''}
            disabled={isReadOnlyRegistration}
            onChange={(e) => {
              const count = e.target.value ? Math.max(0, Number(e.target.value)) : undefined;
              const currentNames = editingEvent.courtNames || [];
              let newNames: string[] = [];
              if (count && count > 0) {
                newNames = Array.from({ length: count }, (_, i) => currentNames[i] || `Quadra ${i + 1}`);
              }
              handleProtectedChange({
                ...editingEvent,
                courtsCount: count,
                courtNames: newNames,
              });
            }}
            placeholder="ex: 4"
            className="w-full h-12 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-xl px-4 font-black text-sm outline-none"
          />
        </div>

        {editingEvent.courtsCount && editingEvent.courtsCount > 0 ? (
          <div className="space-y-2 bg-slate-100 p-3 rounded-2xl border border-slate-200">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block ml-1">
              Nomes das Quadras
            </label>
            <div className="grid grid-cols-1 gap-2">
              {Array.from({ length: editingEvent.courtsCount }).map((_, index) => {
                const currentNames = editingEvent.courtNames || [];
                const val = currentNames[index] !== undefined ? currentNames[index] : `Quadra ${index + 1}`;
                return (
                  <div key={index} className="flex items-center gap-2">
                    <span className="text-[11px] font-black text-slate-400 w-16 text-right shrink-0">
                      Quadra {index + 1}:
                    </span>
                    <input
                      type="text"
                      value={val}
                      disabled={isReadOnlyRegistration}
                      onChange={(e) => {
                        const updated = [...currentNames];
                        updated[index] = e.target.value;
                        handleProtectedChange({
                          ...editingEvent,
                          courtNames: updated,
                        });
                      }}
                      className="flex-1 h-9 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-lg px-3 font-bold text-xs outline-none"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      {/* Botões de Ação */}
      {isReadOnlyRegistration ? (
        <Button onClick={onClose} className="w-full !bg-slate-700 hover:!bg-slate-800 !py-4 rounded-xl font-black flex gap-2 text-white shadow-md active:scale-95 transition-all">
          <X size={18} /> Fechar visualização
        </Button>
      ) : (
        <Button onClick={onSaveEvent} disabled={isSavingEvent} className="w-full !bg-amber-500 !py-4 rounded-xl font-black flex gap-2 text-white">
          {isSavingEvent ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />} Salvar evento
        </Button>
      )}
    </div>
  );
};
