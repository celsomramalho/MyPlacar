import React, { useState, useEffect } from 'react';
import { Bell, ArrowLeft, MessageSquare, PieChart, Pin, Clock, CheckCircle2, ThumbsUp, Heart, Smile, PartyPopper, Send, Loader2 } from 'lucide-react';
import type { Communication, Reply } from '@modules/communications/types';
import { useGame } from '@modules/game';
import { getDb } from '@infra/firebase';
import {
  appendCommunicationReply,
  markCommunicationAsRead,
  subscribeUserCommunications,
  updateCommunicationPoll,
  updateCommunicationReactions,
} from '@infra/firebase/communications';
import { Button } from '@shared/components/Button';

interface Props {
  onBack: () => void;
}

const isEventNotification = (comm: Communication): boolean => {
  if (Boolean(comm.eventPin) || Boolean(comm.notificationType) || Boolean(comm.categoryId) || Boolean(comm.paymentId)) {
    return true;
  }
  if (comm.authorId === 'system') return true;
  const lowerTitle = (comm.title || '').toLowerCase();
  const lowerContent = (comm.content || '').toLowerCase();
  if (
    lowerTitle.includes('inscrição') ||
    lowerTitle.includes('pagamento') ||
    lowerTitle.includes('categoria') ||
    lowerTitle.includes('torneio') ||
    lowerTitle.includes('evento') ||
    lowerContent.includes('evento ') ||
    lowerContent.includes('inscrito na categoria') ||
    lowerContent.includes('inscrição confirmada')
  ) {
    return true;
  }
  return false;
};

