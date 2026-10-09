import { User, Phone, Mail, AlertTriangle } from 'lucide-react';
import { MarsIcon, VenusIcon } from '@shared/components/GenderIcons';
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
  canEditIdentity = false,
  isAdmin = false,
  readOnly = false,
  isSimplified = false,
  nameConflictWarning = null,
  disableIdentity = false,
}) => {
  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <div className="border-b border-slate-100 pb-3">
        <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
          <User size={18} className="text-blue-600" />
          Dados do atleta
        </h3>
        <p className="text-xs text-slate-400 font-bold mt-0.5">
          {isSimplified
            ? 'Informe como o atleta quer ser chamado no placar e seu gênero.'
            : 'Informações de identificação do participante no torneio.'}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Na inscrição simplificada, renderiza APENAS Apelido/Nome e Gênero */}
        {!isSimplified && (
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-xs font-black text-slate-700 flex items-center gap-1.5">
              Nome completo <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              disabled={readOnly || disableIdentity}
              value={formData.name}
              onChange={(e) => updateField('name', e.target.value)}
              placeholder="Nome e sobrenome"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-sm font-bold text-slate-800 bg-white disabled:bg-slate-50 disabled:text-slate-500 outline-none transition-all"
            />
            {disableIdentity && (
              <p className="text-[10px] text-slate-400 font-semibold">Vinculado ao seu cadastro</p>
            )}
          </div>
        )}

        {/* Apelido / Como quer ser chamado */}
        <div className={`space-y-1.5 ${isSimplified ? 'sm:col-span-2' : ''}`}>
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
              if (isSimplified) {
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

        {!isSimplified && (
          <div className="space-y-1.5">
            <label className="text-xs font-black text-slate-700 flex items-center gap-1.5">
              <Mail size={14} className="text-slate-400" />
              E-mail <span className="text-rose-500">*</span>
            </label>
            <input
              type="email"
              disabled={readOnly || disableIdentity}
              value={formData.email}
              onChange={(e) => updateField('email', e.target.value)}
              placeholder="atleta@email.com"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-sm font-bold text-slate-800 bg-white disabled:bg-slate-50 disabled:text-slate-500 outline-none transition-all"
            />
            {disableIdentity && (
              <p className="text-[10px] text-slate-400 font-semibold">Vinculado ao seu cadastro</p>
            )}
          </div>
        )}

        {/* WhatsApp */}
        {!isSimplified && (
          <div className="space-y-1.5">
            <label className="text-xs font-black text-slate-700 flex items-center gap-1.5">
              <Phone size={14} className="text-slate-400" />
              WhatsApp <span className="text-rose-500">*</span>
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
        )}

        {/* Gênero */}
        <div className={`space-y-1.5 ${isSimplified ? 'sm:col-span-2' : ''}`}>
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
        {!isSimplified && (
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
        )}
      </div>
    </div>
  );
};
