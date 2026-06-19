/**
 * pickleballEngine.ts — Motor dedicado ao Pickleball
 * Isolado do tennisEngine.ts
 *
 * Regras implementadas
 * ────────────────────
 * Side-out scoring (tradicional) — Duplas
 *   - Só pontua quem está sacando.
 *   - Posicionamento por rastreamento explícito (t1RightPlayer / t2RightPlayer):
 *       após side-out: quem está fisicamente na DIREITA inicia o saque.
 *       após cada ponto conquistado pelo sacador: os dois jogadores do time trocam de lado.
 *   - Transições de saque:
 *       rally ganho  → pontua; troca de lado dentro do time sacador.
 *       server 1 perde rally → saque para server 2 do mesmo time (sem ponto; sem troca de lado).
 *       server 2 perde rally → side-out: saque para o time adversário.
 *   - Após side-out: novo time começa com o jogador da direita (t[N]RightPlayer).
 *   - Exceção início de partida: primeiro time começa como server 2
 *     (regra "first server" — só um sacador na primeira posse).
 *
 * Side-out scoring (tradicional) — Simples
 *   - Lado do sacador por paridade do placar (par='even', ímpar='odd').
 *
 * Rally scoring (WPL/APP)
 *   - Qualquer time pontua a qualquer rally.
 *   - Recebedor ganha → pontua E assume o saque.
 *   - Sacador ganha → pontua e mantém o saque.
 *   - Duplas: rotação circular (switch-side) ou alternate-server.
 *   - Lado do sacador por paridade do placar.
 *
 * First server rule (duplas, side-out)
 *   - Flag explícito isFirstServerActive persiste no estado.
 *   - Desativado no primeiro side-out e no início de games subsequentes.
 */

import { GameState, PickleballState, CourtSide } from '../../../types.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers internos — resolução de nomes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve o nome do sacador para rally scoring e simples (mapeamento estático).
 *   serverNumber 1 → jogador principal do time (p1.name / p2.name)
 *   serverNumber 2 → parceiro          do time (p1.partnerName / p2.partnerName)
 * NÃO usado para side-out duplas (usa rastreamento posicional via t1/t2RightPlayer).
 */
const resolveServerName = (
  state: GameState,
  team: 1 | 2,
  serverNumber: 1 | 2
): string => {
  if (team === 1) {
    return serverNumber === 1
      ? state.p1.name
      : (state.p1.partnerName || state.p1.name);
  }
  return serverNumber === 1
    ? state.p2.name
    : (state.p2.partnerName || state.p2.name);
};

