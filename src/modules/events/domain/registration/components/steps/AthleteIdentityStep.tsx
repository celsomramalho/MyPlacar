import React, { useState, useRef, useCallback } from 'react';
import { User, Phone, Mail, AlertTriangle, KeyRound, CheckCircle2, Loader2, Check } from 'lucide-react';
import { MarsIcon, VenusIcon } from '@shared/components/GenderIcons';
import { getDb } from '@infra/firebase';
import { findUserByPinOrEmail, type FirebaseUserByPin } from '@infra/firebase/users';
import type { RegistrationFormData } from '../../types';

export interface AthleteIdentityStepProps {
  formData: RegistrationFormData;
  updateField: <K extends keyof RegistrationFormData>(field: K, value: RegistrationFormData[K]) => void;
  canEditIdentity?: boolean;
  isAdmin?: boolean;
  readOnly?: boolean;
  isSimplified?: boolean;
  nameConflictWarning?: string | null;
  /** Quando true, desabilita Nome Completo e E-mail (campos vinculados ao cadastro do usuário) */
  disableIdentity?: boolean;
  /** Callback para confirmar vínculo e salvar dados do atleta */
  onConfirmUser?: (user: FirebaseUserByPin) => Promise<void> | void;
}

const formatPhone = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (!digits) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

