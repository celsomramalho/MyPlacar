import React, { useState, useEffect } from 'react';
import { 
  BookOpen,
  TrendingUp,
  Star, 
  Menu, 
  RotateCcw, 
  Check, 
  Sparkles, 
  LifeBuoy, 
  Send, 
  Loader2, 
  Home, 
  Users, 
  Settings, 
  UserCheck, 
  History, 
  Trophy, 
  User, 
  ChevronRight,
  CheckCircle2,
  Bell,
  Play,
} from 'lucide-react';
import type { UserProfile } from '@modules/auth/types';
import type { Tab, Screen } from '../../../types';
import { getOnboardingStatus } from '@shared/onboarding';
import { getDb } from '@infra/firebase';
import { fetchSystemConfig } from '@infra/firebase/systemConfig';
import { addCommunication } from '@infra/firebase/communications';
import { Button } from '@shared/components/Button';

interface Props {
  profile: UserProfile;
  onNavigateToTab: (tab: Tab) => void;
  onOpenRules: () => void;
  onPlay?: () => void;
  canStartMatch: boolean;
  onOpenMenu: () => void;
  onReplayTour?: (screen: Screen, tab?: string) => void;
  onOpenCommunications?: () => void;
}

export const HelpScreen: React.FC<Props> = ({ 
  profile, 
  onOpenMenu, 
  onReplayTour,
  onOpenCommunications,
}) => {
  const [refreshKey, setRefreshKey] = useState(0);
  const [supportEnabled, setSupportEnabled] = useState(true);
  const [suggestionText, setSuggestionText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sentSuccess, setSentSuccess] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  // Estado do NPS contínuo
  const [npsSelectedScore, setNpsSelectedScore] = useState<number | null>(null);
  const [npsComment, setNpsComment] = useState('');
  const [isSendingNps, setIsSendingNps] = useState(false);
  const [npsSuccess, setNpsSuccess] = useState(false);
  const [evaluatedScore, setEvaluatedScore] = useState<number | null>(() => {
    try {
      const saved = localStorage.getItem('myplacar_user_nps_score');
      return saved !== null ? Number(saved) : null;
    } catch {
      return null;
    }
  });

  const handleSendNps = async () => {
    if (npsSelectedScore === null) return;
    const db = getDb();
    if (!db) return;

    setIsSendingNps(true);
    try {
      const score = npsSelectedScore;
      const category = score >= 9 ? 'Promotor 🟢' : score >= 7 ? 'Neutro 🟡' : 'Detrator 🔴';
      const userKey = profile.pin || profile.email || 'user';
      const userName = profile.nickname || profile.name || 'Usuário';

      await addCommunication(db, {
        type: 'nps',
        title: `Avaliação NPS: Nota ${score}/10 (${category}) de ${userName}`,
        content: npsComment.trim()
          ? `Nota: ${score}/10 [${category}]\n\nMotivo / Comentário:\n"${npsComment.trim()}"`
          : `Nota: ${score}/10 [${category}]`,
        authorId: userKey,
        authorName: userName,
        createdAt: Date.now(),
        targetUserId: 'admin',
        nps: {
          scores: { [userKey]: score },
          comments: npsComment.trim() ? {
            [userKey]: {
              comment: npsComment.trim(),
              authorName: userName,
              createdAt: Date.now()
            }
          } : {},
          totalResponses: 1,
        },
        readBy: [],
        reactions: {},
      });

      try {
        localStorage.setItem('myplacar_user_nps_score', String(score));
      } catch {}

      setEvaluatedScore(score);
      setNpsSuccess(true);
      setNpsComment('');
      setNpsSelectedScore(null);
      setTimeout(() => setNpsSuccess(false), 4000);
    } catch (e) {
      console.error('Erro ao enviar avaliação NPS:', e);
    } finally {
      setIsSendingNps(false);
    }
  };

  useEffect(() => {
    const db = getDb();
    if (!db) return;
    fetchSystemConfig(db).then(cfg => {
      if (cfg && typeof cfg.supportChannelEnabled === 'boolean') {
        setSupportEnabled(cfg.supportChannelEnabled);
      }
    });
  }, []);

  const tourScreens = [
    {
      id: 'home',
      name: 'Início',
      desc: 'Visão geral da tela principal e atalhos rápidos',
      icon: Home,
      color: 'text-orange-500 bg-orange-50 border-orange-100',
      screen: 'home' as Screen,
      tab: undefined,
    },
    {
      id: 'config',
      name: 'Times',
      desc: 'Escalação, seleção de jogadores e sorteio de duplas',
      icon: Users,
      color: 'text-sky-600 bg-sky-50 border-sky-100',
      screen: 'settings' as Screen,
      tab: 'config',
    },
    {
      id: 'rules',
      name: 'Regras',
      desc: 'Modalidades esportivas, formatos de pontuação e narração',
      icon: Settings,
      color: 'text-amber-500 bg-amber-50 border-amber-100',
      screen: 'new-game' as Screen,
      tab: undefined,
    },
    {
      id: 'scoreboard',
      name: 'Play',
      desc: 'Placar ao vivo, narração por voz, cronômetro e transmissão',
      icon: Play,
      color: 'text-emerald-500 bg-emerald-50 border-emerald-100',
      screen: 'scoreboard' as Screen,
      tab: undefined,
    },
    {
      id: 'partners',
      name: 'Parceiros',
      desc: 'Lista de jogadores, fila de quadra, QR code e PIN',
      icon: UserCheck,
      color: 'text-teal-700 bg-teal-50 border-teal-100',
      screen: 'partners' as Screen,
      tab: undefined,
    },
    {
      id: 'history',
      name: 'Histórico',
      desc: 'Resultados das partidas, estatísticas e mapa GPS',
      icon: History,
      color: 'text-emerald-600 bg-emerald-50 border-emerald-100',
      screen: 'settings' as Screen,
      tab: 'history',
    },
    {
      id: 'tournaments',
      name: 'Torneios',
      desc: 'Eventos oficiais, chaves eliminatórias e inscrições',
      icon: Trophy,
      color: 'text-blue-600 bg-blue-50 border-blue-100',
      screen: 'tournaments' as Screen,
      tab: undefined,
    },
    {
      id: 'profile',
      name: 'Perfil',
      desc: 'Seus dados cadastrais, apelido do narrador e PIN exclusivo',
      icon: User,
      color: 'text-pink-600 bg-pink-50 border-pink-100',
      screen: 'settings' as Screen,
      tab: 'profile',
    },
  ];

  const handleResetTours = () => {
    tourScreens.forEach(item => {
      try {
        localStorage.removeItem(`myplacar_onboarding_status_${item.id}`);
        localStorage.removeItem(`myplacar_onboarding_seen_${item.id}`);
      } catch {}
    });
    try {
      localStorage.removeItem('myplacar_onboarding_home_step10_completed');
    } catch {}
    setRefreshKey(prev => prev + 1);
    setResetSuccess(true);
    setTimeout(() => setResetSuccess(false), 3500);
  };

  const handleSendSuggestion = async () => {
    if (!suggestionText.trim()) return;
    const db = getDb();
    if (!db) return;

    setIsSending(true);
    try {
      const authorId = profile.pin || profile.email || 'user';
      const authorName = profile.nickname || profile.name || 'Usuário';
      const now = Date.now();
      const text = suggestionText.trim();

      // 1. Aviso para o admin ver
      await addCommunication(db, {
        type: 'support',
        title: `Sugestão de ${authorName}`,
        content: text,
        authorId,
        authorName,
        createdAt: now,
        targetUserId: 'admin',
        readBy: [],
        reactions: {},
      });

      // 2. Confirmação para o próprio usuário aparecer em Comunicados
      await addCommunication(db, {
        type: 'support',
        title: 'Sua sugestão foi enviada ✓',
        content: `Recebemos sua mensagem:\n\n"${text}"\n\nO administrador responderá em breve via Comunicados.`,
        authorId: 'system',
        authorName: 'MyPlacar',
        createdAt: now + 1,
        targetUserId: authorId,
        readBy: [],
        reactions: {},
      });

      setSuggestionText('');
      setSentSuccess(true);
      setTimeout(() => setSentSuccess(false), 4000);
    } catch (e) {
      console.error('Erro ao enviar sugestão:', e);
    } finally {
      setIsSending(false);
    }
  };

  const completedCount = tourScreens.filter(
    s => getOnboardingStatus(s.id) === 'completed'
  ).length;

  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-hidden animate-in fade-in duration-300">
      {/* Cabeçalho */}
      <header className="px-6 py-4 flex items-center justify-between bg-white border-b border-gray-100 sticky top-0 z-40 min-h-[72px]">
        <button 
          onClick={onOpenMenu} 
          className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-700 active:scale-95 transition-all"
        >
          <Menu size={20} />
        </button>
        <div className="flex-1 flex items-center justify-center gap-2">
          <BookOpen size={22} className="text-blue-600 stroke-[2.5]" />
          <h1 className="text-lg font-black text-black tracking-tight">Central de tutoriais</h1>
        </div>
        <div className="w-10 text-right">
          <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-full border border-blue-100">
            {completedCount}/{tourScreens.length}
          </span>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-5 no-scrollbar space-y-6">
        
        {/* Banner de apresentação */}
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-6 text-white shadow-sm space-y-2">
          <div className="flex items-center gap-2 text-blue-200 text-xs font-black tracking-wide">
            <Sparkles size={16} /> Guias interativos
          </div>
          <h2 className="text-xl font-black tracking-tight leading-tight">
            Aprenda a usar cada tela no seu ritmo
          </h2>
          <p className="text-xs text-blue-100 leading-relaxed font-bold">
            Toque em qualquer seção abaixo para abrir a respectiva tela com o tour guiado passo a passo ativado.
          </p>
        </div>

        {/* Lista dos Tours */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-black text-slate-500 tracking-wide">
              Telas disponíveis ({tourScreens.length})
            </h3>
            {resetSuccess && (
              <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 animate-in fade-in">
                ✓ Tutoriais reiniciados!
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 gap-2.5">
            {tourScreens.map(item => {
              void refreshKey;
              const status = getOnboardingStatus(item.id);
              const statusBadge =
                status === 'completed' ? (
                  <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                    <Check size={10} strokeWidth={3} /> Concluído
                  </span>
                ) : status === 'partial' ? (
                  <span className="text-[10px] font-extrabold text-sky-600 bg-sky-50 px-2 py-0.5 rounded-full border border-sky-200">
                    Em andamento
                  </span>
                ) : (
                  <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                    Novo
                  </span>
                );

              return (
                <button
                  key={item.id}
                  onClick={() => onReplayTour?.(item.screen, item.tab)}
                  className="w-full bg-white rounded-2xl p-4 shadow-sm border border-slate-100 hover:border-blue-200 flex items-center gap-3.5 text-left active:scale-[0.98] transition-all group cursor-pointer"
                >
                  <div className={`w-11 h-11 rounded-2xl border flex items-center justify-center shrink-0 ${item.color}`}>
                    <item.icon size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-black text-slate-900">{item.name}</span>
                      {statusBadge}
                    </div>
                    <p className="text-[11px] font-bold text-slate-500 truncate leading-tight">
                      {item.desc}
                    </p>
                  </div>
                  <ChevronRight size={18} className="text-slate-300 group-hover:text-blue-500 transition-colors shrink-0" />
                </button>
              );
            })}
          </div>
        </div>

        {/* Reiniciar todos os tutoriais */}
        <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm flex items-center justify-between">
          <div className="space-y-0.5 pr-2">
            <h4 className="text-xs font-black text-slate-800">Reiniciar todos os tutoriais</h4>
            <p className="text-[11px] font-bold text-slate-400 leading-tight">
              Limpa seu progresso e reexibe os avisos de boas-vindas
            </p>
          </div>
          <button
            onClick={handleResetTours}
            className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-black flex items-center gap-1.5 active:scale-95 transition-all shrink-0 cursor-pointer"
          >
            <RotateCcw size={14} /> Reiniciar
          </button>
        </div>

        {/* Canal de Sugestões e Suporte */}
        <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-3">
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${supportEnabled ? 'bg-teal-50 text-teal-700 border border-teal-100' : 'bg-slate-100 text-slate-400'}`}>
              <LifeBuoy size={18} />
            </div>
            <div className="flex-1">
              <h4 className="text-xs font-black text-slate-900">Sugestões e suporte</h4>
              <p className="text-[11px] font-bold text-slate-400">
                {supportEnabled ? 'Envie sua mensagem diretamente ao administrador' : 'Canal pausado temporariamente'}
              </p>
            </div>
            {onOpenCommunications && (
              <button
                onClick={onOpenCommunications}
                className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center shrink-0 hover:bg-blue-100 active:scale-95 transition-all"
                title="Ver Comunicados"
              >
                <Bell size={16} />
              </button>
            )}
          </div>

          {supportEnabled ? (
            <div className="space-y-2.5 pt-1">
              {sentSuccess ? (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-2 animate-in fade-in">
                  <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                  <p className="text-xs font-black text-emerald-800">
                    Mensagem enviada com sucesso! O administrador responderá via Comunicados.
                  </p>
                </div>
              ) : (
                <>
                  <textarea
                    value={suggestionText}
                    onChange={(e) => setSuggestionText(e.target.value)}
                    placeholder="Escreva aqui sua sugestão, dúvida ou problema encontrado..."
                    className="w-full h-24 bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs font-bold text-slate-700 focus:border-blue-400 focus:outline-none resize-none transition-all"
                  />
                  <Button
                    onClick={handleSendSuggestion}
                    disabled={isSending || !suggestionText.trim()}
                    className="w-full py-3 rounded-2xl font-black text-xs !bg-blue-600 text-white flex items-center justify-center gap-2 shadow-md shadow-blue-100"
                  >
                    {isSending ? <Loader2 size={16} className="animate-spin" /> : <><Send size={14} /> Enviar ao desenvolvedor</>}
                  </Button>
                </>
              )}
            </div>
          ) : (
            <p className="text-xs font-bold text-slate-400 bg-slate-50 p-3 rounded-2xl">
              O canal direto de sugestões está momentaneamente pausado. Acompanhe novidades pela central de Comunicados.
            </p>
          )}
        </div>

        {/* Pesquisa NPS Contínua */}
        <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-3.5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center shrink-0">
              <TrendingUp size={18} />
            </div>
            <div>
              <h4 className="text-xs font-black text-slate-900">Pesquisa de satisfação (NPS)</h4>
              <p className="text-[11px] font-bold text-slate-400">
                Sua avaliação chega diretamente ao desenvolvedor
              </p>
            </div>
          </div>

          <p className="text-xs font-bold text-slate-700 leading-snug">
            Em uma escala de 0 a 10, qual a probabilidade de você recomendar o MyPlacar para um amigo ou parceiro de quadra?
          </p>

          {evaluatedScore !== null && !npsSelectedScore && !npsSuccess ? (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
                <div>
                  <p className="text-xs font-black text-emerald-800">
                    Sua nota atual: {evaluatedScore} / 10
                  </p>
                  <p className="text-[11px] font-bold text-emerald-600">
                    Obrigado por avaliar! Sua opinião faz a diferença.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEvaluatedScore(null)}
                className="text-[10px] font-bold text-emerald-700 hover:text-emerald-900 underline px-2 py-1"
              >
                Alterar nota
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {npsSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-2 animate-in fade-in">
                  <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                  <p className="text-xs font-black text-emerald-800">
                    Avaliação enviada com sucesso ao administrador! Muito obrigado.
                  </p>
                </div>
              )}

              {/* Botões de nota de 0 a 10 */}
              <div className="grid grid-cols-11 gap-1">
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(val => {
                  const isSelected = npsSelectedScore === val;
                  const btnColor =
                    val <= 6
                      ? isSelected ? 'bg-red-500 text-white border-red-500 scale-105 shadow-sm' : 'bg-slate-50 text-red-600 border-red-200 hover:bg-red-50'
                      : val <= 8
                      ? isSelected ? 'bg-amber-400 text-slate-900 border-amber-400 scale-105 shadow-sm font-black' : 'bg-slate-50 text-amber-600 border-amber-200 hover:bg-amber-50'
                      : isSelected ? 'bg-emerald-600 text-white border-emerald-600 scale-105 shadow-sm' : 'bg-slate-50 text-emerald-700 border-emerald-300 hover:bg-emerald-50';

                  return (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setNpsSelectedScore(val)}
                      className={`h-10 rounded-xl border text-xs font-black flex items-center justify-center transition-all active:scale-95 ${btnColor}`}
                    >
                      {val}
                    </button>
                  );
                })}
              </div>

              <div className="flex justify-between text-[9px] font-bold text-slate-400 px-1">
                <span>0 (Pouco provável)</span>
                <span>10 (Muito provável)</span>
              </div>

              {npsSelectedScore !== null && (
                <div className="space-y-2.5 pt-1 animate-in fade-in duration-300">
                  <input
                    type="text"
                    placeholder="O que motivou a sua nota? (opcional)..."
                    value={npsComment}
                    onChange={(e) => setNpsComment(e.target.value)}
                    className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 text-xs font-bold text-slate-700 outline-none focus:border-indigo-500"
                  />
                  <Button
                    onClick={handleSendNps}
                    disabled={isSendingNps}
                    className="w-full py-3 rounded-2xl font-black text-xs !bg-indigo-600 text-white flex items-center justify-center gap-2 shadow-md shadow-indigo-100"
                  >
                    {isSendingNps ? <Loader2 size={16} className="animate-spin" /> : <><Star size={14} /> Enviar avaliação</>}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
