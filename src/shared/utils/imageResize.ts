export interface ImageResizeOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: 'image/jpeg' | 'image/png' | 'image/webp';
}

/**
 * Redimensiona e comprime uma imagem (File, Blob ou Data URL) para um Data URL leve.
 * Ideal para evitar o limite de 1 MiB do Firestore em banners, fotos e ícones.
 */
export const compressImageToDataUrl = (
  fileOrDataUrl: File | Blob | string,
  options: ImageResizeOptions = {}
): Promise<string> => {
  const {
    maxWidth = 1200,
    maxHeight = 675,
    quality = 0.8,
    format = 'image/jpeg',
  } = options;

  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      // Ambiente sem DOM (ex: Node/testes)
      if (typeof fileOrDataUrl === 'string') {
        resolve(fileOrDataUrl);
      } else {
        resolve('');
      }
      return;
    }

    const processImage = (src: string) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width <= 0 || height <= 0) {
          resolve(src);
          return;
        }

        // Manter proporção
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(src);
          return;
        }

        // Preenche fundo branco para JPEG (evita fundo preto em imagens com transparência)
        if (format === 'image/jpeg') {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, width, height);
        }

        ctx.drawImage(img, 0, 0, width, height);

        try {
          const resultDataUrl = canvas.toDataURL(format, quality);
          resolve(resultDataUrl);
        } catch {
          resolve(src);
        }
      };
      img.onerror = (err) => {
        console.warn('Erro ao carregar imagem para redimensionamento:', err);
        resolve(src);
      };
      img.src = src;
    };

    if (typeof fileOrDataUrl === 'string') {
      processImage(fileOrDataUrl);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        processImage(String(e.target?.result || ''));
      };
      reader.onerror = (err) => {
        console.warn('Erro ao ler arquivo de imagem:', err);
        reject(err);
      };
      reader.readAsDataURL(fileOrDataUrl);
    }
  });
};
