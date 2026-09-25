/**
 * Utilitário para abrir regulamentos ou arquivos PDF em uma nova aba com segurança.
 *
 * Browsers modernos (Chromium, Firefox, Safari) bloqueiam navegação direta
 * para URLs do tipo "data:application/pdf;base64,..." por razões de segurança.
 * Esta função converte data URLs em Blob de mesma origem (blob:...), permitindo
 * que o leitor de PDF nativo do navegador renderize o documento perfeitamente.
 */
export function openPdfOrUrl(url: string, fileName = 'regulamento.pdf'): void {
  if (!url) return;

  // Se for uma URL em formato base64/data URI
  if (url.startsWith('data:')) {
    try {
      const commaIdx = url.indexOf(',');
      if (commaIdx !== -1) {
        const meta = url.slice(0, commaIdx);
        const data = url.slice(commaIdx + 1);
        const mimeMatch = meta.match(/:(.*?);/);
        const mimeType = mimeMatch ? mimeMatch[1] : 'application/pdf';

        let blob: Blob;
        if (meta.includes('base64')) {
          const byteCharacters = atob(data.trim());
          const byteNumbers = new Uint8Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          blob = new Blob([byteNumbers], { type: mimeType });
        } else {
          blob = new Blob([decodeURIComponent(data)], { type: mimeType });
        }

        const blobUrl = URL.createObjectURL(blob);
        const openedWindow = window.open(blobUrl, '_blank', 'noopener,noreferrer');

        // Se o popup blocker interceptou o window.open, usa fallback via elemento <a>
        if (!openedWindow || openedWindow.closed || typeof openedWindow.closed === 'undefined') {
          const link = document.createElement('a');
          link.href = blobUrl;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }

        // Revoga a URL do Blob após 1 minuto para liberar memória
        setTimeout(() => {
          try {
            URL.revokeObjectURL(blobUrl);
          } catch {
            // No-op
          }
        }, 60000);
        return;
      }
    } catch (err) {
      console.error('Erro ao converter data URL para visualização do PDF:', err);
    }
  }

  // URL HTTP/HTTPS tradicional
  window.open(url, '_blank', 'noopener,noreferrer');
}
