import { CalendarDays, ChevronLeft, ChevronRight, Loader2, Search, Star, User } from 'lucide-react';
import type { UserProfile } from '@modules/auth/types';
import type { FirebaseUserWithCreatedAt } from '@infra/firebase/users';
import { applyGoldenRule } from '@shared/utils/formatters';

interface AdminUsersPanelProps {
  userSearch: string;
  foundUsers: UserProfile[];
  userCount: number | null;
  isLoadingUserCount: boolean;
  isSearchingUsers: boolean;
  onUserSearchChange: (value: string) => void;
  onSearchUsers: () => void;
  onToggleUserPremium: (user: UserProfile) => void;
  // Inscrições por período
  periodFrom?: string;
  periodTo?: string;
  periodUsers?: FirebaseUserWithCreatedAt[];
  isLoadingPeriod?: boolean;
  hasQueriedPeriod?: boolean;
  onPeriodFromChange?: (value: string) => void;
  onPeriodToChange?: (value: string) => void;
  onFetchPeriod?: () => void;
  onSetCurrentMonth?: () => void;
  onPrevMonth?: () => void;
  onNextMonth?: () => void;
  periodLabel?: string;
  onMigrateDates?: () => void;
  isMigratingDates?: boolean;
  migrationFeedback?: string | null;
}

