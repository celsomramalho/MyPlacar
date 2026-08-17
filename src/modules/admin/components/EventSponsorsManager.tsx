import React, { useState, useRef } from 'react';
import { Plus, Trash2, CheckCircle2, ChevronDown, ChevronUp, Upload, Image as ImageIcon } from 'lucide-react';
import type { TournamentEvent, EventSponsor } from '@modules/events/types';

interface Props {
  event: TournamentEvent;
  onUpdateSponsors: (sponsors: EventSponsor[]) => void;
  onUpdateEvent: (event: TournamentEvent) => void;
}

// Utilitário para redimensionar/comprimir imagem para Data URL de tamanho otimizado
const resizeImageToDataUrl = (file: File, maxWidth = 400, maxHeight = 400): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(e.target?.result || ''));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.85));
      };
      img.onerror = reject;
      img.src = String(e.target?.result || '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

interface SponsorFormProps {
  sponsor?: EventSponsor;
  onSave: (sponsorData: EventSponsor) => void;
  onDelete?: () => void;
  onCancel: () => void;
}

const EventSponsorForm: React.FC<SponsorFormProps> = ({
  sponsor,
  onSave,
  onDelete,
  onCancel,
}) => {
  const [name, setName] = useState(sponsor?.name || '');
  const [instagram, setInstagram] = useState(sponsor?.instagram || '');
  const [logoUrl, setLogoUrl] = useState(sponsor?.logoUrl || '');
  const [obs1, setObs1] = useState(sponsor?.obs1 || '');
  const [obs2, setObs2] = useState(sponsor?.obs2 || '');
  const [isProcessingImage, setIsProcessingImage] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsProcessingImage(true);
      const dataUrl = await resizeImageToDataUrl(file);
      setLogoUrl(dataUrl);
    } catch (err) {
      console.error('Erro ao processar imagem:', err);
    } finally {
      setIsProcessingImage(false);
    }
  };

  const handleRemoveLogo = () => {
    setLogoUrl('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    let cleanInsta = instagram.trim();
    if (cleanInsta && !cleanInsta.startsWith('@') && !cleanInsta.startsWith('http')) {
      cleanInsta = `@${cleanInsta}`;
    }

    const updatedSponsor: EventSponsor = {
      id: sponsor?.id || `sponsor-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      name: name.trim(),
      ...(cleanInsta ? { instagram: cleanInsta } : {}),
      ...(logoUrl.trim() ? { logoUrl: logoUrl.trim() } : {}),
      ...(obs1.trim() ? { obs1: obs1.trim() } : {}),
      ...(obs2.trim() ? { obs2: obs2.trim() } : {}),
      createdAt: sponsor?.createdAt || Date.now(),
    };

    onSave(updatedSponsor);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Header com título e lixeira */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <h3 className="font-black text-slate-800 text-sm">
          {sponsor ? 'Editar patrocinador' : 'Cadastrar patrocinador'}
        </h3>
        {sponsor && onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
            title="Excluir patrocinador"
          >
            <Trash2 size={18} />
          </button>
        )}
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Nome */}
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 ml-1">
              Nome do patrocinador <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Empresa / Marca Patrocinadora"
              className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 font-bold text-xs outline-none focus:border-emerald-500"
            />
          </div>

          {/* Instagram */}
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 ml-1">Instagram</label>
            <input
              type="text"
              value={instagram}
              onChange={(e) => setInstagram(e.target.value)}
              placeholder="Ex: @patrocinador"
              className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 font-bold text-xs outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Logo Upload */}
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 ml-1">Logo do patrocinador</label>
          <div className="flex items-center gap-3">
            {/* Preview Box */}
            <div className="w-14 h-14 rounded-2xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="w-full h-full object-contain p-1" />
              ) : (
                <ImageIcon size={20} className="text-slate-300" />
              )}
            </div>

            <div className="flex-1 space-y-1">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={isProcessingImage}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs px-3 py-2 rounded-xl transition-all"
                >
                  <Upload size={14} />
                  {logoUrl ? 'Alterar logo' : 'Upload de logo'}
                </button>
                {logoUrl && (
                  <button
                    type="button"
                    onClick={handleRemoveLogo}
                    className="text-slate-400 hover:text-red-500 text-xs font-bold px-2 py-2 rounded-xl hover:bg-red-50 transition-all"
                  >
                    Remover
                  </button>
                )}
              </div>
              <p className="text-[10px] text-slate-400 font-medium">PNG, JPG ou WEBP (recomendado fundo transparente)</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Obs1 */}
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 ml-1">Obs 1</label>
            <input
              type="text"
              value={obs1}
              onChange={(e) => setObs1(e.target.value)}
              placeholder="Observação 1 (ex: Cota Ouro, Stand 01, etc.)"
              className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 font-bold text-xs outline-none focus:border-emerald-500"
            />
          </div>

          {/* Obs2 */}
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 ml-1">Obs 2</label>
            <input
              type="text"
              value={obs2}
              onChange={(e) => setObs2(e.target.value)}
              placeholder="Observação 2"
              className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 font-bold text-xs outline-none focus:border-emerald-500"
            />
          </div>
        </div>
      </div>

      <div className="flex gap-2 pt-2 border-t border-slate-100">
        <button
          type="submit"
          className="flex-1 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-black text-xs py-3 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2"
        >
          <CheckCircle2 size={16} /> Salvar patrocinador
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs px-5 py-3 rounded-xl transition-all"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
};

export const EventSponsorsManager: React.FC<Props> = ({
  event,
  onUpdateSponsors,
}) => {
  const sponsors = event.sponsors || [];

  const [isAdding, setIsAdding] = useState(false);
  const [expandedSponsorId, setExpandedSponsorId] = useState<string | null>(null);

  const handleStartAdd = () => {
    setExpandedSponsorId(null);
    setIsAdding(true);
  };

  const handleSaveSponsor = (sponsorData: EventSponsor) => {
    let updatedList: EventSponsor[];
    const exists = sponsors.some((s) => s.id === sponsorData.id);
    if (exists) {
      updatedList = sponsors.map((item) => (item.id === sponsorData.id ? sponsorData : item));
    } else {
      updatedList = [...sponsors, sponsorData];
    }
    onUpdateSponsors(updatedList);
    setIsAdding(false);
    setExpandedSponsorId(null);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Tem certeza que deseja excluir este patrocinador?')) {
      const updatedList = sponsors.filter((s) => s.id !== id);
      onUpdateSponsors(updatedList);
      if (expandedSponsorId === id) {
        setExpandedSponsorId(null);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
        <div>
          <h2 className="text-xl font-black text-slate-800 tracking-tight">Patrocinadores</h2>
          <p className="text-xs text-slate-400 font-bold mt-0.5">
            Gerencie os patrocinadores oficiais e apoiadores do evento.
          </p>
        </div>
        {!isAdding && (
          <button
            onClick={handleStartAdd}
            className="flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-black text-xs px-5 py-3 rounded-2xl shadow-sm transition-all self-start sm:self-auto"
          >
            <Plus size={16} /> Novo patrocinador
          </button>
        )}
      </div>

      {/* New Sponsor Form */}
      {isAdding && (
        <div className="rounded-3xl border-2 border-emerald-500 bg-white p-6 shadow-md animate-in slide-in-from-top-4">
          <EventSponsorForm
            onSave={handleSaveSponsor}
            onCancel={() => setIsAdding(false)}
          />
        </div>
      )}

      {/* Sponsors Table (1 por linha com accordion) */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        {sponsors.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <p className="text-sm font-bold text-slate-400">Nenhum patrocinador cadastrado ainda.</p>
            <p className="text-xs text-slate-300">Clique em "Novo patrocinador" para cadastrar um patrocinador.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-[10px] tracking-wider font-black text-slate-400">
                  <th className="py-3 px-3 w-16 text-center">Logo</th>
                  <th className="py-3 px-3">Patrocinador</th>
                  <th className="py-3 px-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-bold">
                {sponsors.map((sponsor) => {
                  const isExpanded = expandedSponsorId === sponsor.id;

                  return (
                    <React.Fragment key={sponsor.id}>
                      <tr className={`transition-colors ${isExpanded ? 'bg-emerald-50/50' : 'hover:bg-slate-50/80'}`}>
                        {/* Logo Column */}
                        <td className="py-3.5 px-3 text-center">
                          <div className="w-10 h-10 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden mx-auto">
                            {sponsor.logoUrl ? (
                              <img src={sponsor.logoUrl} alt={sponsor.name} className="w-full h-full object-contain p-0.5" />
                            ) : (
                              <ImageIcon size={18} className="text-slate-300" />
                            )}
                          </div>
                        </td>

                        {/* Patrocinador Name Column */}
                        <td className="py-3.5 px-3">
                          <p className="font-black text-slate-800 text-sm">{sponsor.name}</p>
                          {sponsor.instagram && (
                            <p className="text-[10px] text-pink-600 font-bold">{sponsor.instagram}</p>
                          )}
                        </td>

                        {/* Actions Column with Accordion Chevron Button */}
                        <td className="py-3.5 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setIsAdding(false);
                              setExpandedSponsorId(isExpanded ? null : sponsor.id);
                            }}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 text-slate-500 transition-colors hover:bg-gray-200 active:scale-90"
                            title={isExpanded ? 'Fechar cadastro do patrocinador' : 'Abrir cadastro do patrocinador'}
                          >
                            {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                          </button>
                        </td>
                      </tr>

                      {/* Expanded Edit Form Row */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={3} className="bg-white px-4 pb-5 pt-0">
                            <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
                              <EventSponsorForm
                                key={`expanded-${sponsor.id}`}
                                sponsor={sponsor}
                                onSave={handleSaveSponsor}
                                onDelete={() => handleDelete(sponsor.id)}
                                onCancel={() => setExpandedSponsorId(null)}
                              />
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
