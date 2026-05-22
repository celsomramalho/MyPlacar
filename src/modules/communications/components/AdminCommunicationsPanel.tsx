import React, { useState, useEffect } from 'react';
import { Send, MessageSquare, PieChart, Users, User, Pin, Trash2, Loader2, Plus, X, ChevronDown, ChevronUp, Mail } from 'lucide-react';
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
import { Input } from '@shared/components/Input';
import { notificationService } from '../services/notificationService';

interface Props {
  adminProfile: UserProfile;
  appUrl: string;
}

export const AdminCommunicationsPanel: React.FC<Props> = ({ adminProfile, appUrl }) => {
  const [type, setType] = useState<'message' | 'poll'>('message');
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

  useEffect(() => {
    const db = getDb();
    if (!db || !adminProfile?.email) return;
    return subscribeRecentCommunications(db, 10, setRecentComms);
  }, [adminProfile?.email]);

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

  return (
    <div className="space-y-6">
      {/* Form Section */}
      <div className="bg-white rounded-3xl p-6 border-2 border-slate-100 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-brand-50 text-brand-600 rounded-2xl flex items-center justify-center">
            <Send size={20} />
          </div>
          <h2 className="text-lg font-black text-slate-900 tracking-tight">Novo comunicado</h2>
        </div>

        <div className="space-y-4">
          <div className="flex p-1 bg-slate-50 rounded-2xl gap-1">
            <button
              onClick={() => setType('message')}
              className={`flex-1 py-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${type === 'message' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <MessageSquare size={16} /> Mensagem
            </button>
            <button
              onClick={() => setType('poll')}
              className={`flex-1 py-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${type === 'poll' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <PieChart size={16} /> Enquete
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
        <h3 className="text-sm font-black text-slate-900 px-1">Comunicados recentes</h3>
        {recentComms.map(comm => (
          <div key={comm.id} className="bg-white rounded-3xl p-5 border-2 border-slate-100 shadow-sm">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${comm.type === 'poll' ? 'bg-amber-50 text-amber-600' : 'bg-brand-50 text-brand-600'}`}>
                  {comm.type === 'poll' ? <PieChart size={16} /> : <MessageSquare size={16} />}
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-900">{comm.title}</h4>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    {comm.targetUserId === 'all' ? 'Todos' : 'Individual'} • {new Date(comm.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <button onClick={() => handleDeleteComm(comm.id)} className="p-2 text-slate-300 hover:text-red-500 transition-colors">
                <Trash2 size={16} />
              </button>
            </div>

            <p className="text-xs text-slate-600 line-clamp-2 mb-4">{comm.content}</p>

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
        ))}
      </div>
    </div>
  );
};