const formatDateBR = (ts: number) => {
  if (!ts) return 'Data não registrada';
  return new Date(ts).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const AdminUsersPanel = ({
  userSearch,
  foundUsers,
  userCount,
  isLoadingUserCount,
  isSearchingUsers,
  onUserSearchChange,
  onSearchUsers,
  onToggleUserPremium,
  periodFrom = '',
  periodTo = '',
  periodUsers = [],
  isLoadingPeriod = false,
  hasQueriedPeriod = false,
  onPeriodFromChange = () => {},
  onPeriodToChange = () => {},
  onFetchPeriod = () => {},
  onSetCurrentMonth = () => {},
  onPrevMonth = () => {},
  onNextMonth = () => {},
  periodLabel = '',
  onMigrateDates,
  isMigratingDates = false,
  migrationFeedback = null,
}: AdminUsersPanelProps) => (
  <section className="space-y-4">
    <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-white space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-100 text-black rounded-xl flex items-center justify-center">
          <User size={20} />
        </div>
        <div>
          <h3 className="font-black text-black">Gestão de usuários</h3>
          <p className="text-xs font-semibold text-slate-500 mt-1">
            {isLoadingUserCount
              ? 'Contando usuários cadastrados…'
              : `${userCount === null ? '—' : userCount.toLocaleString('pt-BR')} usuários cadastrados`}
          </p>
        </div>
      </div>
      <div className="relative">
        <input
          type="text"
          value={userSearch}
          onChange={(event) => onUserSearchChange(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && onSearchUsers()}
          placeholder="Buscar por e-mail..."
          className="w-full h-12 bg-slate-50 border border-slate-100 rounded-xl px-4 pr-12 text-sm font-bold outline-none text-black"
        />
        <button onClick={onSearchUsers} className="absolute right-3 top-1/2 -translate-y-1/2 text-black">
          {isSearchingUsers ? <Loader2 className="animate-spin" size={18} /> : <Search size={18} />}
        </button>
      </div>
    </div>

    <div className="space-y-3">
      {foundUsers.map((user) => (
        <div key={user.email} className="bg-white p-5 rounded-[2rem] shadow-sm border border-gray-100 flex items-center justify-between">
          <div className="flex-1 min-w-0 pr-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-black text-black truncate">{user.nickname || user.name}</span>
              {user.planType === 'premium' && (
                <div className="bg-blue-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full flex items-center gap-1">
                  <Star size={6} fill="currentColor" /> Premium
                </div>
              )}
            </div>
            <span className="text-[10px] font-bold text-black block truncate">{applyGoldenRule(user.email, true)}</span>
          </div>
          <button
            onClick={() => onToggleUserPremium(user)}
            className={`px-4 py-2 rounded-xl text-[10px] font-black transition-all border ${
              user.planType === 'premium'
                ? 'bg-red-50 border-red-100 text-red-500'
                : 'bg-slate-50 border-slate-100 text-black'
            }`}
          >
            {user.planType === 'premium' ? 'Revogar premium' : 'Ativar premium'}
          </button>
        </div>
      ))}
    </div>

    {/* Inscrições por período */}
    <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-white space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-emerald-100 text-emerald-700 rounded-xl flex items-center justify-center">
          <CalendarDays size={20} />
        </div>
        <div>
          <h3 className="font-black text-black">Inscrições por período</h3>
          <p className="text-xs font-semibold text-slate-500 mt-1">Consulte quem se cadastrou em um intervalo de datas</p>
        </div>
      </div>

      {/* Navegação rápida por mês */}
      <div className="flex items-center gap-2">
        <button
          onClick={onPrevMonth}
          className="w-9 h-9 rounded-xl bg-slate-100 text-black flex items-center justify-center active:scale-90"
          aria-label="Mês anterior"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          onClick={onSetCurrentMonth}
          className="flex-1 h-9 rounded-xl bg-slate-100 text-black text-xs font-black active:bg-slate-200 truncate"
        >
          {periodLabel}
        </button>
        <button
          onClick={onNextMonth}
          className="w-9 h-9 rounded-xl bg-slate-100 text-black flex items-center justify-center active:scale-90"
          aria-label="Próximo mês"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Intervalo customizado */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 ml-1">De</label>
          <input
            type="date"
            value={periodFrom}
            onChange={(e) => onPeriodFromChange(e.target.value)}
            className="w-full h-10 bg-slate-50 border border-slate-100 rounded-xl px-3 text-xs font-bold text-black outline-none"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 ml-1">Até</label>
          <input
            type="date"
            value={periodTo}
            onChange={(e) => onPeriodToChange(e.target.value)}
            className="w-full h-10 bg-slate-50 border border-slate-100 rounded-xl px-3 text-xs font-bold text-black outline-none"
          />
        </div>
      </div>

      <button
        onClick={onFetchPeriod}
        disabled={isLoadingPeriod || !periodFrom || !periodTo}
        className="w-full h-11 bg-emerald-500 text-white rounded-xl text-sm font-black flex items-center justify-center gap-2 disabled:opacity-40"
      >
        {isLoadingPeriod ? <Loader2 className="animate-spin" size={18} /> : <Search size={16} />}
        Consultar período
      </button>

      {hasQueriedPeriod && periodUsers.length === 0 && !isLoadingPeriod && (
        <div className="pt-2 text-center py-4 bg-slate-50 rounded-2xl">
          <p className="text-xs font-bold text-slate-500">Nenhum usuário cadastrado neste período.</p>
        </div>
      )}

      {periodUsers.length > 0 && (
        <div className="pt-2 space-y-3">
          <div className="flex items-center justify-between px-1">
            <p className="text-xs font-black text-slate-700">
              {periodUsers.length} usuário{periodUsers.length !== 1 ? 's' : ''} cadastrado{periodUsers.length !== 1 ? 's' : ''}
            </p>
            <span className="text-[10px] font-bold text-slate-400">Mais recentes primeiro</span>
          </div>
          <div className="space-y-2 max-h-72 overflow-y-auto no-scrollbar">
            {periodUsers.map((user) => (
              <div key={user.id} className="bg-slate-50 rounded-2xl px-4 py-3 flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <span className="font-black text-black text-sm block truncate">{user.nickname || user.name || user.pin}</span>
                  <span className="text-[10px] font-bold text-slate-500 block truncate">{applyGoldenRule(user.email ?? user.id, true)}</span>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-[10px] font-bold text-slate-500 block">{formatDateBR(user.createdAt)}</span>
                  {user.phone && <span className="text-[9px] font-semibold text-slate-400 block">{user.phone}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {onMigrateDates && (
        <div className="pt-3 border-t border-slate-100 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400">Banco Firestore</span>
            <button
              type="button"
              onClick={() => {
                console.log('[AdminUsersPanel] Clique acionado em Padronizar datas');
                onMigrateDates();
              }}
              disabled={isMigratingDates}
              className="text-[11px] font-black text-blue-600 hover:text-blue-700 flex items-center gap-1.5 disabled:opacity-50 active:scale-95 transition-transform"
            >
              {isMigratingDates ? <Loader2 className="animate-spin" size={13} /> : null}
              {isMigratingDates ? 'Padronizando...' : 'Padronizar datas para Timestamp'}
            </button>
          </div>
          {migrationFeedback && (
            <p className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-3 py-2 rounded-xl text-right animate-in fade-in">
              {migrationFeedback}
            </p>
          )}
        </div>
      )}
    </div>
  </section>
);
