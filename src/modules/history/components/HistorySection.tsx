import React, { useMemo, useState } from 'react';
import { Search, Loader2, Clock, Trophy, ChevronDown, ChevronUp, MapPin, Cloud, Trash2, CloudUpload, CloudDownload, Calendar, Smartphone, Share2 } from 'lucide-react';
import { Input } from '@shared/components/Input';
import { LazySportIcon } from '@shared/components/LazySportIcon';
import { MatchTimeline } from '@shared/components/MatchTimeline';
import type { MatchHistoryItem } from '../types';
import { filterHistory } from '../services/filterHistory';
import { groupHistoryByDate } from '../services/groupHistoryByDate';

const COLOR_MAP: Record<string, string> = {
  azul: 'text-blue-600',
  vermelho: 'text-red-600',
  verde: 'text-green-600',
  amarelo: 'text-yellow-600',
  laranja: 'text-orange-600',
  lilas: 'text-violet-600',
  marrom: 'text-amber-800',
  roxo: 'text-purple-600',
};

interface Props {
  history: MatchHistoryItem[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  isSyncingAll: boolean;
  onSyncAll: (force?: boolean) => void;
  onDownloadHistory?: () => void;
  cloudMatchesCount?: number;
  isDownloading?: boolean;
  onDeleteMatch: (id: string) => void;
  onViewMap: (id: string) => void;
  selectedMatches: Set<string>;
  setSelectedMatches: React.Dispatch<React.SetStateAction<Set<string>>>;
  appUrl: string;
}

const formatDateShort = (dateStr: string) => {
  if (!dateStr) return '';
  const parts = dateStr.split('/');
  if (parts.length < 3) return dateStr;
  const day = parts[0].padStart(2, '0');
  const month = parts[1].padStart(2, '0');
  let year = parts[2];
  if (year.length === 4) year = year.slice(-2);
  return `${day}/${month}/${year}`;
};

export const HistorySection: React.FC<Props> = ({
  history,
  searchQuery,
  setSearchQuery,
  isSyncingAll,
  onSyncAll,
  onDownloadHistory,
  cloudMatchesCount = 0,
  isDownloading = false,
  onDeleteMatch,
  onViewMap,
  selectedMatches,
  setSelectedMatches,
  appUrl,
}) => {
  const [expandedMatch, setExpandedMatch] = useState<string | null>(null);

  const filtered = useMemo(() => filterHistory(history, searchQuery), [history, searchQuery]);
  const realUnsyncedCount = useMemo(() => history.filter((item) => !item.isSynced).length, [history]);
  const syncedLocalCount = useMemo(() => history.filter((item) => item.isSynced).length, [history]);
  // totalCloudCount: itens locais sincronizados + itens na nuvem que ainda faltam baixar.
  // cloudMatchesCount representa exatamente o delta (na nuvem mas não local).
  const totalCloudCount = syncedLocalCount + cloudMatchesCount;
  const grouped = useMemo(() => groupHistoryByDate(filtered), [filtered]);

  const toggleSelect = (id: string) => {
    const next = new Set(selectedMatches);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedMatches(next);
  };

  const toggleSelectDay = (items: MatchHistoryItem[]) => {
    const next = new Set(selectedMatches);
    const allSelected = items.every((item) => next.has(item.id));
    items.forEach((item) => {
      if (allSelected) next.delete(item.id);
      else next.add(item.id);
    });
    setSelectedMatches(next);
  };

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m ${s}s`;
  };

  return (
    <div className="flex flex-col gap-4 animate-in fade-in duration-300 pb-32 font-sans">
      <div className="bg-white rounded-[3rem] p-7 border border-gray-100 shadow-sm space-y-6 mb-2">
        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h3 className="text-xl font-black text-gray-900 tracking-tight leading-none">Meus registros</h3>
              <div className="flex flex-wrap gap-x-3 gap-y-2 mt-4">
                <div className="flex items-center gap-2 bg-blue-50 px-3 py-1.5 rounded-full border border-blue-100">
                  <Smartphone size={12} className="text-blue-600" />
                  <span className="text-[11px] font-black text-blue-800">{history.length} / <span className="text-orange-500">{realUnsyncedCount}</span> <span className="font-bold opacity-60">Local</span></span>
                </div>
                <div className="flex items-center gap-2 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100">
                  <CloudDownload size={12} className="text-emerald-600" />
                  <span className="text-[11px] font-black text-emerald-800">{totalCloudCount} / <span className="text-orange-500">{cloudMatchesCount}</span> <span className="font-bold opacity-60">Nuvem</span></span>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => onSyncAll(true)}
                disabled={isSyncingAll || history.length === 0}
                className={`w-14 h-14 rounded-2xl transition-all shadow-lg flex items-center justify-center border-2 ${(isSyncingAll || history.length === 0) ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed opacity-50' : 'bg-amber-500 text-white border-amber-400 active:scale-90 shadow-amber-100'}`}
              >
                {isSyncingAll ? <Loader2 size={24} className="animate-spin" /> : <CloudUpload size={24} />}
              </button>

              <button
                onClick={onDownloadHistory}
                disabled={isDownloading}
                className={`w-14 h-14 rounded-2xl transition-all shadow-lg flex items-center justify-center border-2 ${isDownloading ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed opacity-50' : 'bg-emerald-600 text-white border-emerald-500 active:scale-90 shadow-emerald-100'}`}
              >
                {isDownloading ? <Loader2 size={24} className="animate-spin" /> : <CloudDownload size={24} />}
              </button>
            </div>
          </div>
        </div>
        <div className="relative">
          <Input
            placeholder="Buscar por nome ou resultado..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-12 h-[60px] text-base bg-gray-50/50 border-gray-100 rounded-3xl shadow-none"
          />
          <Search size={22} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 px-10 text-gray-400">
          <Clock size={64} className="mb-4 opacity-20" />
          <p className="text-base font-black opacity-40">Nenhum registro encontrado</p>
        </div>
      ) : (
        Object.entries(grouped).map(([originalDate, items]) => (
          <div key={originalDate} className="space-y-4">
            <div className="flex items-center justify-between px-6 mt-6">
              <div className="flex items-center gap-2">
                <Calendar size={14} className="text-gray-400" />
                <span className="text-[13px] font-black text-gray-900 tracking-tight">{originalDate}</span>
              </div>
              <button
                onClick={() => toggleSelectDay(items)}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-full transition-all border ${items.every((item) => selectedMatches.has(item.id)) ? 'bg-black text-white border-black' : 'bg-gray-200 text-gray-600 border-transparent'}`}
              >
                <span className="text-[10px] font-black">Marcar dia</span>
              </button>
            </div>

            {items.map((item) => {
              const isExpanded = expandedMatch === item.id;
              const isSelected = selectedMatches.has(item.id);
              const setsP1 = item.p1Sets || [];
              const setsP2 = item.p2Sets || [];
              const p1SetsWon = setsP1.filter((score, i) => score > setsP2[i]).length;
              const p2SetsWon = setsP2.filter((score, i) => score > setsP1[i]).length;
              const c1 = COLOR_MAP[item.p1Color] || 'text-gray-900';
              const c2 = COLOR_MAP[item.p2Color] || 'text-gray-900';
              const dateDDMMAA = formatDateShort(item.date);

              return (
                <div key={item.id} className={`bg-white rounded-[3.5rem] overflow-hidden shadow-sm border-2 transition-all duration-300 ${isSelected ? 'border-blue-500 ring-8 ring-blue-50' : 'border-white'}`}>
                  <div className="p-4 md:p-6 flex items-center gap-0.5">
                    <div className="relative" onClick={(e) => { e.stopPropagation(); toggleSelect(item.id); }}>
                      <div className={`w-6 h-6 rounded-lg border-2 transition-all flex items-center justify-center ${isSelected ? 'bg-blue-500 border-blue-500' : 'bg-white border-gray-200'}`}>
                        {isSelected && <ChevronDown size={18} className="text-white rotate-[-45deg] stroke-[4]" />}
                      </div>
                    </div>

                    <div className="text-center min-w-[110px] flex flex-col justify-center items-center gap-1.5 shrink-0" onClick={() => setExpandedMatch(isExpanded ? null : item.id)}>
                      <div className="flex items-center justify-center gap-2 mb-1">
                        <div className={`p-2 rounded-full transition-colors duration-300 ${item.isSynced ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                          {item.isSynced ? <Cloud size={14} fill="currentColor" /> : <CloudUpload size={14} />}
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); onViewMap(item.id); }} className="p-2 bg-blue-50 text-blue-600 rounded-full active:scale-90 shadow-sm">
                          <MapPin size={14} fill="currentColor" />
                        </button>
                      </div>
                      <div className="text-[14px] font-black text-gray-900 leading-none tracking-tighter">{dateDDMMAA}</div>
                      <div className="text-[10px] font-bold text-gray-500 leading-none">{item.time}</div>
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col justify-center cursor-pointer" onClick={() => setExpandedMatch(isExpanded ? null : item.id)}>
                      <div className="flex items-start gap-2 mb-1.5 min-w-0">
                        <h4 className={`text-[15px] font-black leading-tight break-words flex-1 ${c1}`}>
                          {item.p1Name}{item.p1Partner ? ` e ${item.p1Partner}` : ''}
                        </h4>
                        {item.winnerTeam === 1 && <Trophy size={14} className="text-amber-500 shrink-0 mt-0.5" fill="currentColor" />}
                      </div>

                      <div className="flex items-start gap-2 mb-3 min-w-0">
                        <h4 className={`text-[15px] font-black leading-tight break-words flex-1 ${c2}`}>
                          {item.p2Name}{item.p2Partner ? ` e ${item.p2Partner}` : ''}
                        </h4>
                        {item.winnerTeam === 2 && <Trophy size={14} className="text-amber-500 shrink-0 mt-0.5" fill="currentColor" />}
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 bg-gray-50 px-3 py-1 rounded-2xl border border-gray-100 shadow-inner">
                          <span className={`text-xl font-black ${c1}`}>{p1SetsWon}</span>
                          <span className="text-gray-300 font-bold">-</span>
                          <span className={`text-xl font-black ${c2}`}>{p2SetsWon}</span>
                        </div>
                        <div className="flex items-center gap-2 px-2.5 py-1.5 bg-gray-50 rounded-xl border border-gray-100">
                          <LazySportIcon sportId={item.sportType} defaultIcon={item.sportType === 'tennis' ? '🎾' : '🥒'} className="w-5 h-5 rounded-sm" />
                          <span className="text-[11px] font-black text-gray-400 tracking-tight leading-none">{item.sportType === 'tennis' ? 'Tênis' : 'Pickle'}</span>
                        </div>
                      </div>
                    </div>

                    <button onClick={() => setExpandedMatch(isExpanded ? null : item.id)} className="p-3 bg-gray-50 rounded-2xl text-gray-400 hover:text-black active:scale-90 transition-all">
                      {isExpanded ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="px-6 pb-10 pt-6 space-y-8 animate-in slide-in-from-top-4 duration-500 border-t border-gray-50 bg-gray-50/30">
                      <div className="flex flex-row justify-center gap-3">
                        {setsP1.map((s1, idx) => {
                          const s2 = setsP2[idx];
                          return (
                            <div key={idx} className="flex flex-col items-center gap-1.5 bg-white px-4 py-3 rounded-[1.8rem] border border-gray-100 shadow-md min-w-[70px]">
                              <span className="text-[9px] font-black text-gray-400 leading-none tracking-tight">Set {idx + 1}</span>
                              <div className="flex items-center gap-2">
                                <span className={`text-xl font-black ${c1}`}>{s1}</span>
                                <span className="text-gray-200 font-bold">/</span>
                                <span className={`text-xl font-black ${c2}`}>{s2}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="bg-white rounded-[2.5rem] border border-gray-100 p-8 shadow-xs space-y-8">
                        <div className="flex justify-between items-center border-b border-gray-50 pb-4">
                          <span className="text-[14px] font-black text-gray-400 tracking-tight">Estatísticas</span>
                          <span className="text-[14px] font-black text-blue-600 tracking-tight">{item.stats?.totalPoints || 0} pontos totais</span>
                        </div>

                        <div className="space-y-6">
                          <div className="flex items-center justify-between">
                            <span className="text-lg font-black text-gray-700">Aces</span>
                            <div className="flex items-center gap-4">
                              <span className={`text-3xl font-black ${c1}`}>{item.stats?.p1Aces || 0}</span>
                              <div className="w-2.5 h-2.5 bg-gray-100 rounded-full" />
                              <span className={`text-3xl font-black ${c2}`}>{item.stats?.p2Aces || 0}</span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="text-lg font-black text-gray-700">Faltas</span>
                            <div className="flex items-center gap-4">
                              <span className={`text-3xl font-black ${c1}`}>{item.stats?.p1Faults || 0}</span>
                              <div className="w-2.5 h-2.5 bg-gray-100 rounded-full" />
                              <span className={`text-3xl font-black ${c2}`}>{item.stats?.p2Faults || 0}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <MatchTimeline history={item.pointHistory || []} p1Sets={item.p1Sets} p2Sets={item.p2Sets} />

                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white rounded-[2rem] p-5 text-center border border-gray-100 shadow-sm">
                          <div className="text-[10px] font-black text-gray-400 mb-2 tracking-tight">Duração</div>
                          <div className="text-lg font-black text-gray-900">{formatDuration(item.duration)}</div>
                        </div>
                        <div className="bg-white rounded-[2rem] p-5 text-center border border-gray-100 shadow-sm">
                          <div className="text-[10px] font-black text-gray-400 mb-2 tracking-tight">Sincronização</div>
                          <div className={`text-sm font-black transition-colors duration-300 ${item.isSynced ? 'text-emerald-500' : 'text-amber-500'}`}>
                            {item.isSynced ? 'Nuvem ok' : 'Sincronização pendente'}
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <button
                          onClick={() => {
                            const appBaseUrl = appUrl.endsWith('/') ? appUrl.slice(0, -1) : appUrl;
                            navigator.clipboard.writeText(`${appBaseUrl}/?viewMatch=${item.id}`);
                            alert('Link copiado!');
                          }}
                          className="flex-1 py-5 bg-black text-white rounded-3xl font-black text-sm tracking-tight shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2"
                        >
                          <Share2 size={18} /> Compartilhar
                        </button>
                        <button onClick={() => onDeleteMatch(item.id)} className="w-16 h-16 bg-red-50 text-red-500 border-2 border-red-100 rounded-[1.8rem] flex items-center justify-center active:scale-90 transition-all shadow-sm">
                          <Trash2 size={26} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
};
