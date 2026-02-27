import React, { useState, useEffect } from 'react';
import { getDbLite } from '../firebaseLite';
import { doc, getDoc } from 'firebase/firestore/lite';

interface Props {
  sportId: string;
  defaultIcon?: string;
  className?: string;
}

// Cache em memória para evitar múltiplas leituras do LocalStorage no mesmo ciclo
const memoryCache: Record<string, string> = {};

export const LazySportIcon: React.FC<Props> = ({ sportId, defaultIcon = '🎾', className = "" }) => {
  const [iconUrl, setIconUrl] = useState<string | null>(memoryCache[sportId] || null);
  const [isLoading, setIsLoading] = useState(!memoryCache[sportId]);

  useEffect(() => {
    if (memoryCache[sportId]) {
      setIconUrl(memoryCache[sportId]);
      setIsLoading(false);
      return;
    }

    const loadIcon = async () => {
      // 1. Tentar LocalStorage (myPlacarAssets)
      try {
        const savedAssets = localStorage.getItem('myPlacarAssets');
        const assets = savedAssets ? JSON.parse(savedAssets) : {};
        
        if (assets[sportId]) {
          memoryCache[sportId] = assets[sportId];
          setIconUrl(assets[sportId]);
          setIsLoading(false);
          return;
        }
      } catch (e) {
        console.warn("Erro ao ler cache de assets:", e);
      }

      // 2. Verificar conectividade antes de tentar o Firestore Lite
      if (!navigator.onLine) {
        setIsLoading(false);
        return;
      }

      // 3. Buscar no Firestore apenas este ID específico (Lazy Loading com Lite)
      const db = getDbLite();
      if (db) {
        try {
          const docRef = doc(db, "sport_icons", sportId);
          const snap = await getDoc(docRef);
          
          if (snap.exists() && snap.data()?.url) {
            const fetchedUrl = snap.data()!.url;
            
            // Atualizar Estados e Caches
            memoryCache[sportId] = fetchedUrl;
            setIconUrl(fetchedUrl);
            
            // Persistir no cache de assets para economizar rede no futuro
            const savedAssets = localStorage.getItem('myPlacarAssets');
            const assets = savedAssets ? JSON.parse(savedAssets) : {};
            assets[sportId] = fetchedUrl;
            localStorage.setItem('myPlacarAssets', JSON.stringify(assets));
          }
        } catch (e) {
          console.error(`Erro ao buscar ícone ${sportId}:`, e);
        }
      }
      setIsLoading(false);
    };

    if (sportId) loadIcon();
  }, [sportId]);

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center bg-gray-100 animate-pulse ${className}`}>
        <span className="text-[10px] opacity-20">...</span>
      </div>
    );
  }

  const finalIcon = iconUrl || defaultIcon;
  const isImage = finalIcon.startsWith('http') || finalIcon.startsWith('data');

  return (
    <div className={`flex items-center justify-center overflow-hidden ${className}`}>
      {isImage ? (
        <img 
          src={finalIcon} 
          alt="" 
          loading="lazy" 
          className="w-full h-full object-cover"
          onError={() => setIconUrl(null)} 
        />
      ) : (
        <span className="text-xl">{finalIcon}</span>
      )}
    </div>
  );
};