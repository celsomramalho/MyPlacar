import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  DollarSign,
  ExternalLink,
  Eye,
  FileText,
  Image as ImageIcon,
  Info,
  Loader2,
  MapPin,
  Menu,
  Save,
  Settings,
  Trophy,
  X,
} from 'lucide-react';
import {
  EVENT_STATUS_OPTIONS,
  EVENT_TYPE_OPTIONS,
  DRAW_TYPE_OPTIONS,
  TEAM_DRAW_TYPE_OPTIONS,
  EVENT_PAYMENT_TYPE_OPTIONS,
  EVENT_REGISTRATION_TYPE_OPTIONS,
  type EventStatusOption,
  type EventTypeOption,
  type DrawTypeOption,
  type TeamDrawTypeOption,
  type EventPaymentTypeOption,
  type EventRegistrationTypeOption,
  type TournamentEvent,
} from '@modules/events/types';
import { Button } from '@shared/components/Button';
import { Toggle } from '@shared/components/Toggle';
import { isRankingEvent, isSuper8DuplasEvent } from '@modules/events/services/eventTypeHelpers';
import { openPdfOrUrl } from '@modules/events/services/openRegulationPdf';
import { EventCoAdminsManager } from './EventCoAdminsManager';
import { EventMatchRulesEditor } from './EventMatchRulesEditor';
import { SPORT_GROUPS, SPORT_LIST } from '../../../../constants';
import type { FirebaseAdminSportIcon } from '@infra/firebase/adminIcons';
import type { EventSportRules } from '@modules/events/types';
import { getDefaultRulesForSport } from '@modules/events/domain/rules/eventMatchRules';

// ─── Bloco Accordion & Itens de Menu ──────────────────────────────────────────

export type EventConfigBlockKey =
  | 'evento'
  | 'configuracoes'
  | 'valores'
  | 'informacoes'
  | 'localizacao'
  | 'datas'
  | 'esporte';

export interface EventBlockMenuItem {
  key: EventConfigBlockKey;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  isAdminOnly?: boolean;
}

export const EVENT_CONFIG_BLOCKS: EventBlockMenuItem[] = [
  { key: 'evento', label: 'Evento', icon: Trophy, isAdminOnly: true },
  { key: 'configuracoes', label: 'Configurações', icon: Settings, isAdminOnly: true },
  { key: 'valores', label: 'Valores', icon: DollarSign, isAdminOnly: true },
  { key: 'informacoes', label: 'Informações', icon: Info, isAdminOnly: false },
  { key: 'localizacao', label: 'Localização', icon: MapPin, isAdminOnly: false },
  { key: 'datas', label: 'Datas', icon: CalendarDays, isAdminOnly: false },
  { key: 'esporte', label: 'Esporte', icon: Activity, isAdminOnly: false },
];

interface FormBlockProps {
  id?: string;
  title: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  isOpen: boolean;
  onToggle: () => void;
  isAdminOnly?: boolean;
  children: React.ReactNode;
}

