import React, { useState } from 'react';
import { Users, UserPlus, Phone, Mail, UserCheck } from 'lucide-react';
import type { EventCategory, CategoryPartnerInfo, TournamentEntry, TournamentPair } from '@modules/events/types';

export interface PartnerSelectionStepProps {
  categories: EventCategory[];
  selectedCategoryIds: string[];
  categoryPartners: Record<string, CategoryPartnerInfo>;
  updateCategoryPartner: (categoryId: string, partner: CategoryPartnerInfo) => void;
  isTeamDrawPreDefined?: boolean;
  allowUserTeamFormation?: boolean;
  readOnly?: boolean;
  /** Retorna o TournamentEntry do parceiro já inscrito no e-mail informado */
  getPartnerEntryForCategory?: (categoryId: string, partnerEmail: string) => TournamentEntry | undefined;
  /** Retorna o par já formado para o atleta nessa categoria */
  getPairForCategory?: (categoryId: string) => TournamentPair | undefined;
  /** Retorna o par já formado para o e-mail do parceiro nessa categoria */
  getPairForEmailInCategory?: (email: string, categoryId: string) => TournamentPair | undefined;
  /** Chamado quando o atleta confirma a formação do time */
  onFormTeam?: (categoryId: string, partnerEntry: TournamentEntry) => Promise<void>;
  /** Se o atleta atual está cancelado/desativado */
  isSelfCancelled?: boolean;
}

const formatPhone = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (!digits) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

