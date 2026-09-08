import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RotateCw, Trash2 } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
    window.location.replace(window.location.origin + window.location.pathname);
  };

  private handleReset = async () => {
    try {
      localStorage.removeItem('myPlacarActiveGameState');
      localStorage.removeItem('myPlacarSettings');
      localStorage.removeItem('myPlacar_last_firebase_error');
      
      // Limpa chaves do firestore e live no localStorage
      Object.keys(localStorage).forEach(key => {
        if (key.includes('firestore') || key.includes('firebase') || key.includes('live')) {
          localStorage.removeItem(key);
        }
      });
      sessionStorage.clear();

      // Limpa bancos IndexedDB do Firestore se suportado pelo navegador
      if (typeof indexedDB !== 'undefined' && indexedDB.databases) {
        try {
          const dbs = await indexedDB.databases();
          for (const d of dbs) {
            if (d.name && (d.name.includes('firestore') || d.name.includes('firebase') || d.name.includes('myplacar'))) {
              indexedDB.deleteDatabase(d.name);
            }
          }
        } catch {}
      }
    } catch { /* best effort */ }

    this.setState({ hasError: false, error: null });
    window.location.replace(window.location.origin + window.location.pathname);
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4 sm:p-8 text-center animate-in fade-in relative overflow-y-auto no-scrollbar">
          <button
            onClick={this.handleRetry}
            className="absolute top-3 right-3 sm:top-6 sm:right-6 w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center bg-gray-100 text-gray-500 rounded-full active:scale-90 transition-all"
            aria-label="Fechar"
          >
            <span className="text-lg sm:text-xl font-black leading-none">×</span>
          </button>
          <div className="w-12 h-12 sm:w-20 sm:h-20 bg-red-50 text-red-600 rounded-full flex items-center justify-center mb-3 sm:mb-6 shadow-inner shrink-0">
            <AlertCircle size={28} className="sm:hidden" />
            <AlertCircle size={40} className="hidden sm:block" />
          </div>
          <h2 className="text-base sm:text-2xl font-black text-black mb-1 sm:mb-4 tracking-tight leading-tight">
            Ocorreu um erro inesperado
          </h2>
          <p className="text-slate-500 font-bold mb-4 sm:mb-8 max-w-xs text-xs sm:text-sm leading-tight">
            Não foi possível carregar a partida. Isso pode ser devido a dados corrompidos.
          </p>
          
          <div className="flex flex-col w-full gap-2 sm:gap-3 max-w-xs">
            <button 
              onClick={this.handleRetry}
              className="w-full py-3 sm:py-4 bg-blue-600 text-white rounded-2xl sm:rounded-3xl font-black text-xs sm:text-sm shadow-md active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <RotateCw size={16} />
              Tentar novamente
            </button>
            
            <button 
              onClick={this.handleReset} 
              className="w-full py-3 sm:py-4 bg-red-50 text-red-600 rounded-2xl sm:rounded-3xl font-black text-xs sm:text-sm border border-red-100 active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <Trash2 size={16} />
              Limpar dados e reiniciar
            </button>
          </div>
          
          {this.state.error?.message && (
            <div className="mt-4 sm:mt-8 text-[9px] sm:text-[10px] font-mono text-slate-400 max-w-xs truncate px-2">
              {this.state.error.message}
            </div>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