const FormBlock: React.FC<FormBlockProps> = ({ id, title, icon: Icon, isOpen, onToggle, isAdminOnly, children }) => (
  <div id={id} className="rounded-2xl border border-slate-200 bg-white overflow-hidden scroll-mt-4">
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-slate-50 transition-colors cursor-pointer"
    >
      <div className="flex items-center gap-2.5">
        <Icon size={18} className="text-slate-600 shrink-0" />
        <span className="text-sm font-black text-slate-700">{title}</span>
        {isAdminOnly && (
          <span className="text-[10px] bg-amber-100 text-amber-700 font-black px-2 py-0.5 rounded-full">
            Admin
          </span>
        )}
      </div>
      <ChevronDown
        size={16}
        className={`text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
      />
    </button>
    {isOpen && (
      <div className="px-4 pb-4 pt-3 space-y-4 border-t border-slate-100">
        {children}
      </div>
    )}
  </div>
);

// ─── Props ────────────────────────────────────────────────────────────────────

export interface EventConfigFormProps {
  editingEvent: TournamentEvent;
  isReadOnlyRegistration: boolean;
  canManageEventAdmins: boolean;
  isSavingEvent: boolean;
  bannerInputRef: React.RefObject<HTMLInputElement>;
  coAdminNamesByPin: Record<string, string>;
  adminEmail?: string;
  initialBlock?: string;
  activeSports?: FirebaseAdminSportIcon[];
  onChangeEditingEvent: (event: TournamentEvent | null) => void;
  onSaveEvent: () => void;
  onClose: () => void;
}

// ─── Componente Principal ─────────────────────────────────────────────────────

export const EventConfigForm: React.FC<EventConfigFormProps> = ({
  editingEvent,
  isReadOnlyRegistration,
  canManageEventAdmins,
  isSavingEvent,
  bannerInputRef,
  coAdminNamesByPin,
  adminEmail,
  initialBlock,
  activeSports,
  onChangeEditingEvent,
  onSaveEvent,
  onClose,
}) => {
  const regulationInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // ── Esporte e Categoria do Esporte ──────────────────────────────────────────
  const allSports = React.useMemo(() => {
    if (activeSports && activeSports.length > 0) {
      return activeSports;
    }
    return SPORT_LIST.map((s) => ({
      id: s.id,
      name: s.name,
      url: s.defaultIcon || '',
      group: s.group,
      engine: s.engine,
      isActive: s.isActive,
    }));
  }, [activeSports]);

  const currentSportId = editingEvent.sportId || editingEvent.config?.sportType || 'beach-tennis';
  const currentSport = allSports.find((s) => s.id === currentSportId);
  const currentSportGroup = editingEvent.sportGroup || currentSport?.group || 'raquetes';

  const availableSportsForGroup = React.useMemo(() => {
    const list = allSports.filter((s) => (s.group || 'raquetes') === currentSportGroup);
    return list.length > 0 ? list : allSports;
  }, [allSports, currentSportGroup]);

  const handleSportGroupChange = (newGroup: string) => {
    const sportsInGroup = allSports.filter((s) => (s.group || 'raquetes') === newGroup);
    const firstSport = sportsInGroup[0];
    const newSportId = firstSport?.id || '';
    const newSportName = firstSport?.name || '';
    const defaultRules = getDefaultRulesForSport(newSportId);
    const newSportRules: EventSportRules = {
      defaultRules,
      customPhasesEnabled: false,
      phaseRules: {},
    };
    handleProtectedChange({
      ...editingEvent,
      sportGroup: newGroup,
      sportId: newSportId,
      sportName: newSportName,
      sportRules: newSportRules,
      setsCount: defaultRules.setsCount,
      gamesPerSet: defaultRules.gamesPerSet,
      config: {
        ...editingEvent.config,
        sportType: newSportId,
        sets: defaultRules.setsCount,
        gamesPerSet: defaultRules.gamesPerSet,
        noAd: defaultRules.noAd,
        tieBreak: defaultRules.tieBreak,
        tieBreakAt: defaultRules.tieBreakAt,
        tieBreakPoints: defaultRules.tieBreakPoints,
        tieBreakWinByTwo: defaultRules.tieBreakWinByTwo,
        switchSidesOdd: defaultRules.switchSidesOdd,
        pickleballScoringMode: defaultRules.pickleballScoringMode,
      } as any,
    });
  };

  const handleSportIdChange = (newSportId: string) => {
    const sportObj = allSports.find((s) => s.id === newSportId);
    const defaultRules = getDefaultRulesForSport(newSportId);
    const newSportRules: EventSportRules = {
      defaultRules,
      customPhasesEnabled: false,
      phaseRules: {},
    };
    handleProtectedChange({
      ...editingEvent,
      sportId: newSportId,
      sportName: sportObj?.name || '',
      sportGroup: sportObj?.group || currentSportGroup,
      sportRules: newSportRules,
      setsCount: defaultRules.setsCount,
      gamesPerSet: defaultRules.gamesPerSet,
      config: {
        ...editingEvent.config,
        sportType: newSportId,
        sets: defaultRules.setsCount,
        gamesPerSet: defaultRules.gamesPerSet,
        noAd: defaultRules.noAd,
        tieBreak: defaultRules.tieBreak,
        tieBreakAt: defaultRules.tieBreakAt,
        tieBreakPoints: defaultRules.tieBreakPoints,
        tieBreakWinByTwo: defaultRules.tieBreakWinByTwo,
        switchSidesOdd: defaultRules.switchSidesOdd,
        pickleballScoringMode: defaultRules.pickleballScoringMode,
      } as any,
    });
  };

  const handleSportRulesChange = (rules: EventSportRules) => {
    handleProtectedChange({
      ...editingEvent,
      sportRules: rules,
      setsCount: rules.defaultRules.setsCount,
      gamesPerSet: rules.defaultRules.gamesPerSet,
      config: {
        ...editingEvent.config,
        sportType: editingEvent.sportId || editingEvent.config?.sportType || 'beach-tennis',
        sets: rules.defaultRules.setsCount,
        gamesPerSet: rules.defaultRules.gamesPerSet,
        noAd: rules.defaultRules.noAd,
        tieBreak: rules.defaultRules.tieBreak,
        tieBreakAt: rules.defaultRules.tieBreakAt,
        tieBreakPoints: rules.defaultRules.tieBreakPoints,
        tieBreakWinByTwo: rules.defaultRules.tieBreakWinByTwo,
        switchSidesOdd: rules.defaultRules.switchSidesOdd,
        pickleballScoringMode: rules.defaultRules.pickleballScoringMode,
      } as any,
    });
  };
  const [organizerStatus, setOrganizerStatus] = useState<{
    loading: boolean;
    connected?: boolean;
    userId?: string;
    checkedEmail?: string;
  }>({ loading: false });

  // ── Permissões ───────────────────────────────────────────────────────────────
  // Blocos 1 (Evento), 2 (Configurações) e 3 (Valores) são exclusivos do admin global
  const isGlobalAdmin = adminEmail === 'celsomramalho@gmail.com';
  const isAdminOnlyDisabled = !isGlobalAdmin || isReadOnlyRegistration;

  // ── Estado das seções: inicialmente fechados (ou abre apenas o initialBlock) ─
  const [openSections, setOpenSections] = useState({
    evento: initialBlock === 'evento',
    configuracoes: initialBlock === 'configuracoes',
    valores: initialBlock === 'valores',
    informacoes: initialBlock === 'informacoes',
    localizacao: initialBlock === 'localizacao',
    datas: initialBlock === 'datas',
    esporte: initialBlock === 'esporte',
  });

  useEffect(() => {
    if (initialBlock) {
      setOpenSections({
        evento: initialBlock === 'evento',
        configuracoes: initialBlock === 'configuracoes',
        valores: initialBlock === 'valores',
        informacoes: initialBlock === 'informacoes',
        localizacao: initialBlock === 'localizacao',
        datas: initialBlock === 'datas',
        esporte: initialBlock === 'esporte',
      });
      setTimeout(() => {
        document.getElementById(`event-block-${initialBlock}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [initialBlock]);

  // Fecha menu ao clicar fora
  useEffect(() => {
    if (!isMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen]);

  const toggleSection = (key: keyof typeof openSections) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleSelectBlockFromMenu = (blockKey: EventConfigBlockKey) => {
    setOpenSections({
      evento: false,
      configuracoes: false,
      valores: false,
      informacoes: false,
      localizacao: false,
      datas: false,
      esporte: false,
      [blockKey]: true,
    });
    setIsMenuOpen(false);
    setTimeout(() => {
      document.getElementById(`event-block-${blockKey}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  // ── Status Mercado Pago ───────────────────────────────────────────────────────
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

  // ── Handlers ──────────────────────────────────────────────────────────────────
  const handleProtectedChange = (updated: TournamentEvent | null) => {
    if (isReadOnlyRegistration && updated !== null) return;
    onChangeEditingEvent(updated);
  };

  const handleAddCoAdmin = (pin: string) => {
    const currentAdmins = (editingEvent.coAdminPins || []).map((p) => p.toUpperCase().trim());
    if (currentAdmins.includes(pin)) return;
    handleProtectedChange({ ...editingEvent, coAdminPins: [...currentAdmins, pin] });
  };

  const handleRemoveCoAdmin = (pin: string) => {
    handleProtectedChange({
      ...editingEvent,
      coAdminPins: (editingEvent.coAdminPins || []).filter(
        (p) => p.toUpperCase().trim() !== pin.toUpperCase().trim()
      ),
    });
  };

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="bg-slate-50 p-4 rounded-[2.5rem] border border-slate-200 space-y-3 animate-in slide-in-from-top-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <h4 className="text-sm font-black text-slate-800 tracking-tight">
          {isReadOnlyRegistration ? 'Visualizar cadastro do evento' : 'Configurar evento'}
        </h4>
        <div className="flex items-center gap-2">
          {/* Menu Dropdown de Acesso aos Blocos */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setIsMenuOpen((prev) => !prev)}
              className="w-10 h-10 bg-slate-100 text-slate-700 rounded-full flex items-center justify-center hover:bg-slate-200 active:scale-95 transition-all cursor-pointer"
              title="Acessar blocos do evento"
            >
              <Menu size={18} />
            </button>
            {isMenuOpen && (
              <div className="absolute right-0 top-12 w-56 bg-white rounded-2xl shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in zoom-in-95">
                <div className="px-3 py-1.5 border-b border-slate-100 mb-1">
                  <p className="text-[10px] font-black text-slate-400 tracking-wider">Acessar bloco</p>
                </div>
                {EVENT_CONFIG_BLOCKS.map((block) => {
                  const BlockIcon = block.icon;
                  return (
                    <button
                      key={block.key}
                      type="button"
                      onClick={() => handleSelectBlockFromMenu(block.key)}
                      className="w-full flex items-center justify-between px-3.5 py-2.5 text-left hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <BlockIcon size={16} className="text-slate-500 shrink-0" />
                        <span className="text-xs font-black text-slate-700">{block.label}</span>
                      </div>
                      {block.isAdminOnly && (
                        <span className="text-[9px] bg-amber-100 text-amber-700 font-black px-1.5 py-0.5 rounded-full">
                          Admin
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <button
            onClick={onClose}
            className="w-10 h-10 bg-slate-100 text-slate-700 rounded-full flex items-center justify-center hover:bg-slate-200 active:scale-95 transition-all cursor-pointer"
            title="Recolher configuração"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* 1. EVENTO — somente admin global                                      */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <FormBlock
        id="event-block-evento"
        title="Evento"
        icon={Trophy}
        isOpen={openSections.evento}
        onToggle={() => toggleSection('evento')}
        isAdminOnly
      >
        {/* Evento ativo */}
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-2">
          <Toggle
            id="event-active"
            label="Evento ativo"
            checked={editingEvent.active}
            disabled={isAdminOnlyDisabled}
            onChange={(checked) => handleProtectedChange({ ...editingEvent, active: checked })}
          />
        </div>

        {/* Nome do evento */}
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 ml-1">Nome do evento</label>
          <input
            type="text"
            value={editingEvent.name}
            disabled={isAdminOnlyDisabled}
            onChange={(e) => handleProtectedChange({ ...editingEvent, name: e.target.value })}
            placeholder="Nome do evento"
            className="w-full h-12 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-xl px-4 font-black text-sm outline-none"
          />
        </div>

        {/* PIN */}
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 ml-1">Pin exclusivo (ex: CarmoFev26)</label>
          <input
            type="text"
            value={editingEvent.pin}
            disabled={isAdminOnlyDisabled}
            onChange={(e) => handleProtectedChange({ ...editingEvent, pin: e.target.value })}
            placeholder="Pin do evento"
            className="w-full h-12 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-xl px-4 font-black text-sm outline-none"
          />
        </div>

        {/* Status */}
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 ml-1">Status</label>
          <select
            value={editingEvent.eventStatus || 'Em configuração'}
            disabled={isAdminOnlyDisabled}
            onChange={(e) =>
              handleProtectedChange({ ...editingEvent, eventStatus: e.target.value as EventStatusOption })
            }
            className="w-full h-12 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-xl px-3 font-black text-xs outline-none cursor-pointer text-slate-700"
          >
            {EVENT_STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>
      </FormBlock>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* 2. CONFIGURAÇÕES — somente admin global                               */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <FormBlock
        id="event-block-configuracoes"
        title="Configurações"
        icon={Settings}
        isOpen={openSections.configuracoes}
        onToggle={() => toggleSection('configuracoes')}
        isAdminOnly
      >
        {/* Tipo de evento */}
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 ml-1">Tipo de evento</label>
          <select
            value={editingEvent.eventType || (isRankingEvent(editingEvent) ? 'Ranking' : 'Chave mata-mata')}
            disabled={isAdminOnlyDisabled}
            onChange={(e) =>
              handleProtectedChange({ ...editingEvent, eventType: e.target.value as EventTypeOption })
            }
            className="w-full h-12 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-xl px-3 font-black text-xs outline-none cursor-pointer text-slate-700"
          >
            {EVENT_TYPE_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>

        {/* Config Ranking - condicional exclusivo se for do tipo Ranking */}
        {(editingEvent.eventType ? editingEvent.eventType === 'Ranking' : isRankingEvent(editingEvent)) && (
          <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-emerald-700 ml-1">Quantas partidas por time</label>
              <input
                type="number"
                min={0}
                value={editingEvent.rankingMatchesPerTeam ?? ''}
                disabled={isAdminOnlyDisabled}
                onChange={(e) => {
                  const value = e.target.value ? Math.max(0, Number(e.target.value)) : undefined;
                  handleProtectedChange({ ...editingEvent, rankingMatchesPerTeam: value });
                }}
                placeholder="Sem limite"
                className="w-full h-12 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-emerald-200 rounded-xl px-4 font-black text-sm outline-none"
              />
            </div>
            <div className="rounded-xl border border-emerald-200 bg-white px-4 py-3">
              <p className="text-[10px] font-black text-emerald-700">Pontuação do ranking</p>
              <p className="text-xs font-bold text-slate-600 mt-1">
                Vitória = 5 pts + 1 ponto para o saldo de games da partida. Derrota = 2 pts.
              </p>
            </div>
          </div>
        )}

        {/* Config Super 8 Duplas */}
        {isSuper8DuplasEvent(editingEvent) && (
          <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-amber-700 ml-1">Grupos por chave</label>
              <input
                type="number"
                min={1}
                max={8}
                value={editingEvent.groupsPerBracket ?? 2}
                disabled={isAdminOnlyDisabled}
                onChange={(e) => {
                  const value = Math.max(1, Math.min(8, Number(e.target.value) || 2));
                  handleProtectedChange({ ...editingEvent, groupsPerBracket: value });
                }}
                placeholder="2"
                className="w-full h-12 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-amber-200 rounded-xl px-4 font-black text-sm outline-none"
              />
            </div>
            <div className="rounded-xl border border-amber-200 bg-white px-4 py-3 space-y-1">
              <p className="text-[10px] font-black text-amber-700">Estrutura dos grupos</p>
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

        {/* Separador: Inscrição */}
        <p className="text-[10px] font-black text-slate-400 tracking-wider pt-1 border-t border-slate-100">Inscrição</p>

        {/* Tipo inscrição + Tipo pagamento */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 ml-1">Tipo inscrição</label>
            <select
              value={editingEvent.registrationType || 'App'}
              disabled={isAdminOnlyDisabled}
              onChange={(e) =>
                handleProtectedChange({ ...editingEvent, registrationType: e.target.value as EventRegistrationTypeOption })
              }
              className="w-full h-12 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-xl px-3 font-black text-xs outline-none cursor-pointer text-slate-700"
            >
              {EVENT_REGISTRATION_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 ml-1">Tipo pagamento</label>
            <select
              value={editingEvent.paymentType || 'manual'}
              disabled={isAdminOnlyDisabled}
              onChange={(e) =>
                handleProtectedChange({ ...editingEvent, paymentType: e.target.value as EventPaymentTypeOption })
              }
              className="w-full h-12 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-xl px-3 font-black text-xs outline-none cursor-pointer text-slate-700"
            >
              {EVENT_PAYMENT_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Mercado Pago */}
        {editingEvent.paymentType === 'mercadopago' && (
          <div className="space-y-4 rounded-2xl border border-sky-200 bg-sky-50/50 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-sky-900 flex items-center gap-1.5">
                ⚡ Mercado Pago Split &amp; Marketplace
              </span>
              <span className="text-[10px] bg-sky-100 text-sky-700 font-bold px-2 py-0.5 rounded-full">
                Pix automático
              </span>
            </div>

            {/* Organizador */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black text-slate-600 ml-1">
                  E-mail do organizador (recebedor principal)
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
                disabled={isAdminOnlyDisabled}
                onChange={(e) =>
                  handleProtectedChange({ ...editingEvent, organizerEmail: e.target.value.toLowerCase().trim() })
                }
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
                        <span className="text-[10px] font-normal text-emerald-600">
                          (ID: {organizerStatus.userId})
                        </span>
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
                ) : (editingEvent.organizerEmail || '').trim().toLowerCase() ===
                    (adminEmail || '').trim().toLowerCase() && editingEvent.organizerEmail ? null : (
                  <div className="space-y-2 bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 font-bold">
                    <div className="flex items-center gap-1.5">
                      <AlertTriangle size={15} className="text-amber-600 shrink-0" />
                      <span>Organizador ainda não conectou o Mercado Pago</span>
                    </div>
                    <p className="text-[11px] font-medium text-amber-800 leading-relaxed">
                      Para que o dinheiro das inscrições caia direto na conta do organizador com o split da sua
                      taxa, é necessário autorizar a conexão uma única vez.
                    </p>
                    <a
                      href={`/api/mercadopago-oauth-start?adminEmail=${encodeURIComponent(
                        editingEvent.organizerEmail || adminEmail || ''
                      )}`}
                      className="inline-flex items-center justify-center gap-2 w-full py-2.5 bg-sky-500 hover:bg-sky-600 active:scale-95 text-white font-black text-xs rounded-xl shadow transition-all"
                    >
                      <ExternalLink size={14} />
                      Conectar Mercado Pago deste organizador
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* Taxa da Plataforma */}
            <div className="space-y-1.5 pt-1 border-t border-sky-100">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black text-slate-600 ml-1">Taxa da plataforma (%)</label>
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
                disabled={isAdminOnlyDisabled}
                onChange={(e) => {
                  const val =
                    e.target.value === '' ? 10 : Math.max(0, Math.min(100, Number(e.target.value)));
                  handleProtectedChange({ ...editingEvent, marketplaceFeePercent: val });
                }}
                className="w-full h-11 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-xl px-4 font-bold text-xs outline-none focus:border-sky-400"
              />
              <p className="text-[10px] text-slate-500 leading-relaxed">
                Exemplo: em uma inscrição de R$ 100,00, R${' '}
                {(100 * ((editingEvent.marketplaceFeePercent ?? 10) / 100)).toFixed(2)} fica com você
                (plataforma) e R${' '}
                {(100 * (1 - (editingEvent.marketplaceFeePercent ?? 10) / 100)).toFixed(2)} vai direto
                para a conta do organizador.
              </p>
            </div>
          </div>
        )}

        {/* Separador: Times */}
        <p className="text-[10px] font-black text-slate-400 tracking-wider pt-1 border-t border-slate-100">Times &amp; sorteios</p>

        {/* Formação times */}
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 ml-1">Formação times</label>
          <select
            value={editingEvent.teamDrawType || 'Manual'}
            disabled={isAdminOnlyDisabled}
            onChange={(e) =>
              handleProtectedChange({ ...editingEvent, teamDrawType: e.target.value as TeamDrawTypeOption })
            }
            className="w-full h-12 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-xl px-3 font-black text-xs outline-none cursor-pointer text-slate-700"
          >
            {TEAM_DRAW_TYPE_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>

        {/* Sorteio das chaves + partidas */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 ml-1">Sorteio das chaves</label>
            <select
              value={editingEvent.bracketDrawType || 'Manual'}
              disabled={isAdminOnlyDisabled}
              onChange={(e) =>
                handleProtectedChange({ ...editingEvent, bracketDrawType: e.target.value as DrawTypeOption })
              }
              className="w-full h-12 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-xl px-3 font-black text-xs outline-none cursor-pointer text-slate-700"
            >
              {DRAW_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 ml-1">Sorteio das partidas</label>
            <select
              value={editingEvent.matchDrawType || 'Manual'}
              disabled={isAdminOnlyDisabled}
              onChange={(e) =>
                handleProtectedChange({ ...editingEvent, matchDrawType: e.target.value as DrawTypeOption })
              }
              className="w-full h-12 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-xl px-3 font-black text-xs outline-none cursor-pointer text-slate-700"
            >
              {DRAW_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Toggles */}
        <div className="grid grid-cols-1 gap-3">
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-2">
            <Toggle
              id="event-allow-user-team-formation"
              label="Usuário forma time"
              checked={editingEvent.allowUserTeamFormation === true}
              disabled={isAdminOnlyDisabled}
              onChange={(checked) =>
                handleProtectedChange({ ...editingEvent, allowUserTeamFormation: checked })
              }
            />
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-2">
            <Toggle
              id="event-allow-user-score-entry"
              label="Usuário lança placar"
              checked={editingEvent.allowUserScoreEntry === true}
              disabled={isAdminOnlyDisabled}
              onChange={(checked) =>
                handleProtectedChange({ ...editingEvent, allowUserScoreEntry: checked })
              }
            />
          </div>
        </div>

        {/* Separador: Quadras */}
        <p className="text-[10px] font-black text-slate-400 tracking-wider pt-1 border-t border-slate-100">Jogadores &amp; quadras</p>

        {/* Limite jogadores por categoria */}
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 ml-1">
            Limite de jogadores por categoria (padrão)
          </label>
          <input
            type="number"
            min={1}
            disabled={isAdminOnlyDisabled}
            value={editingEvent.maxPlayersPerCategory ?? 8}
            onChange={(e) =>
              handleProtectedChange({
                ...editingEvent,
                maxPlayersPerCategory: e.target.value ? Math.max(1, Number(e.target.value)) : 8,
              })
            }
            placeholder="8"
            className="w-full h-12 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-xl px-4 font-black text-sm outline-none"
          />
        </div>

        {/* Quantidade de quadras */}
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 ml-1">Quantidade de quadras</label>
          <input
            type="number"
            min={0}
            value={editingEvent.courtsCount ?? ''}
            disabled={isAdminOnlyDisabled}
            onChange={(e) => {
              const count = e.target.value ? Math.max(0, Number(e.target.value)) : undefined;
              const currentNames = editingEvent.courtNames || [];
              const newNames =
                count && count > 0
                  ? Array.from({ length: count }, (_, i) => currentNames[i] || `Quadra ${i + 1}`)
                  : [];
              handleProtectedChange({ ...editingEvent, courtsCount: count, courtNames: newNames });
            }}
            placeholder="ex: 4"
            className="w-full h-12 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-xl px-4 font-black text-sm outline-none"
          />
        </div>

        {editingEvent.courtsCount && editingEvent.courtsCount > 0 ? (
          <div className="space-y-2 bg-slate-100 p-3 rounded-2xl border border-slate-200">
            <label className="text-[10px] font-black text-slate-500 tracking-wider block ml-1">
              Nomes das quadras
            </label>
            <div className="grid grid-cols-1 gap-2">
              {Array.from({ length: editingEvent.courtsCount }).map((_, index) => {
                const currentNames = editingEvent.courtNames || [];
                const val =
                  currentNames[index] !== undefined ? currentNames[index] : `Quadra ${index + 1}`;
                return (
                  <div key={index} className="flex items-center gap-2">
                    <span className="text-[11px] font-black text-slate-400 w-16 text-right shrink-0">
                      Quadra {index + 1}:
                    </span>
                    <input
                      type="text"
                      value={val}
                      disabled={isAdminOnlyDisabled}
                      onChange={(e) => {
                        const updated = [...currentNames];
                        updated[index] = e.target.value;
                        handleProtectedChange({ ...editingEvent, courtNames: updated });
                      }}
                      className="flex-1 h-9 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-lg px-3 font-bold text-xs outline-none"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Separador: Co-admins */}
        <p className="text-[10px] font-black text-slate-400 tracking-wider pt-1 border-t border-slate-100">Co-administradores</p>

        <EventCoAdminsManager
          coAdminPins={editingEvent.coAdminPins || []}
          coAdminNamesByPin={coAdminNamesByPin}
          canManageEventAdmins={canManageEventAdmins}
          isReadOnlyRegistration={isReadOnlyRegistration}
          onAddCoAdmin={handleAddCoAdmin}
          onRemoveCoAdmin={handleRemoveCoAdmin}
        />
      </FormBlock>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* 3. VALORES — somente admin global                                     */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <FormBlock
        id="event-block-valores"
        title="Valores"
        icon={DollarSign}
        isOpen={openSections.valores}
        onToggle={() => toggleSection('valores')}
        isAdminOnly
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 ml-1">Valor inscrição (R$)</label>
            <input
              type="number"
              step="0.01"
              min={0}
              disabled={isAdminOnlyDisabled}
              value={editingEvent.registrationFee ?? ''}
              onChange={(e) =>
                handleProtectedChange({
                  ...editingEvent,
                  registrationFee: e.target.value ? Number(e.target.value) : undefined,
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
              disabled={isAdminOnlyDisabled}
              value={editingEvent.extraCategoryFee ?? ''}
              onChange={(e) =>
                handleProtectedChange({
                  ...editingEvent,
                  extraCategoryFee: e.target.value ? Number(e.target.value) : undefined,
                })
              }
              placeholder="0,00"
              className="w-full h-12 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-xl px-3 font-black text-xs outline-none"
            />
          </div>
        </div>
      </FormBlock>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* 4. INFORMAÇÕES — co-admin pode editar                                 */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <FormBlock
        id="event-block-informacoes"
        title="Informações"
        icon={Info}
        isOpen={openSections.informacoes}
        onToggle={() => toggleSection('informacoes')}
      >
        {/* Banner */}
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

        {/* Regulamento PDF */}
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 ml-1">Regulamento (PDF)</label>
          {isReadOnlyRegistration ? (
            editingEvent.regulationUrl ? (
              <button
                type="button"
                onClick={() =>
                  openPdfOrUrl(
                    editingEvent.regulationUrl!,
                    editingEvent.regulationFileName || 'regulamento.pdf'
                  )
                }
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
                  onClick={() =>
                    openPdfOrUrl(
                      editingEvent.regulationUrl!,
                      editingEvent.regulationFileName || 'regulamento.pdf'
                    )
                  }
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

        {/* Informações do evento */}
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 ml-1">Informações do evento</label>
          <textarea
            rows={5}
            value={editingEvent.information || ''}
            disabled={isReadOnlyRegistration}
            onChange={(e) => handleProtectedChange({ ...editingEvent, information: e.target.value })}
            placeholder="Orientações e informações para os participantes"
            className="w-full bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-xl px-4 py-3 font-bold text-xs outline-none resize-y"
          />
        </div>
      </FormBlock>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* 5. LOCALIZAÇÃO — co-admin pode editar                                 */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <FormBlock
        id="event-block-localizacao"
        title="Localização"
        icon={MapPin}
        isOpen={openSections.localizacao}
        onToggle={() => toggleSection('localizacao')}
      >
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 ml-1">Local (clube / cidade)</label>
          <input
            type="text"
            value={editingEvent.location || ''}
            disabled={isReadOnlyRegistration}
            onChange={(e) => handleProtectedChange({ ...editingEvent, location: e.target.value })}
            placeholder="ex: Clube Carmo - Belo Horizonte"
            className="w-full h-12 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-xl px-4 font-black text-sm outline-none"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 ml-1">Link do endereço (Google Maps)</label>
          <input
            type="url"
            value={editingEvent.locationMapUrl || ''}
            disabled={isReadOnlyRegistration}
            onChange={(e) => handleProtectedChange({ ...editingEvent, locationMapUrl: e.target.value })}
            placeholder="https://maps.google.com/..."
            className="w-full h-12 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-xl px-4 font-bold text-xs outline-none"
          />
        </div>
      </FormBlock>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* 6. DATAS — co-admin pode editar                                       */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <FormBlock
        id="event-block-datas"
        title="Datas"
        icon={CalendarDays}
        isOpen={openSections.datas}
        onToggle={() => toggleSection('datas')}
      >
        {/* Data do Evento texto */}
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 ml-1">Data do evento</label>
          <input
            type="text"
            value={editingEvent.eventDateText || ''}
            disabled={isReadOnlyRegistration}
            onChange={(e) => handleProtectedChange({ ...editingEvent, eventDateText: e.target.value })}
            placeholder="ex: 15 a 17 de março"
            className="w-full h-12 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-xl px-4 font-black text-sm outline-none"
          />
        </div>

        {/* Período de inscrição */}
        <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
          <p className="text-[10px] font-black text-slate-500 tracking-wider">Período de inscrição</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 ml-1">Início</label>
              <input
                type="date"
                value={editingEvent.startDate || ''}
                disabled={isReadOnlyRegistration}
                onChange={(e) => handleProtectedChange({ ...editingEvent, startDate: e.target.value })}
                className="w-full h-12 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-xl px-3 font-black text-xs outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 ml-1">Fim</label>
              <input
                type="date"
                value={editingEvent.endDate || ''}
                disabled={isReadOnlyRegistration}
                onChange={(e) => handleProtectedChange({ ...editingEvent, endDate: e.target.value })}
                className="w-full h-12 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-xl px-3 font-black text-xs outline-none"
              />
            </div>
          </div>
        </div>

        {/* Período do torneio */}
        <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
          <p className="text-[10px] font-black text-slate-500 tracking-wider">Período do torneio</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 ml-1">Início</label>
              <input
                type="date"
                value={editingEvent.tournamentStartDate || ''}
                disabled={isReadOnlyRegistration}
                onChange={(e) =>
                  handleProtectedChange({ ...editingEvent, tournamentStartDate: e.target.value })
                }
                className="w-full h-12 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-xl px-3 font-black text-xs outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 ml-1">Fim</label>
              <input
                type="date"
                value={editingEvent.tournamentEndDate || ''}
                disabled={isReadOnlyRegistration}
                onChange={(e) =>
                  handleProtectedChange({ ...editingEvent, tournamentEndDate: e.target.value })
                }
                className="w-full h-12 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-xl px-3 font-black text-xs outline-none"
              />
            </div>
          </div>
        </div>
      </FormBlock>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* 7. ESPORTE — co-admin pode editar                                     */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <FormBlock
        id="event-block-esporte"
        title="Esporte"
        icon={Activity}
        isOpen={openSections.esporte}
        onToggle={() => toggleSection('esporte')}
      >
        {/* Categoria e Esporte (simples, no início do bloco) */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 ml-1">Categoria</label>
            <select
              value={currentSportGroup}
              disabled={isReadOnlyRegistration}
              onChange={(e) => handleSportGroupChange(e.target.value)}
              className="w-full h-12 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-xl px-3 font-black text-xs outline-none cursor-pointer text-slate-700"
            >
              {SPORT_GROUPS.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 ml-1">Esporte</label>
            <select
              value={currentSportId}
              disabled={isReadOnlyRegistration}
              onChange={(e) => handleSportIdChange(e.target.value)}
              className="w-full h-12 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-xl px-3 font-black text-xs outline-none cursor-pointer text-slate-700"
            >
              {availableSportsForGroup.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Editor de Regras da Partida (Padrão e por Fase) */}
        <EventMatchRulesEditor
          sportRules={editingEvent.sportRules}
          sportId={currentSportId}
          isReadOnly={isReadOnlyRegistration}
          onChangeSportRules={handleSportRulesChange}
        />
      </FormBlock>

      {/* ── Botões de Ação ────────────────────────────────────────────────────── */}
      {isReadOnlyRegistration ? (
        <Button
          onClick={onClose}
          className="w-full !bg-slate-700 hover:!bg-slate-800 !py-4 rounded-xl font-black flex gap-2 text-white shadow-md active:scale-95 transition-all"
        >
          <X size={18} /> Fechar visualização
        </Button>
      ) : (
        <Button
          onClick={onSaveEvent}
          disabled={isSavingEvent}
          className="w-full !bg-amber-500 !py-4 rounded-xl font-black flex gap-2 text-white"
        >
          {isSavingEvent ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />} Salvar evento
        </Button>
      )}
    </div>
  );
};