export const CommunicationsScreen: React.FC<Props> = ({ onBack }) => {
  const { userProfile } = useGame();
  const [communications, setCommunications] = useState<Communication[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string[]>>({});
  const [isVoting, setIsVoting] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const db = getDb();
    if (!db) { setIsLoading(false); return; }

    const unsubscribe = subscribeUserCommunications(db, { pin: userProfile.pin, email: userProfile.email }, (docs) => {
      setCommunications(docs);
      setIsLoading(false);

      // Mark as read
      docs.forEach(comm => {
        const readList = comm.readBy || [];
        const isRead = (userProfile.pin && readList.includes(userProfile.pin)) || (userProfile.email && readList.includes(userProfile.email));
        if (!isRead) {
          markCommunicationAsRead(db, comm.id, userProfile.pin || userProfile.email);
        }
      });
    });

    return () => unsubscribe();
  }, [userProfile.pin, userProfile.email]);

  const handleVote = async (commId: string) => {
    const db = getDb();
    if (!db) return;

    const selectedIds = selectedOptions[commId] || [];
    if (selectedIds.length === 0) return;

    const comm = communications.find(c => c.id === commId);
    if (!comm || !comm.poll || comm.poll.closed) return;

    // Check if user already voted
    const alreadyVoted = comm.poll.options.some(opt => opt.voters?.includes(userProfile.pin));
    if (alreadyVoted) return;

    setIsVoting(prev => ({ ...prev, [commId]: true }));

    try {
      const newOptions = comm.poll.options.map(opt => {
        if (selectedIds.includes(opt.id)) {
          const voters = opt.voters || [];
          return { ...opt, votes: opt.votes + 1, voters: [...voters, userProfile.pin] };
        }
        return opt;
      });

      await updateCommunicationPoll(db, commId, newOptions, comm.poll.totalVotes + 1);
    } catch (error) {
      console.error('Erro ao votar:', error);
    } finally {
      setIsVoting(prev => ({ ...prev, [commId]: false }));
    }
  };

  const handleReaction = async (commId: string, emoji: string) => {
    const db = getDb();
    if (!db) return;

    const comm = communications.find(c => c.id === commId);
    if (!comm) return;

    const reactions = { ...(comm.reactions || {}) };
    const users = reactions[emoji] || [];

    if (users.includes(userProfile.pin)) {
      reactions[emoji] = users.filter(id => id !== userProfile.pin);
    } else {
      reactions[emoji] = [...users, userProfile.pin];
    }

    await updateCommunicationReactions(db, commId, reactions);
  };

  const handleSendReply = async (commId: string) => {
    const db = getDb();
    if (!db || !replyText[commId]?.trim()) return;

    const reply: Reply = {
      id: `r_${Date.now()}`,
      authorPin: userProfile.pin,
      authorName: userProfile.nickname || userProfile.name,
      content: replyText[commId].trim(),
      createdAt: Date.now()
    };

    await appendCommunicationReply(db, commId, reply);

    setReplyText(prev => ({ ...prev, [commId]: '' }));
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-100 p-4 sticky top-0 z-10 flex items-center gap-4">
        <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
          <ArrowLeft size={24} className="text-slate-600" />
        </button>
        <div className="flex items-center gap-2">
          <Bell className="text-brand-600" size={24} />
          <h1 className="text-xl font-black text-slate-900 tracking-tight">Comunicados</h1>
        </div>
      </header>

      <main className="flex-1 p-4 max-w-2xl mx-auto w-full space-y-4">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-12 h-12 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
            <p className="text-slate-500 font-bold">Carregando avisos...</p>
          </div>
        ) : communications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center text-slate-300">
              <MessageSquare size={40} />
            </div>
            <h2 className="text-lg font-black text-slate-900">Nenhum comunicado</h2>
            <p className="text-slate-500 text-sm max-w-xs">Você está em dia com todos os avisos do administrador.</p>
          </div>
        ) : (
          communications.map(comm => {
            const isEventComm = isEventNotification(comm);
            return (
              <div 
                key={comm.id} 
                className={`bg-white rounded-3xl p-6 shadow-sm border-2 transition-all ${comm.isPinned ? 'border-brand-100' : 'border-transparent'}`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${comm.type === 'poll' ? 'bg-amber-50 text-amber-600' : 'bg-brand-50 text-brand-600'}`}>
                      {comm.type === 'poll' ? <PieChart size={20} /> : <MessageSquare size={20} />}
                    </div>
                    <div>
                      <h3 className="font-black text-slate-900 leading-tight">{comm.title}</h3>
                      <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                        <Clock size={12} />
                        {new Date(comm.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                  {comm.isPinned && (
                    <div className="bg-brand-50 text-brand-600 p-1.5 rounded-lg">
                      <Pin size={14} />
                    </div>
                  )}
                </div>

                <div className={`text-slate-600 text-sm leading-relaxed whitespace-pre-wrap ${isEventComm ? 'mb-0' : 'mb-6'}`}>
                  {comm.content}
                </div>

                {comm.type === 'poll' && comm.poll && (
                  <div className="space-y-3 mb-6">
                    {comm.poll.options.map(opt => {
                      const hasVoted = comm.poll!.options.some(o => o.voters?.includes(userProfile.pin));
                      const isUserSelection = opt.voters?.includes(userProfile.pin);
                      const percentage = comm.poll!.totalVotes > 0 ? Math.round((opt.votes / comm.poll!.totalVotes) * 100) : 0;
                      
                      return (
                        <button
                          key={opt.id}
                          disabled={comm.poll!.closed || hasVoted}
                          onClick={() => setSelectedOptions(prev => {
                            const current = prev[comm.id] || [];
                            const next = current.includes(opt.id) 
                              ? current.filter(id => id !== opt.id)
                              : [...current, opt.id];
                            return { ...prev, [comm.id]: next };
                          })}
                          className={`w-full relative h-12 rounded-2xl border-2 transition-all overflow-hidden group active:scale-[0.98] ${
                            isUserSelection || (selectedOptions[comm.id]?.includes(opt.id)) 
                              ? 'border-brand-500 bg-brand-50/30' 
                              : 'border-slate-100 hover:border-slate-200'
                          }`}
                        >
                          {hasVoted && (
                            <div 
                              className={`absolute inset-y-0 left-0 transition-all duration-700 ${isUserSelection ? 'bg-brand-100' : 'bg-slate-50'}`}
                              style={{ width: `${percentage}%` }}
                            />
                          )}
                          <div className="absolute inset-0 px-4 flex items-center justify-between font-bold text-sm">
                            <div className="flex items-center gap-2">
                              {(isUserSelection || (selectedOptions[comm.id]?.includes(opt.id))) && <CheckCircle2 size={16} className="text-brand-600" />}
                              <span className={isUserSelection || (selectedOptions[comm.id]?.includes(opt.id)) ? 'text-brand-900' : 'text-slate-700'}>
                                {opt.text}
                              </span>
                            </div>
                            {hasVoted && (
                              <span className={isUserSelection ? 'text-brand-700' : 'text-slate-400'}>
                                {percentage}%
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}

                    {!comm.poll.options.some(o => o.voters?.includes(userProfile.pin)) && !comm.poll.closed && (
                      <Button
                        onClick={() => handleVote(comm.id)}
                        disabled={!selectedOptions[comm.id]?.length || isVoting[comm.id]}
                        className="w-full !py-3 !rounded-xl !text-xs font-black shadow-md !bg-amber-500 text-white gap-2 mt-2"
                      >
                        {isVoting[comm.id] ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                        Confirmar meu voto
                      </Button>
                    )}

                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">
                      <span>{comm.poll.totalVotes} {comm.poll.totalVotes === 1 ? 'voto' : 'votos'}</span>
                      {comm.poll.closed && <span className="text-amber-600 flex items-center gap-1"><CheckCircle2 size={12} /> Enquete encerrada</span>}
                    </div>
                  </div>
                )}

                {!isEventComm && (
                  <>
                    <div className="flex items-center gap-2 pt-4 border-t border-slate-50">
                      {[
                        { emoji: '👍', icon: ThumbsUp },
                        { emoji: '❤️', icon: Heart },
                        { emoji: '😊', icon: Smile },
                        { emoji: '🎉', icon: PartyPopper }
                      ].map(({ emoji, icon: Icon }) => {
                        const users = comm.reactions?.[emoji] || [];
                        const isActive = users.includes(userProfile.pin);
                        return (
                          <button
                            key={emoji}
                            onClick={() => handleReaction(comm.id, emoji)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${isActive ? 'bg-brand-50 text-brand-600 border-brand-100 border' : 'bg-slate-50 text-slate-400 border-transparent border hover:bg-slate-100'}`}
                          >
                            <span>{emoji}</span>
                            {users.length > 0 && <span>{users.length}</span>}
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-6 pt-6 border-t border-slate-50 space-y-4">
                      <div className="flex items-center gap-2 mb-2">
                        <MessageSquare size={14} className="text-slate-400" />
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Conversa</span>
                      </div>
                      
                      <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                        {comm.replies?.map(reply => (
                          <div 
                            key={reply.id} 
                            className={`flex flex-col ${reply.authorPin === userProfile.pin ? 'items-end' : 'items-start'}`}
                          >
                            <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${
                              reply.authorPin === userProfile.pin 
                                ? 'bg-blue-600 text-white rounded-tr-none' 
                                : 'bg-slate-100 text-slate-700 rounded-tl-none'
                            }`}>
                              <div className="flex items-center justify-between gap-4 mb-1">
                                <span className={`text-[10px] font-black uppercase tracking-wider ${reply.authorPin === userProfile.pin ? 'text-blue-200' : 'text-slate-400'}`}>
                                  {reply.authorPin === userProfile.pin ? 'Você' : reply.authorName}
                                </span>
                                <span className={`text-[9px] font-bold ${reply.authorPin === userProfile.pin ? 'text-blue-100' : 'text-slate-400'}`}>
                                  {new Date(reply.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                              <p className="font-medium leading-relaxed">{reply.content}</p>
                            </div>
                          </div>
                        ))}
                        {(!comm.replies || comm.replies.length === 0) && (
                          <p className="text-center text-[10px] font-bold text-slate-300 py-4 uppercase tracking-widest">Nenhuma mensagem ainda</p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 pt-2">
                        <div className="flex-1">
                          <input
                            placeholder="Escreva uma resposta..."
                            value={replyText[comm.id] || ''}
                            onChange={(e) => setReplyText(prev => ({ ...prev, [comm.id]: e.target.value }))}
                            className="w-full h-11 bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 text-xs font-bold text-slate-700 focus:border-blue-500 focus:outline-none transition-all"
                          />
                        </div>
                        <button 
                          onClick={() => handleSendReply(comm.id)}
                          disabled={!replyText[comm.id]?.trim()}
                          className="w-11 h-11 bg-blue-600 text-white rounded-2xl flex items-center justify-center hover:bg-blue-700 active:scale-90 transition-all disabled:opacity-40 disabled:active:scale-100 shadow-md shadow-blue-100"
                        >
                          <Send size={18} />
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })
        )}
      </main>
    </div>
  );
};
