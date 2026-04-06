import React, { useState, useEffect, useRef } from 'react';
import { Clock, MapPin, Info, ShieldCheck, Loader2, Target, AlertTriangle } from 'lucide-react';
import { getFirestore, collection, getDocs, query, orderBy, QueryDocumentSnapshot } from 'firebase/firestore';
import L from 'leaflet';
import { MatchHistoryItem } from '../types.ts';

interface Props {
  history: MatchHistoryItem[];
  focusMatchId: string | null;
  onBack: () => void;
}

export const LocationScreen: React.FC<Props> = ({ history, focusMatchId, onBack }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const [adminClicks, setAdminClicks] = useState(0);
  const [isAdminView, setIsAdminView] = useState(false);
  const [cloudMatches, setCloudMatches] = useState<MatchHistoryItem[]>([]);
  const [isLoadingCloud, setIsLoadingCloud] = useState(false);
  const [hasError, setHasError] = useState<string | null>(null);
  const markersRef = useRef<Record<string, L.CircleMarker>>({});

  const handleAdminTrigger = () => {
    const nextCount = adminClicks + 1;
    setAdminClicks(nextCount);
    if (nextCount === 5) {
      setIsAdminView(true);
      fetchCloudMatches();
    }
  };

  const fetchCloudMatches = async () => {
    setIsLoadingCloud(true);
    setHasError(null);
    try {
      const db = getFirestore();
      const q = query(collection(db, "matches"), orderBy("date", "desc"));
      const querySnapshot = await getDocs(q);
      const fetched: MatchHistoryItem[] = [];
      querySnapshot.forEach((doc: QueryDocumentSnapshot) => {
        fetched.push({ id: doc.id, ...doc.data() } as MatchHistoryItem);
      });
      setCloudMatches(fetched);
    } catch (error: any) {
      console.error("Erro ao buscar dados na nuvem:", error);
      setHasError("Falha ao carregar dados da nuvem.");
    } finally {
      setIsLoadingCloud(false);
    }
  };

  const centerOnMatch = (id: string | null) => {
    if (!id || !mapInstance.current) return;
    const activeHistory = isAdminView ? cloudMatches : history;
    const match = activeHistory.find(m => m.id === id);
    
    if (match?.location && match.location.lat && match.location.lng) {
      mapInstance.current.invalidateSize();
      mapInstance.current.flyTo([match.location.lat, match.location.lng], 16, {
        animate: true,
        duration: 1.5
      });
      const marker = markersRef.current[id];
      if (marker) {
        setTimeout(() => marker.openPopup(), 1600);
      }
    } else if (id) {
      (window as any).alert("Atenção: Esta partida foi registrada sem coordenadas de GPS.");
    }
  };

  useEffect(() => {
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    const initMap = () => {
      if (!mapRef.current) return;
      
      if (mapInstance.current) {
        mapInstance.current.remove();
        markersRef.current = {};
      }

      const activeHistory = isAdminView ? cloudMatches : history;
      
      mapInstance.current = L.map(mapRef.current, {
        zoomControl: false,
        maxZoom: 18
      }).setView([-23.5505, -46.6333], 4);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap'
      }).addTo(mapInstance.current);

      L.control.zoom({ position: 'bottomright' }).addTo(mapInstance.current);

      activeHistory
        .filter(m => m.location && typeof m.location.lat === 'number' && typeof m.location.lng === 'number')
        .forEach(match => {
          const color = match.sportType === 'tennis' ? '#3b82f6' : '#22c55e';
          
          const marker = L.circleMarker([match.location!.lat, match.location!.lng], {
            radius: 10,
            fillColor: color,
            color: '#fff',
            weight: 3,
            opacity: 1,
            fillOpacity: 0.8
          }).addTo(mapInstance.current!);

          const popupContent = `
            <div style="font-family: sans-serif; min-width: 140px; padding: 4px;">
              <div style="font-size: 10px; font-weight: 900; color: ${color}; text-transform: uppercase; margin-bottom: 2px;">
                ${match.sportType === 'tennis' ? '🎾 Tênis' : '🏓 Pickleball'}
              </div>
              <div style="font-size: 13px; font-weight: 800; color: #0f172a;">${match.p1Name} vs ${match.p2Name}</div>
              <div style="font-size: 14px; font-weight: 900; color: #1e293b; margin-top: 2px;">${match.scoreSummary}</div>
            </div>
          `;
          marker.bindPopup(popupContent);
          markersRef.current[match.id] = marker;
        });

      setTimeout(() => {
        if (!mapInstance.current) return;
        mapInstance.current.invalidateSize();
        
        if (focusMatchId) {
          centerOnMatch(focusMatchId);
        } else {
          // Fix: Explicitly cast mList to L.Layer[] to resolve unknown[] type mismatch from Object.values with L.featureGroup
          const mList = Object.values(markersRef.current) as L.Layer[];
          if (mList.length > 0) {
            const group = L.featureGroup(mList);
            mapInstance.current.fitBounds(group.getBounds().pad(0.2));
          }
        }
      }, 600);
    };

    initMap();

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [history, cloudMatches, isAdminView, focusMatchId]);

  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden">
      <header className="px-4 py-4 flex items-center justify-between bg-white/90 backdrop-blur-md sticky top-0 z-[1001] border-b border-gray-200 shadow-sm">
        <button onClick={onBack} className="p-2 -ml-2 text-gray-400 hover:text-blue-500 active:scale-90 transition-transform">
          <Clock size={24} />
        </button>
        <h1 onClick={handleAdminTrigger} className="text-sm font-black text-gray-900 tracking-tighter flex items-center gap-2 cursor-pointer select-none">
          <MapPin size={18} className={`${isAdminView ? 'text-indigo-600' : 'text-blue-500'}`} />
          {isAdminView ? 'Nuvem' : 'Localização'}
        </h1>
        <button onClick={() => centerOnMatch(focusMatchId)} className="p-2 text-blue-500 active:scale-90 transition-transform">
          <Target size={22} />
        </button>
      </header>
      
      <div className="flex-1 relative">
        <div ref={mapRef} className="absolute inset-0 z-0 bg-gray-100" />
        
        {isLoadingCloud && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/60 backdrop-blur-[2px]">
            <Loader2 className="text-blue-500 animate-spin" size={40} />
          </div>
        )}

        {hasError && (
          <div className="absolute inset-x-0 top-4 z-50 flex justify-center px-6">
            <div className="bg-red-500 text-white px-4 py-2 rounded-xl flex items-center gap-2 shadow-lg text-xs font-bold">
              <AlertTriangle size={16} /> {hasError}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};