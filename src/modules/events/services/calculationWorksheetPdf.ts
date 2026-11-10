import type {
  EventCategory,
  TournamentEntry,
  TournamentEvent,
  TournamentMatch,
  TournamentPair,
} from '../types';

const escapeHtml = (value: unknown): string =>
  String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char] as string);

const entryLabel = (entry?: TournamentEntry) =>
  entry?.nickname || entry?.name || 'A definir';

const pairLabel = (pair?: TournamentPair, label?: string) => {
  if (!pair) return label || 'A definir';
  const names = [entryLabel(pair.p1), entryLabel(pair.p2)].filter(Boolean).join(' & ');
  const code = pair.teamCode || (pair.teamNumber ? `Time ${pair.teamNumber}` : '');
  return code ? `${code} - ${names}` : names;
};

export const exportCategoryCalculationWorksheetPdf = (
  event: TournamentEvent,
  category: EventCategory,
  entries: TournamentEntry[],
  pairs: TournamentPair[],
  matches: TournamentMatch[],
  pairsById: Record<string, TournamentPair>
) => {
  const scoreTarget = category.scoreTarget || event.scoreTarget || 'Inscrito';
  const roster = scoreTarget === 'Time'
    ? pairs.map((pair) => ({
        code: pair.teamCode || `T${pair.teamNumber || ''}`,
        name: pairLabel(pair),
      }))
    : entries.map((entry, index) => ({
        code: entry.registrationId ? `I${entry.registrationId}` : `I${index + 1}`,
        name: entryLabel(entry),
      }));
  const sets = Number(event.setsCount || event.config?.sets || 1);
  const isSuper8 = (event.eventType || '').toLowerCase().includes('super 8');
  const roundCount = new Set(
    matches
      .map((match) => match.phase?.match(/^rodada(\d+)$/i)?.[1])
      .filter((round): round is string => Boolean(round))
  ).size;
  const tieBreakCriteria = isSuper8 && scoreTarget === 'Inscrito'
    ? [
        '1. Maior número de vitórias (critério principal).',
        '2. Maior saldo de games (games pró menos games contra).',
        '3. Maior número de games pró.',
        '4. Confronto direto, somente quando restarem dois inscritos empatados em vitórias, saldo e games pró; considerar vitórias e, persistindo, saldo de games no confronto.',
        '5. Maior percentual de games pró sobre o total de games disputados.',
        `6. Persistindo igualdade: ${(category as any).technicalTieBreak || event.technicalTieBreak || 'rank compartilhado'} (conforme configuração da categoria).`,
      ]
    : isSuper8
      ? [
          '1. Maior número de vitórias.',
          '2. Confronto direto, quando houver exatamente dois times empatados.',
          ...(sets > 1 ? ['3. Maior saldo de sets.'] : []),
          `${sets > 1 ? '4' : '3'}. Maior saldo de games.`,
          `${sets > 1 ? '5' : '4'}. Maior percentual de games pró sobre o total de games disputados.`,
          `${sets > 1 ? '6' : '5'}. Sorteio da comissão quando os critérios matemáticos permanecerem iguais.`,
        ]
      : [
          '1. Maior número de vitórias na fase de classificação.',
          '2. Confronto direto, quando aplicável.',
          ...(sets > 1 ? ['3. Maior saldo de sets.'] : []),
          `${sets > 1 ? '4' : '3'}. Maior saldo de games.`,
          `${sets > 1 ? '5' : '4'}. Maior percentual de games pró sobre o total de games disputados.`,
          `${sets > 1 ? '6' : '5'}. Sorteio/desempate técnico conforme regulamento da categoria.`,
        ];
  const tieBreakHtml = tieBreakCriteria.map((criterion) => `<li>${escapeHtml(criterion)}</li>`).join('');
  const gamesPerSet = Number(category.gamesPerSet || event.gamesPerSet || event.config?.gamesPerSet || 6);
  const sortedMatches = [...matches].sort((a, b) =>
    (a.matchNumber || Number(a.matchCode) || 0) - (b.matchNumber || Number(b.matchCode) || 0)
  );

  const matchRows = sortedMatches.map((match) => {
    const p1 = match.pair1 || (match.pair1Id ? pairsById[match.pair1Id] : undefined);
    const p2 = match.pair2 || (match.pair2Id ? pairsById[match.pair2Id] : undefined);
    const code = match.matchCode || String(match.matchNumber || '');
    const phase = match.phase ? ` · ${match.phase}` : '';
    const scoreCells = Array.from({ length: Math.max(sets, 1) }, (_, i) =>
      `<td class="score-cell"><span>J${i + 1}</span><i></i><i></i></td>`
    ).join('');
    return `<tr>
      <td class="match-code">[${escapeHtml(code)}]<small>${escapeHtml(phase)}</small></td>
      <td><div class="side-cell"><span class="winner-circle"></span><span>${escapeHtml(pairLabel(p1, match.pair1Label))}</span></div></td>
      ${scoreCells}
      <td><div class="side-cell"><span class="winner-circle"></span><span>${escapeHtml(pairLabel(p2, match.pair2Label))}</span></div></td>
    </tr>`;
  }).join('');

  const standingRows = roster.map((item) => {
    const victoryMarks = isSuper8 && roundCount > 0
      ? `<div class="win-circles">${Array.from({ length: roundCount }, () => '<span class="winner-circle"></span>').join('')}</div>`
      : '';
    return `<tr>
      <td>${escapeHtml(item.code)}</td><td>${escapeHtml(item.name)}</td><td>${victoryMarks}</td>
      <td></td><td></td><td></td><td></td><td></td><td></td><td></td>
    </tr>`;
  }).join('');

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
    <title>Cálculos - ${escapeHtml(category.name)}</title>
    <style>
      @page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{font:10px Arial,sans-serif;color:#172033;margin:0}
      h1{font-size:18px;margin:0 0 4px}h2{font-size:14px;margin:0 0 8px}.meta{color:#475569;margin-bottom:12px}
      .page{page-break-after:always}.page:last-child{page-break-after:auto}.instructions{border:1px solid #94a3b8;border-radius:6px;padding:8px;margin:8px 0 12px;line-height:1.5}
      table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{border:1px solid #64748b;padding:5px;text-align:center;height:30px;overflow:hidden}
      th{background:#e2e8f0;font-size:9px}td:nth-child(2){text-align:left}.matches th:nth-child(1){width:12%}
      .matches th.score-head{width:8%}.match-code{font-weight:bold}.match-code small{display:block;font-weight:normal;color:#475569}
      .score-cell{padding:2px}.score-cell span{display:block;font-size:7px;color:#64748b}.score-cell i{display:inline-block;width:19px;height:16px;border:1px solid #94a3b8;margin:1px}
      .side-cell{display:flex;align-items:center;gap:6px;text-align:left}.winner-circle{display:inline-block;flex:0 0 14px;width:14px;height:14px;border:1.5px solid #334155;border-radius:50%}.side-cell>span:last-child{overflow-wrap:anywhere}
      .standings th:nth-child(1){width:7%}.standings th:nth-child(2){width:22%}
      .standings th:nth-child(3){width:${isSuper8 && roundCount > 0 ? Math.min(28, Math.max(12, roundCount * 3.5)) : 10}%}
      .win-circles{display:flex;justify-content:center;gap:3px;flex-wrap:wrap}.win-circles .winner-circle{flex-basis:13px;width:13px;height:13px}
      .criteria{margin:8px 0 0 18px;padding:0;line-height:1.5}.criteria li{padding-left:2px;margin:2px 0}.criteria-note{margin-top:6px;padding:6px 8px;background:#f1f5f9;border-left:3px solid #475569;line-height:1.45}
      .standings td{height:27px}.footnote{margin-top:8px;color:#334155;line-height:1.5}.signatures{display:flex;gap:40px;margin-top:20px}.signatures span{flex:1;border-top:1px solid #64748b;padding-top:4px}
      @media print{.page{min-height:185mm}}
    </style></head><body>
    <section class="page">
      <h1>Folha de partidas e placares</h1>
      <div class="meta">${escapeHtml(event.name)} · Categoria: <b>${escapeHtml(category.name)}</b> · Pontuação por: <b>${escapeHtml(scoreTarget)}</b> · ${gamesPerSet} games por set · ${sets} set(s)</div>
      <div class="instructions"><b>Como preencher:</b> anote os games de cada lado em cada set; marque o vencedor da partida. Em pontuação por inscrito, o resultado da dupla/partida deve ser lançado para cada inscrito participante. Em pontuação por time, lance uma única vez para o time fixo.</div>
      <table class="matches"><thead><tr><th>Partida / fase</th><th>Lado A · vencedor</th>${Array.from({length:Math.max(sets,1)},(_,i)=>`<th class="score-head">Set ${i+1}<br>games A / B</th>`).join('')}<th>Lado B · vencedor</th></tr></thead><tbody>${matchRows || `<tr><td colspan="${3+Math.max(sets,1)}">Nenhuma partida gerada. Use o quadro de classificação para registrar os dados manualmente.</td></tr>`}</tbody></table>
      <div class="signatures"><span>Responsável pelo registro</span><span>Conferência</span></div>
    </section>
    <section class="page">
      <h1>Apuração manual da classificação</h1>
      <div class="meta">${escapeHtml(event.name)} · ${escapeHtml(category.name)} · Apuração por <b>${escapeHtml(scoreTarget)}</b></div>
      <div class="instructions"><b>Como apurar:</b> ${isSuper8 && roundCount > 0 ? `marque um círculo na coluna Vitórias para cada rodada vencida (há ${roundCount} rodadas). Se todos disputarem todas as rodadas, os círculos vazios representam derrotas.` : 'registre o total de vitórias na coluna correspondente.'} Saldo partidas = vitórias menos derrotas; saldos de games e sets = pró menos contra. Em pontuação por inscrito, lance os dados para cada participante; em pontuação por time, lance uma vez para cada dupla fixa. Cada linha corresponde a ${scoreTarget === 'Time' ? 'um time fixo' : 'um inscrito'}.</div>
      <table class="standings"><thead><tr><th>Código</th><th>${scoreTarget === 'Time' ? 'Time' : 'Inscrito'}</th><th>Vitórias${isSuper8 && roundCount > 0 ? `<br><small>${roundCount} círculos = rodadas</small>` : ''}</th><th>Saldo partidas</th><th>Games pró</th><th>Games contra</th><th>Saldo games</th><th>Sets pró</th><th>Sets contra</th><th>Saldo sets</th></tr></thead><tbody>${standingRows || `<tr><td colspan="10">Nenhum ${scoreTarget === 'Time' ? 'time' : 'inscrito'} encontrado nesta categoria. Acrescente linhas antes da apuração.</td></tr>`}</tbody></table>
      <h2 style="margin-top:12px">Critérios de desempate</h2>
      <ol class="criteria">${tieBreakHtml}</ol>
      <div class="criteria-note"><b>Conferência:</b> anote também a ordem final e o critério aplicado nos empates. Se o regulamento da categoria divergir desta lista, prevalece o regulamento.</div>
      <div class="signatures"><span>Apurado por</span><span>Conferido por</span><span>Data</span></div>
    </section>
    <script>window.onload=()=>setTimeout(()=>window.print(),300)</script></body></html>`;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  } else {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.target = '_blank';
    link.rel = 'noopener';
    link.click();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
  }
};
