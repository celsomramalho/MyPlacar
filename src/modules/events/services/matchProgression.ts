import type { PlayerStanding, TournamentEntry, TournamentMatch, TournamentPair } from '../types';
import { minifyPairForStorage, minifyEntryForPair } from '../types';
import {
  parseMatchSets,
  parseScoresFromMatch,
} from '../domain/brackets/engine/matchScoreEngine';

export {
  parseMatchSets,
  parseScoresFromMatch,
} from '../domain/brackets/engine/matchScoreEngine';

export {
  calculateBracketStandings,
  updatePlayoffProgression,
  type TeamStanding,
} from '../domain/brackets/engine/bracketProgressionEngine';

/**
 * Normaliza chave de identificação do atleta (email prioritário, fallback PIN ou nome)
 */
const getEntryKey = (e?: Partial<TournamentEntry>): string => {
  if (!e) return '';
  return (e.email || e.pin || e.name || '').toLowerCase().trim();
};

/**
 * Calcula a classificação individual dos atletas no Super 8 de acordo com os critérios:
 * 1º Critério: Número de Vitórias (Pontos)
 * 2º Critério: Saldo de Games (SG = Games a Favor - Games Sofridos)
 * 3º Critério: Games Pró (GP = total de Games a Favor)
 * 4º Critério: Confronto Direto (caso 2 jogadores continuem empatados, verifica quem venceu em lados opostos)
 */
