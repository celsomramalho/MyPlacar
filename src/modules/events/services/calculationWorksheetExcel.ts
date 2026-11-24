import * as XLSX from 'xlsx';
import type { EventCategory, TournamentEntry, TournamentEvent, TournamentMatch, TournamentPair } from '../types';

const entryName = (entry?: TournamentEntry) => entry?.nickname || entry?.name || 'A definir';
const entryCode = (entry: TournamentEntry, index: number) => entry.pin || entry.email || `I${entry.registrationId || index + 1}`;
const pairName = (pair?: TournamentPair, fallback?: string) => pair
  ? `${pair.teamCode || `Time ${pair.teamNumber || ''}`} - ${entryName(pair.p1)} & ${entryName(pair.p2)}`
  : fallback || 'A definir';
const quoteSheetName = (name: string) => `'${name.replace(/'/g, "''")}'`;
const safeSheetName = (raw: string, used: Set<string>) => {
  const base = (raw || 'Categoria').replace(/[\\/?*:[\]]/g, '_').slice(0, 27) || 'Categoria';
  let name = base;
  let suffix = 1;
  while (used.has(name.toLowerCase())) {
    const tail = `_${suffix++}`;
    name = `${base.slice(0, 31 - tail.length)}${tail}`;
  }
  used.add(name.toLowerCase());
  return name;
};

