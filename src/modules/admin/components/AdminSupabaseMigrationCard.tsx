import { Database, Loader2 } from 'lucide-react';

export interface AdminMigrationResult {
  users: number;
  matches: number;
  partners: number;
  icons: number;
}

interface AdminSupabaseMigrationCardProps {
  isMigrating: boolean;
  migrationResult: AdminMigrationResult | null;
  onMigrate: () => void;
}

export const AdminSupabaseMigrationCard = ({
  isMigrating,
  migrationResult,
  onMigrate,
}: AdminSupabaseMigrationCardProps) => (
  <section className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-white space-y-4">
    <div className="flex items-center gap-4">
      <div className="w-12 h-12 bg-violet-100 rounded-2xl flex items-center justify-center text-violet-600">
        <Database size={24} />
      </div>
      <div className="text-left">
        <p className="text-base font-black text-black leading-tight">Migração Supabase</p>
        <p className="text-[11px] font-bold text-slate-400">Copia users, partidas e ícones do Firebase para o Supabase de uma vez</p>
      </div>
    </div>

    {migrationResult && (
      <div className="bg-green-50 border border-green-100 rounded-2xl p-4 space-y-1">
        <p className="text-xs font-black text-green-700">Migração concluída!</p>
        <p className="text-[11px] font-bold text-green-600">
          {migrationResult.users} usuários · {migrationResult.matches} partidas · {migrationResult.partners} parceiros · {migrationResult.icons} ícones
        </p>
      </div>
    )}

    <button
      onClick={onMigrate}
      disabled={isMigrating}
      className="w-full py-4 bg-violet-600 text-white rounded-2xl font-black text-xs flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all disabled:opacity-50"
    >
      {isMigrating ? (
        <>
          <Loader2 size={16} className="animate-spin" /> Migrando...
        </>
      ) : (
        <>
          <Database size={16} /> Migrar Firebase → Supabase
        </>
      )}
    </button>
  </section>
);
