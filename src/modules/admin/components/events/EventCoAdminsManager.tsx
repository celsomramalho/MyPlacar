import React, { useState, useEffect } from 'react';
import { ShieldCheck, Plus, Loader2, X, Search } from 'lucide-react';
import { getDb, findUserByPin } from '@infra/firebase';

export interface EventCoAdminsManagerProps {
  coAdminPins: string[];
  coAdminNamesByPin: Record<string, string>;
  canManageEventAdmins: boolean;
  isReadOnlyRegistration: boolean;
  onAddCoAdmin: (pin: string) => void;
  onRemoveCoAdmin: (pin: string) => void;
}

export const EventCoAdminsManager: React.FC<EventCoAdminsManagerProps> = ({
  coAdminPins,
  coAdminNamesByPin,
  canManageEventAdmins,
  isReadOnlyRegistration,
  onAddCoAdmin,
  onRemoveCoAdmin,
}) => {
  const [coAdminPin, setCoAdminPin] = useState('');
  const [coAdminLookupName, setCoAdminLookupName] = useState('');
  const [isSearchingCoAdminPin, setIsSearchingCoAdminPin] = useState(false);
  const [pendingCoAdminRemovalPin, setPendingCoAdminRemovalPin] = useState<string | null>(null);

  useEffect(() => {
    const lookup = async () => {
      const pin = coAdminPin.toUpperCase().trim();
      if (pin.length !== 5) {
        setCoAdminLookupName('');
        return;
      }

      setIsSearchingCoAdminPin(true);
      const db = getDb();
      if (!db) {
        setIsSearchingCoAdminPin(false);
        return;
      }

      try {
        const user = await findUserByPin(db, pin);
        setCoAdminLookupName(user ? user.nickname : 'Usuário não localizado');
      } catch {
        setCoAdminLookupName('');
      } finally {
        setIsSearchingCoAdminPin(false);
      }
    };

    lookup();
  }, [coAdminPin]);

  const handleAdd = () => {
    if (!canManageEventAdmins) return;
    const pin = coAdminPin.toUpperCase().trim();
    if (pin.length < 5 || coAdminLookupName === 'Usuário não localizado') return;
    onAddCoAdmin(pin);
    setCoAdminPin('');
    setCoAdminLookupName('');
  };

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <ShieldCheck size={17} className="text-indigo-600" />
        <div>
          <p className="text-xs font-black text-slate-900">Administradores do evento</p>
          <p className="text-[10px] font-bold text-slate-400">Acesso liberado somente com evento ativo e dentro das datas.</p>
        </div>
      </div>

      {!canManageEventAdmins ? (
        <p className="text-xs font-bold text-slate-400 italic">
          Somente o administrador principal pode adicionar ou remover administradores deste evento.
        </p>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              maxLength={5}
              value={coAdminPin}
              disabled={isReadOnlyRegistration}
              onChange={(e) => setCoAdminPin(e.target.value.toUpperCase())}
              placeholder="PIN do usuário (5 dígitos)"
              className="flex-1 h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 font-mono font-black text-xs uppercase outline-none"
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={coAdminPin.trim().length !== 5 || isSearchingCoAdminPin || coAdminLookupName === 'Usuário não localizado'}
              className="px-4 h-11 bg-indigo-600 disabled:opacity-50 text-white font-black text-xs rounded-xl flex items-center gap-1 active:scale-95 transition-all"
            >
              {isSearchingCoAdminPin ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Adicionar
            </button>
          </div>
          {coAdminLookupName && (
            <p className={`text-[11px] font-black px-1 ${coAdminLookupName === 'Usuário não localizado' ? 'text-red-500' : 'text-emerald-600'}`}>
              {coAdminLookupName}
            </p>
          )}
        </div>
      )}

      {coAdminPins.length === 0 ? (
        <p className="text-xs font-bold text-slate-400 italic">Nenhum administrador adicional cadastrado.</p>
      ) : (
        <div className="space-y-2 pt-1">
          {coAdminPins.map((pin) => {
            const normalizedPin = pin.toUpperCase().trim();
            const displayName = coAdminNamesByPin[normalizedPin] || 'Administrador';
            const isPendingRemoval = pendingCoAdminRemovalPin === normalizedPin;

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
                          onRemoveCoAdmin(normalizedPin);
                          setPendingCoAdminRemovalPin(null);
                        }}
                        className="px-2 py-1 text-[10px] font-black bg-red-600 text-white rounded-lg active:scale-95"
                      >
                        Confirmar
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingCoAdminRemovalPin(null)}
                        className="px-2 py-1 text-[10px] font-black bg-slate-200 text-slate-600 rounded-lg active:scale-95"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPendingCoAdminRemovalPin(normalizedPin)}
                      className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg transition-colors"
                      title="Remover administrador"
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