export const calculateSuper8PlayerStandings = (
  entries: TournamentEntry[],
  categoryMatches: TournamentMatch[],
  scoringMode: 'wins' | 'rankingPoints' = 'wins'
): PlayerStanding[] => {
  const playerMap = new Map<string, PlayerStanding>();

  entries.forEach((entry) => {
    const key = getEntryKey(entry);
    if (key) {
      playerMap.set(key, {
        entry,
        played: 0,
        wins: 0,
        losses: 0,
        points: 0,
        gamesWon: 0,
        gamesLost: 0,
        gamesDiff: 0,
        rank: 1,
        isTiedWithOthers: false,
        tieBreakNote: undefined,
      });
    }
  });

  categoryMatches.forEach((match) => {
    if (match.status !== 'finished') return;

    const { g1, g2 } = parseScoresFromMatch(match);
    const gameDiff = Math.abs(g1 - g2);
    const isPair1Winner = match.winnerPairId
      ? match.winnerPairId === match.pair1Id || match.winnerPairId === match.pair1?.id
      : g1 > g2;

    const pair1Athletes = [match.pair1?.p1, match.pair1?.p2].filter(Boolean) as TournamentEntry[];
    const pair2Athletes = [match.pair2?.p1, match.pair2?.p2].filter(Boolean) as TournamentEntry[];

    pair1Athletes.forEach((athlete) => {
      const key = getEntryKey(athlete);
      const st = playerMap.get(key);
      if (st) {
        st.played += 1;
        st.gamesWon += g1;
        st.gamesLost += g2;
        if (isPair1Winner) {
          st.wins += 1;
          st.points = (st.points || 0) + (scoringMode === 'rankingPoints' ? 5 + gameDiff : 1);
        } else {
          st.losses += 1;
          st.points = (st.points || 0) + (scoringMode === 'rankingPoints' ? 2 : 0);
        }
      }
    });

    pair2Athletes.forEach((athlete) => {
      const key = getEntryKey(athlete);
      const st = playerMap.get(key);
      if (st) {
        st.played += 1;
        st.gamesWon += g2;
        st.gamesLost += g1;
        if (!isPair1Winner) {
          st.wins += 1;
          st.points = (st.points || 0) + (scoringMode === 'rankingPoints' ? 5 + gameDiff : 1);
        } else {
          st.losses += 1;
          st.points = (st.points || 0) + (scoringMode === 'rankingPoints' ? 2 : 0);
        }
      }
    });
  });

  // Atualiza saldo de games para cada atleta
  const standingsList = Array.from(playerMap.values()).map((st) => ({
    ...st,
    gamesDiff: st.gamesWon - st.gamesLost,
  }));

  const hasAnyPlayed = standingsList.some((st) => st.played > 0);
  if (!hasAnyPlayed) {
    // Se nenhuma partida foi jogada/finalizada (ou todas foram excluídas), não há classificação nem rank atribuído
    return standingsList.map((st) => ({
      ...st,
      rank: undefined,
      tieBreakNote: undefined,
      isTiedWithOthers: false,
    }));
  }

  // Agrupa os atletas pelo critério principal: pontos no Ranking, vitórias no Super 8.
  const winsGroups: Record<number, PlayerStanding[]> = {};
  standingsList.forEach((st) => {
    const primaryScore = scoringMode === 'rankingPoints' ? (st.points || 0) : st.wins;
    if (!winsGroups[primaryScore]) {
      winsGroups[primaryScore] = [];
    }
    winsGroups[primaryScore].push(st);
  });

  const sortedWinKeys = Object.keys(winsGroups)
    .map(Number)
    .sort((a, b) => b - a);

  const finalSortedStandings: PlayerStanding[] = [];

  sortedWinKeys.forEach((winCount) => {
    const group = winsGroups[winCount];

    if (group.length === 1) {
      finalSortedStandings.push(group[0]);
      return;
    }

    const hasAnyPlayed = group.some((st) => st.played > 0);
    if (!hasAnyPlayed) {
      group.sort((a, b) => (a.entry.name || '').localeCompare(b.entry.name || ''));
      finalSortedStandings.push(...group);
      return;
    }

    group.forEach((st) => {
      st.isTiedWithOthers = true;
    });

    // 1. Caso de empate entre exatamente 2 atletas -> Saldo de Games -> Games Pró -> Confronto Direto
    if (group.length === 2) {
      const [p1, p2] = group;
      if (p1.gamesDiff !== p2.gamesDiff) {
        const higher = p1.gamesDiff > p2.gamesDiff ? p1 : p2;
        const lower = p1.gamesDiff > p2.gamesDiff ? p2 : p1;
        higher.tieBreakNote = `Desempate por Saldo de Games: ${higher.gamesDiff > 0 ? '+' : ''}${higher.gamesDiff} (${higher.gamesWon} - ${higher.gamesLost})`;
        lower.tieBreakNote = `Desempate por Saldo de Games: ${lower.gamesDiff > 0 ? '+' : ''}${lower.gamesDiff} (${lower.gamesWon} - ${lower.gamesLost})`;
        finalSortedStandings.push(higher, lower);
        return;
      }

      if (p1.gamesWon !== p2.gamesWon) {
        const higher = p1.gamesWon > p2.gamesWon ? p1 : p2;
        const lower = p1.gamesWon > p2.gamesWon ? p2 : p1;
        higher.tieBreakNote = `Desempate por Games Pró: ${higher.gamesWon} games`;
        lower.tieBreakNote = `Desempate por Games Pró: ${lower.gamesWon} games`;
        finalSortedStandings.push(higher, lower);
        return;
      }

      // Se empatados em SG e GP, verifica confronto direto
      const key1 = getEntryKey(p1.entry);
      const key2 = getEntryKey(p2.entry);

      const directMatch = categoryMatches.find((m) => {
        if (m.status !== 'finished') return false;
        const p1Athletes = [m.pair1?.p1, m.pair1?.p2].map(getEntryKey);
        const p2Athletes = [m.pair2?.p1, m.pair2?.p2].map(getEntryKey);
        const inOppositeTeams =
          (p1Athletes.includes(key1) && p2Athletes.includes(key2)) ||
          (p1Athletes.includes(key2) && p2Athletes.includes(key1));
        return inOppositeTeams;
      });

      if (directMatch) {
        const { g1, g2 } = parseScoresFromMatch(directMatch);
        const isPair1Winner = directMatch.winnerPairId
          ? directMatch.winnerPairId === directMatch.pair1Id || directMatch.winnerPairId === directMatch.pair1?.id
          : g1 > g2;

        const p1Athletes = [directMatch.pair1?.p1, directMatch.pair1?.p2].map(getEntryKey);
        const p1Won = p1Athletes.includes(key1) ? isPair1Winner : !isPair1Winner;

        const winner = p1Won ? p1 : p2;
        const loser = p1Won ? p2 : p1;
        winner.tieBreakNote = 'Desempate por Confronto Direto';
        loser.tieBreakNote = 'Desempate por Confronto Direto';
        finalSortedStandings.push(winner, loser);
        return;
      }
    }

    // 2. Empate entre 3 ou mais atletas (ou 2 sem confronto direto finalizado):
    group.sort((a, b) => {
      // 2º Critério: Saldo de Games (SG)
      if (b.gamesDiff !== a.gamesDiff) {
        return b.gamesDiff - a.gamesDiff;
      }
      // 3º Critério: Games Pró (GP)
      if (b.gamesWon !== a.gamesWon) {
        return b.gamesWon - a.gamesWon;
      }
      // 4º Critério: Confronto Direto caso sobrem 2
      const keyA = getEntryKey(a.entry);
      const keyB = getEntryKey(b.entry);
      const direct = categoryMatches.find((m) => {
        if (m.status !== 'finished') return false;
        const team1 = [m.pair1?.p1, m.pair1?.p2].map(getEntryKey);
        const team2 = [m.pair2?.p1, m.pair2?.p2].map(getEntryKey);
        return (team1.includes(keyA) && team2.includes(keyB)) || (team1.includes(keyB) && team2.includes(keyA));
      });
      if (direct) {
        const { g1, g2 } = parseScoresFromMatch(direct);
        const pair1Won = direct.winnerPairId
          ? direct.winnerPairId === direct.pair1Id || direct.winnerPairId === direct.pair1?.id
          : g1 > g2;
        const team1 = [direct.pair1?.p1, direct.pair1?.p2].map(getEntryKey);
        const aWon = team1.includes(keyA) ? pair1Won : !pair1Won;
        return aWon ? -1 : 1;
      }
      return (a.entry.name || '').localeCompare(b.entry.name || '');
    });

    const gamesDiffVaries = group.some((st) => st.gamesDiff !== group[0].gamesDiff);
    const gamesWonVaries = group.some((st) => st.gamesWon !== group[0].gamesWon);

    group.forEach((st) => {
      if (gamesDiffVaries) {
        st.tieBreakNote = `Desempate por Saldo de Games: ${st.gamesDiff > 0 ? '+' : ''}${st.gamesDiff} (${st.gamesWon} - ${st.gamesLost})`;
      } else if (gamesWonVaries) {
        st.tieBreakNote = `Desempate por Games Pró (GP): ${st.gamesWon} games`;
      } else {
        st.tieBreakNote = 'Desempate por Sorteio / Comissão';
      }
    });

    finalSortedStandings.push(...group);
  });

  // Atribui posições finais (rank)
  finalSortedStandings.forEach((st, idx) => {
    st.rank = idx + 1;
  });

  return finalSortedStandings;
};