export const PartnerSelectionStep: React.FC<PartnerSelectionStepProps> = ({
  categories,
  selectedCategoryIds,
  categoryPartners,
  updateCategoryPartner,
  isTeamDrawPreDefined = true,
  allowUserTeamFormation = false,
  readOnly = false,
  getPartnerEntryForCategory,
  getPairForCategory,
  getPairForEmailInCategory,
  onFormTeam,
  isSelfCancelled = false,
}) => {
  const [isForming, setIsForming] = useState(false);

  const doublesCategories = categories.filter(
    (c) => selectedCategoryIds.includes(c.id) && c.format === 'Duplas'
  );

  if ((!isTeamDrawPreDefined && !allowUserTeamFormation) || doublesCategories.length === 0) return null;

  const handleFormTeam = async (categoryId: string, partnerEntry: TournamentEntry) => {
    if (!onFormTeam || isForming) return;
    setIsForming(true);
    try {
      await onFormTeam(categoryId, partnerEntry);
    } catch (err) {
      console.error('[PartnerSelectionStep] Erro ao formar time:', err);
    } finally {
      setIsForming(false);
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <div className="border-b border-slate-100 pb-3">
        <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
          <Users size={18} className="text-blue-600" />
          Indicação de parceiro(a)
        </h3>
        <p className="text-xs text-slate-400 font-bold mt-0.5">
          {isTeamDrawPreDefined
            ? 'Este evento exige duplas pré-definidas. Preencha todos os dados obrigatórios do seu parceiro(a).'
            : 'A formação de duplas deste evento é manual ou por sorteio. Os dados do parceiro são opcionais.'}
        </p>
      </div>

      <div className="space-y-4">
        {doublesCategories.map((cat) => {
          const partner = categoryPartners[cat.id] || { name: '', email: '', phone: '' };
          const existingPair = getPairForCategory?.(cat.id);
          const partnerEntry = getPartnerEntryForCategory?.(cat.id, partner.email);
          const partnerAlreadyPaired = partner.email
            ? getPairForEmailInCategory?.(partner.email, cat.id)
            : undefined;
          const isPartnerCancelled = Boolean(
            partnerEntry?.disabled || partnerEntry?.paymentStatus === 'Cancelado'
          );

          // O botão "Formar time" aparece quando:
          // – o atleta não está cancelado
          // – o callback onFormTeam foi fornecido (modo user com onUpdateEvent)
          // – o parceiro foi encontrado como inscrito nessa categoria
          // – o parceiro NÃO está cancelado
          // – ainda NÃO há par formado para o atleta nessa categoria
          // – o parceiro NÃO está em outro par na mesma categoria
          const canShowFormTeam = Boolean(
            !isSelfCancelled &&
            onFormTeam &&
            partnerEntry &&
            !isPartnerCancelled &&
            !existingPair &&
            !partnerAlreadyPaired
          );

          const handleChange = (field: keyof CategoryPartnerInfo, val: string) => {
            if (readOnly) return;
            const registeredPartner = field === 'email'
              ? getPartnerEntryForCategory?.(cat.id, val.trim())
              : undefined;
            updateCategoryPartner(cat.id, {
              ...partner,
              [field]: field === 'phone' ? formatPhone(val) : val,
              ...(registeredPartner
                ? {
                    name: registeredPartner.name,
                    phone: formatPhone(registeredPartner.phone || ''),
                  }
                : {}),
            });
          };

          return (
            <div
              key={cat.id}
              className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3"
            >
              {/* Cabeçalho da categoria */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div>
                  <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md tracking-wider">
                    {cat.abbreviation || 'Duplas'}
                  </span>
                  <h4 className="text-sm font-black text-slate-800 mt-1">{cat.name}</h4>
                </div>
                {existingPair ? (
                  <span className="flex items-center gap-1.5 text-[10px] font-black text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200/60">
                    <UserCheck size={12} />
                    {existingPair.teamCode || `Time ${existingPair.teamNumber || ''}`}
                  </span>
                ) : (
                  <UserPlus size={16} className="text-slate-400" />
                )}
              </div>

              {/* Campos do parceiro */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* E-mail */}
                <div className="space-y-1">
                  <label className="text-[11px] font-black text-slate-600 flex items-center gap-1">
                    <Mail size={12} className="text-slate-400" />
                    E-mail do parceiro
                    {isTeamDrawPreDefined ? (
                      <span className="text-rose-500 font-black">*</span>
                    ) : (
                      <span className="text-slate-400 font-bold text-[10px]">(opcional)</span>
                    )}
                  </label>
                  <input
                    type="email"
                    disabled={readOnly || Boolean(existingPair)}
                    required={isTeamDrawPreDefined}
                    value={partner.email}
                    onChange={(e) => handleChange('email', e.target.value)}
                    placeholder="parceiro@email.com"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-xs font-bold text-slate-800 bg-white disabled:bg-slate-50 outline-none"
                  />
                </div>

                {/* Nome */}
                <div className="space-y-1 sm:col-span-1">
                  <label className="text-[11px] font-black text-slate-600 flex items-center gap-1">
                    Nome do parceiro(a)
                    {isTeamDrawPreDefined ? (
                      <span className="text-rose-500 font-black">*</span>
                    ) : (
                      <span className="text-slate-400 font-bold text-[10px]">(opcional)</span>
                    )}
                  </label>
                  <input
                    type="text"
                    disabled={readOnly || Boolean(existingPair)}
                    required={isTeamDrawPreDefined}
                    value={partner.name}
                    onChange={(e) => handleChange('name', e.target.value)}
                    placeholder="Nome completo"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-xs font-bold text-slate-800 bg-white disabled:bg-slate-50 outline-none"
                  />
                </div>

                {/* WhatsApp */}
                <div className="space-y-1">
                  <label className="text-[11px] font-black text-slate-600 flex items-center gap-1">
                    <Phone size={12} className="text-slate-400" />
                    WhatsApp
                    {isTeamDrawPreDefined ? (
                      <span className="text-rose-500 font-black">*</span>
                    ) : (
                      <span className="text-slate-400 font-bold text-[10px]">(opcional)</span>
                    )}
                  </label>
                  <input
                    type="tel"
                    disabled={readOnly || Boolean(existingPair)}
                    required={isTeamDrawPreDefined}
                    value={partner.phone}
                    onChange={(e) => handleChange('phone', e.target.value)}
                    placeholder="(00) 00000-0000"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-xs font-bold text-slate-800 bg-white disabled:bg-slate-50 outline-none"
                  />
                </div>
              </div>

              {partnerEntry && !existingPair && (
                <div className="flex items-start gap-2.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs text-blue-800">
                  <UserCheck size={16} className="mt-0.5 shrink-0 text-blue-600" />
                  <div>
                    <p className="font-black">{partnerEntry.name || partnerEntry.nickname} já possui inscrição neste evento.</p>
                    <p className="mt-0.5 font-bold text-blue-700">
                      {partnerEntry.email}{partnerEntry.phone ? ` · ${formatPhone(partnerEntry.phone)}` : ''}
                    </p>
                    <p className="mt-1 font-bold text-blue-700">Confirme abaixo para formar esta dupla.</p>
                  </div>
                </div>
              )}

              {/* Botão Formar time – aparece quando o parceiro foi encontrado como inscrito */}
              {canShowFormTeam && (
                <button
                  type="button"
                  disabled={isForming}
                  onClick={() => handleFormTeam(cat.id, partnerEntry!)}
                  className="w-full rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2.5 text-xs font-black text-white transition-all active:scale-95 flex items-center justify-center gap-2 shadow-xs disabled:opacity-50"
                >
                  <UserCheck size={14} />
                  {isForming ? 'Formando dupla...' : `Confirmar dupla com ${partnerEntry!.nickname || partnerEntry!.name}`}
                </button>
              )}

              {/* Aviso: parceiro já em outro time */}
              {!existingPair && partnerAlreadyPaired && partner.email && (
                <p className="text-[11px] font-bold text-amber-600 bg-amber-50 px-3 py-2 rounded-xl border border-amber-200">
                  Este parceiro já está em outro time nesta categoria.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