/** Creates one workbook for the event, with a score-entry and a live standings tab per category. */
export const exportEventCalculationWorkbook = (
  event: TournamentEvent,
  categories: EventCategory[],
  entries: TournamentEntry[],
  pairs: TournamentPair[],
  matches: TournamentMatch[],
) => {
  const workbook = XLSX.utils.book_new();
  workbook.Workbook ||= {};
  (workbook.Workbook as Record<string, unknown>).CalcPr = {
    calcMode: 'auto', fullCalcOnLoad: true, forceFullCalc: true,
  };
  const usedNames = new Set<string>();
  const orderedCategories = [...categories].sort((a, b) => a.priority - b.priority);

  for (const category of orderedCategories) {
    const prefix = category.abbreviation || category.name || 'Categoria';
    const sumName = safeSheetName(`${prefix}_sum`, usedNames);
    const calcName = safeSheetName(`${prefix}_calc`, usedNames);
    const categoryEntries = entries.filter((entry) => !entry.disabled && entry.paymentStatus !== 'Cancelado' && entry.categoryIds?.includes(category.id));
    const categoryPairs = pairs.filter((pair) => pair.categoryId === category.id || (!pair.categoryId && (pair.p1.categoryIds?.includes(category.id) || pair.p2.categoryIds?.includes(category.id))));
    const pairMap = new Map(categoryPairs.map((pair) => [pair.id, pair]));
    const categoryMatches = matches.filter((match) => match.categoryId === category.id).sort((a, b) => (a.matchNumber || Number(a.matchCode) || 0) - (b.matchNumber || Number(b.matchCode) || 0));
    const scoreTarget = category.scoreTarget || event.scoreTarget || 'Inscrito';
    const setCount = Math.max(1, Number(event.setsCount || event.config?.sets || 1));
    const isTeam = scoreTarget === 'Time';
    const roster = isTeam
      ? categoryPairs.map((pair, i) => ({ code: pair.id, name: pairName(pair), order: i + 1 }))
      : categoryEntries.map((entry, i) => ({ code: entryCode(entry, i), name: entryName(entry), order: i + 1 }));

    const sumHeaders = ['Partida', 'Fase', 'Lado A', 'Lado B', ...Array.from({ length: setCount }, (_, i) => [`Set ${i + 1} A`, `Set ${i + 1} B`]).flat(), 'Vencedor', 'A1 id', 'A2 id', 'B1 id', 'B2 id'];
    const sumRows: unknown[][] = [
      [`${event.name} · ${category.name}`, `Pontuação por ${scoreTarget}. Preencha apenas os placares em azul.`],
      sumHeaders,
    ];
    const scoreStart = 4;
    const winnerCol = scoreStart + setCount * 2;
    const idsStart = winnerCol + 1;
    categoryMatches.forEach((match, index) => {
      const a = match.pair1 || (match.pair1Id ? pairMap.get(match.pair1Id) : undefined);
      const b = match.pair2 || (match.pair2Id ? pairMap.get(match.pair2Id) : undefined);
      const stableEntryCode = (entry: TournamentEntry) => entryCode(entry, Math.max(0, categoryEntries.findIndex((candidate) => candidate.pin === entry.pin || candidate.email === entry.email || (entry.registrationId && candidate.registrationId === entry.registrationId))));
      const aIds = isTeam ? [a?.id || '', ''] : [a ? stableEntryCode(a.p1) : '', a ? stableEntryCode(a.p2) : ''];
      const bIds = isTeam ? [b?.id || '', ''] : [b ? stableEntryCode(b.p1) : '', b ? stableEntryCode(b.p2) : ''];
      const row: unknown[] = [match.matchCode || String(match.matchNumber || index + 1), match.phase || '', pairName(a, match.pair1Label), pairName(b, match.pair2Label)];
      for (let set = 0; set < setCount; set += 1) {
        row.push(null, null);
      }
      row.push(null, ...aIds, ...bIds);
      const excelRow = index + 3;
      const scoreEnd = scoreStart + setCount * 2 - 1;
      const aScoreCols = Array.from({ length: setCount }, (_, s) => XLSX.utils.encode_col(scoreStart + s * 2));
      const bScoreCols = Array.from({ length: setCount }, (_, s) => XLSX.utils.encode_col(scoreStart + s * 2 + 1));
      const aWins = aScoreCols.map((col, s) => `--(${col}${excelRow}>${bScoreCols[s]}${excelRow})`).join('+');
      const bWins = bScoreCols.map((col, s) => `--(${col}${excelRow}>${aScoreCols[s]}${excelRow})`).join('+');
      row[winnerCol] = { f: `IF(COUNTA(${XLSX.utils.encode_col(scoreStart)}${excelRow}:${XLSX.utils.encode_col(scoreEnd)}${excelRow})=0,"",IF(${aWins}>${bWins},1,IF(${bWins}>${aWins},2,"")))` } as unknown as string;
      row[idsStart] = aIds[0]; row[idsStart + 1] = aIds[1]; row[idsStart + 2] = bIds[0]; row[idsStart + 3] = bIds[1];
      sumRows.push(row);
    });
    const sumSheet = XLSX.utils.aoa_to_sheet(sumRows);
    const standingsStart = idsStart + 4;
    const standingsNameCol = XLSX.utils.encode_col(standingsStart);
    const standingsRankCol = XLSX.utils.encode_col(standingsStart + 1);
    const standingsStatusCol = XLSX.utils.encode_col(standingsStart + 2);
    sumSheet['!cols'] = [
      { wch: 12 }, { wch: 16 }, { wch: 32 }, { wch: 32 },
      ...Array.from({ length: setCount * 2 }, () => ({ wch: 10 })), { wch: 11 },
      ...Array.from({ length: 4 }, () => ({ wch: 2, hidden: true })),
      { wch: 34 }, { wch: 15 }, { wch: 38 },
    ];
    sumSheet['!autofilter'] = { ref: `A2:${XLSX.utils.encode_col(winnerCol)}${Math.max(2, sumRows.length)}` };
    sumSheet['!freeze'] = { xSplit: 4, ySplit: 2, topLeftCell: 'E3', activePane: 'bottomRight', state: 'frozen' };
    for (let r = 2; r < sumRows.length; r += 1) {
      for (let c = scoreStart; c < winnerCol; c += 1) {
        const cell = sumSheet[XLSX.utils.encode_cell({ r, c })];
        if (cell) cell.s = { fill: { fgColor: { rgb: 'DBEAFE' } }, font: { color: { rgb: '1D4ED8' } }, alignment: { horizontal: 'center' } };
      }
    }
    XLSX.utils.book_append_sheet(workbook, sumSheet, sumName);

    const calcHeaders = ['Ordem', isTeam ? 'Código do time' : 'Código inscrito', isTeam ? 'Time' : 'Participante', 'Classificação', 'Vitórias', 'Saldo games', 'Games pró', 'Games contra', 'Vitórias no confronto direto', 'Saldo games confronto direto', '% games pró', 'Sorteio comissão*', 'Chave de ordenação'];
    const calcRows: unknown[][] = [
      [`${event.name} · ${category.name} · Pontuação por ${scoreTarget}`],
      calcHeaders,
    ];
    roster.forEach((item, index) => {
      const r = index + 3;
      const firstMatchRow = 3;
      const lastMatchRow = Math.max(firstMatchRow, sumRows.length);
      const sumRef = quoteSheetName(sumName);
      const idCols = [idsStart, idsStart + 1, idsStart + 2, idsStart + 3].map((col) => `${sumRef}!$${XLSX.utils.encode_col(col)}$${firstMatchRow}:$${XLSX.utils.encode_col(col)}$${lastMatchRow}`);
      const winnerRef = `${sumRef}!$${XLSX.utils.encode_col(winnerCol)}$${firstMatchRow}:$${XLSX.utils.encode_col(winnerCol)}$${lastMatchRow}`;
      const codeCell = `B${r}`;
      const winA = `SUMPRODUCT((${idCols[0]}=${codeCell})*(${winnerRef}=1))+SUMPRODUCT((${idCols[1]}=${codeCell})*(${winnerRef}=1))`;
      const winB = `SUMPRODUCT((${idCols[2]}=${codeCell})*(${winnerRef}=2))+SUMPRODUCT((${idCols[3]}=${codeCell})*(${winnerRef}=2))`;
      const aGameCols = Array.from({ length: setCount }, (_, s) => XLSX.utils.encode_col(scoreStart + s * 2));
      const bGameCols = Array.from({ length: setCount }, (_, s) => XLSX.utils.encode_col(scoreStart + s * 2 + 1));
      const aGamesRange = aGameCols.map((c) => `${sumRef}!$${c}$${firstMatchRow}:$${c}$${lastMatchRow}`);
      const bGamesRange = bGameCols.map((c) => `${sumRef}!$${c}$${firstMatchRow}:$${c}$${lastMatchRow}`);
      const gamesWonA = aGamesRange.map((g) => `SUMPRODUCT(((${idCols[0]}=${codeCell})+(${idCols[1]}=${codeCell}))*${g})`).join('+');
      const gamesWonB = bGamesRange.map((g) => `SUMPRODUCT(((${idCols[2]}=${codeCell})+(${idCols[3]}=${codeCell}))*${g})`).join('+');
      const gamesLostA = bGamesRange.map((g) => `SUMPRODUCT(((${idCols[0]}=${codeCell})+(${idCols[1]}=${codeCell}))*${g})`).join('+');
      const gamesLostB = aGamesRange.map((g) => `SUMPRODUCT(((${idCols[2]}=${codeCell})+(${idCols[3]}=${codeCell}))*${g})`).join('+');
      const standingsEnd = roster.length + 2;
      const winsRange = `$E$3:$E$${standingsEnd}`;
      const gamesForRange = `$G$3:$G$${standingsEnd}`;
      const gamesDiffRange = `$F$3:$F$${standingsEnd}`;
      const directWinRange = `$I$3:$I$${standingsEnd}`;
      const directGamesRange = `$J$3:$J$${standingsEnd}`;
      const gamesPctRange = `$K$3:$K$${standingsEnd}`;
      const sortitionRange = `$L$3:$L$${standingsEnd}`;
      const opponentCode = `INDEX($B$3:$B$${standingsEnd},MATCH(1,INDEX((${winsRange}=E${r})*(${gamesDiffRange}=F${r})*(${gamesForRange}=G${r})*($B$3:$B$${standingsEnd}<>B${r}),0,1),0))`;
      const isPlayerOnA = `((${idCols[0]}=${codeCell})+(${idCols[1]}=${codeCell})>0)`;
      const isPlayerOnB = `((${idCols[2]}=${codeCell})+(${idCols[3]}=${codeCell})>0)`;
      const isOpponentOnA = `((${idCols[0]}=${opponentCode})+(${idCols[1]}=${opponentCode})>0)`;
      const isOpponentOnB = `((${idCols[2]}=${opponentCode})+(${idCols[3]}=${opponentCode})>0)`;
      const sideAGames = aGamesRange.join('+');
      const sideBGames = bGamesRange.join('+');
      const headToHeadFilter = `((${isPlayerOnA}*${isOpponentOnB})+(${isPlayerOnB}*${isOpponentOnA}))`;
      const headToHeadCount = `SUMPRODUCT(${headToHeadFilter}*--((${sideAGames}+${sideBGames})>0))`;
      const headToHeadBalance = `SUMPRODUCT(${isPlayerOnA}*${isOpponentOnB}*(${sideAGames}-${sideBGames}))+SUMPRODUCT(${isPlayerOnB}*${isOpponentOnA}*(${sideBGames}-${sideAGames}))`;
      const tiedPairCount = `COUNTIFS(${winsRange},E${r},${gamesDiffRange},F${r},${gamesForRange},G${r})=2`;
      const headToHeadWins = `IF(${tiedPairCount},IF(${headToHeadCount}>0,SUMPRODUCT(${isPlayerOnA}*${isOpponentOnB}*(${winnerRef}=1))+SUMPRODUCT(${isPlayerOnB}*${isOpponentOnA}*(${winnerRef}=2)),""),"")`;
      const headToHeadSaldo = `IF(${tiedPairCount},IF(${headToHeadCount}>0,${headToHeadBalance},""),"")`;
      const rankFormula = `1+COUNTIF(${winsRange},">"&E${r})+COUNTIFS(${winsRange},E${r},${gamesDiffRange},">"&F${r})+COUNTIFS(${winsRange},E${r},${gamesDiffRange},F${r},${gamesForRange},">"&G${r})+COUNTIFS(${winsRange},E${r},${gamesDiffRange},F${r},${gamesForRange},G${r},${directWinRange},">"&I${r})+COUNTIFS(${winsRange},E${r},${gamesDiffRange},F${r},${gamesForRange},G${r},${directWinRange},I${r},${directGamesRange},">"&J${r})+COUNTIFS(${winsRange},E${r},${gamesDiffRange},F${r},${gamesForRange},G${r},${directWinRange},I${r},${directGamesRange},J${r},${gamesPctRange},">"&K${r})+COUNTIFS(${winsRange},E${r},${gamesDiffRange},F${r},${gamesForRange},G${r},${directWinRange},I${r},${directGamesRange},J${r},${gamesPctRange},K${r},${sortitionRange},">"&L${r})`;
      calcRows.push([
        item.order, item.code, item.name,
        { f: rankFormula }, { f: `${winA}+${winB}` },
        { f: `G${r}-H${r}` },
        { f: `${gamesWonA}+${gamesWonB}` }, { f: `${gamesLostA}+${gamesLostB}` },
        { f: headToHeadWins }, { f: headToHeadSaldo },
        { f: `IF(G${r}+H${r}=0,0,G${r}/(G${r}+H${r}))` }, 0,
        { f: `D${r}*${roster.length + 1}+COUNTIF($D$3:D${r},D${r})` },
      ]);
    });
    calcRows.push([`Desempate: vitórias, saldo de games, games pró, vitórias no confronto direto, saldo de games no confronto direto, percentual de games pró e sorteio da comissão.`]);
    const calcSheet = XLSX.utils.aoa_to_sheet(calcRows);
    calcSheet['!cols'] = [
      { wch: 9 }, { wch: 18 }, { wch: 34 }, { wch: 15 }, { wch: 12 }, { wch: 18 },
      { wch: 12 }, { wch: 14 }, { wch: 13 }, { wch: 14 }, { wch: 28 }, { wch: 18 },
      { wch: 2, hidden: true },
    ];
    calcSheet['!autofilter'] = { ref: `A2:L${roster.length + 2}` };
    calcSheet['!freeze'] = { xSplit: 4, ySplit: 2, topLeftCell: 'E3', activePane: 'bottomRight', state: 'frozen' };
    for (let r = 2; r < roster.length + 2; r += 1) {
      const pct = calcSheet[`K${r + 1}`];
      if (pct) pct.z = '0.0%';
      for (const col of ['L']) {
        const cell = calcSheet[`${col}${r + 1}`];
        if (cell) cell.z = '0;-0;;@';
      }
      for (const col of ['L']) {
        const cell = calcSheet[`${col}${r + 1}`];
        if (cell) cell.s = { fill: { fgColor: { rgb: 'FEF3C7' } }, font: { color: { rgb: '92400E' } } };
      }
    }
    const standingsEnd = roster.length + 2;
    const calcRef = quoteSheetName(calcName);
    const orderKeyRange = `${calcRef}!$M$3:$M$${standingsEnd}`;
    const participantRange = `${calcRef}!$C$3:$C$${standingsEnd}`;
    const classificationRange = `${calcRef}!$D$3:$D$${standingsEnd}`;
    const winnerColumn = XLSX.utils.encode_col(winnerCol);
    const winnerResultsRange = `${quoteSheetName(sumName)}!$${winnerColumn}$3:$${winnerColumn}$${Math.max(2, sumRows.length)}`;
    const panelRows: unknown[][] = [
      [isTeam ? 'Time' : 'Participante', 'Classificação', 'Desempate'],
    ];
    roster.forEach((_, index) => {
      const row = index + 3;
      const position = `SMALL(${orderKeyRange},ROWS($${standingsNameCol}$3:${standingsNameCol}${row}))`;
      const lookup = `MATCH(${position},${orderKeyRange},0)`;
      const rankCell = `${standingsRankCol}${row}`;
      panelRows.push([
        { f: `IFERROR(INDEX(${participantRange},${lookup}),"")` },
        { f: `IFERROR(INDEX(${classificationRange},${lookup}),"")` },
        { f: `IF(${categoryMatches.length}>0,IF(COUNT(${winnerResultsRange})=${categoryMatches.length},IF(AND(${rankCell}<>"",COUNTIF(${classificationRange},${rankCell})>1),"Empate técnico: definir sorteio da comissão",""),""),"")` },
      ]);
    });
    XLSX.utils.sheet_add_aoa(sumSheet, panelRows, { origin: { r: 1, c: standingsStart } });
    for (let r = 1; r < roster.length + 2; r += 1) {
      for (const col of [standingsNameCol, standingsRankCol, standingsStatusCol]) {
        const cell = sumSheet[`${col}${r + 1}`];
        if (cell) cell.s = r === 1
          ? { fill: { fgColor: { rgb: 'DBEAFE' } }, font: { bold: true, color: { rgb: '1E3A8A' } } }
          : { alignment: { vertical: 'center' } };
      }
    }
    sumSheet['!ref'] = `A1:${standingsStatusCol}${Math.max(sumRows.length, roster.length + 2)}`;
    XLSX.utils.book_append_sheet(workbook, calcSheet, calcName);
  }

  const instructions = XLSX.utils.aoa_to_sheet([
    ['Planilha de resultados e classificação', event.name],
    ['Como usar', 'Em cada aba *_sum, informe os games de cada set nas células azuis. O quadro ao lado mostra a classificação atualizada; a aba *_calc contém os cálculos detalhados. O aviso de empate técnico aparece depois do preenchimento de todos os placares.'],
    ['Pontuação individual', 'Quando a categoria pontua por inscrito, cada resultado é atribuído aos dois participantes de cada lado.'],
    ['Pontuação por time', 'Quando a categoria pontua por time, cada resultado é atribuído à dupla fixa.'],
    ['Desempate', 'A classificação segue vitórias, saldo de games, games pró, vitórias no confronto direto, saldo de games no confronto direto e percentual de games pró, antes do sorteio da comissão. Os dois critérios de confronto são calculados automaticamente quando exatamente dois participantes seguem empatados nos critérios anteriores.'],
    ['Atenção', 'Os dados do confronto direto são calculados a partir dos placares preenchidos na aba *_sum. Empates que persistirem após os critérios matemáticos aparecem sinalizados para definir o sorteio da comissão. No sorteio, valores maiores deixam o participante à frente. A planilha não altera os resultados salvos no MyPlacar.'],
  ]);
  instructions['!cols'] = [{ wch: 25 }, { wch: 110 }];
  XLSX.utils.book_append_sheet(workbook, instructions, 'Instruções');
  XLSX.writeFile(workbook, `${(event.name || 'Evento').replace(/[\\/:*?"<>|]/g, '_')}_resultados.xlsx`);
};
