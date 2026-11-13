import { CalendarDays, ChevronLeft, ChevronRight, Loader2, Search, Star, User, X } from 'lucide-react';
import type { UserProfile } from '@modules/auth/types';
import type { FirebaseUserWithCreatedAt } from '@infra/firebase/users';
import { applyGoldenRule } from '@shared/utils/formatters';

interface AdminUsersPanelProps {
  userSearch: string;
  foundUsers: UserProfile[];
  userCount: number | null;
  isLoadingUserCount: boolean;
  isSearchingUsers: boolean;
  hasSearchedUsers?: boolean;
  onUserSearchChange: (value: string) => void;
  onSearchUsers: () => void;
  onClearUserSearch?: () => void;
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

const formatDateBR = (ts?: any) => {
  if (!ts) return '';
  const ms =
    typeof ts === 'number'
      ? ts
      : ts?.toMillis
      ? ts.toMillis()
      : typeof ts === 'string'
      ? Date.parse(ts)
      : 0;
  if (!ms || isNaN(ms)) return '';
  return new Date(ms).toLocaleDateString('pt-BR', {
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
  hasSearchedUsers = false,
  onUserSearchChange,
  onSearchUsers,
  onClearUserSearch,
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
          placeholder="Buscar por nome, apelido, e-mail ou PIN..."
          className="w-full h-12 bg-slate-50 border border-slate-100 rounded-xl px-4 pr-20 text-sm font-bold outline-none text-black placeholder:text-slate-400 focus:border-blue-500 focus:bg-white transition-all"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-black">
          {userSearch && (
            <button
              type="button"
              onClick={onClearUserSearch || (() => onUserSearchChange(''))}
              className="w-6 h-6 rounded-full hover:bg-slate-200 flex items-center justify-center text-slate-400 hover:text-black transition-colors"
              title="Limpar busca"
            >
              <X size={14} />
            </button>
          )}
          <button
            type="button"
            onClick={onSearchUsers}
            className="w-7 h-7 rounded-lg hover:bg-slate-200 flex items-center justify-center text-black transition-colors"
            title="Buscar"
          >
            {isSearchingUsers ? <Loader2 className="animate-spin text-blue-600" size={18} /> : <Search size={18} />}
          </button>
        </div>
      </div>

      {/* Feedback durante a busca */}
      {isSearchingUsers && (
        <div className="py-4 flex items-center justify-center gap-2 text-xs font-bold text-slate-500 bg-slate-50 rounded-2xl">
          <Loader2 className="animate-spin text-blue-600" size={16} />
          <span>Pesquisando usuários...</span>
        </div>
      )}

      {/* Nenhum usuário encontrado */}
      {hasSearchedUsers && !isSearchingUsers && foundUsers.length === 0 && (
        <div className="py-5 px-3 text-center bg-slate-50 rounded-2xl border border-slate-100">
          <p className="text-xs font-bold text-slate-700">Nenhum usuário encontrado para &quot;{userSearch}&quot;</p>
          <p className="text-[10px] font-medium text-slate-400 mt-0.5">Tente buscar por nome, apelido, e-mail ou PIN.</p>
        </div>
      )}

      {/* Resultados da busca abaixo do campo de pesquisa */}
      {foundUsers.length > 0 && (
        <div className="space-y-2.5 pt-1">
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-bold text-slate-400">
              {foundUsers.length} {foundUsers.length === 1 ? 'usuário encontrado' : 'usuários encontrados'}
            </span>
          </div>
          <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
            {foundUsers.map((user) => (
              <div
                key={user.email || user.pin || user.name}
                className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center justify-between gap-3 hover:bg-slate-100/70 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-black text-black text-sm truncate">
                      {user.name || user.nickname || 'Usuário sem nome'}
                    </span>
                    {user.nickname && user.name && user.nickname.toLowerCase() !== user.name.toLowerCase() && (
                      <span className="text-[11px] font-bold text-slate-500">
                        ({user.nickname})
                      </span>
                    )}
                    {user.planType === 'premium' ? (
                      <div className="bg-blue-600 text-white text-[9px] font-black px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Star size={7} fill="currentColor" /> Premium
                      </div>
                    ) : (
                      <div className="bg-slate-200 text-slate-600 text-[9px] font-black px-2 py-0.5 rounded-full">
                        Free
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-semibold text-slate-500 flex-wrap">
                    <span className="text-black font-bold truncate">
                      {applyGoldenRule(user.email, true)}
                    </span>
                    {user.pin && (
                      <span className="bg-white border border-slate-200 px-1.5 py-0.5 rounded text-[10px] font-mono text-slate-600">
                        PIN: {user.pin}
                      </span>
                    )}
                    {user.phone && (
                      <span className="text-slate-400 text-[10px]">
                        Tel: {user.phone}
                      </span>
                    )}
                    {formatDateBR(user.createdAt) && (
                      <span className="text-slate-500 text-[10px] flex items-center gap-1 font-medium bg-white border border-slate-200 px-1.5 py-0.5 rounded">
                        <CalendarDays size={11} className="text-slate-400 shrink-0" />
                        <span>Inscrição: {formatDateBR(user.createdAt)}</span>
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => onToggleUserPremium(user)}
                  className={`px-3.5 py-2 rounded-xl text-[11px] font-black transition-all border shrink-0 active:scale-95 ${
                    user.planType === 'premium'
                      ? 'bg-red-50 border-red-100 text-red-500 hover:bg-red-100'
                      : 'bg-white border-slate-200 text-black hover:bg-slate-100'
                  }`}
                >
                  {user.planType === 'premium' ? 'Revogar premium' : 'Ativar premium'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
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
                  <span className="text-[10px] font-bold text-slate-500 block">{formatDateBR(user.createdAt) || 'Data não registrada'}</span>
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
