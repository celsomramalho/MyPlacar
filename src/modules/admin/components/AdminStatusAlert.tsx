import { AlertCircle, CheckCircle2 } from 'lucide-react';

export interface AdminStatus {
  type: 'success' | 'error';
  msg: string;
}

interface AdminStatusAlertProps {
  status: AdminStatus | null;
}

export const AdminStatusAlert = ({ status }: AdminStatusAlertProps) => {
  if (!status) return null;

  return (
    <div className={`p-4 rounded-2xl flex items-center gap-2 text-sm font-bold animate-in zoom-in shadow-sm ${status.type === 'success' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
      {status.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
      {status.msg}
    </div>
  );
};
