import React, { useState, useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { Mic, Camera, X, Loader2, Image as ImageIcon, AlertCircle } from 'lucide-react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: React.ReactNode;
  rightAction?: React.ReactNode;
  enableVoice?: boolean;
  enableCamera?: boolean;
  onVoiceComplexResult?: (p1: string, p2: string) => void;
  partnerTerms?: string[];
}

// Carrega html5-qrcode dinamicamente apenas quando necessário
// evitando que o iframe do Google apareça em contextos como o relógio
const loadHtml5Qrcode = (): Promise<any> => {
  return new Promise((resolve, reject) => {
    if ((window as any).Html5Qrcode) {
      resolve((window as any).Html5Qrcode);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/html5-qrcode';
    script.onload = () => resolve((window as any).Html5Qrcode);
    script.onerror = reject;
    document.head.appendChild(script);
  });
};

export const Input = forwardRef<any, InputProps>(({ label, rightAction, enableVoice, enableCamera, className = '', onChange, value, onVoiceComplexResult, partnerTerms = ['mais', 'com'], ...props }, ref) => {
  const [isListening, setIsListening] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const [isScanningFile, setIsScanningFile] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const scannerRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.lang = 'pt-BR';
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (event: any) => {
      let transcript = event.results[0][0].transcript.toLowerCase();
      transcript = transcript.replace(/\+/g, ' mais ');

      if (onVoiceComplexResult) {
        const terms = (partnerTerms || []).map(t => t.toLowerCase().trim()).filter(t => !!t);
        // Adiciona 'e' como termo comum se não estiver presente
        if (!terms.includes('e')) terms.push('e');
        
        for (const term of terms) {
          const regex = new RegExp(`\\s+${term}\\s+`, 'i');
          const match = transcript.match(regex);
          if (match && match.index !== undefined) {
            const p1 = transcript.substring(0, match.index).trim();
            const p2 = transcript.substring(match.index + match[0].length).trim();
            if (p1 && p2) {
              onVoiceComplexResult(p1, p2);
              return; 
            }
          }
        }
      }
      if (onChange) onChange({ target: { value: transcript } } as any);
    };
    recognition.start();
  };

  const processDecodedText = (decodedText: string) => {
    let extractedPin = "";
    let extractedNick = "";

    if (decodedText.includes("pin_ref=")) {
      try {
        const urlStr = decodedText.startsWith('http') ? decodedText : `https://${decodedText}`;
        const url = new URL(urlStr);
        extractedPin = url.searchParams.get("pin_ref")?.toUpperCase() || "";
        extractedNick = url.searchParams.get("ref") || "";
      } catch (e) {
        const pinMatch = decodedText.match(/pin_ref=([^&]+)/);
        const nickMatch = decodedText.match(/ref=([^&]+)/);
        if (pinMatch) extractedPin = pinMatch[1].toUpperCase();
        if (nickMatch) extractedNick = decodeURIComponent(nickMatch[1]);
      }
    } else if (decodedText.length === 5 && !decodedText.includes(" ")) {
      extractedPin = decodedText.toUpperCase();
    }

    if (extractedPin || extractedNick) {
      if (onVoiceComplexResult) onVoiceComplexResult(extractedNick, extractedPin);
      if (onChange) onChange({ target: { value: extractedNick || extractedPin } } as any);
      stopScanner();
    } else {
      setScanError("O qr code encontrado não é válido para o MyPlacar");
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setScanError(null);
    setIsScanningFile(true);

    // Tenta fechar a câmera antes de processar arquivo
    if (scannerRef.current) {
      try { await scannerRef.current.stop(); } catch(e) {}
    }

    const scanImage = async (imageSource: File | HTMLCanvasElement) => {
      const Html5QrcodeLib = await loadHtml5Qrcode();
      const processor = new Html5QrcodeLib("qr-reader", { verbose: false });
      return await processor.scanFile(imageSource, true);
    };

    try {
      // Tentativa 1: Imagem original
      try {
        const decoded = await scanImage(file);
        processDecodedText(decoded);
      } catch (err) {
        // Tentativa 2: Redimensionar para canvas (melhora detecção em fotos de alta resolução)
        const bitmap = await createImageBitmap(file);
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 1000;
        let width = bitmap.width;
        let height = bitmap.height;

        if (width > height) {
          if (width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(bitmap, 0, 0, width, height);
        
        const decodedFromCanvas = await scanImage(canvas);
        processDecodedText(decodedFromCanvas);
      }
    } catch (err) {
      console.error("Erro ao ler imagem da galeria:", err);
      setScanError("Não foi possível localizar um qr code nesta imagem");
    } finally {
      setIsScanningFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const startScanner = () => {
    setShowScanner(true);
    setIsCameraLoading(true);
    setScanError(null);
    
    setTimeout(async () => {
      const element = document.getElementById("qr-reader");
      if (!element) {
        setIsCameraLoading(false);
        return;
      }

      if (scannerRef.current) {
        try { await scannerRef.current.stop(); } catch(e) {}
      }

      try {
        const Html5QrcodeLib = await loadHtml5Qrcode();
        const html5QrCode = new Html5QrcodeLib("qr-reader", { verbose: false });
        scannerRef.current = html5QrCode;

        const config = { 
          fps: 15,
          videoConstraints: {
            facingMode: "environment",
            focusMode: "continuous"
          }
        };

        await html5QrCode.start(
          { facingMode: "environment" },
          config,
          (decodedText: string) => {
            processDecodedText(decodedText);
          },
          () => {} 
        );
        
        setIsCameraLoading(false);
      } catch (err) {
        console.error("Scanner error:", err);
        setIsCameraLoading(false);
        if (!scannerRef.current) {
           const Html5QrcodeFallback = await loadHtml5Qrcode();
           scannerRef.current = new Html5QrcodeFallback("qr-reader", { verbose: false });
        }
      }
    }, 400);
  };

  const stopScanner = () => {
    // Força o fechamento da UI imediatamente
    setShowScanner(false);
    
    const cleanup = () => {
      scannerRef.current = null;
      setScanError(null);
    };

    if (scannerRef.current) {
      // Tenta parar a câmera de forma assíncrona mas não bloqueia a UI
      const scanner = scannerRef.current;
      const stopPromise = typeof scanner.stop === 'function' 
        ? scanner.stop() 
        : Promise.resolve();

      stopPromise.then(() => {
        try { scanner.clear(); } catch(e) {}
        cleanup();
      }).catch(cleanup);
    } else {
      cleanup();
    }
  };

  useImperativeHandle(ref, () => ({
    click: () => startScanner(),
    startScanner,
    stopScanner
  }));

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        try { scannerRef.current.stop(); } catch(e) {}
      }
    };
  }, []);

  return (
    <div className="flex flex-col gap-0.5 w-full">
      {showScanner && (
        <div className="fixed inset-0 z-[10000000] bg-black flex flex-col items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="absolute top-8 right-6 z-[10000002]">
             <button 
               onClick={stopScanner} 
               className="p-4 bg-white/10 hover:bg-white/20 rounded-full text-white backdrop-blur-xl active:scale-90 transition-all border border-white/20"
             >
               <X size={28} />
             </button>
          </div>
          
          <div className="relative w-full max-w-sm aspect-square bg-gray-900 rounded-[2.5rem] overflow-hidden shadow-2xl border border-white/10">
            <div id="qr-reader" className="w-full h-full"></div>
            <div className="absolute inset-0 pointer-events-none z-10">
              {isCameraLoading ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-950 text-white/50 gap-4">
                  <Loader2 className="animate-spin text-emerald-500" size={40} />
                  <span className="text-xs font-bold text-white">Iniciando câmera...</span>
                </div>
              ) : isScanningFile ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-950/80 text-white/50 gap-4 backdrop-blur-sm">
                  <Loader2 className="animate-spin text-blue-500" size={40} />
                  <span className="text-xs font-bold text-white">Processando imagem...</span>
                </div>
              ) : (
                <>
                  <div className="scanner-line"></div>
                  <div className="scanner-corner top-6 left-6 border-b-0 border-r-0 rounded-tl-2xl"></div>
                  <div className="scanner-corner top-6 right-6 border-b-0 border-l-0 rounded-tr-2xl"></div>
                  <div className="scanner-corner bottom-6 left-6 border-t-0 border-r-0 rounded-bl-2xl"></div>
                  <div className="scanner-corner bottom-6 right-6 border-t-0 border-l-0 rounded-br-2xl"></div>
                </>
              )}
            </div>
          </div>
          
          <div className="mt-8 text-center space-y-2">
            <p className="text-white font-black text-sm">Área de leitura</p>
            <p className="text-white/60 font-medium text-xs max-w-[240px] leading-relaxed">
              Posicione o qr code do seu parceiro <br/>centralizado na moldura
            </p>
          </div>

          <div className="flex flex-col gap-3 mt-10 w-full max-w-[280px]">
            {scanError && (
              <div className="mb-2 p-4 bg-red-500/20 border border-red-500/50 rounded-2xl flex items-center gap-3 animate-in shake">
                 <AlertCircle className="text-red-400 shrink-0" size={20} />
                 <p className="text-[11px] font-bold text-red-200 leading-tight">{scanError}</p>
              </div>
            )}

            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isScanningFile}
              className="w-full px-10 py-4 bg-blue-600 text-white rounded-2xl font-black text-xs tracking-widest active:scale-95 transition-all shadow-lg flex items-center justify-center gap-3"
            >
              <ImageIcon size={18} />
              Escolher da galeria
            </button>
            
            <input 
              type="file" 
              ref={fileInputRef} 
              accept="image/*" 
              className="hidden" 
              onChange={handleFileSelect} 
            />

            <button 
              onClick={stopScanner}
              className="w-full px-10 py-4 bg-white/10 text-white rounded-2xl font-black text-xs tracking-widest active:scale-95 transition-all border border-white/20 backdrop-blur-md"
            >
              Fechar câmera
            </button>
          </div>
        </div>
      )}

      {label && <label className="text-[13px] font-bold text-black ml-1 leading-tight">{label}</label>}
      <div className="relative flex items-center">
        <input 
          value={value}
          onChange={onChange}
          className={`w-full bg-white border border-gray-200 rounded-xl px-4 py-1.5 text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm ${(rightAction || enableVoice || enableCamera) ? 'pr-12' : ''} ${className}`}
          {...props}
        />
        <div className="absolute right-2 flex items-center gap-1">
          {enableCamera && (
            <button type="button" onClick={startScanner} className="p-2 text-emerald-500 hover:text-emerald-600 transition-all active:scale-75">
              <Camera size={18} />
            </button>
          )}
          {enableVoice && (
            <button type="button" onClick={startListening} className={`p-2 rounded-lg transition-all active:scale-75 ${isListening ? 'text-red-500 bg-red-50 animate-pulse' : 'text-blue-500 hover:text-blue-600'}`}>
              <Mic size={18} />
            </button>
          )}
          {rightAction}
        </div>
      </div>
    </div>
  );
});