/**
 * Atualiza automaticamente as duplas das Fases 2 e 3 do Super 8 duplas
 * conforme os resultados da Fase 1 ficam disponíveis.
 *
 * Lógica:
 * - Para cada grupo da Fase 1, calcula standings individuais.
 * - 1° e 2° colocados do grupo → dupla da Chave Ouro.
 * - 3° e 4° colocados do grupo → dupla da Chave Prata.
 * - Quando ambos os grupos de uma semi estão finalizados, preenche os pares da semi.
 * - Quando a semi está finalizada, preenche a final e o 3° lugar correspondentes.
 */
export const updateSuper8DuplasProgression = (
  entries: TournamentEntry[],
  matches: TournamentMatch[]
): TournamentMatch[] => {
  const updatedMatches = matches.map((m) => ({ ...m }));

  // Agrupa as partidas de Fase 1 por grupo (super8dGroup metadata)
  const groupToMatches: Record<string, TournamentMatch[]> = {};
  updatedMatches.forEach((m) => {
    if (m.phase?.startsWith('super8d_fase1_')) {
      // phase format: super8d_fase1_A1_r1
      const parts = m.phase.replace('super8d_fase1_', '').split('_r');
      const groupKey = parts[0]?.toUpperCase() || '';
      if (groupKey) {
        if (!groupToMatches[groupKey]) groupToMatches[groupKey] = [];
        groupToMatches[groupKey].push(m);
      }
    }
  });

  // Calcula standings de cada grupo
  const groupStandings: Record<string, TournamentEntry[]> = {};
  Object.entries(groupToMatches).forEach(([groupKey, groupMatches]) => {
    const allFinished = groupMatches.length > 0 && groupMatches.every((m) => m.status === 'finished');
    if (!allFinished) return;

    // Identifica jogadores que participaram deste grupo
    const groupPlayerKeys = new Set<string>();
    groupMatches.forEach((m) => {
      [m.pair1, m.pair2].forEach((pair) => {
        [pair?.p1, pair?.p2].forEach((p) => {
          if (p) {
            const key = (p.email || p.pin || p.name || '').toLowerCase().trim();
            if (key) groupPlayerKeys.add(key);
          }
        });
      });
    });

    const groupEntries = entries.filter((e) => {
      const key = (e.email || e.pin || e.name || '').toLowerCase().trim();
      return groupPlayerKeys.has(key);
    });

    const standings = calculateSuper8PlayerStandings(groupEntries, groupMatches, 'wins');
    groupStandings[groupKey] = standings.map((s) => s.entry);
  });

  // Função auxiliar: cria TournamentPair com 2 entries (dupla do Super 8 duplas)
  const makeSuper8DuplasPair = (e1: TournamentEntry, e2: TournamentEntry, groupKey: string, rank: string): TournamentPair => {
    return minifyPairForStorage({
      id: `s8d_pair_${groupKey}_${rank}_${e1.email || e1.pin}_${e2.email || e2.pin}`,
      p1: minifyEntryForPair(e1),
      p2: minifyEntryForPair(e2),
      categoryId: '',
    });
  };

  // ── Atualizar Semifinais Ouro ────────────────────────────────────────────────
  const semiOuroMatches = updatedMatches.filter((m) => m.phase?.startsWith('super8d_semi_ouro'));
  semiOuroMatches.forEach((semi) => {
    // Extrai os grupos que alimentam essa semi a partir do pair1Label/pair2Label
    // pair1Label ex: "Dupla Ouro A1 (1°+2°)"
    const extractGroup = (label?: string) => {
      if (!label) return null;
      const match = label.match(/([A-B]\d+)/);
      return match ? match[1] : null;
    };
    const g1Key = extractGroup(semi.pair1Label);
    const g2Key = extractGroup(semi.pair2Label);
    if (!g1Key || !g2Key) return;

    const standings1 = groupStandings[g1Key];
    const standings2 = groupStandings[g2Key];

    if (standings1 && standings1.length >= 2 && standings2 && standings2.length >= 2) {
      // Dupla Ouro: 1° e 2° de cada grupo
      const pair1 = makeSuper8DuplasPair(standings1[0], standings1[1], g1Key, 'ouro');
      const pair2 = makeSuper8DuplasPair(standings2[0], standings2[1], g2Key, 'ouro');

      const idx = updatedMatches.findIndex((m) => m.id === semi.id);
      if (idx !== -1) {
        updatedMatches[idx].pair1Id = pair1.id;
        updatedMatches[idx].pair2Id = pair2.id;
        updatedMatches[idx].pair1 = pair1;
        updatedMatches[idx].pair2 = pair2;
        delete updatedMatches[idx].pair1Label;
        delete updatedMatches[idx].pair2Label;
      }
    } else {
      // Fase 1 incompleta — limpa duplas da semi
      const idx = updatedMatches.findIndex((m) => m.id === semi.id);
      if (idx !== -1) {
        delete updatedMatches[idx].pair1Id;
        delete updatedMatches[idx].pair2Id;
        delete updatedMatches[idx].pair1;
        delete updatedMatches[idx].pair2;
        updatedMatches[idx].pair1Label = g1Key ? `Dupla Ouro ${g1Key} (1°+2°)` : 'A definir';
        updatedMatches[idx].pair2Label = g2Key ? `Dupla Ouro ${g2Key} (1°+2°)` : 'A definir';
      }
    }
  });

  // ── Atualizar Semifinais Prata ───────────────────────────────────────────────
  const semiPrataMatches = updatedMatches.filter((m) => m.phase?.startsWith('super8d_semi_prata'));
  semiPrataMatches.forEach((semi) => {
    const extractGroup = (label?: string) => {
      if (!label) return null;
      const match = label.match(/([A-B]\d+)/);
      return match ? match[1] : null;
    };
    const g1Key = extractGroup(semi.pair1Label);
    const g2Key = extractGroup(semi.pair2Label);
    if (!g1Key || !g2Key) return;

    const standings1 = groupStandings[g1Key];
    const standings2 = groupStandings[g2Key];

    if (standings1 && standings1.length >= 4 && standings2 && standings2.length >= 4) {
      // Dupla Prata: 3° e 4° de cada grupo
      const pair1 = makeSuper8DuplasPair(standings1[2], standings1[3], g1Key, 'prata');
      const pair2 = makeSuper8DuplasPair(standings2[2], standings2[3], g2Key, 'prata');

      const idx = updatedMatches.findIndex((m) => m.id === semi.id);
      if (idx !== -1) {
        updatedMatches[idx].pair1Id = pair1.id;
        updatedMatches[idx].pair2Id = pair2.id;
        updatedMatches[idx].pair1 = pair1;
        updatedMatches[idx].pair2 = pair2;
        delete updatedMatches[idx].pair1Label;
        delete updatedMatches[idx].pair2Label;
      }
    } else {
      const idx = updatedMatches.findIndex((m) => m.id === semi.id);
      if (idx !== -1) {
        delete updatedMatches[idx].pair1Id;
        delete updatedMatches[idx].pair2Id;
        delete updatedMatches[idx].pair1;
        delete updatedMatches[idx].pair2;
        updatedMatches[idx].pair1Label = g1Key ? `Dupla Prata ${g1Key} (3°+4°)` : 'A definir';
        updatedMatches[idx].pair2Label = g2Key ? `Dupla Prata ${g2Key} (3°+4°)` : 'A definir';
      }
    }
  });

  // ── Atualizar Finais a partir de Semis ──────────────────────────────────────
  const fillFinalFromSemis = (
    semi1Phase: string,
    semi2Phase: string,
    finalPhase: string,
    thirdPhase: string
  ) => {
    const s1 = updatedMatches.find((m) => m.phase === semi1Phase);
    const s2 = updatedMatches.find((m) => m.phase === semi2Phase);
    const finalMatch = updatedMatches.find((m) => m.phase === finalPhase);
    const thirdMatch = updatedMatches.find((m) => m.phase === thirdPhase);

    if (s1?.status === 'finished' && s1.winnerPairId && s2?.status === 'finished' && s2.winnerPairId) {
      // Final: ganhadores das semis
      if (finalMatch) {
        const fIdx = updatedMatches.findIndex((m) => m.id === finalMatch.id);
        if (fIdx !== -1) {
          const p1 = s1.pair1Id === s1.winnerPairId ? s1.pair1 : s1.pair2;
          const p2 = s2.pair1Id === s2.winnerPairId ? s2.pair1 : s2.pair2;
          if (p1 && p2) {
            updatedMatches[fIdx].pair1Id = p1.id;
            updatedMatches[fIdx].pair2Id = p2.id;
            updatedMatches[fIdx].pair1 = p1;
            updatedMatches[fIdx].pair2 = p2;
            delete updatedMatches[fIdx].pair1Label;
            delete updatedMatches[fIdx].pair2Label;
          }
        }
      }
      // 3° Lugar: perdedores das semis
      if (thirdMatch) {
        const tIdx = updatedMatches.findIndex((m) => m.id === thirdMatch.id);
        if (tIdx !== -1) {
          const p1 = s1.pair1Id !== s1.winnerPairId ? s1.pair1 : s1.pair2;
          const p2 = s2.pair1Id !== s2.winnerPairId ? s2.pair1 : s2.pair2;
          if (p1 && p2) {
            updatedMatches[tIdx].pair1Id = p1.id;
            updatedMatches[tIdx].pair2Id = p2.id;
            updatedMatches[tIdx].pair1 = p1;
            updatedMatches[tIdx].pair2 = p2;
            delete updatedMatches[tIdx].pair1Label;
            delete updatedMatches[tIdx].pair2Label;
          }
        }
      }
    } else {
      // Semis não concluídas — limpa finais
      [{ m: finalMatch, l1: 'Ganhador Semi 1', l2: 'Ganhador Semi 2' }, { m: thirdMatch, l1: 'Perdedor Semi 1', l2: 'Perdedor Semi 2' }].forEach(({ m, l1, l2 }) => {
        if (!m) return;
        const idx = updatedMatches.findIndex((x) => x.id === m.id);
        if (idx !== -1) {
          delete updatedMatches[idx].pair1Id;
          delete updatedMatches[idx].pair2Id;
          delete updatedMatches[idx].pair1;
          delete updatedMatches[idx].pair2;
          updatedMatches[idx].pair1Label = l1;
          updatedMatches[idx].pair2Label = l2;
        }
      });
    }
  };

  fillFinalFromSemis('super8d_semi_ouro_1', 'super8d_semi_ouro_2', 'super8d_final_ouro', 'super8d_3lugar_ouro');
  fillFinalFromSemis('super8d_semi_prata_1', 'super8d_semi_prata_2', 'super8d_final_prata', 'super8d_3lugar_prata');

  return updatedMatches;
};
