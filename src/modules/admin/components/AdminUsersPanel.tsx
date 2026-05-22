import { Loader2, Search, Star, User } from 'lucide-react';
import type { UserProfile } from '@modules/auth/types';
import { applyGoldenRule } from '@shared/utils/formatters';

interface AdminUsersPanelProps {
  userSearch: string;
  foundUsers: UserProfile[];
  isSearchingUsers: boolean;
  onUserSearchChange: (value: string) => void;
  onSearchUsers: () => void;
  onToggleUserPremium: (user: UserProfile) => void;
}

export const AdminUsersPanel = ({
  userSearch,
  foundUsers,
  isSearchingUsers,
  onUserSearchChange,
  onSearchUsers,
  onToggleUserPremium,
}: AdminUsersPanelProps) => (
  <section className="space-y-4">
    <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-white space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-100 text-black rounded-xl flex items-center justify-center">
          <User size={20} />
        </div>
        <h3 className="font-black text-black">Gestão de usuários</h3>
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
  </section>
);
