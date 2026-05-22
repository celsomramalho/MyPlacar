import { ChevronDown, ChevronUp, Mic } from 'lucide-react';
import type { ReactNode } from 'react';
import { AdminVoiceCommandItem } from '@modules/admin/components/AdminVoiceCommandItem';
import { applyGoldenRule } from '@shared/utils/formatters';
import type { VoiceCommands } from '../../../types';

interface AdminVoiceRulesPanelProps {
  voiceCommands: VoiceCommands;
  isOpenCVP: boolean;
  isOpenCVS: boolean;
  isOpenCVO: boolean;
  onToggleCVP: () => void;
  onToggleCVS: () => void;
  onToggleCVO: () => void;
  onUpdateCommandField: (field: keyof VoiceCommands, value: string) => void;
}

const VoiceRuleSection = ({
  title,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}) => (
  <div className="bg-gray-50/50 rounded-[2rem] overflow-hidden">
    <button onClick={onToggle} className="w-full px-6 py-4 flex items-center justify-between text-black active:bg-gray-100 transition-colors">
      <span className="text-xs font-black">{title}</span>
      {isOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
    </button>
    {isOpen && (
      <div className="p-4 pt-0 space-y-4">
        {children}
      </div>
    )}
  </div>
);

export const AdminVoiceRulesPanel = ({
  voiceCommands,
  isOpenCVP,
  isOpenCVS,
  isOpenCVO,
  onToggleCVP,
  onToggleCVS,
  onToggleCVO,
  onUpdateCommandField,
}: AdminVoiceRulesPanelProps) => {
  const renderCmdItem = (
    id: string,
    label: string,
    field: keyof VoiceCommands | null,
    condition: string | null,
    purpose: string,
    usage: string,
  ) => (
    <AdminVoiceCommandItem
      id={id}
      label={label}
      condition={condition}
      purpose={purpose}
      usage={usage}
      termsValue={field ? voiceCommands[field].join(', ') : undefined}
      onTermsChange={field ? (value) => onUpdateCommandField(field, value) : undefined}
    />
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-2">
        <Mic size={20} className="text-blue-500" />
        <h2 className="text-sm font-black text-black">Regras de voz</h2>
      </div>
      <section className="bg-white rounded-[2.5rem] p-6 shadow-sm border border-white space-y-5">
        <VoiceRuleSection title="Regras de voz que alteram o placar (cvp):" isOpen={isOpenCVP} onToggle={onToggleCVP}>
          {renderCmdItem('cvp1', 'Prefixo', 'pointTerm', "raw.includes('.') || LIKE(text, FONETICA.ponto)", 'Prefixo para dar o comando de pontuação (sendo: prefixo0 = ponto e prefixo1 = .)', 'Diga: ponto ou .')}
          <div className="space-y-2 p-4 bg-gray-50 rounded-2xl border border-gray-100 shadow-sm animate-in fade-in">
            <div className="flex items-start justify-between">
              <div className="flex flex-col gap-0.5">
                <span className="text-black font-black text-sm">cvp2) Alvo: [cor], [nome], [time]</span>
                <span className="text-[9px] font-bold text-blue-600 font-mono">(n?: string, p?: string, c?: string, t?: string)</span>
              </div>
            </div>
            <div className="space-y-1.5 border-l-2 border-gray-200 pl-3">
              <p className="text-[10px] font-bold text-gray-500 leading-tight">
                Para que serve esse comando: <span className="text-black">{applyGoldenRule('quando a pontuação é da [cor], do [nome], do [time]', true)}</span>
              </p>
              <p className="text-[10px] font-bold text-gray-500 leading-tight">
                Como usar <span className="text-black">{applyGoldenRule('diga: ponto [nome do jogador] ou ponto [cor do time] ou ponto [time 1 / time 2]', true)}</span>
              </p>
            </div>
          </div>
          {renderCmdItem('cvp3', 'Sacador', 'serverTerm', 'LIKE(text, FONETICA.sacador)', 'quando a pontuação é do time sacador', 'diga: ponto sacador')}
          {renderCmdItem('cvp4', 'Contra', 'receiverTerm', 'LIKE(text, FONETICA.contra)', 'quando a pontuação é do time recebedor', 'diga: ponto contra')}
          {renderCmdItem('cvp5', 'Ace', 'ace', 'LIKE(text, FONETICA.ace) || LIKE(text, FONETICA.saque)', 'quando o sacador faz um ace', 'diga: ponto ace or ponto de saque')}
          {renderCmdItem('cvp6', 'Falta', 'fault', 'LIKE(text, FONETICA.falta)', 'quando the sacador saca na rede ou fora da quadra', 'diga: saque errado ou erro de saque')}
          {renderCmdItem('cvp7', 'Voltar', 'undo', 'LIKE(text, FONETICA.voltar)', 'volta o placar para o último ponto', 'diga: desfazer ponto ou voltar ponto')}
        </VoiceRuleSection>

        <VoiceRuleSection title="Regras de voz que não alteram o placar (cvs):" isOpen={isOpenCVS} onToggle={onToggleCVS}>
          {renderCmdItem('cvs1', 'Trocar', 'switchServer', 'LIKE(text, FONETICA.trocar) && LIKE(text, FONETICA.saque)', 'caso durante a partida precisar ajustar quem está sacando', 'diga: trocar sacador')}
          {renderCmdItem('cvs2', 'Placar', 'scoreStatus', 'LIKE(text, FONETICA.placar)', 'para anunciar o placar atual', 'diga: placar ou quanto tá')}
        </VoiceRuleSection>

        <VoiceRuleSection title="Comandos de voz (outros):" isOpen={isOpenCVO} onToggle={onToggleCVO}>
          {renderCmdItem('cvd1', 'Parceiro', 'partnerTerm', null, 'usado na tela inicial para informar os nomes do time num só comando de voz', 'diga: [nome1] mais [nome2], ou [nome1] com [nome2]')}
        </VoiceRuleSection>
      </section>
    </div>
  );
};
