interface AdminVoiceCommandItemProps {
  id: string;
  label: string;
  condition?: string | null;
  purpose: string;
  usage: string;
  termsValue?: string;
  onTermsChange?: (value: string) => void;
}

export const AdminVoiceCommandItem = ({
  id,
  label,
  condition,
  purpose,
  usage,
  termsValue,
  onTermsChange,
}: AdminVoiceCommandItemProps) => (
  <div className="space-y-2 p-4 bg-gray-50 rounded-2xl border border-gray-100 shadow-sm animate-in fade-in">
    <div className="flex items-start justify-between">
      <div className="flex flex-col gap-0.5">
        <span className="text-black font-black text-sm">{id}) {label}</span>
        {condition && <span className="text-[9px] font-bold text-blue-600 font-mono">{condition}</span>}
      </div>
    </div>
    <div className="space-y-1.5 border-l-2 border-gray-200 pl-3">
      <p className="text-[10px] font-bold text-gray-500 leading-tight">
        Para que serve esse comando: <span className="text-black">{purpose}</span>
      </p>
      <p className="text-[10px] font-bold text-gray-500 leading-tight">
        Como usar<span className="text-black">{usage}</span>
      </p>
    </div>
    {onTermsChange && (
      <div className="mt-2">
        <input
          type="text"
          value={termsValue || ''}
          onChange={(event) => onTermsChange(event.target.value)}
          placeholder="Termos separados por vírgula"
          className="w-full h-[40px] bg-white border border-gray-200 rounded-xl px-4 text-sm font-bold text-black outline-none focus:ring-2 focus:ring-blue-100 transition-all"
        />
      </div>
    )}
  </div>
);
