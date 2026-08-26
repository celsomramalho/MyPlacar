import type { EventCategory, TournamentEvent, TournamentMatch, TournamentPair } from '../types';
import { formatMatchNumber } from './matchGenerator';

export const exportCategoryMatchesBlankPdf = (
  event: TournamentEvent,
  category: EventCategory,
  categoryMatches: TournamentMatch[],
  pairsById: Record<string, TournamentPair>
) => {
  const b1Matches = categoryMatches.filter((m) => m.phase === 'chave1');
  const b2Matches = categoryMatches.filter((m) => m.phase === 'chave2');
  const semiMatches = categoryMatches.filter((m) => m.phase === 'semifinal');
  const finalMatches = categoryMatches.filter((m) => m.phase === 'final' || m.phase === '3lugar');
  const otherMatches = categoryMatches.filter(
    (m) => !['chave1', 'chave2', 'semifinal', 'final', '3lugar'].includes(m.phase || '')
  );

  const totalSets = (event.setsCount || event.config?.sets || 1) as number;

  const getCleanPhaseLabel = (phase?: string): string => {
    if (!phase) return '';
    const p = phase.toLowerCase();
    if (p === 'chave1' || p === 'chave 1') return 'chave 1';
    if (p === 'chave2' || p === 'chave 2') return 'chave 2';
    if (p === 'semifinal' || p === 'semi') return 'semifinal';
    if (p === 'final') return 'final';
    if (p === '3lugar' || p === '3º lugar') return '3º lugar';
    return phase;
  };

  const renderMatchCardHtml = (match: TournamentMatch) => {
    const code = match.matchCode || formatMatchNumber(match.matchNumber || 1);
    const phase = getCleanPhaseLabel(match.phase);
    const phaseStr = phase ? `[${phase}]` : '';

    const p1 = match.pair1 || (match.pair1Id && pairsById ? pairsById[match.pair1Id] : undefined);
    const p2 = match.pair2 || (match.pair2Id && pairsById ? pairsById[match.pair2Id] : undefined);

    const team1Name = p1
      ? `${p1.p1.nickname || p1.p1.name} & ${p1.p2.nickname || p1.p2.name}`
      : match.pair1Label || 'A definir';
    const team1Code = p1 ? (p1.teamCode || `Time ${p1.teamNumber || ''}`) : '';

    const team2Name = p2
      ? `${p2.p1.nickname || p2.p1.name} & ${p2.p2.nickname || p2.p2.name}`
      : match.pair2Label || 'A definir';
    const team2Code = p2 ? (p2.teamCode || `Time ${p2.teamNumber || ''}`) : '';

    return `
      <div class="match-card">
        <div class="match-header">
          <span class="match-code">[${code}] ${phaseStr}</span>
          <span class="match-quadra">Quadra: ______</span>
        </div>

        <div class="match-body">
          <div class="team-row">
            <div class="team-info">
              <span class="team-name" title="${team1Name}">${team1Name}</span>
              ${team1Code ? `<span class="team-code">[${team1Code}]</span>` : ''}
            </div>
            <div class="score-boxes">
              ${Array.from({ length: totalSets })
                .map(
                  (_, i) => `
                <div class="set-col">
                  <div class="score-box"></div>
                  <span class="set-label">set ${i + 1}</span>
                </div>
              `
                )
                .join('')}
              ${totalSets > 1 ? '<div class="total-set-box"><div class="score-box total"></div><span class="set-label">Total</span></div>' : ''}
            </div>
          </div>

          <div class="vs-divider">vs</div>

          <div class="team-row">
            <div class="team-info">
              <span class="team-name" title="${team2Name}">${team2Name}</span>
              ${team2Code ? `<span class="team-code">[${team2Code}]</span>` : ''}
            </div>
            <div class="score-boxes">
              ${Array.from({ length: totalSets })
                .map(
                  (_, i) => `
                <div class="set-col">
                  <div class="score-box"></div>
                  <span class="set-label">set ${i + 1}</span>
                </div>
              `
                )
                .join('')}
              ${totalSets > 1 ? '<div class="total-set-box"><div class="score-box total"></div><span class="set-label">Total</span></div>' : ''}
            </div>
          </div>
        </div>

        <div class="match-footer">
          <div class="footer-field">
            <span>Vencedor: ________________________</span>
          </div>
          <div class="footer-field">
            <span>Assinatura: _____________________</span>
          </div>
        </div>
      </div>
    `;
  };

  const renderHeaderHtml = (showBanner = false) => `
    <div class="page-header-wrapper">
      ${showBanner && event.bannerUrl ? `
        <div class="event-banner-container">
          <img src="${event.bannerUrl}" class="event-banner-img" alt="Banner do evento" />
        </div>
      ` : ''}

      <div class="header-bar">
        <div class="header-info">
          <h1>${event.name}</h1>
          <p>Categoria: <strong>${category.name}</strong> &bull; Total: <strong>${categoryMatches.length} partidas</strong></p>
        </div>
        <div class="header-meta">
          <div>Formato: ${category.format || 'Duplas'}</div>
          <div>${totalSets === 1 ? 'Partidas em 1 set' : `Melhor de ${totalSets} sets`}</div>
          <div>Gerado em: ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
        </div>
      </div>
    </div>
  `;

  const renderFooterHtml = () => `
    <div class="pdf-footer">
      <span>Criado e desenvolvido por:</span>
      <div class="brand-wrapper">
        <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" class="brand-logo-svg">
          <rect x="2" y="6" width="28" height="20" rx="4" fill="#1e293b" />
          <path d="M2 10C2 7.79086 3.79086 6 6 6H26C28.2091 6 30 7.79086 30 10V11H2V10Z" fill="#334155" />
          <rect x="8" y="4" width="2" height="4" rx="1" fill="#94a3b8" />
          <rect x="22" y="4" width="2" height="4" rx="1" fill="#94a3b8" />
          <rect x="5" y="13" width="10" height="10" rx="1" fill="#ef4444" />
          <rect x="9" y="15" width="2" height="6" rx="1" stroke="white" stroke-width="1.5" fill="none" />
          <rect x="17" y="13" width="10" height="10" rx="1" fill="#3b82f6" />
          <path d="M21 16H23L21 20H23" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span class="brand-name">MyPlacar</span>
      </div>
      <span>&bull;</span>
      <span class="brand-url">by myplacar.app.br</span>
    </div>
  `;

  const renderSectionHtml = (title: string, matches: TournamentMatch[]) => {
    if (matches.length === 0) return '';
    return `
      <div class="section-container">
        <h2 class="section-title">${title} (${matches.length} ${matches.length === 1 ? 'jogo' : 'jogos'})</h2>
        <div class="matches-grid">
          ${matches.map(renderMatchCardHtml).join('')}
        </div>
      </div>
    `;
  };

  // Montagem das páginas:
  // Página 1: Primeira fase — chave 1
  // Página 2: Primeira fase — chave 2
  // Página 3: Semifinais e Finais & 3º lugar
  const pagesHtml: string[] = [];

  // Se houver Chave 1
  if (b1Matches.length > 0) {
    pagesHtml.push(`
      <div class="pdf-page">
        <div class="pdf-page-top">
          ${renderHeaderHtml(true)}
          ${renderSectionHtml('Primeira fase — chave 1', b1Matches)}
        </div>
        ${renderFooterHtml()}
      </div>
    `);
  }

  // Se houver Chave 2
  if (b2Matches.length > 0) {
    pagesHtml.push(`
      <div class="pdf-page">
        <div class="pdf-page-top">
          ${renderHeaderHtml(false)}
          ${renderSectionHtml('Primeira fase — chave 2', b2Matches)}
        </div>
        ${renderFooterHtml()}
      </div>
    `);
  }

  // Se houver Semifinais ou Finais
  if (semiMatches.length > 0 || finalMatches.length > 0 || otherMatches.length > 0) {
    pagesHtml.push(`
      <div class="pdf-page">
        <div class="pdf-page-top">
          ${renderHeaderHtml(false)}
          ${renderSectionHtml('Semifinais', semiMatches)}
          ${renderSectionHtml('Finais & 3º lugar', finalMatches)}
          ${renderSectionHtml('Outras partidas', otherMatches)}
        </div>
        ${renderFooterHtml()}
      </div>
    `);
  }

  // Fallback se não se encaixar no formato tradicional de chaves
  if (pagesHtml.length === 0) {
    pagesHtml.push(`
      <div class="pdf-page">
        <div class="pdf-page-top">
          ${renderHeaderHtml(true)}
          ${renderSectionHtml('Partidas', categoryMatches)}
        </div>
        ${renderFooterHtml()}
      </div>
    `);
  }

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Súmula de Partidas - ${category.name} - ${event.name}</title>
      <style>
        @page {
          size: A4 portrait;
          margin: 8mm 10mm 8mm 10mm;
        }

        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }

        body {
          background-color: #f8fafc;
          color: #0f172a;
          padding: 16px;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        @media print {
          body {
            background-color: #ffffff;
            padding: 0;
          }
          .no-print {
            display: none !important;
          }
          .pdf-page {
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
            min-height: 280mm !important;
            max-height: 280mm !important;
            page-break-after: always !important;
            break-after: page !important;
          }
          .pdf-page:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
        }

        .pdf-page {
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          min-height: 275mm;
          width: 100%;
          max-width: 190mm;
          margin: 0 auto 30px auto;
          background: #ffffff;
          padding: 12px;
          border-radius: 8px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.06);
          page-break-after: always;
          break-after: page;
        }

        .pdf-page:last-child {
          page-break-after: auto;
          break-after: auto;
          margin-bottom: 0;
        }

        .pdf-page-top {
          flex: 1;
        }

        .top-action-bar {
          background: #1e293b;
          color: #ffffff;
          padding: 12px 20px;
          border-radius: 12px;
          margin-bottom: 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          max-width: 190mm;
          margin-left: auto;
          margin-right: auto;
        }

        .btn-print {
          background: #22c55e;
          color: #ffffff;
          border: none;
          font-size: 14px;
          font-weight: 800;
          padding: 8px 18px;
          border-radius: 8px;
          cursor: pointer;
          transition: background 0.2s;
        }
        .btn-print:hover {
          background: #16a34a;
        }

        .event-banner-container {
          width: 100%;
          max-height: 85px;
          border-radius: 8px;
          overflow: hidden;
          margin-bottom: 8px;
          border: 1.5px solid #0f172a;
          background: #0f172a;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .event-banner-img {
          width: 100%;
          max-height: 85px;
          object-fit: cover;
          display: block;
        }

        .header-bar {
          background: #ffffff;
          border: 2px solid #0f172a;
          border-radius: 10px;
          padding: 10px 14px;
          margin-bottom: 12px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .header-info h1 {
          font-size: 16px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: -0.5px;
          color: #0f172a;
        }

        .header-info p {
          font-size: 12px;
          font-weight: 700;
          color: #475569;
          margin-top: 1px;
        }

        .header-meta {
          text-align: right;
          font-size: 10.5px;
          font-weight: 800;
          color: #64748b;
          line-height: 1.35;
        }

        .section-container {
          margin-bottom: 12px;
        }

        .section-title {
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.3px;
          background: #f1f5f9;
          color: #1e293b;
          border-left: 4px solid #0f172a;
          padding: 4px 10px;
          margin-bottom: 8px;
          border-radius: 0 6px 6px 0;
        }

        .matches-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
          width: 100%;
        }

        .match-card {
          background: #ffffff;
          border: 1.5px solid #0f172a;
          border-radius: 8px;
          padding: 8px 10px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          overflow: hidden;
          width: 100%;
        }

        .match-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 10.5px;
          font-weight: 900;
          padding-bottom: 4px;
          margin-bottom: 4px;
          border-bottom: 1px dashed #cbd5e1;
        }

        .match-code {
          color: #0f172a;
        }

        .match-quadra {
          color: #64748b;
          font-size: 9.5px;
        }

        .match-body {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .team-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 6px;
        }

        .team-info {
          display: flex;
          flex-direction: column;
          min-width: 0;
          flex: 1;
        }

        .team-name {
          font-size: 11px;
          font-weight: 800;
          color: #0f172a;
          line-height: 1.2;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .team-code {
          font-size: 8.5px;
          font-weight: 700;
          color: #64748b;
        }

        .score-boxes {
          display: flex;
          align-items: center;
          gap: 3px;
        }

        .set-col {
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .score-box {
          width: 28px;
          height: 22px;
          border: 1.5px solid #0f172a;
          background: #ffffff;
          border-radius: 3px;
        }

        .score-box.total {
          border-width: 2px;
          background: #f8fafc;
        }

        .set-label {
          font-size: 7.5px;
          font-weight: 700;
          color: #64748b;
          margin-top: 1px;
        }

        .vs-divider {
          text-align: center;
          font-size: 8.5px;
          font-weight: 800;
          color: #94a3b8;
          line-height: 1;
          margin: 1px 0;
        }

        .match-footer {
          margin-top: 6px;
          padding-top: 4px;
          border-top: 1px dashed #cbd5e1;
          display: flex;
          justify-content: space-between;
          font-size: 8.5px;
          font-weight: 700;
          color: #475569;
        }

        .pdf-footer {
          margin-top: 14px;
          padding-top: 8px;
          border-top: 1px solid #cbd5e1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          font-size: 10px;
          font-weight: 700;
          color: #64748b;
        }

        .brand-wrapper {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          color: #0f172a;
          font-weight: 900;
        }

        .brand-logo-svg {
          width: 18px;
          height: 18px;
          vertical-align: middle;
        }

        .brand-name {
          font-size: 11.5px;
          font-weight: 900;
          color: #0f172a;
          letter-spacing: -0.3px;
        }

        .brand-url {
          color: #2563eb;
          text-decoration: none;
          font-weight: 800;
        }
      </style>
    </head>
    <body>
      <div class="top-action-bar no-print">
        <div>
          <strong>Folha de Súmulas para Anotação Manual</strong>
          <span style="opacity: 0.8; font-size: 12px; margin-left: 10px;">Clique em Imprimir ou pressione Ctrl+P para salvar em PDF</span>
        </div>
        <button class="btn-print" onclick="window.print()">🖨️ Imprimir / Salvar PDF</button>
      </div>

      ${pagesHtml.join('')}

      <script>
        window.onload = function() {
          setTimeout(function() {
            window.print();
          }, 300);
        };
      </script>
    </body>
    </html>
  `;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  } else {
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.target = '_blank';
    a.click();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
  }
};
