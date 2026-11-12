import React, { useState, useRef, useCallback } from 'react';
import { Users, UserPlus, Phone, Mail, UserCheck, CheckCircle2, Loader2, Check } from 'lucide-react';
import { getDb } from '@infra/firebase';
import { findUserByPinOrEmail, type FirebaseUserByPin } from '@infra/firebase/users';
import type { EventCategory, CategoryPartnerInfo, TournamentEntry, TournamentPair } from '@modules/events/types';

export interface PartnerSelectionStepProps {
  categories: EventCategory[];
  selectedCategoryIds: string[];
  categoryPartners: Record<string, CategoryPartnerInfo>;
  updateCategoryPartner: (categoryId: string, partner: CategoryPartnerInfo) => void;
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
  allowUserTeamFormation = false,
  readOnly = false,
  getPartnerEntryForCategory,
  getPairForCategory,
  getPairForEmailInCategory,
  onFormTeam,
  isSelfCancelled = false,
}) => {
  const [isForming, setIsForming] = useState(false);
  const [searchingCatId, setSearchingCatId] = useState<string | null>(null);
  const [candidateUser, setCandidateUser] = useState<FirebaseUserByPin | null>(null);
  const [targetCatId, setTargetCatId] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [boundMessage, setBoundMessage] = useState<{ [catId: string]: string }>({});
  const lastSearchEmailRef = useRef<{ [catId: string]: string }>({});

  const doublesCategories = categories.filter(
    (c) => selectedCategoryIds.includes(c.id) && c.format === 'Duplas' && c.requiresPartner !== false
  );

  const handleEmailLookup = useCallback(
    async (catId: string, email: string) => {
      const clean = email.trim();
      if (!clean || clean.length < 5 || !clean.includes('@') || clean === lastSearchEmailRef.current[catId]) return;
      lastSearchEmailRef.current[catId] = clean;

      const db = getDb();
      if (!db) return;

      try {
        setSearchingCatId(catId);
        const user = await findUserByPinOrEmail(db, clean);
        if (user) {
          setCandidateUser(user);
          setTargetCatId(catId);
          setShowConfirmModal(true);
        }
      } catch (err) {
        console.error('Erro ao buscar parceiro por e-mail:', err);
      } finally {
        setSearchingCatId(null);
      }
    },
    []
  );

  const handleConfirmCandidate = () => {
    if (!candidateUser || !targetCatId) return;

    const currentPartner = categoryPartners[targetCatId] || { name: '', email: '', phone: '' };
    const updatedPartner: CategoryPartnerInfo = {
      ...currentPartner,
      email: candidateUser.email || currentPartner.email,
      name: candidateUser.name || candidateUser.nickname || currentPartner.name,
      phone: candidateUser.phone ? formatPhone(candidateUser.phone) : currentPartner.phone,
    };

    updateCategoryPartner(targetCatId, updatedPartner);

    const displayName = candidateUser.nickname || candidateUser.name || candidateUser.email;
    setBoundMessage((prev) => ({
      ...prev,
      [targetCatId]: `Parceiro vinculado ao cadastro: ${displayName}`,
    }));

    setTimeout(() => {
      setBoundMessage((prev) => {
        const next = { ...prev };
        delete next[targetCatId];
        return next;
      });
    }, 4000);

    setShowConfirmModal(false);
    setCandidateUser(null);
    setTargetCatId(null);
  };

  const handleCancelCandidate = () => {
    setShowConfirmModal(false);
    setCandidateUser(null);
    setTargetCatId(null);
  };

  if (doublesCategories.length === 0) return null;

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
          {doublesCategories.some((c) => c.requiresPartner !== false)
            ? 'Preencha os dados do parceiro(a) para as categorias em duplas selecionadas.'
            : 'A formação de duplas deste evento é manual ou por sorteio. Os dados do parceiro são opcionais.'}
        </p>
      </div>

      <div className="space-y-4">
        {doublesCategories.map((cat) => {
          const isPartnerRequired = cat.requiresPartner !== false;
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
            allowUserTeamFormation &&
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

              {/* Mensagem de Parceiro Vinculado */}
              {boundMessage[cat.id] && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-bold flex items-center gap-2 animate-in fade-in">
                  <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                  <span>{boundMessage[cat.id]}</span>
                </div>
              )}

              {/* Campos do parceiro */}
              <div className="grid grid-cols-1 gap-3">
                {/* E-mail */}
                <div className="space-y-1">
                  <label className="text-[11px] font-black text-slate-600 flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <Mail size={12} className="text-slate-400" />
                      E-mail do parceiro
                      {isPartnerRequired ? (
                        <span className="text-rose-500 font-black">*</span>
                      ) : (
                        <span className="text-slate-400 font-bold text-[10px]">(opcional)</span>
                      )}
                    </span>
                    {searchingCatId === cat.id && (
                      <Loader2 size={12} className="animate-spin text-blue-500" />
                    )}
                  </label>
                  <input
                    type="email"
                    disabled={readOnly || Boolean(existingPair)}
                    required={isPartnerRequired}
                    value={partner.email}
                    onChange={(e) => {
                      const val = e.target.value;
                      handleChange('email', val);
                      if (val.includes('@') && val.length > 5) {
                        handleEmailLookup(cat.id, val);
                      }
                    }}
                    onBlur={(e) => handleEmailLookup(cat.id, e.target.value)}
                    placeholder="parceiro@email.com"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-xs font-bold text-slate-800 bg-white disabled:bg-slate-50 outline-none"
                  />
                </div>

                {/* Nome */}
                <div className="space-y-1">
                  <label className="text-[11px] font-black text-slate-600 flex items-center gap-1">
                    Nome do parceiro(a)
                    {isPartnerRequired ? (
                      <span className="text-rose-500 font-black">*</span>
                    ) : (
                      <span className="text-slate-400 font-bold text-[10px]">(opcional)</span>
                    )}
                  </label>
                  <input
                    type="text"
                    disabled={readOnly || Boolean(existingPair)}
                    required={isPartnerRequired}
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
                    <span className="text-slate-400 font-bold text-[10px]">(opcional)</span>
                  </label>
                  <input
                    type="tel"
                    disabled={readOnly || Boolean(existingPair)}
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
                    <p className="font-black">{partnerEntry.name || partnerEntry.nickname} já possui inscrição nesta categoria.</p>
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

      {/* Modal de Confirmação de Parceiro Localizado */}
      {showConfirmModal && candidateUser && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-xs animate-in fade-in"
            onClick={handleCancelCandidate}
          />
          <div className="relative bg-white rounded-3xl shadow-2xl max-w-sm w-full p-6 space-y-4 border border-slate-100 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <CheckCircle2 size={20} />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">Confirmar parceiro(a)</h3>
                <p className="text-xs font-bold text-slate-400">Cadastro localizado no sistema</p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 space-y-2 text-xs font-bold text-slate-700">
              {candidateUser.name && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400 font-semibold shrink-0">Nome:</span>
                  <span className="text-slate-900 font-black truncate">{candidateUser.name}</span>
                </div>
              )}
              {candidateUser.nickname && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400 font-semibold shrink-0">Nome como quer ser chamado:</span>
                  <span className="text-slate-900 font-black truncate">{candidateUser.nickname}</span>
                </div>
              )}
              {candidateUser.email && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400 font-semibold shrink-0">E-mail:</span>
                  <span className="text-slate-900 font-black truncate">{candidateUser.email}</span>
                </div>
              )}
              {candidateUser.phone && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400 font-semibold shrink-0">WhatsApp:</span>
                  <span className="text-slate-900 font-black truncate">{formatPhone(candidateUser.phone)}</span>
                </div>
              )}
              {candidateUser.pin && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400 font-semibold shrink-0">PIN:</span>
                  <span className="text-slate-900 font-black truncate">{candidateUser.pin}</span>
                </div>
              )}
            </div>

            <p className="text-xs text-slate-500 font-semibold">
              Deseja vincular o parceiro ao cadastro localizado e preencher os dados?
            </p>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={handleCancelCandidate}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-black text-slate-600 hover:bg-slate-50 transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmCandidate}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-black text-white flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer active:scale-95"
              >
                <Check size={14} className="stroke-[3]" />
                Confirmar e preencher
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
