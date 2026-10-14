import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  MessageSquare,
  PieChart,
  Users,
  User,
  Pin,
  Trash2,
  Loader2,
  Plus,
  X,
  ChevronDown,
  ChevronUp,
  Mail,
  LifeBuoy,
  TrendingUp,
  Menu,
  Check,
  DollarSign,
  UserCheck,
  AlertCircle,
  Bell,
} from 'lucide-react';
import type { Communication, Reply } from '@modules/communications/types';
import type { UserProfile } from '@modules/auth';
import { getDb } from '@infra/firebase';
import {
  addCommunication,
  appendCommunicationReply,
  deleteCommunication,
  fetchAllCommunicationRecipients,
  fetchCommunicationTargetPinByEmail,
  subscribeRecentCommunications,
  type FirebaseCommunicationDraft,
} from '@infra/firebase/communications';
import { Button } from '@shared/components/Button';
import { Toggle } from '@shared/components/Toggle';
import { fetchSystemConfig, saveSystemConfigPatch } from '@infra/firebase/systemConfig';
import { Input } from '@shared/components/Input';
import { notificationService } from '../services/notificationService';

export type CommunicationCategory =
  | 'sugestao_mensagem'
  | 'nps'
  | 'inscricao'
  | 'pagamento'
  | 'remocao_partida';

export type CommunicationFilterType = 'all' | CommunicationCategory;

export const getCommunicationCategory = (comm: Communication): CommunicationCategory => {
  const title = (comm.title || '').toLowerCase();
  const content = (comm.content || '').toLowerCase();
  const nType = (comm.notificationType || '').toLowerCase();

  // e) Remoção de partida
  if (
    nType === 'match_delete_request' ||
    title.includes('remoção de partida') ||
    title.includes('remover partida') ||
    content.includes('remoção da partida') ||
    content.includes('remover a partida')
  ) {
    return 'remocao_partida';
  }

  // d) Pagamento
  if (
    nType === 'payment_created' ||
    nType === 'pending_payment' ||
    Boolean(comm.paymentId) ||
    title.includes('pagamento') ||
    title.includes('valores pendentes') ||
    content.includes('pagamento salvo') ||
    content.includes('valores não pagos')
  ) {
    return 'pagamento';
  }

  // c) Inscrição
  if (
    nType === 'registration_confirmed' ||
    nType === 'new_category' ||
    nType === 'registration_deleted' ||
    Boolean(comm.categoryId) ||
    Boolean(comm.eventPin && !title.includes('remoção')) ||
    title.includes('inscrição') ||
    title.includes('inscrito') ||
    content.includes('inscrição confirmada') ||
    content.includes('sua inscrição') ||
    content.includes('inscrito na categoria')
  ) {
    return 'inscricao';
  }

  // b) NPS
  if (
    comm.type === 'nps' ||
    Boolean(comm.nps) ||
    title.includes('nps') ||
    title.includes('avaliação nps')
  ) {
    return 'nps';
  }

  // a) Sugestão/Mensagem
  return 'sugestao_mensagem';
};

export const CATEGORY_CONFIG: Record<
  CommunicationCategory,
  {
    label: string;
    shortLabel: string;
    badgeStyle: string;
    iconBg: string;
    iconColor: string;
  }
> = {
  sugestao_mensagem: {
    label: 'Sugestão/Mensagem',
    shortLabel: 'Sugestão',
    badgeStyle: 'bg-blue-50 text-blue-700 border-blue-200',
    iconBg: 'bg-blue-50',
    iconColor: 'text-blue-600',
  },
  nps: {
    label: 'NPS',
    shortLabel: 'NPS',
    badgeStyle: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    iconBg: 'bg-indigo-50',
    iconColor: 'text-indigo-600',
  },
  inscricao: {
    label: 'Inscrição',
    shortLabel: 'Inscrição',
    badgeStyle: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
  },
  pagamento: {
    label: 'Pagamento',
    shortLabel: 'Pagamento',
    badgeStyle: 'bg-amber-50 text-amber-700 border-amber-200',
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-600',
  },
  remocao_partida: {
    label: 'Remoção de partida',
    shortLabel: 'Remoção',
    badgeStyle: 'bg-rose-50 text-rose-700 border-rose-200',
    iconBg: 'bg-rose-50',
    iconColor: 'text-rose-600',
  },
};

