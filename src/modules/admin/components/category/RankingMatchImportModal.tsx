import React, { useMemo, useState } from 'react';
import { FileSpreadsheet, Upload, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import type { EventCategory, TournamentEntry, TournamentEvent, TournamentMatch, TournamentPair } from '@modules/events/types';

type Row = { date: string; a1: string; a2: string; ga: number; gb: number; b1: string; b2: string; line: number };
type PreparedRow = { row: Row; p1?: TournamentPair; p2?: TournamentPair; error?: string; duplicate?: boolean };
const norm = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ');

function parseCsv(text: string): string[][] {
  const delimiter = (text.split(/\r?\n/, 1)[0].match(/;/g) || []).length > (text.split(/\r?\n/, 1)[0].match(/,/g) || []).length ? ';' : (text.split(/\r?\n/, 1)[0].match(/\t/g) || []).length ? '\t' : ',';
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) { const c = text[i]; if (c === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; } else if (!quoted && c === delimiter) { row.push(cell.trim()); cell = ''; } else if (!quoted && (c === '\n' || c === '\r')) { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = ''; } else cell += c; }
  row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); return rows;
}
function parseDate(value: string, preferUsMdy = false): string | null {
  const v = value.trim(); let d: Date;
  const us = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  const br = v.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/); const iso = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (us && (+us[2] > 12 || preferUsMdy)) d = new Date(2000 + Number(us[3]), +us[1] - 1, +us[2], 12); else if (us) d = new Date(2000 + Number(us[3]), +us[2] - 1, +us[1], 12); else if (br) d = new Date(+br[3], +br[2] - 1, +br[1], 12); else if (iso) d = new Date(+iso[1], +iso[2] - 1, +iso[3], 12); else return null;
  if (!Number.isFinite(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface Props { event: TournamentEvent; category: EventCategory; onClose: () => void; onImport: (pairs: TournamentPair[], matches: TournamentMatch[]) => Promise<void>; }
export const RankingMatchImportModal: React.FC<Props> = ({ event, category, onClose, onImport }) => {
  const [prepared, setPrepared] = useState<PreparedRow[]>([]); const [fileName, setFileName] = useState(''); const [busy, setBusy] = useState(false); const [feedback, setFeedback] = useState('');
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null); const [sheetNames, setSheetNames] = useState<string[]>([]); const [selectedSheet, setSelectedSheet] = useState('');
  const existingPairs = (event.pairs || []).filter(p => p.categoryId === category.id);
  const entries = (event.entries || []).filter(e => !e.disabled && e.categoryIds?.includes(category.id));
  const existingMatches = (event.matches || []).filter(m => m.categoryId === category.id);
  const results = useMemo(() => {
    const seenInFile = new Set<string>();
    return prepared.map(item => {
    if (item.error) return item;
    const samePlayers = (pair: TournamentPair, a: TournamentEntry, b: TournamentEntry) => { const ids = [norm(pair.p1.email || pair.p1.pin || pair.p1.nickname), norm(pair.p2.email || pair.p2.pin || pair.p2.nickname)].sort(); return ids[0] === norm(a.email || a.pin || a.nickname) && ids[1] === norm(b.email || b.pin || b.nickname); };
    const dateScoreSame = (m: TournamentMatch, swapSides: boolean) => {
      const score = (m.scores || []).find(s => s.p1 != null && s.p2 != null); const parsed = String(m.result || '').match(/(\d+)\s*[\/-]\s*(\d+)/); const a = score?.p1 ?? (parsed ? Number(parsed[1]) : undefined); const b = score?.p2 ?? (parsed ? Number(parsed[2]) : undefined);
      return m.matchDate === item.row.date && a != null && b != null && Number(a) === (swapSides ? item.row.gb : item.row.ga) && Number(b) === (swapSides ? item.row.ga : item.row.gb);
    };
    const key = `${item.row.date}|${[norm(item.p1!.p1.email || item.p1!.p1.pin), norm(item.p1!.p2.email || item.p1!.p2.pin)].sort().join('&')}|${[norm(item.p2!.p1.email || item.p2!.p1.pin), norm(item.p2!.p2.email || item.p2!.p2.pin)].sort().join('&')}|${Math.min(item.row.ga, item.row.gb)}-${Math.max(item.row.ga, item.row.gb)}`;
    const duplicate = seenInFile.has(key) || existingMatches.some(m => {
      const x = (event.pairs || []).find(p => p.id === m.pair1Id); const y = (event.pairs || []).find(p => p.id === m.pair2Id);
      return !!x && !!y && dateScoreSame(m, false) && samePlayers(x, item.p1!.p1, item.p1!.p2) && samePlayers(y, item.p2!.p1, item.p2!.p2) || !!x && !!y && dateScoreSame(m, true) && samePlayers(x, item.p2!.p1, item.p2!.p2) && samePlayers(y, item.p1!.p1, item.p1!.p2);
    });
    seenInFile.add(key);
    return { ...item, duplicate };
    });
  }, [prepared, existingMatches, event.pairs]);
  const invalid = results.filter(r => r.error).length; const duplicates = results.filter(r => r.duplicate).length; const importable = results.length - invalid - duplicates;

  const processMatrix = (matrix: string[][], preferUsMdy = false) => {
    if (!matrix.length) { setPrepared([]); setFeedback('A aba selecionada não contém linhas para importar.'); return; }
    const headerRowIndex = matrix.findIndex(row => {
      const header = row.map(norm);
      return ['data', 'jogador a1', 'jogador a2', 'games a', 'games b', 'jogador b1', 'jogador b2'].every(name => header.includes(name));
    });
    if (headerRowIndex < 0) { setPrepared([]); setFeedback('Não encontrei todos os cabeçalhos esperados: Data, Jogador A1, Jogador A2, Games A, Games B, Jogador B1 e Jogador B2.'); return; }
    const headers = matrix[headerRowIndex].map(norm); const col = (names: string[]) => headers.findIndex(h => names.map(norm).includes(h));
    const ix = { date: col(['data']), a1: col(['jogador a1']), a2: col(['jogador a2']), ga: col(['games a']), gb: col(['games b']), b1: col(['jogador b1']), b2: col(['jogador b2']) };
    if (Object.values(ix).some(i => i < 0)) { setPrepared([]); setFeedback('Não encontrei todos os cabeçalhos esperados.'); return; }
    const rows = matrix.slice(headerRowIndex + 1).map((cells, i) => ({ line: headerRowIndex + i + 2, date: cells[ix.date] || '', a1: cells[ix.a1] || '', a2: cells[ix.a2] || '', ga: Number(String(cells[ix.ga] || '').replace(',', '.')), gb: Number(String(cells[ix.gb] || '').replace(',', '.')), b1: cells[ix.b1] || '', b2: cells[ix.b2] || '' }));
    const pairMap = new Map(existingPairs.map(p => [[norm(p.p1.email || p.p1.pin || p.p1.nickname), norm(p.p2.email || p.p2.pin || p.p2.nickname)].sort().join('|'), p]));
    const newlyFormed = new Map<string, TournamentPair>(); let nextNo = Math.max(0, ...existingPairs.map(p => p.teamNumber || 0));
    const findEntry = (name: string) => { const found = entries.filter(e => norm(e.nickname || e.name) === norm(name)); return found.length === 1 ? { entry: found[0] } : { error: found.length ? 'Nome corresponde a mais de uma inscrição' : 'Inscrito não encontrado pelo nome de exibição' }; };
    setPrepared(rows.map(row => {
      const date = parseDate(row.date, preferUsMdy); const names = [row.a1, row.a2, row.b1, row.b2];
      if (!date) return { row: { ...row, date: row.date }, error: 'Data inválida' };
      if (names.some(n => !n)) return { row: { ...row, date }, error: 'Falta o nome de um jogador' };
      if (!Number.isInteger(row.ga) || !Number.isInteger(row.gb) || row.ga < 0 || row.gb < 0) return { row: { ...row, date }, error: 'Games A/B precisam ser números inteiros iguais ou maiores que zero' };
      if (row.ga === row.gb) return { row: { ...row, date }, error: 'O placar não pode terminar empatado' };
      const found = names.map(findEntry); const err = found.find(x => x.error)?.error; if (err) return { row: { ...row, date }, error: err };
      const players = found.map(x => (x as {entry: TournamentEntry}).entry); if (new Set(players.map(e => norm(e.email || e.pin))).size < 4) return { row: { ...row, date }, error: 'Um participante aparece mais de uma vez na mesma partida' };
      const getPair = (one: TournamentEntry, two: TournamentEntry) => { const idKey = [norm(one.email || one.pin || one.nickname), norm(two.email || two.pin || two.nickname)].sort().join('|'); const existing = pairMap.get(idKey) || newlyFormed.get(idKey); if (existing) return existing; nextNo++; const pair: TournamentPair = { id: `rank_${category.id}_${Date.now()}_${nextNo}_${Math.random().toString(36).slice(2, 7)}`, p1: one, p2: two, categoryId: category.id, teamNumber: nextNo, teamCode: `T${nextNo}` }; newlyFormed.set(idKey, pair); return pair; };
      return { row: { ...row, date }, p1: getPair(players[0], players[1]), p2: getPair(players[2], players[3]) };
    }));
    setFeedback('');
  };

  const loadFile = async (file?: File) => {
    if (!file) return; setFileName(file.name); setFeedback('');
    setWorkbook(null); setSheetNames([]); setSelectedSheet(''); setPrepared([]);
    if (!/\.(csv|txt|xlsx|xls)$/i.test(file.name)) { setPrepared([]); setFeedback('Use uma planilha Excel (.xlsx/.xls) ou CSV.'); return; }
    let matrix: string[][];
    if (/\.(xlsx|xls)$/i.test(file.name)) {
      const loadedWorkbook = XLSX.read(await file.arrayBuffer(), { cellDates: true });
      setWorkbook(loadedWorkbook); setSheetNames(loadedWorkbook.SheetNames); setSelectedSheet(loadedWorkbook.SheetNames[0] || '');
      const firstSheet = loadedWorkbook.Sheets[loadedWorkbook.SheetNames[0]];
      matrix = firstSheet ? XLSX.utils.sheet_to_json<string[]>(firstSheet, { header: 1, raw: false, defval: '', dateNF: 'dd/mm/yyyy' }).map(row => row.map(value => String(value))) : [];
    } else {
      const text = (await file.text()).replace(/^\uFEFF/, ''); matrix = parseCsv(text);
    }
    processMatrix(matrix, /\.(xlsx|xls)$/i.test(file.name));
  };

  const handleSheetChange = (sheetName: string) => {
    setSelectedSheet(sheetName);
    const sheet = workbook?.Sheets[sheetName];
    if (sheet) processMatrix(XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '', dateNF: 'dd/mm/yyyy' }).map(row => row.map(value => String(value))), true);
  };

  const commit = async () => {
    const validRows = results.filter(r => !r.error && !r.duplicate); if (!validRows.length) return;
    setBusy(true); try {
      const newPairs = new Map<string, TournamentPair>(); const matches: TournamentMatch[] = [];
      for (const item of validRows) { const a = item.p1!; const b = item.p2!; newPairs.set(a.id, a); newPairs.set(b.id, b);
        const pair1Wins = item.row.ga > item.row.gb; matches.push({ id: `rank_match_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`, matchNumber: existingMatches.length + matches.length + 1, categoryId: category.id, pair1Id: a.id, pair2Id: b.id, pair1: a, pair2: b, status: 'finished', result: `${item.row.ga}/${item.row.gb}`, scores: [{ p1: item.row.ga, p2: item.row.gb }], winnerPairId: pair1Wins ? a.id : b.id, loserPairId: pair1Wins ? b.id : a.id, matchDate: item.row.date, finishedAt: new Date(`${item.row.date}T12:00:00`).toISOString() });
      }
      await onImport([...existingPairs, ...Array.from(newPairs.values()).filter(p => !existingPairs.some(x => x.id === p.id))], [...(event.matches || []), ...matches]); onClose();
    } catch (err) { setFeedback(err instanceof Error ? err.message : 'Não foi possível gravar as partidas.'); } finally { setBusy(false); }
  };
  return <div className="fixed inset-0 z-[100] bg-slate-950/50 p-3 flex items-center justify-center" role="dialog" aria-modal="true" aria-label="Importar partidas do ranking"><div className="w-full max-w-3xl max-h-[92vh] overflow-hidden rounded-3xl bg-white shadow-2xl flex flex-col">
    <div className="p-5 border-b flex items-start justify-between"><div><h2 className="text-lg font-black text-slate-800">Importar partidas</h2><p className="text-xs text-slate-500 mt-1">{category.name} · use o campo “Nome como quer ser chamado”</p></div><button onClick={onClose} className="p-2 rounded-xl bg-slate-100" aria-label="Fechar"><X size={18}/></button></div>
    <div className="p-5 space-y-4 overflow-y-auto"><label className="flex gap-3 items-center p-4 rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50 cursor-pointer"><FileSpreadsheet className="text-emerald-600"/><span className="flex-1"><b className="text-sm text-slate-700">{fileName || 'Selecione uma planilha ou arquivo CSV'}</b><small className="block text-xs text-slate-500 mt-1">Data, Jogador A1, Jogador A2, Games A, Games B, Jogador B1, Jogador B2</small></span><Upload size={18} className="text-emerald-600"/><input type="file" accept=".xlsx,.xls,.csv,.txt" className="hidden" onChange={e => void loadFile(e.target.files?.[0])}/></label>
      {sheetNames.length > 1 && <label className="block text-xs font-bold text-slate-600">Aba da categoria<select value={selectedSheet} onChange={e => handleSheetChange(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm font-bold text-slate-800">{sheetNames.map(name => <option key={name} value={name}>{name}</option>)}</select></label>}
      {!!feedback && <p className="text-sm font-bold text-rose-600">{feedback}</p>}
      {!!results.length && <><p className="text-xs font-bold text-slate-600">{results.length} linhas · {importable} para importar · {duplicates} duplicadas serão ignoradas · {invalid} com erro</p>{existingMatches.length > 0 && <p className="text-xs rounded-xl bg-amber-50 text-amber-800 p-3">A categoria já possui {existingMatches.length} partidas. A importação acrescentará as partidas novas e pulará coincidências de data, duplas e placar.</p>}<div className="border rounded-2xl overflow-auto max-h-72"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-slate-100"><tr>{['Linha','Data','Time A','Placar','Time B','Validação'].map(h=><th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>{results.map(r=><tr key={r.row.line} className="border-t"><td className="p-2">{r.row.line}</td><td className="p-2 whitespace-nowrap">{r.row.date}</td><td className="p-2">{r.row.a1} & {r.row.a2}</td><td className="p-2">{r.row.ga}–{r.row.gb}</td><td className="p-2">{r.row.b1} & {r.row.b2}</td><td className={`p-2 font-bold ${r.error?'text-rose-600':r.duplicate?'text-amber-600':'text-emerald-700'}`}>{r.error || (r.duplicate?'Duplicada · ignorar':'Pronta')}</td></tr>)}</tbody></table></div></>}
    </div><div className="p-4 border-t flex justify-end gap-2"><button onClick={onClose} className="px-4 py-2 rounded-xl border text-sm font-bold">Cancelar</button><button disabled={!importable || busy} onClick={() => void commit()} className="px-4 py-2 rounded-xl bg-emerald-500 disabled:opacity-40 text-white text-sm font-black">{busy?'Importando…':`Importar ${importable} partidas`}</button></div>
  </div></div>;
};
