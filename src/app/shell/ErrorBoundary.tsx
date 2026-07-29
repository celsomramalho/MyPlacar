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
    window.location.reload();
  };

  private handleReset = () => {
    try {
      localStorage.removeItem('myPlacarActiveGameState');
      localStorage.removeItem('myPlacarSettings');
    } catch { /* best effort */ }
    this.setState({ hasError: false, error: null });
    window.location.href = window.location.origin;
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-white flex flex-col items-center justify-center p-8 text-center animate-in fade-in relative">
          <button
            onClick={this.handleRetry}
            className="absolute top-6 right-6 w-10 h-10 flex items-center justify-center bg-gray-100 text-gray-500 rounded-full active:scale-90 transition-all"
          >
            <span className="text-xl font-black leading-none">×</span>
          </button>
          <div className="w-20 h-20 bg-red-50 text-red-600 rounded-full flex items-center justify-center mb-6 shadow-inner">
            <AlertCircle size={40} />
          </div>
          <h2 className="text-2xl font-black text-black mb-4 tracking-tight">Ocorreu um erro inesperado</h2>
          <p className="text-slate-500 font-bold mb-8 max-w-xs leading-tight">
            Não foi possível carregar a partida. Isso pode ser devido a dados corrompidos.
          </p>
          
          <div className="flex flex-col w-full gap-3 max-w-xs">
            <button 
              onClick={this.handleRetry}
              className="w-full py-4 bg-blue-600 text-white rounded-3xl font-black text-sm shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <RotateCw size={18} />
              Tentar novamente
            </button>
            
            <button 
              onClick={this.handleReset} 
              className="w-full py-4 bg-red-50 text-red-600 rounded-3xl font-black text-sm border border-red-100 active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <Trash2 size={18} />
              Limpar dados e reiniciar
            </button>
          </div>
          
          <div className="mt-12 text-[10px] font-mono text-slate-300 max-w-xs truncate">
            {this.state.error?.message}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
