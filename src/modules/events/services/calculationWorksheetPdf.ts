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

const entryLabel = (entry?: TournamentEntry) => entry?.nickname || entry?.name || 'A definir';

const pairLabel = (pair: TournamentPair) => {
  const names = [entryLabel(pair.p1), entryLabel(pair.p2)].join(' & ');
  const code = pair.teamCode || (pair.teamNumber ? `Time ${pair.teamNumber}` : '');
  return code ? `${code} - ${names}` : names;
};

/** Renderiza a apuração manual em páginas para ser anexada à súmula de partidas. */
export const renderCategoryCalculationPagesHtml = (
  event: TournamentEvent,
  category: EventCategory,
  entries: TournamentEntry[],
  pairs: TournamentPair[],
  matches: TournamentMatch[]
): string[] => {
  const scoreTarget = category.scoreTarget || event.scoreTarget || 'Inscrito';
  const isSuper8 = (event.eventType || '').toLowerCase().includes('super 8');
  const roundCount = new Set(
    matches
      .map((match) => match.phase?.match(/(?:rodada|_r)(\d+)/i)?.[1])
      .filter((round): round is string => Boolean(round))
  ).size;
  const roster = scoreTarget === 'Time'
    ? pairs.map((pair, index) => ({
        code: pair.teamCode || `T${pair.teamNumber || index + 1}`,
        name: pairLabel(pair),
      }))
    : entries.map((entry, index) => ({
        code: entry.registrationId ? `I${entry.registrationId}` : `I${index + 1}`,
        name: entryLabel(entry),
      }));

  const rowsPerPage = 17;
  const rosterPages: Array<typeof roster> = [];
  for (let index = 0; index < roster.length; index += rowsPerPage) {
    rosterPages.push(roster.slice(index, index + rowsPerPage));
  }
  if (rosterPages.length === 0) rosterPages.push([]);

  return rosterPages.map((pageRoster, pageIndex) => {
    const rows = pageRoster.map((item) => {
      const victoryMarks = isSuper8 && roundCount > 0
        ? `<div class="win-circles">${Array.from({ length: roundCount }, () => '<span class="calc-circle"></span>').join('')}</div>`
        : '';
      return `<tr>
        <td>${escapeHtml(item.code)}</td><td>${escapeHtml(item.name)}</td><td>${victoryMarks}</td>
        ${Array.from({ length: 9 }, () => '<td></td>').join('')}
      </tr>`;
    }).join('');

    return `<section class="calculation-sheet">
      <h2>Apuração manual da classificação${pageIndex > 0 ? ' - continuação' : ''}</h2>
      <p class="calculation-meta">${escapeHtml(event.name)} · ${escapeHtml(category.name)} · Pontuação por <b>${escapeHtml(scoreTarget)}</b></p>
      ${pageIndex === 0 ? `<div class="calculation-instructions"><b>Como apurar:</b> ${isSuper8 && roundCount > 0 ? `marque um círculo na coluna Vitórias para cada rodada vencida (há ${roundCount} rodadas). Se todos disputarem todas as rodadas, os círculos vazios representam derrotas.` : 'registre as vitórias na coluna correspondente.'} Saldo de games e sets = pró menos contra. Preencha uma linha por ${scoreTarget === 'Time' ? 'time' : 'inscrito'}.</div>` : ''}
      <table class="calculation-standings"><thead><tr>
        <th>Código</th><th>${scoreTarget === 'Time' ? 'Time' : 'Inscrito'}</th>
        <th>Vitórias${isSuper8 && roundCount > 0 ? `<br><small>${roundCount} círculos = rodadas</small>` : ''}</th>
        <th>Games pró</th><th>Games contra</th><th>Saldo games</th>
        <th>Vitórias confronto direto</th><th>Saldo games confronto direto</th><th>% games pró</th>
        <th>Sets pró</th><th>Sets contra</th><th>Saldo sets</th>
      </tr></thead><tbody>${rows || '<tr><td colspan="12">Nenhum participante encontrado nesta categoria.</td></tr>'}</tbody></table>
    </section>`;
  });
};