interface Props {
  adminProfile: UserProfile;
  appUrl: string;
}

export const AdminCommunicationsPanel: React.FC<Props> = ({ adminProfile, appUrl }) => {
  const [type, setType] = useState<'message' | 'poll' | 'support'>('message');
  const [supportEnabled, setSupportEnabled] = useState(true);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [targetType, setTargetType] = useState<'all' | 'individual'>('all');
  const [targetEmail, setTargetEmail] = useState('');
  const [isPinned, setIsPinned] = useState(false);
  const [sendEmail, setSendEmail] = useState(true);
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [recentComms, setRecentComms] = useState<Communication[]>([]);
  const [showRepliesFor, setShowRepliesFor] = useState<string | null>(null);
  const [adminReply, setAdminReply] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CommunicationFilterType>('all');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMenuOpen]);

  useEffect(() => {
    const db = getDb();
    if (!db) return;
    fetchSystemConfig(db).then(cfg => {
      if (cfg && typeof cfg.supportChannelEnabled === 'boolean') {
        setSupportEnabled(cfg.supportChannelEnabled);
      }
    });
    if (!adminProfile?.email) return;
    return subscribeRecentCommunications(db, 50, setRecentComms);
  }, [adminProfile?.email]);

  const handleToggleSupport = async (val: boolean) => {
    setSupportEnabled(val);
    const db = getDb();
    if (db) {
      await saveSystemConfigPatch(db, { supportChannelEnabled: val });
    }
  };

  const handleSelectType = (selected: 'message' | 'poll' | 'support') => {
    setType(selected);
    if (selected === 'support') {
      setTitle('Canal de sugestões e suporte');
      setContent('Tem alguma dúvida, encontrou algum problema ou tem sugestões de melhorias para o MyPlacar? Deixe sua mensagem abaixo que nossa equipe responderá por aqui!');
    }
  };

  const handleAddOption = () => {
    if (pollOptions.length < 5) {
      setPollOptions([...pollOptions, '']);
    }
  };

  const handleRemoveOption = (index: number) => {
    if (pollOptions.length > 2) {
      setPollOptions(pollOptions.filter((_, i) => i !== index));
    }
  };

  const handleSend = async () => {
    if (!title || !content) {
      setStatus('Preencha o título e o conteúdo');
      return;
    }

    setIsLoading(true);
    setStatus('Enviando...');

    try {
      const db = getDb();
      if (!db) throw new Error('Database not initialized');

      let targetId = 'all';
      if (targetType === 'individual') {
        const targetPin = await fetchCommunicationTargetPinByEmail(db, targetEmail);
        if (!targetPin) {
          throw new Error('Usuário não encontrado com este e-mail');
        }
        targetId = targetPin;
      }

      const commData: FirebaseCommunicationDraft = {
        type,
        title,
        content,
        authorId: adminProfile.pin,
        authorName: adminProfile.nickname || adminProfile.name,
        createdAt: Date.now(),
        targetUserId: targetId,
        isPinned,
        readBy: [],
        reactions: {}
      };

      if (type === 'poll') {
        commData.poll = {
          options: pollOptions.filter(o => o.trim()).map((o, i) => ({ id: `opt_${i}`, text: o, votes: 0 })),
          totalVotes: 0,
          closed: false
        };
      } else if (type === 'support') {
        commData.supportConfig = {
          isActive: true
        };
      }

      await addCommunication(db, commData);
      
      // Gatilho de notificações híbridas (Push + Email)
      const usersToNotify = targetType === 'individual'
        ? [{ email: targetEmail }]
        : await fetchAllCommunicationRecipients(db);

      await notificationService.triggerHybridNotifications(commData, usersToNotify, sendEmail, appUrl);
      
      setStatus('Comunicado enviado com sucesso!');
      setTitle('');
      setContent('');
      setPollOptions(['', '']);
      setTargetEmail('');
      setIsPinned(false);
    } catch (error: any) {
      setStatus(`Erro: ${error.message}`);
    } finally {
      setIsLoading(false);
      setTimeout(() => setStatus(null), 3000);
    }
  };

  const handleSendAdminReply = async (commId: string) => {
    const db = getDb();
    if (!db || !adminReply.trim()) return;

    const reply: Reply = {
      id: `r_${Date.now()}`,
      authorPin: adminProfile.pin,
      authorName: adminProfile.nickname || adminProfile.name,
      content: adminReply.trim(),
      createdAt: Date.now()
    };

    await appendCommunicationReply(db, commId, reply);

    setAdminReply('');
  };

  const handleDeleteComm = async (id: string) => {
    const db = getDb();
    if (!db) return;
    await deleteCommunication(db, id);
  };

  const categoryCounts = recentComms.reduce<Record<string, number>>((acc, comm) => {
    const cat = getCommunicationCategory(comm);
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});

  const filteredComms = selectedCategory === 'all'
    ? recentComms
    : recentComms.filter(comm => getCommunicationCategory(comm) === selectedCategory);

  return (
    <div className="space-y-6">
      {/* Toggle Canal de Suporte e Sugestões */}
      <div className="bg-white rounded-3xl p-5 border-2 border-slate-100 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${supportEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
            <LifeBuoy size={20} />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-800">Canal de sugestões e suporte</h3>
            <p className="text-[11px] font-bold text-slate-500">
              {supportEnabled ? 'Ativo — usuários podem enviar dúvidas e sugestões' : 'Desativado — canal de sugestões pausado'}
            </p>
          </div>
        </div>
        <Toggle
          id="toggle-support-channel"
          checked={supportEnabled}
          onChange={handleToggleSupport}
        />
      </div>

      {/* Card: Resultado da Pesquisa NPS Contínua */}
      {(() => {
        const npsComms = recentComms.filter(c => c.type === 'nps');
        const allNpsEntries: { id: string; score: number; authorName: string; comment?: string; createdAt: number }[] = [];

        npsComms.forEach(c => {
          const scores = c.nps?.scores || {};
          const comments = c.nps?.comments || {};
          const scoreKeys = Object.keys(scores);

          if (scoreKeys.length > 0) {
            scoreKeys.forEach(userKey => {
              allNpsEntries.push({
                id: `${c.id}_${userKey}`,
                score: Number(scores[userKey]),
                authorName: comments[userKey]?.authorName || c.authorName || 'Usuário',
                comment: comments[userKey]?.comment || (c.content && c.content.includes('Motivo') ? c.content.split('Motivo / Comentário:\n')[1]?.replace(/^"|"$/g, '') : undefined),
                createdAt: comments[userKey]?.createdAt || c.createdAt,
              });
            });
          } else if (c.title && c.title.includes('Nota ')) {
            // Extrai nota se gravado como comunicado individual
            const match = c.title.match(/Nota (\d+)/);
            if (match) {
              const score = Number(match[1]);
              allNpsEntries.push({
                id: c.id,
                score,
                authorName: c.authorName || 'Usuário',
                comment: c.content && c.content.includes('Motivo') ? c.content.split('Motivo / Comentário:\n')[1]?.replace(/^"|"$/g, '') : undefined,
                createdAt: c.createdAt,
              });
            }
          }
        });

        const total = allNpsEntries.length;
        const promoters = allNpsEntries.filter(e => e.score >= 9).length;
        const passives = allNpsEntries.filter(e => e.score >= 7 && e.score <= 8).length;
        const detractors = allNpsEntries.filter(e => e.score <= 6).length;
        const npsScore = total > 0 ? Math.round(((promoters - detractors) / total) * 100) : 0;
        const zoneLabel = npsScore >= 75 ? 'Excelente' : npsScore >= 50 ? 'Muito bom' : npsScore >= 0 ? 'Razoável' : 'Crítico';
        const zoneColor = npsScore >= 75 ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : npsScore >= 50 ? 'bg-green-100 text-green-800 border-green-200' : npsScore >= 0 ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-red-100 text-red-800 border-red-200';

        return (
          <div className="bg-white rounded-3xl p-6 border-2 border-slate-100 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                  <TrendingUp size={20} />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-900 tracking-tight">Resultado da pesquisa NPS</h2>
                  <p className="text-[11px] font-bold text-slate-400">
                    Pesquisa permanentemente ativa na Central de tutoriais
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs font-black text-slate-700 bg-slate-100 px-3 py-1 rounded-full">
                  {total} {total === 1 ? 'avaliação' : 'avaliações'}
                </span>
              </div>
            </div>

            {total === 0 ? (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-center">
                <p className="text-xs font-bold text-slate-500">
                  Nenhuma avaliação registrada ainda. Os jogadores podem avaliar o MyPlacar na Central de tutoriais a qualquer momento.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Score consolidado e classificação */}
                <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Score NPS geral</span>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-3xl font-black text-slate-900">
                        {npsScore > 0 ? `+${npsScore}` : npsScore}
                      </span>
                      <span className={`text-xs font-black px-2.5 py-1 rounded-full border ${zoneColor}`}>
                        Zona ${zoneLabel}
                      </span>
                    </div>
                  </div>
                  <div className="text-right text-[11px] font-bold text-slate-500">
                    <p>Escala oficial de -100 a +100</p>
                  </div>
                </div>

                {/* Barra de distribuição */}
                <div className="space-y-2">
                  <div className="h-3.5 bg-slate-100 rounded-full overflow-hidden flex">
                    <div style={{ width: `${(detractors / total) * 100}%` }} className="bg-red-500 transition-all" title={`Detratores: ${detractors}`} />
                    <div style={{ width: `${(passives / total) * 100}%` }} className="bg-amber-400 transition-all" title={`Neutros: ${passives}`} />
                    <div style={{ width: `${(promoters / total) * 100}%` }} className="bg-emerald-500 transition-all" title={`Promotores: ${promoters}`} />
                  </div>
                  <div className="grid grid-cols-3 text-center text-[10px] font-bold gap-1.5">
                    <span className="text-red-600 bg-red-50 py-1 rounded-xl border border-red-100">🔴 {Math.round((detractors / total) * 100)}% Detratores ({detractors})</span>
                    <span className="text-amber-600 bg-amber-50 py-1 rounded-xl border border-amber-100">🟡 {Math.round((passives / total) * 100)}% Neutros ({passives})</span>
                    <span className="text-emerald-700 bg-emerald-50 py-1 rounded-xl border border-emerald-100">🟢 {Math.round((promoters / total) * 100)}% Promotores ({promoters})</span>
                  </div>
                </div>

                {/* Comentários recentes dos jogadores */}
                {allNpsEntries.filter(e => Boolean(e.comment)).length > 0 && (
                  <div className="pt-2 border-t border-slate-100 space-y-2">
                    <h3 className="text-xs font-black text-slate-700">Comentários dos jogadores</h3>
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {allNpsEntries
                        .filter(e => Boolean(e.comment))
                        .map(entry => {
                          const badgeColor = entry.score >= 9 ? 'text-emerald-700 bg-emerald-50' : entry.score >= 7 ? 'text-amber-700 bg-amber-50' : 'text-red-700 bg-red-50';
                          return (
                            <div key={entry.id} className="p-3 bg-slate-50 border border-slate-100 rounded-2xl text-xs space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="font-black text-slate-800">{entry.authorName}</span>
                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${badgeColor}`}>
                                  Nota {entry.score}
                                </span>
                              </div>
                              <p className="text-slate-600 font-medium text-[11px] leading-snug">
                                "{entry.comment}"
                              </p>
                              <p className="text-[9px] font-bold text-slate-400">
                                {new Date(entry.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* Form Section */}
      <div className="bg-white rounded-3xl p-6 border-2 border-slate-100 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-brand-50 text-brand-600 rounded-2xl flex items-center justify-center">
            <Send size={20} />
          </div>
          <h2 className="text-lg font-black text-slate-900 tracking-tight">Novo comunicado</h2>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-3 p-1 bg-slate-50 rounded-2xl gap-1">
            <button
              onClick={() => setType('message')}
              className={`py-2 px-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 ${type === 'message' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <MessageSquare size={16} /> Mensagem
            </button>
            <button
              onClick={() => setType('poll')}
              className={`py-2 px-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 ${type === 'poll' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <PieChart size={16} /> Enquete
            </button>
            <button
              onClick={() => handleSelectType('support')}
              className={`py-2 px-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 ${type === 'support' ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <LifeBuoy size={16} /> Suporte
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setTargetType('all')}
              className={`py-3 rounded-2xl text-xs font-black border-2 transition-all flex items-center justify-center gap-2 ${targetType === 'all' ? 'border-brand-600 bg-brand-50 text-brand-600' : 'border-slate-100 text-slate-400'}`}
            >
              <Users size={16} /> Todos
            </button>
            <button
              onClick={() => setTargetType('individual')}
              className={`py-3 rounded-2xl text-xs font-black border-2 transition-all flex items-center justify-center gap-2 ${targetType === 'individual' ? 'border-brand-600 bg-brand-50 text-brand-600' : 'border-slate-100 text-slate-400'}`}
            >
              <User size={16} /> Individual
            </button>
          </div>

          {targetType === 'individual' && (
            <Input
              label="E-mail do destinatário"
              value={targetEmail}
              onChange={(e) => setTargetEmail(e.target.value)}
              placeholder="exemplo@email.com"
              type="email"
            />
          )}

          <Input
            label="Título do comunicado"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: Manutenção agendada"
          />

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Conteúdo</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full h-32 bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 text-sm font-bold text-slate-700 focus:border-brand-500 focus:outline-none transition-all resize-none"
              placeholder="Escreva sua mensagem aqui..."
            />
          </div>

          {type === 'poll' && (
            <div className="space-y-3 p-4 bg-amber-50/50 rounded-2xl border-2 border-amber-100">
              <label className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Opções da enquete</label>
              {pollOptions.map((opt, idx) => (
                <div key={idx} className="flex gap-2">
                  <input
                    value={opt}
                    onChange={(e) => {
                      const newOpts = [...pollOptions];
                      newOpts[idx] = e.target.value;
                      setPollOptions(newOpts);
                    }}
                    className="flex-1 bg-white border-2 border-amber-100 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 focus:border-amber-500 focus:outline-none"
                    placeholder={`Opção ${idx + 1}`}
                  />
                  {pollOptions.length > 2 && (
                    <button onClick={() => handleRemoveOption(idx)} className="p-2 text-red-400 hover:text-red-600">
                      <X size={20} />
                    </button>
                  )}
                </div>
              ))}
              {pollOptions.length < 5 && (
                <button onClick={handleAddOption} className="flex items-center gap-2 text-xs font-black text-amber-600 hover:text-amber-700 px-1">
                  <Plus size={16} /> Adicionar opção
                </button>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setIsPinned(!isPinned)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all ${isPinned ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500'}`}
            >
              <Pin size={16} /> {isPinned ? 'Mensagem fixada' : 'Fixar mensagem'}
            </button>

            <button
              onClick={() => setSendEmail(!sendEmail)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all ${sendEmail ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'}`}
            >
              <Mail size={16} /> {sendEmail ? 'Enviar por e-mail: Sim' : 'Enviar por e-mail: Não'}
            </button>
          </div>

          <Button
            onClick={handleSend}
            disabled={isLoading}
            className="w-full py-4 rounded-2xl font-black shadow-lg !bg-brand-600 text-white gap-2"
          >
            {isLoading ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
            Enviar comunicado
          </Button>

          {status && (
            <p className={`text-center text-xs font-bold ${status.includes('Erro') ? 'text-red-500' : 'text-emerald-600'}`}>
              {status}
            </p>
          )}
        </div>
      </div>

      {/* History Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-black text-slate-900">Comunicados recentes</h3>
            {selectedCategory !== 'all' && (
              <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-50 text-blue-700 border border-blue-200 animate-in fade-in">
                <span>{CATEGORY_CONFIG[selectedCategory].label}</span>
                <button
                  type="button"
                  onClick={() => setSelectedCategory('all')}
                  className="hover:text-blue-900 ml-0.5 p-0.5"
                  title="Remover filtro"
                >
                  <X size={12} />
                </button>
              </div>
            )}
          </div>

          {/* Menu button + dropdown */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setIsMenuOpen(prev => !prev)}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-95 shadow-sm border ${
                isMenuOpen || selectedCategory !== 'all'
                  ? 'bg-blue-50 border-blue-200 text-blue-600 shadow-blue-100'
                  : 'bg-slate-100 hover:bg-slate-200 border-slate-200/80 text-slate-700'
              }`}
              title="Separar por tipos de comunicação"
              aria-label="Separar por tipos de comunicação"
            >
              <Menu size={18} strokeWidth={2.4} />
            </button>

            {isMenuOpen && (
              <div className="absolute right-0 top-11 w-64 bg-white rounded-2xl shadow-xl border border-slate-200 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Tipos de comunicação
                  </p>
                  {selectedCategory !== 'all' && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCategory('all');
                        setIsMenuOpen(false);
                      }}
                      className="text-[10px] font-bold text-blue-600 hover:underline"
                    >
                      Limpar
                    </button>
                  )}
                </div>

                <div className="py-1">
                  {/* Todos */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCategory('all');
                      setIsMenuOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-xs font-bold flex items-center justify-between transition-colors ${
                      selectedCategory === 'all'
                        ? 'bg-blue-50/80 text-blue-700 font-black'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500">
                        <Bell size={13} />
                      </div>
                      <span>Todos os avisos</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-bold">
                        {recentComms.length}
                      </span>
                      {selectedCategory === 'all' && <Check size={14} className="text-blue-600" />}
                    </div>
                  </button>

                  {/* Separator */}
                  <div className="my-1 border-t border-slate-100" />

                  {/* a) Sugestão/Mensagem */}
                  {/* b) NPS */}
                  {/* c) Inscrição */}
                  {/* d) Pagamento */}
                  {/* e) Remoção de partida */}
                  {(
                    [
                      'sugestao_mensagem',
                      'nps',
                      'inscricao',
                      'pagamento',
                      'remocao_partida',
                    ] as const
                  ).map((catKey, index) => {
                    const cfg = CATEGORY_CONFIG[catKey];
                    const isSelected = selectedCategory === catKey;
                    const count = categoryCounts[catKey] || 0;
                    const letter = ['a', 'b', 'c', 'd', 'e'][index];

                    return (
                      <button
                        key={catKey}
                        type="button"
                        onClick={() => {
                          setSelectedCategory(catKey);
                          setIsMenuOpen(false);
                        }}
                        className={`w-full px-3 py-2 text-xs font-bold flex items-center justify-between transition-colors ${
                          isSelected
                            ? 'bg-blue-50/80 text-blue-700 font-black'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-6 h-6 rounded-lg ${cfg.iconBg} ${cfg.iconColor} flex items-center justify-center`}
                          >
                            {catKey === 'sugestao_mensagem' && <MessageSquare size={13} />}
                            {catKey === 'nps' && <TrendingUp size={13} />}
                            {catKey === 'inscricao' && <UserCheck size={13} />}
                            {catKey === 'pagamento' && <DollarSign size={13} />}
                            {catKey === 'remocao_partida' && <AlertCircle size={13} />}
                          </div>
                          <span>
                            <span className="text-slate-400 font-normal mr-1">{letter})</span>
                            {cfg.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                              count > 0 ? cfg.badgeStyle : 'bg-slate-100 text-slate-400'
                            }`}
                          >
                            {count}
                          </span>
                          {isSelected && <Check size={14} className="text-blue-600" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {filteredComms.length === 0 ? (
          <div className="bg-white rounded-3xl p-8 border-2 border-slate-100 shadow-sm text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-400 mx-auto flex items-center justify-center">
              <Bell size={22} />
            </div>
            <p className="text-xs font-black text-slate-700">Nenhum comunicado encontrado</p>
            <p className="text-[11px] font-bold text-slate-400 max-w-xs mx-auto">
              Não há comunicados para o filtro "{CATEGORY_CONFIG[selectedCategory as keyof typeof CATEGORY_CONFIG]?.label || 'selecionado'}".
            </p>
            {selectedCategory !== 'all' && (
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                className="mt-2 text-xs font-black text-blue-600 hover:underline inline-block"
              >
                Limpar filtro e ver todos ({recentComms.length})
              </button>
            )}
          </div>
        ) : (
          filteredComms.map(comm => {
            const commCat = getCommunicationCategory(comm);
            const catCfg = CATEGORY_CONFIG[commCat];
            return (
              <div key={comm.id} className="bg-white rounded-3xl p-5 border-2 border-slate-100 shadow-sm">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${catCfg.iconBg} ${catCfg.iconColor}`}>
                      {commCat === 'remocao_partida' ? (
                        <AlertCircle size={16} />
                      ) : commCat === 'pagamento' ? (
                        <DollarSign size={16} />
                      ) : commCat === 'inscricao' ? (
                        <UserCheck size={16} />
                      ) : commCat === 'nps' ? (
                        <TrendingUp size={16} />
                      ) : comm.type === 'poll' ? (
                        <PieChart size={16} />
                      ) : comm.type === 'support' ? (
                        <LifeBuoy size={16} />
                      ) : (
                        <MessageSquare size={16} />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-black text-slate-900">{comm.title}</h4>
                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md border ${catCfg.badgeStyle}`}>
                          {catCfg.label}
                        </span>
                      </div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                        {comm.targetUserId === 'all' ? 'Todos' : comm.targetUserId === 'admin' ? `Enviado por ${comm.authorName}` : 'Individual'} • {new Date(comm.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => handleDeleteComm(comm.id)} className="p-2 text-slate-300 hover:text-red-500 transition-colors">
                    <Trash2 size={16} />
                  </button>
                </div>

                <p className="text-xs text-slate-600 whitespace-pre-line mb-4 leading-relaxed">{comm.content}</p>

            {/* Reactions View for Admin */}
            {comm.reactions && Object.keys(comm.reactions).length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4 p-2 bg-slate-50 rounded-xl">
                {Object.entries(comm.reactions).map(([emoji, pins]) => (
                  (pins as string[]).length > 0 && (
                    <div key={emoji} className="flex items-center gap-1.5 px-2 py-1 bg-white rounded-lg border border-slate-100 shadow-sm">
                      <span className="text-sm">{emoji}</span>
                      <span className="text-[10px] font-black text-slate-500">{(pins as string[]).length}</span>
                    </div>
                  )
                ))}
              </div>
            )}

            {comm.type === 'poll' && comm.poll && (
              <div className="space-y-2 mb-4">
                {comm.poll.options.map(opt => (
                  <div key={opt.id} className="space-y-1">
                    <div className="flex justify-between text-[10px] font-black text-slate-500 uppercase tracking-wider">
                      <span>{opt.text}</span>
                      <span>{opt.votes} votos ({comm.poll!.totalVotes > 0 ? Math.round((opt.votes / comm.poll!.totalVotes) * 100) : 0}%)</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-amber-500 transition-all duration-500" 
                        style={{ width: `${comm.poll!.totalVotes > 0 ? (opt.votes / comm.poll!.totalVotes) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* NPS Analytics Section */}
            {comm.type === 'nps' && (() => {
              const scores = Object.values(comm.nps?.scores || {}) as number[];
              const total = scores.length;
              const promoters = scores.filter(s => s >= 9).length;
              const passives = scores.filter(s => s >= 7 && s <= 8).length;
              const detractors = scores.filter(s => s <= 6).length;
              const npsScore = total > 0 ? Math.round(((promoters - detractors) / total) * 100) : 0;
              const zoneLabel = npsScore >= 75 ? 'Excelente' : npsScore >= 50 ? 'Muito bom' : npsScore >= 0 ? 'Razoável' : 'Crítico';
              const zoneColor = npsScore >= 75 ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : npsScore >= 50 ? 'bg-green-100 text-green-800 border-green-200' : npsScore >= 0 ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-red-100 text-red-800 border-red-200';
              const commentsList = Object.entries(comm.nps?.comments || {});

              return (
                <div className="space-y-3 mb-4 p-4 bg-indigo-50/50 rounded-2xl border-2 border-indigo-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Resultado NPS</span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-2xl font-black text-slate-900">{total > 0 ? (npsScore > 0 ? `+${npsScore}` : npsScore) : '—'}</span>
                        {total > 0 && (
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${zoneColor}`}>
                            Zona ${zoneLabel}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{total} {total === 1 ? 'avaliação' : 'avaliações'}</span>
                    </div>
                  </div>

                  {total > 0 && (
                    <div>
                      <div className="h-3 bg-slate-200 rounded-full overflow-hidden flex">
                        <div style={{ width: `${(detractors / total) * 100}%` }} className="bg-red-500 transition-all" title={`Detratores: ${detractors}`} />
                        <div style={{ width: `${(passives / total) * 100}%` }} className="bg-amber-400 transition-all" title={`Neutros: ${passives}`} />
                        <div style={{ width: `${(promoters / total) * 100}%` }} className="bg-emerald-500 transition-all" title={`Promotores: ${promoters}`} />
                      </div>
                      <div className="grid grid-cols-3 text-center text-[10px] font-bold mt-2 gap-1">
                        <span className="text-red-600 bg-red-50 py-0.5 rounded">🔴 {Math.round((detractors / total) * 100)}% Detratores ({detractors})</span>
                        <span className="text-amber-600 bg-amber-50 py-0.5 rounded">🟡 {Math.round((passives / total) * 100)}% Neutros ({passives})</span>
                        <span className="text-emerald-700 bg-emerald-50 py-0.5 rounded">🟢 {Math.round((promoters / total) * 100)}% Promotores ({promoters})</span>
                      </div>
                    </div>
                  )}

                  {commentsList.length > 0 && (
                    <div className="pt-2 border-t border-indigo-100/60 space-y-1.5">
                      <span className="text-[10px] font-black text-indigo-600 uppercase tracking-wider">Comentários dos usuários ({commentsList.length})</span>
                      <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                        {commentsList.map(([key, item]) => (
                          <div key={key} className="bg-white p-2.5 rounded-xl border border-indigo-100 text-xs">
                            <div className="flex justify-between text-[10px] font-black text-slate-500">
                              <span>{item.authorName}</span>
                              <span className="text-indigo-600 font-black">Nota: {comm.nps?.scores?.[key] ?? '—'}</span>
                            </div>
                            <p className="text-slate-700 font-medium mt-0.5 text-xs">{item.comment}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Replies Section for Admin */}
            <div className="space-y-3">
              <button 
                onClick={() => setShowRepliesFor(showRepliesFor === comm.id ? null : comm.id)}
                className="flex items-center gap-2 text-[10px] font-black text-blue-600 uppercase tracking-widest"
              >
                {showRepliesFor === comm.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                {comm.replies?.length || 0} Respostas
              </button>

              {showRepliesFor === comm.id && (
                <div className="space-y-4 pt-2 border-t border-slate-50">
                  <div className="space-y-3 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                    {comm.replies?.map(reply => (
                      <div key={reply.id} className={`flex flex-col ${reply.authorPin === adminProfile.pin ? 'items-end' : 'items-start'}`}>
                        <div className={`max-w-[90%] p-2.5 rounded-xl text-xs ${reply.authorPin === adminProfile.pin ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
                          <p className="font-bold mb-0.5">{reply.authorName}</p>
                          <p className="font-medium">{reply.content}</p>
                        </div>
                      </div>
                    ))}
                    {(!comm.replies || comm.replies.length === 0) && (
                      <p className="text-center text-[10px] font-bold text-slate-300 py-2 uppercase tracking-widest">Nenhuma mensagem ainda</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Input 
                      placeholder="Responder..." 
                      value={adminReply} 
                      onChange={(e) => setAdminReply(e.target.value)}
                      className="text-xs py-1.5"
                    />
                    <button 
                      onClick={() => handleSendAdminReply(comm.id)}
                      className="p-2.5 bg-blue-600 text-white rounded-xl active:scale-90 transition-all shadow-md shadow-blue-100"
                    >
                      <Send size={16} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })
    )}
      </div>
    </div>
  );
};
