import React, { useState, useEffect } from 'react';
import { Gavel, Plus, Loader2, X } from 'lucide-react';
import { getDb, findUserByPin } from '@infra/firebase';

export interface EventJudgesManagerProps {
  judgePins: string[];
  judgeNamesByPin: Record<string, string>;
  canManageEventAdmins: boolean;
  isReadOnlyRegistration: boolean;
  onAddJudge: (pin: string) => void;
  onRemoveJudge: (pin: string) => void;
}

export const EventJudgesManager: React.FC<EventJudgesManagerProps> = ({
  judgePins,
  judgeNamesByPin,
  canManageEventAdmins,
  isReadOnlyRegistration,
  onAddJudge,
  onRemoveJudge,
}) => {
  const [judgePin, setJudgePin] = useState('');
  const [judgeLookupName, setJudgeLookupName] = useState('');
  const [isSearchingJudgePin, setIsSearchingJudgePin] = useState(false);
  const [pendingJudgeRemovalPin, setPendingJudgeRemovalPin] = useState<string | null>(null);

  useEffect(() => {
    const lookup = async () => {
      const pin = judgePin.toUpperCase().trim();
      if (pin.length !== 5) {
        setJudgeLookupName('');
        return;
      }

      setIsSearchingJudgePin(true);
      const db = getDb();
      if (!db) {
        setIsSearchingJudgePin(false);
        return;
      }

      try {
        const user = await findUserByPin(db, pin);
        setJudgeLookupName(user ? user.nickname : 'Usuário não localizado');
      } catch {
        setJudgeLookupName('');
      } finally {
        setIsSearchingJudgePin(false);
      }
    };

    lookup();
  }, [judgePin]);

  const handleAdd = () => {
    if (!canManageEventAdmins) return;
    const pin = judgePin.toUpperCase().trim();
    if (pin.length < 5 || judgeLookupName === 'Usuário não localizado') return;
    onAddJudge(pin);
    setJudgePin('');
    setJudgeLookupName('');
  };

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <Gavel size={17} className="text-amber-600" />
        <div>
          <p className="text-xs font-black text-slate-900">Juízes da partida</p>
          <p className="text-[10px] font-bold text-slate-400">Podem lançar e atualizar placares das partidas do evento.</p>
        </div>
      </div>

      {!canManageEventAdmins ? (
        <p className="text-xs font-bold text-slate-400 italic">
          Somente administradores ou co-administradores podem adicionar ou remover juízes deste evento.
        </p>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              maxLength={5}
              value={judgePin}
              disabled={isReadOnlyRegistration}
              onChange={(e) => setJudgePin(e.target.value.toUpperCase())}
              placeholder="PIN do usuário"
              className="w-1/3 max-w-[33.333%] min-w-0 flex-none h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 font-mono font-black text-xs uppercase placeholder:normal-case outline-none"
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={judgePin.trim().length !== 5 || isSearchingJudgePin || judgeLookupName === 'Usuário não localizado'}
              className="px-4 h-11 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-black text-xs rounded-xl flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
            >
              {isSearchingJudgePin ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Adicionar
            </button>
          </div>
          {judgeLookupName && (
            <p className={`text-[11px] font-black px-1 ${judgeLookupName === 'Usuário não localizado' ? 'text-red-500' : 'text-emerald-600'}`}>
              {judgeLookupName}
            </p>
          )}
        </div>
      )}

      {judgePins.length === 0 ? (
        <p className="text-xs font-bold text-slate-400 italic">Nenhum juiz cadastrado no evento.</p>
      ) : (
        <div className="space-y-2 pt-1">
          {judgePins.map((pin) => {
            const normalizedPin = pin.toUpperCase().trim();
            const displayName = judgeNamesByPin[normalizedPin] || 'Juiz';
            const isPendingRemoval = pendingJudgeRemovalPin === normalizedPin;

            return (
              <div key={normalizedPin} className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-slate-200 bg-slate-50">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black text-slate-800 truncate">{displayName}</p>
                  <p className="text-[10px] font-mono font-bold text-slate-400">PIN: {normalizedPin}</p>
                </div>
                {canManageEventAdmins && (
                  isPendingRemoval ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          onRemoveJudge(normalizedPin);
                          setPendingJudgeRemovalPin(null);
                        }}
                        className="px-2 py-1 text-[10px] font-black bg-red-600 text-white rounded-lg active:scale-95 cursor-pointer"
                      >
                        Confirmar
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingJudgeRemovalPin(null)}
                        className="px-2 py-1 text-[10px] font-black bg-slate-200 text-slate-600 rounded-lg active:scale-95 cursor-pointer"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPendingJudgeRemovalPin(normalizedPin)}
                      className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg transition-colors cursor-pointer"
                      title="Remover juiz"
                    >
                      <X size={14} />
                    </button>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