/** Formata os nomes do vencedor para exibição e anúncio. */
const resolveWinnerNames = (state: GameState, team: 1 | 2): string => {
  if (!state.matchConfig.isDoubles) {
    return team === 1 ? state.p1.name : state.p2.name;
  }
  if (team === 1) {
    const partner = state.p1.partnerName ? ` e ${state.p1.partnerName}` : '';
    return `${state.p1.name}${partner}`;
  }
  const partner = state.p2.partnerName ? ` e ${state.p2.partnerName}` : '';
  return `${state.p2.name}${partner}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers internos — lado da quadra (rally scoring e simples)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calcula o lado do saque (CourtSide) por paridade de placar.
 * Usado em: rally scoring (qualquer configuração) e side-out SIMPLES.
 * NÃO usado em side-out duplas (usa t1/t2RightPlayer).
 */
const resolveServerSide = (
  teamScore: number
): CourtSide => teamScore % 2 === 0 ? 'even' : 'odd';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers internos — rastreamento posicional (side-out duplas)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retorna o nome do jogador que está na DIREITA do time informado.
 * Lê o campo t1RightPlayer / t2RightPlayer do estado.
 */
const getRightPlayer = (pkl: PickleballState, team: 1 | 2): string =>
  (team === 1 ? pkl.server.t1RightPlayer : pkl.server.t2RightPlayer) ?? '';

/**
 * Troca os jogadores de lado dentro do time informado (swap direita ↔ esquerda).
 * Chamado após cada ponto conquistado pelo time sacador em side-out duplas.
 */
const swapSides = (pkl: PickleballState, state: GameState, team: 1 | 2): void => {
  const p = team === 1 ? state.p1 : state.p2;
  const right = getRightPlayer(pkl, team);
  const newRight = right === p.name ? (p.partnerName || p.name) : p.name;
  if (team === 1) pkl.server.t1RightPlayer = newRight;
  else            pkl.server.t2RightPlayer = newRight;
};

/**
 * Após side-out: define o sacador do novo time como quem está na DIREITA,
 * atualiza serverName, serverNumber e side.
 * Não altera as posições dos jogadores (elas permanecem como eram enquanto recebiam).
 */
const assignServerFromRightPlayer = (
  pkl: PickleballState,
  state: GameState
): void => {
  const team = pkl.server.team;
  const p    = team === 1 ? state.p1 : state.p2;
  const right = getRightPlayer(pkl, team);
  // serverNumber 1 = quem está na direita (sempre inicia o turno)
  pkl.server.serverNumber = 1;
  pkl.server.serverName   = right || p.name;
  pkl.server.side         = 'even'; // direita = 'even'
};

// ─────────────────────────────────────────────────────────────────────────────
// Inicialização
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cria o PickleballState inicial quando uma partida de pickleball começa.
 * Chamada em tennisEngine.ts → incrementScore, na primeira vez que
 * state.pickleball ainda não existe.
 *
 * First server rule (duplas, side-out, game inicial):
 *   Inferida por currentSet === 0 && pointHistory.length === 0.
 *   Nesse caso serverNumber = 2 (parceiro do time sorteado saca primeiro),
 *   o que significa que o time tem apenas um sacador antes do side-out.
 *   Em todos os outros games (e em simples/rally) serverNumber começa em 1.
 *
 * Sugestão implementada: serverName já resolvido e armazenado no estado,
 * facilitando anúncio e exibição sem recalcular a cada render.
 */
export const initPickleballState = (state: GameState): PickleballState => {
  const { matchConfig } = state;
  const isDoubles  = matchConfig.isDoubles;
  const isSideOut  = matchConfig.pickleballScoringMode !== 'rally';
  const team       = (matchConfig.initialServer ?? 1) as 1 | 2;

  // rallyOffset inicial: alinha com o team inicial
  // team=1 → offset=0 (J1), team=2 → offset=1 (J2)
  const rallyOffset = team === 1 ? 0 : 1;

  if (isDoubles && isSideOut) {
    // ── Side-out duplas: rastreamento posicional ────────────────────────────
    // First server rule: o time sorteado começa como server 2 (só um sacador
    // antes do primeiro side-out). O serverNumber=2 é o PARCEIRO do principal.
    //
    // Posições iniciais:
    //   Time sacador (team): p.name na DIREITA → saca como serverNumber=2
    //     (pela first-server rule o parceiro/p.name está na direita)
    //   Time recebedor: p.name na DIREITA (posição padrão de início)
    //
    // Nota: serverNumber=2 com first-server rule identifica o sacador correto
    // a partir do campo t[team]RightPlayer (que é p.name no início).
    const p = team === 1 ? state.p1 : state.p2;
    // Ambos os times começam com o jogador principal (p.name) à direita.
    const t1Right = state.p1.name;
    const t2Right = state.p2.name;
    // O sacador inicial pela first-server rule é o jogador à direita do time sacador.
    const serverName = p.name; // rightPlayer do team

    return {
      score: { team1: 0, team2: 0 },
      server: {
        team,
        serverNumber: 2,      // first-server rule: só um sacador antes do 1º side-out
        serverName,
        side: 'even',         // sacador inicial está na direita (even)
        rallyOffset,
        t1RightPlayer: t1Right,
        t2RightPlayer: t2Right,
      },
      isGameOver:          false,
      isMatchOver:         false,
      winner:              null,
      isFirstServerActive: true,
    };
  }

  // ── Rally scoring ou simples ────────────────────────────────────────────
  const serverNumber: 1 | 2 = 1;
  const serverName = resolveServerName(state, team, serverNumber);

  return {
    score: { team1: 0, team2: 0 },
    server: {
      team,
      serverNumber,
      serverName,
      side: resolveServerSide(0), // placar 0 → 'even'
      rallyOffset,
    },
    isGameOver:          false,
    isMatchOver:         false,
    winner:              null,
    isFirstServerActive: false,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Rotação de serviço — duplas side-out
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Server 1 do time perdeu o rally → saque passa para server 2 do mesmo time.
 * Sem ponto. As posições dos jogadores NÃO mudam (só pontuando que se troca de lado).
 * side-out duplas: o "server 2" é quem estava na ESQUERDA (o que não está na direita).
 */
const rotateToSecondServer = (pkl: PickleballState, state: GameState): void => {
  pkl.server.serverNumber = 2;
  // Sacador 2 é quem está na ESQUERDA (o parceiro do rightPlayer)
  const team = pkl.server.team;
  const p    = team === 1 ? state.p1 : state.p2;
  const right = getRightPlayer(pkl, team);
  pkl.server.serverName = right === p.name ? (p.partnerName || p.name) : p.name;
  pkl.server.side       = 'odd'; // esquerda = 'odd'
};

/**
 * Server 2 do time perdeu o rally → side-out.
 * Saque passa para o time adversário; serverNumber = 1 = quem está na DIREITA do novo time.
 * Posições dos jogadores de ambos os times permanecem inalteradas.
 */
const performSideOut = (pkl: PickleballState, state: GameState): void => {
  pkl.server.team         = pkl.server.team === 1 ? 2 : 1;
  pkl.isFirstServerActive = false; // desativa first-server rule no primeiro side-out
  assignServerFromRightPlayer(pkl, state);
};

/**
 * Após ponto conquistado em side-out duplas:
 * troca os jogadores de lado dentro do time sacador e atualiza serverName/side.
 */
const rotateWithinTeamSideOut = (pkl: PickleballState, state: GameState): void => {
  swapSides(pkl, state, pkl.server.team);
  assignServerFromRightPlayer(pkl, state);
};

/**
 * Avança o sacador na sequência circular fixa para rally scoring duplas:
 *   offset 0 = J1 (team=1, serverNumber=1)
 *   offset 1 = J2 (team=2, serverNumber=1)
 *   offset 2 = J3 (team=1, serverNumber=2)
 *   offset 3 = J4 (team=2, serverNumber=2)
 *
 * Chamado quando o sacador PERDE o rally em modo rally scoring duplas.
 * Independente de quem ganhou — a sequência é fixa e circular.
 */
const rotateRallyServer = (pkl: PickleballState, state: GameState): void => {
  const nextOffset = (pkl.server.rallyOffset + 1) % 4;
  pkl.server.rallyOffset  = nextOffset;
  pkl.server.team         = nextOffset % 2 === 0 ? 1 : 2;
  pkl.server.serverNumber = nextOffset < 2 ? 1 : 2;
  const newTeamScore = pkl.server.team === 1 ? pkl.score.team1 : pkl.score.team2;
  pkl.server.serverName   = resolveServerName(state, pkl.server.team, pkl.server.serverNumber);
  pkl.server.side         = resolveServerSide(newTeamScore);
};

/**
 * Atribui o sacador correto ao time que acabou de ganhar o saque (alternate-server).
 *
 * Regra: o placar do time após o ponto determina qual jogador saca e de que lado:
 *   par  → serverNumber 1 → side 'even' (direita)
 *   ímpar → serverNumber 2 → side 'odd'  (esquerda)
 *
 * Garante que sacador 1 saca sempre à direita e sacador 2 sempre à esquerda.
 * rallyOffset atualizado para manter sincronismo com o marcador visual.
 */
const assignServerByScore = (
  pkl: PickleballState,
  state: GameState,
  team: 1 | 2
): void => {
  const teamScore       = team === 1 ? pkl.score.team1 : pkl.score.team2;
  const serverNumber: 1 | 2 = teamScore % 2 === 0 ? 1 : 2;
  pkl.server.team         = team;
  pkl.server.serverNumber = serverNumber;
  pkl.server.side         = resolveServerSide(teamScore);
  pkl.server.serverName   = resolveServerName(state, team, serverNumber);
  // rallyOffset: team=1 + srvNum=1→0 | team=2 + srvNum=1→1 | team=1 + srvNum=2→2 | team=2 + srvNum=2→3
  pkl.server.rallyOffset  = (team === 1 ? 0 : 1) + (serverNumber === 2 ? 2 : 0);
};

// ─────────────────────────────────────────────────────────────────────────────
// Detecção de tie-break
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retorna true quando a partida está em modo tie-break.
 * Condições:
 *   1. matchConfig.tieBreak === true
 *   2. Melhor de N sets com N > 1 (tie-break em melhor de 1 não faz sentido)
 *   3. Sets empatados em (setsToWin - 1) × cada lado
 *      Ex: melhor de 3 → setsNeeded=2 → empate em 1-1
 *
 * Exportada para ser reutilizada pelo announcer sem duplicar lógica.
 */
export const isPickleballTieBreak = (state: GameState): boolean => {
  const { tieBreak, setsToWin } = state.matchConfig;
  if (!tieBreak) return false;
  const totalSets = Number(setsToWin) || 1;
  if (totalSets <= 1) return false; // melhor de 1 não há tie-break de set
  const setsNeeded = Math.ceil(totalSets / 2);
  const p1SetsWon = state.p1.sets.filter((s, i) => s > (state.p2.sets[i] ?? 0)).length;
  const p2SetsWon = state.p2.sets.filter((s, i) => s > (state.p1.sets[i] ?? 0)).length;
  return p1SetsWon === setsNeeded - 1 && p2SetsWon === setsNeeded - 1;
};

// ─────────────────────────────────────────────────────────────────────────────
// Verificação de vitória do game
// ─────────────────────────────────────────────────────────────────────────────

const checkGameWinner = (
  pkl: PickleballState,
  state: GameState
): 1 | 2 | null => {
  // Em tie-break, usa tieBreakPoints e tieBreakWinByTwo independentemente
  const isTB     = isPickleballTieBreak(state);
  const target   = isTB
    ? (Number(state.matchConfig.tieBreakPoints) || 15)
    : (Number(state.matchConfig.gamesPerSet) || 11);
  const winByTwo = state.matchConfig.tieBreakWinByTwo ?? true;
  const { team1, team2 } = pkl.score;

  const wins = (mine: number, theirs: number): boolean =>
    winByTwo
      ? mine >= target && mine >= theirs + 2
      : mine >= target;

  if (wins(team1, team2)) return 1;
  if (wins(team2, team1)) return 2;
  return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Transição de game → próximo game (ou fim da partida)
// ─────────────────────────────────────────────────────────────────────────────

const processGameWin = (
  pkl: PickleballState,
  state: GameState,
  winner: 1 | 2
): void => {
  // 1. Registra placar final no histórico do ponto
  const lastPoint = state.pointHistory[state.pointHistory.length - 1];
  if (lastPoint) {
    lastPoint.resultingScore = `${pkl.score.team1}-${pkl.score.team2}`;
  }

  // 2. Salva sets no GameState global (compatibilidade com histórico/UI)
  state.p1.sets = [...state.p1.sets, pkl.score.team1];
  state.p2.sets = [...state.p2.sets, pkl.score.team2];

  // 3. Conta sets ganhos
  const p1SetsWon  = state.p1.sets.filter((s, i) => s > (state.p2.sets[i] ?? 0)).length;
  const p2SetsWon  = state.p2.sets.filter((s, i) => s > (state.p1.sets[i] ?? 0)).length;
  const setsNeeded = Math.ceil((Number(state.matchConfig.setsToWin) || 1) / 2) || 1;

  // 4. Sinaliza fim do game (transitório — announcer captura aqui)
  pkl.isGameOver = true;

  if (p1SetsWon >= setsNeeded || p2SetsWon >= setsNeeded) {
    // ── Fim da partida ──────────────────────────────────────────────────────
    pkl.isMatchOver   = true;
    state.isMatchOver = true; // sincroniza com GameState global
    pkl.winner = {
      team:  winner,
      names: resolveWinnerNames(state, winner),
    };
    // isGameOver permanece true — não há próximo game

  } else {
    // ── Próximo game ────────────────────────────────────────────────────────
    state.currentSet += 1;

    // Reseta placar
    pkl.score        = { team1: 0, team2: 0 };
    state.p1.score   = '0';
    state.p2.score   = '0';
    state.p1.games   = 0;
    state.p2.games   = 0;

    // Sacador do próximo game: time que PERDEU (regra convencional de torneios)
    // First server rule não se aplica a games subsequentes — só ao primeiro game.
    const nextTeam: 1 | 2 = winner === 1 ? 2 : 1;
    pkl.server.team        = nextTeam;
    pkl.isFirstServerActive = false; // desativa first server rule em games subsequentes
    // rallyOffset: alinha com o novo time sacador (nextTeam=1→0, nextTeam=2→1)
    pkl.server.rallyOffset = nextTeam === 1 ? 0 : 1;

    const isDoubles = state.matchConfig.isDoubles;
    const isSideOut = state.matchConfig.pickleballScoringMode !== 'rally';

    if (isDoubles && isSideOut) {
      // Novo game: os jogadores voltam às posições iniciais (placar 0 = início)
      // Ambos os times: jogador principal (p.name) à direita
      pkl.server.t1RightPlayer = state.p1.name;
      pkl.server.t2RightPlayer = state.p2.name;
      // Sacador do novo game = jogador da direita do time que inicia
      pkl.server.serverNumber  = 1;
      pkl.server.serverName    = nextTeam === 1 ? state.p1.name : state.p2.name;
      pkl.server.side          = 'even';
    } else {
      pkl.server.serverNumber = 1;
      pkl.server.serverName   = resolveServerName(state, nextTeam, 1);
      pkl.server.side         = resolveServerSide(0); // placar 0 → sempre direita
    }

    // Sincroniza server global
    state.server             = nextTeam;
    state.servingOrderOffset = nextTeam === 1 ? 0 : 1;

    // isGameOver volta a false (batch síncrono — announcer já capturou)
    pkl.isGameOver = false;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Motor — Side-out scoring
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Side-out em SIMPLES:
 *
 *   Sacador ganha rally
 *     → pontua
 *     → side: paridade do placar do time sacador (acabou de aumentar)
 *     → serverNumber permanece 1 (em simples sempre)
 *     → alternate-server ignorado silenciosamente (não se aplica em simples)
 *
 *   Sacador perde rally
 *     → sem ponto
 *     → side-out imediato: performSideOut já atualiza team, serverNumber,
 *       serverName e side pela paridade do placar do novo time
 */
const processSideOutSingles = (
  pkl: PickleballState,
  state: GameState,
  rallyWinner: 1 | 2
): void => {
  if (rallyWinner === pkl.server.team) {
    // ── Sacador ganhou ───────────────────────────────────────────────────────
    if (pkl.server.team === 1) pkl.score.team1++;
    else pkl.score.team2++;
    // side: paridade do placar do time sacador após o ponto (simples = parity)
    const teamScore = pkl.server.team === 1 ? pkl.score.team1 : pkl.score.team2;
    pkl.server.side = resolveServerSide(teamScore);

  } else {
    // ── Sacador perdeu → side-out imediato ───────────────────────────────────
    // performSideOut: muda team, serverNumber=1, serverName e side do novo time
    performSideOut(pkl, state);
  }
};

/**
 * Side-out em DUPLAS:
 *
 *   Sacador ganha rally
 *     → pontua
 *     → alternate-server? rotaciona dentro do time
 *     → side: paridade do placar do time (acabou de aumentar)
 *
 *   Server 1 perde rally
 *     → sem ponto
 *     → saque para server 2 do mesmo time  (rotateToSecondServer)
 *     → side: paridade do placar do time (não mudou)
 *
 *   Server 2 perde rally
 *     → sem ponto
 *     → side-out: saque para o time adversário  (performSideOut)
 *     → novo time começa com serverNumber = 1
 *     → side: paridade do placar do novo time
 */
const processSideOutDoubles = (
  pkl: PickleballState,
  state: GameState,
  rallyWinner: 1 | 2
): void => {
  if (rallyWinner === pkl.server.team) {
    // ── Sacador ganhou ───────────────────────────────────────────────────────
    if (pkl.server.team === 1) pkl.score.team1++;
    else pkl.score.team2++;
    // Após ponto: os dois jogadores do time sacador trocam de lado
    rotateWithinTeamSideOut(pkl, state);

  } else if (pkl.server.serverNumber === 1) {
    // ── Server 1 perdeu → passa para server 2 do mesmo time ─────────────────
    // Sem troca de lado (só muda quem saca dentro do mesmo time)
    rotateToSecondServer(pkl, state);

  } else {
    // ── Server 2 perdeu → side-out ───────────────────────────────────────────
    performSideOut(pkl, state);
  }
};

/**
 * Dispatcher: escolhe simples ou duplas conforme matchConfig.
 */
const processSideOut = (
  pkl: PickleballState,
  state: GameState,
  rallyWinner: 1 | 2
): void => {
  if (state.matchConfig.isDoubles) {
    processSideOutDoubles(pkl, state, rallyWinner);
  } else {
    processSideOutSingles(pkl, state, rallyWinner);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Motor — Rally scoring
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rally scoring:
 *
 *   Simples:
 *     Sacador ganha  → pontua, mantém saque, atualiza side
 *     Sacador perde  → pontua o recebedor, performSideOut (troca direta)
 *
 *   Duplas:
 *     Sacador ganha  → pontua, mantém saque, atualiza side
 *     Sacador perde  → pontua o recebedor, rotateRallyServer()
 *                      (sequência fixa circular J1→J2→J3→J4→J1)
 *
 *   Nota: side sempre atualizado aqui — updateSide() removido do entry point.
 */
const processRallyScoring = (
  pkl: PickleballState,
  state: GameState,
  rallyWinner: 1 | 2
): void => {
  const isDoubles = state.matchConfig.isDoubles;

  // Sempre pontua
  if (rallyWinner === 1) pkl.score.team1++;
  else pkl.score.team2++;

  const isAlternateServer =
    isDoubles && state.matchConfig.pickleballServiceMode === 'alternate-server';

  if (rallyWinner !== pkl.server.team) {
    // ── Recebedor ganhou → troca o saque ─────────────────────────────────────
    if (isDoubles) {
      if (isAlternateServer) {
        // alternate-server: sacador definido pela paridade do placar do time vencedor
        assignServerByScore(pkl, state, rallyWinner);
      } else {
        // switch-side: sequência fixa circular J1→J2→J3→J4
        rotateRallyServer(pkl, state);
      }
    } else {
      // Simples: troca direta para o outro jogador
      // Em simples rally usa paridade simples (reutiliza performSideOut adaptado)
      pkl.server.team         = pkl.server.team === 1 ? 2 : 1;
      pkl.server.serverNumber = 1;
      pkl.server.serverName   = resolveServerName(state, pkl.server.team, 1);
      const ts = pkl.server.team === 1 ? pkl.score.team1 : pkl.score.team2;
      pkl.server.side = resolveServerSide(ts);
    }

  } else {
    // ── Sacador ganhou ────────────────────────────────────────────────────────
    const isSwitchSide = !isAlternateServer;
    if (isSwitchSide) {
      // switch-side: mesmo jogador continua, só troca de lado pela paridade
      const teamScore = pkl.server.team === 1 ? pkl.score.team1 : pkl.score.team2;
      pkl.server.side = resolveServerSide(teamScore);
    } else {
      // alternate-server: parceiro assume o saque, side pela paridade do novo placar
      const teamScore = pkl.server.team === 1 ? pkl.score.team1 : pkl.score.team2;
      pkl.server.serverNumber = pkl.server.serverNumber === 1 ? 2 : 1;
      pkl.server.serverName   = resolveServerName(state, pkl.server.team, pkl.server.serverNumber);
      pkl.server.side         = resolveServerSide(teamScore);
    }
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Entry point público — chamado por tennisEngine.ts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Processa um ponto no pickleball.
 * state já é deep-clone feito em tennisEngine.incrementScore.
 * Sincroniza state.server, state.p1/p2.score e state.isMatchOver
 * com o GameState global para compatibilidade com o restante da UI.
 */
export const incrementScorePickleball = (
  state: GameState,
  rallyWinner: 1 | 2
): GameState => {
  // Inicializa sub-estado se ainda não existe (nova partida)
  // ou se foi restaurado do localStorage sem o campo pickleball
  // (versão antiga salva antes de esta estrutura existir).
  if (!state.pickleball) {
    state.pickleball = initPickleballState(state);
  }
  // Garante que campos adicionados em versões posteriores existem
  // em estados restaurados do localStorage — defaults seguros.
  if (state.pickleball.isFirstServerActive === undefined) {
    state.pickleball.isFirstServerActive = false;
  }
  if (state.pickleball.server.rallyOffset === undefined) {
    // Deriva do team/serverNumber atual para manter consistência
    state.pickleball.server.rallyOffset =
      (state.pickleball.server.team === 1 ? 0 : 1) +
      (state.pickleball.server.serverNumber === 2 ? 2 : 0);
  }
  // Migração: estados salvos antes do rastreamento posicional
  // (side-out duplas): inicializa os campos ausentes com defaults seguros.
  if (
    state.matchConfig.isDoubles &&
    state.matchConfig.pickleballScoringMode !== 'rally' &&
    state.pickleball.server.t1RightPlayer === undefined
  ) {
    state.pickleball.server.t1RightPlayer = state.p1.name;
    state.pickleball.server.t2RightPlayer = state.p2.name;
  }

  const pkl = state.pickleball;
  pkl.isGameOver = false; // limpa estado transitório anterior

  // Processa o ponto conforme o modo
  if (state.matchConfig.pickleballScoringMode === 'rally') {
    processRallyScoring(pkl, state, rallyWinner);
  } else {
    processSideOut(pkl, state, rallyWinner);
  }

  // side já atualizado por cada função de transição acima

  // Sincroniza com GameState global
  state.p1.score = pkl.score.team1.toString();
  state.p2.score = pkl.score.team2.toString();
  state.server   = pkl.server.team;

  // Mantém servingOrderOffset em sincronia para o marcador visual do ScoreboardScreen.
  // Mapeamento: team=1,srvNum=1→0 | team=2,srvNum=1→1 | team=1,srvNum=2→2 | team=2,srvNum=2→3
  state.servingOrderOffset =
    (pkl.server.team === 1 ? 0 : 1) +
    (pkl.server.serverNumber === 2 ? 2 : 0);

  // Verifica vitória do game
  const gameWinner = checkGameWinner(pkl, state);
  if (gameWinner !== null) {
    processGameWin(pkl, state, gameWinner);
  }

  return state;
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers públicos — announcer e UI
// ─────────────────────────────────────────────────────────────────────────────

/** Time em game point, ou null. */
export const whoHasPickleballGamePoint = (
  pkl: PickleballState,
  state: GameState
): 1 | 2 | null => {
  if (pkl.isMatchOver || pkl.isGameOver) return null;
  // Em tie-break usa tieBreakPoints como alvo; game normal usa gamesPerSet
  const isTB     = isPickleballTieBreak(state);
  const target   = isTB
    ? (Number(state.matchConfig.tieBreakPoints) || 15)
    : (Number(state.matchConfig.gamesPerSet) || 11);
  const winByTwo = state.matchConfig.tieBreakWinByTwo ?? true;

  const isGP = (mine: number, theirs: number): boolean =>
    winByTwo
      ? mine + 1 >= target && mine + 1 >= theirs + 2
      : mine + 1 >= target;

  if (isGP(pkl.score.team1, pkl.score.team2)) return 1;
  if (isGP(pkl.score.team2, pkl.score.team1)) return 2;
  return null;
};

/** Time em match point, ou null. */
export const whoHasPickleballMatchPoint = (
  pkl: PickleballState,
  state: GameState
): 1 | 2 | null => {
  if (pkl.isMatchOver) return null;

  // ── Tie-break: branch separada com condição de "penúltimo ponto exato" ────
  // Anuncia match point APENAS quando o placar atinge exatamente target-1
  // (primeira vez que um time pode vencer). Evita repetir o anúncio nas
  // rodadas estendidas além do target (ex: 15-14, 16-15 com target=15).
  const isTB = isPickleballTieBreak(state);
  if (isTB) {
    const target   = Number(state.matchConfig.tieBreakPoints) || 15;
    const winByTwo = state.matchConfig.tieBreakWinByTwo ?? true;
    const { team1, team2 } = pkl.score;

    const isMP = (mine: number, theirs: number): boolean =>
      winByTwo
        ? mine === target - 1 && mine > theirs   // ex: 14 a 12 com target=15
        : mine === target - 1;                   // ex: 14 a X com target=15

    // No tie-break ambos os lados já estão a um set da vitória (implícito)
    if (isMP(team1, team2)) return 1;
    if (isMP(team2, team1)) return 2;
    return null;
  }

  // ── Game normal: delega para whoHasPickleballGamePoint ───────────────────
  const setsNeeded =
    Math.ceil((Number(state.matchConfig.setsToWin) || 1) / 2) || 1;
  const p1SetsWon = state.p1.sets.filter(
    (s, i) => s > (state.p2.sets[i] ?? 0)
  ).length;
  const p2SetsWon = state.p2.sets.filter(
    (s, i) => s > (state.p1.sets[i] ?? 0)
  ).length;
  const gpTeam = whoHasPickleballGamePoint(pkl, state);

  if (p1SetsWon === setsNeeded - 1 && gpTeam === 1) return 1;
  if (p2SetsWon === setsNeeded - 1 && gpTeam === 2) return 2;
  return null;
};

/**
 * Deve trocar de lado no meio do game decisivo?
 * Acontece quando qualquer time alcança metade do alvo
 * (ex: 6 em 11, 8 em 15, 11 em 21).
 */
export const shouldSwitchSidesMidGame = (
  pkl: PickleballState,
  state: GameState
): boolean => {
  if (!state.matchConfig.switchSidesOdd) return false;

  const target   = Number(state.matchConfig.gamesPerSet) || 11;
  const midPoint = Math.ceil(target / 2); // 11→6, 15→8, 21→11

  const setsNeeded =
    Math.ceil((Number(state.matchConfig.setsToWin) || 1) / 2) || 1;
  const p1SetsWon = state.p1.sets.filter(
    (s, i) => s > (state.p2.sets[i] ?? 0)
  ).length;
  const p2SetsWon = state.p2.sets.filter(
    (s, i) => s > (state.p1.sets[i] ?? 0)
  ).length;

  // Só aplica no game decisivo
  const isDecisive =
    p1SetsWon === setsNeeded - 1 && p2SetsWon === setsNeeded - 1;
  if (!isDecisive && state.matchConfig.setsToWin !== 1) return false;

  const { team1, team2 } = pkl.score;
  return (
    (team1 === midPoint && team2 < midPoint) ||
    (team2 === midPoint && team1 < midPoint)
  );
};
