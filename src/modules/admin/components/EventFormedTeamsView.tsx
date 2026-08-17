import React from 'react';
import { Users, Trophy, Trash2, AlertTriangle } from 'lucide-react';
import type { TournamentEvent } from '@modules/events/types';
import { getDb } from '@infra/firebase';
import type { Firestore } from 'firebase/firestore';

interface Props {
  event: TournamentEvent;
  onUpdateEvent?: (event: TournamentEvent) => void;
}

export const EventFormedTeamsView: React.FC<Props> = ({ event, onUpdateEvent }) => {
  const pairs = event.pairs || [];
  const entries = event.entries || [];
  const activeEmails = new Set(entries.map((e) => e.email?.toLowerCase().trim()));
  const activePins = new Set(entries.map((e) => e.pin?.toLowerCase().trim()));

  const handleClearAllPairs = async () => {
    if (!window.confirm('Deseja realmente excluir/desfazer TODOS os times formados deste evento?')) {
      return;
    }

    const updatedEvent: TournamentEvent = {
      ...event,
      pairs: [],
    };

    const db = getDb();
    if (db && event.pin) {
      try {
        const { updateEvent } = await import('@infra/firebase/events');
        await updateEvent(db as Firestore, event.pin, { pairs: [] });
      } catch (err) {
        console.error('Erro ao limpar times no Firestore:', err);
      }
    }

    if (onUpdateEvent) {
      onUpdateEvent(updatedEvent);
    }
  };

  const handleRemovePair = async (pairId: string) => {
    const targetPair = pairs.find((p) => p.id === pairId);
    const pairName = targetPair?.teamCode || 'este time';
    if (!window.confirm(`Deseja realmente desfazer ${pairName}?`)) {
      return;
    }

    const nextPairs = pairs.filter((p) => p.id !== pairId);
    const updatedEvent: TournamentEvent = {
      ...event,
      pairs: nextPairs,
    };

    const db = getDb();
    if (db && event.pin) {
      try {
        const { updateEvent } = await import('@infra/firebase/events');
        await updateEvent(db as Firestore, event.pin, { pairs: nextPairs });
      } catch (err) {
        console.error('Erro ao excluir time no Firestore:', err);
      }
    }

    if (onUpdateEvent) {
      onUpdateEvent(updatedEvent);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-800 tracking-tight">Times Formados</h2>
          <p className="text-xs text-slate-400 font-bold mt-0.5">
            Duplas e equipes confirmadas no evento ({pairs.length} times no total).
          </p>
        </div>
        {pairs.length > 0 && (
          <button
            type="button"
            onClick={handleClearAllPairs}
            className="px-4 py-2.5 bg-red-50 hover:bg-red-100 active:scale-95 text-red-600 font-black text-xs rounded-2xl flex items-center gap-1.5 transition-all self-start sm:self-auto border border-red-200"
            title="Excluir todos os times formados"
          >
            <Trash2 size={15} />
            Limpar todos os times
          </button>
        )}
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden p-6">
        {pairs.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <Users className="mx-auto text-slate-300" size={32} />
            <p className="text-sm font-bold text-slate-400">Nenhum time formado no momento.</p>
            <p className="text-xs text-slate-300">
              Os times/duplas serão exibidos aqui assim que formados pelas inscrições.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pairs.map((pair, index) => {
              const p1Email = pair.p1?.email?.toLowerCase().trim();
              const p2Email = pair.p2?.email?.toLowerCase().trim();
              const p1Pin = pair.p1?.pin?.toLowerCase().trim();
              const p2Pin = pair.p2?.pin?.toLowerCase().trim();

              const isOrphan =
                entries.length > 0 &&
                ((p1Email && !activeEmails.has(p1Email) && (!p1Pin || !activePins.has(p1Pin))) ||
                  (p2Email && !activeEmails.has(p2Email) && (!p2Pin || !activePins.has(p2Pin))));

              return (
                <div
                  key={pair.id || index}
                  className={`p-4 rounded-2xl border flex items-center justify-between gap-4 transition-all ${
                    isOrphan ? 'bg-amber-50/60 border-amber-200' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center font-black text-[10px] shrink-0">
                      {pair.teamCode || `${String(pair.teamNumber || index + 1).padStart(3, '0')}`}
                    </div>
                    <div className="min-w-0">
                      <p className="font-black text-xs text-slate-800 truncate">
                        {pair.p1?.name || pair.p1?.nickname || 'Jogador 1'} &{' '}
                        {pair.p2?.name || pair.p2?.nickname || 'Jogador 2'}
                      </p>
                      <p className="text-[10px] text-slate-400 font-bold mt-0.5 truncate">
                        {pair.categoryId
                          ? (event.categories || []).find((category) => category.id === pair.categoryId)?.name ||
                            'Categoria'
                          : 'Categoria não vinculada'}{' '}
                        · PINs: {pair.p1?.pin || '-'} / {pair.p2?.pin || '-'}
                      </p>
                      {isOrphan && (
                        <p className="text-[9px] text-amber-600 font-black flex items-center gap-1 mt-1">
                          <AlertTriangle size={12} />
                          Atleta excluído da inscrição
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemovePair(pair.id)}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all active:scale-90 shrink-0"
                    title="Desfazer este time"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