export const AthleteIdentityStep: React.FC<AthleteIdentityStepProps> = ({
  formData,
  updateField,
  readOnly = false,
  isSimplified = false,
  nameConflictWarning = null,
  disableIdentity = false,
  onConfirmUser,
}) => {
  const [isSearchingUser, setIsSearchingUser] = useState(false);
  const [foundUserMessage, setFoundUserMessage] = useState<string | null>(null);
  const [candidateUser, setCandidateUser] = useState<FirebaseUserByPin | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isSavingCandidate, setIsSavingCandidate] = useState(false);
  const [isUserBound, setIsUserBound] = useState(false);
  const lastSearchTermRef = useRef<string>('');

  const isRealUserBound = Boolean(
    formData.pin &&
      !formData.pin.toUpperCase().startsWith('TEMP') &&
      !formData.pin.toUpperCase().startsWith('SIMP') &&
      formData.email &&
      !formData.email.includes('@simplificada.local')
  );

  const isIdentityLocked = disableIdentity || isUserBound || isRealUserBound;

  const handleLookup = useCallback(
    async (term: string) => {
      const clean = term.trim();
      if (!clean || clean.length < 3 || clean === lastSearchTermRef.current) return;
      lastSearchTermRef.current = clean;

      const db = getDb();
      if (!db) return;

      try {
        setIsSearchingUser(true);
        const user = await findUserByPinOrEmail(db, clean);
        if (user) {
          setCandidateUser(user);
          setShowConfirmModal(true);
        }
      } catch (err) {
        console.error('Erro ao buscar atleta por PIN ou e-mail:', err);
      } finally {
        setIsSearchingUser(false);
      }
    },
    []
  );

  const handleConfirmCandidate = async () => {
    if (!candidateUser) return;
    setIsSavingCandidate(true);
    try {
      if (candidateUser.name) updateField('name', candidateUser.name);
      if (candidateUser.nickname) updateField('nickname', candidateUser.nickname);
      if (candidateUser.email) updateField('email', candidateUser.email);
      if (candidateUser.phone) updateField('phone', formatPhone(candidateUser.phone));
      if (candidateUser.pin) updateField('pin', candidateUser.pin);
      if (candidateUser.gender) updateField('gender', candidateUser.gender);
      if (candidateUser.shirtSize) updateField('shirtSize', candidateUser.shirtSize);

      if (onConfirmUser) {
        await onConfirmUser(candidateUser);
      }

      const displayName = candidateUser.nickname || candidateUser.name || candidateUser.pin;
      setFoundUserMessage(`Cadastro vinculado e salvo: ${displayName}`);
      setTimeout(() => setFoundUserMessage(null), 4000);
      setIsUserBound(true);
      setShowConfirmModal(false);
      setCandidateUser(null);
    } catch (err) {
      console.error('Erro ao confirmar cadastro:', err);
    } finally {
      setIsSavingCandidate(false);
    }
  };

  const handleCancelCandidate = () => {
    setShowConfirmModal(false);
    setCandidateUser(null);
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <div className="border-b border-slate-100 pb-3">
        <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
          <User size={18} className="text-blue-600" />
          Dados do atleta
        </h3>
        <p className="text-xs text-slate-400 font-bold mt-0.5">
          {isSimplified
            ? 'Na inscrição simplificada, apenas o nome como quer ser chamado é obrigatório.'
            : 'Informações de identificação do participante no torneio.'}
        </p>
      </div>

      {/* Aviso de Usuário Localizado */}
      {foundUserMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-bold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          <span>{foundUserMessage}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Nome completo */}
        <div className="space-y-1.5 sm:col-span-2">
          <label className="text-xs font-black text-slate-700 flex items-center gap-1.5">
            Nome completo {!isSimplified && <span className="text-rose-500">*</span>}
          </label>
          <input
            type="text"
            disabled={readOnly || isIdentityLocked}
            value={formData.name}
            onChange={(e) => updateField('name', e.target.value)}
            placeholder="Nome e sobrenome"
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-sm font-bold text-slate-800 bg-white disabled:bg-slate-50 disabled:text-slate-500 outline-none transition-all"
          />
          {isIdentityLocked && (
            <p className="text-[10px] text-slate-400 font-semibold">Vinculado ao cadastro</p>
          )}
        </div>

        {/* Nome como quer ser chamado (obrigatório sempre) */}
        <div className="space-y-1.5 sm:col-span-2">
          <label className="text-xs font-black text-slate-700 flex items-center gap-1.5">
            Nome como quer ser chamado <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            disabled={readOnly}
            value={formData.nickname}
            onChange={(e) => {
              const val = e.target.value;
              updateField('nickname', val);
              if (isSimplified && !formData.name) {
                updateField('name', val);
              }
            }}
            placeholder="Ex: Celsinho, Rafa..."
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-sm font-bold text-slate-800 bg-white disabled:bg-slate-50 disabled:text-slate-500 outline-none transition-all"
          />
          {nameConflictWarning && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs font-bold animate-in fade-in">
              <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <span>{nameConflictWarning}</span>
            </div>
          )}
        </div>

        {/* E-mail */}
        <div className="space-y-1.5">
          <label className="text-xs font-black text-slate-700 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Mail size={14} className="text-slate-400" />
              E-mail {!isSimplified && <span className="text-rose-500">*</span>}
            </span>
            {isSearchingUser && <Loader2 size={12} className="animate-spin text-blue-500" />}
          </label>
          <input
            type="email"
            disabled={readOnly || isIdentityLocked}
            value={formData.email}
            onChange={(e) => {
              const val = e.target.value;
              updateField('email', val);
              if (val.includes('@') && val.length > 5) {
                handleLookup(val);
              }
            }}
            onBlur={(e) => handleLookup(e.target.value)}
            placeholder="atleta@email.com"
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-sm font-bold text-slate-800 bg-white disabled:bg-slate-50 disabled:text-slate-500 outline-none transition-all"
          />
          {isIdentityLocked && (
            <p className="text-[10px] text-slate-400 font-semibold">Vinculado ao cadastro</p>
          )}
        </div>

        {/* WhatsApp */}
        <div className="space-y-1.5">
          <label className="text-xs font-black text-slate-700 flex items-center gap-1.5">
            <Phone size={14} className="text-slate-400" />
            WhatsApp {!isSimplified && <span className="text-rose-500">*</span>}
          </label>
          <input
            type="tel"
            disabled={readOnly}
            value={formData.phone}
            onChange={(e) => updateField('phone', formatPhone(e.target.value))}
            placeholder="(00) 00000-0000"
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-sm font-bold text-slate-800 bg-white disabled:bg-slate-50 disabled:text-slate-500 outline-none transition-all"
          />
        </div>

        {/* PIN (não obrigatório, abaixo do WhatsApp) */}
        <div className="space-y-1.5 sm:col-span-2">
          <label className="text-xs font-black text-slate-700 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <KeyRound size={14} className="text-slate-400" />
              PIN do atleta
            </span>
            <span className="text-[10px] font-bold text-slate-400">Opcional</span>
          </label>
          <input
            type="text"
            disabled={readOnly || isIdentityLocked}
            value={formData.pin || ''}
            onChange={(e) => {
              const val = e.target.value;
              updateField('pin', val);
              if (val.length >= 3) {
                handleLookup(val);
              }
            }}
            onBlur={(e) => handleLookup(e.target.value)}
            placeholder="Ex: 1rankingbt"
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-sm font-bold text-slate-800 bg-white disabled:bg-slate-50 disabled:text-slate-500 outline-none transition-all"
          />
          {isIdentityLocked && (
            <p className="text-[10px] text-slate-400 font-semibold">Vinculado ao cadastro</p>
          )}
        </div>

        {/* Gênero */}
        <div className="space-y-1.5 sm:col-span-2">
          <label className="text-xs font-black text-slate-700 flex items-center gap-1.5">
            Gênero
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={readOnly}
              onClick={() => updateField('gender', 'M')}
              className={`py-2 px-3 rounded-xl border text-xs font-black flex items-center justify-center gap-1.5 transition-all ${
                (formData.gender || 'M') === 'M'
                  ? 'bg-blue-50 border-blue-500 text-blue-700 shadow-xs'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <MarsIcon size={14} />
              Masculino
            </button>
            <button
              type="button"
              disabled={readOnly}
              onClick={() => updateField('gender', 'F')}
              className={`py-2 px-3 rounded-xl border text-xs font-black flex items-center justify-center gap-1.5 transition-all ${
                formData.gender === 'F'
                  ? 'bg-rose-50 border-rose-500 text-rose-700 shadow-xs'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <VenusIcon size={14} />
              Feminino
            </button>
          </div>
        </div>

        {/* Tamanho da camiseta */}
        <div className="space-y-1.5 sm:col-span-2">
          <label className="text-xs font-black text-slate-700 flex items-center gap-1.5">
            Tamanho da camiseta
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(['P', 'M', 'G'] as const).map((size) => (
              <button
                key={size}
                type="button"
                disabled={readOnly}
                onClick={() => updateField('shirtSize', size)}
                className={`py-2 rounded-xl border text-xs font-black flex items-center justify-center transition-all ${
                  formData.shirtSize === size
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-700 shadow-xs'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Modal de Confirmação de Cadastro Localizado */}
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
                <h3 className="text-base font-black text-slate-900">Confirmar cadastro</h3>
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
              Deseja vincular esta inscrição ao cadastro localizado e salvar os dados do atleta?
            </p>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={handleCancelCandidate}
                disabled={isSavingCandidate}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-black text-slate-600 hover:bg-slate-50 transition-all cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmCandidate}
                disabled={isSavingCandidate}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-black text-white flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer active:scale-95 disabled:opacity-50"
              >
                {isSavingCandidate ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Check size={14} className="stroke-[3]" />
                )}
                Confirmar e salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
