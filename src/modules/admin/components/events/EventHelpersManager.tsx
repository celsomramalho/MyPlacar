import React, { useEffect, useState } from 'react';
import { Loader2, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { findUserByPin, findUsersByPins, getDb } from '@infra/firebase';

interface Props {
  helperPins: string[];
  coAdminPins: string[];
  canManage: boolean;
  onAdd: (pin: string) => void;
  onRemove: (pin: string) => void;
}

export const EventHelpersManager: React.FC<Props> = ({ helperPins, coAdminPins, canManage, onAdd, onRemove }) => {
  const [pin, setPin] = useState('');
  const [name, setName] = useState('');
  const [searching, setSearching] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);
  const [namesByPin, setNamesByPin] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const db = getDb();
    if (!db || helperPins.length === 0) { setNamesByPin({}); return; }
    void findUsersByPins(db, helperPins).then((users) => {
      if (cancelled) return;
      const result: Record<string, string> = {};
      users.forEach((user, key) => { result[key.toUpperCase().trim()] = user.nickname || user.name || ''; });
      setNamesByPin(result);
    }).catch(() => { if (!cancelled) setNamesByPin({}); });
    return () => { cancelled = true; };
  }, [helperPins]);

  useEffect(() => {
    let cancelled = false;
    const lookup = async () => {
      const normalized = pin.trim().toUpperCase();
      if (normalized.length !== 5) { setName(''); return; }
      setSearching(true);
      try {
        const db = getDb();
        const user = db ? await findUserByPin(db, normalized) : null;
        if (!cancelled) setName(user?.nickname || (user ? 'Usuário localizado' : 'Usuário não localizado'));
      } catch { if (!cancelled) setName(''); }
      finally { if (!cancelled) setSearching(false); }
    };
    void lookup();
    return () => { cancelled = true; };
  }, [pin]);

  const normalizedHelpers = helperPins.map((item) => item.toUpperCase().trim());
  const normalizedCoAdmins = coAdminPins.map((item) => item.toUpperCase().trim());
  const canAdd = canManage && pin.trim().length === 5 && Boolean(name) && name !== 'Usuário não localizado' && !normalizedHelpers.includes(pin.trim().toUpperCase()) && !normalizedCoAdmins.includes(pin.trim().toUpperCase());

  return <section className="rounded-2xl border border-sky-200 bg-sky-50/60 p-4 space-y-3">
    <div className="flex items-center gap-2"><ShieldCheck size={17} className="text-sky-700" /><div><p className="text-xs font-black text-slate-900">Auxiliares do evento</p><p className="text-[10px] font-bold text-slate-500">Acesso restrito às tarefas operacionais do evento.</p></div></div>
    {canManage && <div className="space-y-1.5"><div className="flex gap-2"><input value={pin} maxLength={5} onChange={(e) => setPin(e.target.value.toUpperCase())} placeholder="PIN do auxiliar" className="h-10 flex-1 rounded-xl border border-slate-200 bg-white px-3 font-mono text-xs font-black uppercase outline-none" /><button type="button" disabled={!canAdd || searching} onClick={() => { if (!canAdd) return; onAdd(pin.trim().toUpperCase()); setPin(''); setName(''); }} className="flex h-10 items-center gap-1 rounded-xl bg-sky-700 px-3 text-xs font-black text-white disabled:opacity-50">{searching ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Adicionar</button></div>{name && <p className={`px-1 text-[11px] font-bold ${name === 'Usuário não localizado' ? 'text-red-600' : 'text-emerald-700'}`}>{name}</p>}</div>}
    {helperPins.length === 0 ? <p className="text-xs italic text-slate-400">Nenhum auxiliar cadastrado.</p> : <div className="space-y-2">{helperPins.map((rawPin) => { const itemPin = rawPin.toUpperCase().trim(); return <div key={itemPin} className="flex items-center justify-between rounded-xl border border-sky-100 bg-white p-2.5"><span className="text-xs font-black text-slate-700">{namesByPin[itemPin] || 'Auxiliar'} <span className="font-mono text-[10px] text-slate-400">· {itemPin}</span></span>{canManage && (pendingRemove === itemPin ? <span className="flex gap-1"><button type="button" onClick={() => { onRemove(itemPin); setPendingRemove(null); }} className="rounded-lg bg-red-600 px-2 py-1 text-[10px] font-black text-white">Confirmar</button><button type="button" onClick={() => setPendingRemove(null)} className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600">Cancelar</button></span> : <button type="button" title="Remover auxiliar" onClick={() => setPendingRemove(itemPin)} className="rounded-lg p-1.5 text-slate-400 hover:text-red-600"><Trash2 size={15} /></button>)}</div>; })}</div>}
  </section>;
};
