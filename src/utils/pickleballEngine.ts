/**
 * pickleballEngine.ts — Motor dedicado ao Pickleball
 * Isolado do tennisEngine.ts
 *
 * Regras implementadas
 * ────────────────────
 * Side-out scoring (tradicional)
 *   - Só pontua quem está sacando.
 *   - Duplas — transições de saque:
 *       rally ganho  → pontua; serverNumber não muda; side atualiza por paridade
 *       server 1 perde rally → saque para server 2 do mesmo time (sem ponto)
 *       server 2 perde rally → side-out: saque para o time adversário
 *   - Após side-out: novo time começa sempre com serverNumber = 1
 *   - Side do sacador validado pela paridade do placar do time sacador
 *   - Exceção início de partida: primeiro time começa como server 2
 *     (regra "first server" — só um sacador na primeira posse).
 *
 * Rally scoring (WPL/APP)
 *   - Qualquer time pontua a qualquer rally.
 *   - Recebedor ganha → pontua E assume o saque.
 *   - Sacador ganha → pontua e mantém o saque.
 *   - Duplas com alternate-server: rotaciona entre os dois jogadores
 *     do time a cada ponto conquistado pelo time sacador.
 *
 * Lado da quadra (CourtSide)
 *   - Placar par do sacador  → 'even' (direita).
 *   - Placar ímpar do sacador → 'odd'  (esquerda).
 *
 * First server rule (duplas)
 *   - Inferida por: currentSet === 0 && pointHistory.length === 0
 *   - Sem flag explícito no estado — não polui PickleballState.
 */

import { GameState, PickleballState, CourtSide } from '../types.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers internos — resolução de nomes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve o nome do sacador dado time e número do servidor.
 *   serverNumber 1 → jogador principal do time (p1.name / p2.name)
 *   serverNumber 2 → parceiro          do time (p1.partnerName / p2.partnerName)
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
// Helpers internos — lado da quadra
// ─────────────────────────────────────────────────────────────────────────────

/** Placar par → 'even' (direita), ímpar → 'odd' (esquerda). */
const resolveSide = (sacadorScore: number): CourtSide =>
  sacadorScore % 2 === 0 ? 'even' : 'odd';

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

  // First server rule: duplas + side-out.
  // Em vez de inferir pelo pointHistory.length (falha após restauração de sessão),
  // usamos isFirstServerActive como flag explícito persistido no estado.
  const applyFirstServer = isDoubles && isSideOut;
  const serverNumber: 1 | 2 = applyFirstServer ? 2 : 1;
  const serverName = resolveServerName(state, team, serverNumber);

  // rallyOffset inicial: alinha com o team inicial
  // team=1 → offset=0 (J1), team=2 → offset=1 (J2)
  const rallyOffset = team === 1 ? 0 : 1;

  return {
    score: { team1: 0, team2: 0 },
    server: {
      team,
      serverNumber,
      serverName,
      side: 'even', // placar 0 → par → direita (sempre no início)
      rallyOffset,
    },
    isGameOver:          false,
    isMatchOver:         false,
    winner:              null,
    isFirstServerActive: applyFirstServer, // true = first server rule em vigor
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Rotação de serviço — duplas side-out
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Server 1 do time perdeu o rally → saque passa para server 2 do mesmo time.
 * Sem ponto. Side recalculado pelo placar atual do time (não mudou).
 */
const rotateToSecondServer = (pkl: PickleballState, state: GameState): void => {
  pkl.server.serverNumber = 2;
  pkl.server.serverName   = resolveServerName(state, pkl.server.team, 2);
  // side: placar do time não mudou, mas recalcula por consistência
  const teamScore = pkl.server.team === 1 ? pkl.score.team1 : pkl.score.team2;
  pkl.server.side = resolveSide(teamScore);
};

/**
 * Server 2 do time perdeu o rally → side-out.
 * Saque passa para o time adversário, que começa sempre com serverNumber = 1.
 * Side do novo sacador validado pela paridade do placar do novo time.
 */
const performSideOut = (pkl: PickleballState, state: GameState): void => {
  pkl.server.team         = pkl.server.team === 1 ? 2 : 1;
  pkl.server.serverNumber = 1;
  pkl.server.serverName   = resolveServerName(state, pkl.server.team, 1);
  // side: paridade do placar do novo time sacador
  const newTeamScore = pkl.server.team === 1 ? pkl.score.team1 : pkl.score.team2;
  pkl.server.side = resolveSide(newTeamScore);
  // Primeiro side-out desativa a first-server rule para o restante da partida
  pkl.isFirstServerActive = false;
};

/**
 * Rotaciona entre os dois jogadores do time (alternate-server na vitória).
 * Mantém o time, alterna serverNumber 1 ↔ 2.
 * Side recalculado pelo placar do time (acabou de pontuar).
 */
const rotateWithinTeam = (pkl: PickleballState, state: GameState): void => {
  pkl.server.serverNumber = pkl.server.serverNumber === 1 ? 2 : 1;
  pkl.server.serverName   = resolveServerName(
    state, pkl.server.team, pkl.server.serverNumber
  );
  const teamScore = pkl.server.team === 1 ? pkl.score.team1 : pkl.score.team2;
  pkl.server.side = resolveSide(teamScore);
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
  pkl.server.serverName   = resolveServerName(state, pkl.server.team, pkl.server.serverNumber);
  // side: paridade do placar do novo time sacador
  const newTeamScore = pkl.server.team === 1 ? pkl.score.team1 : pkl.score.team2;
  pkl.server.side = resolveSide(newTeamScore);
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
  pkl.server.side         = resolveSide(teamScore);
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
    const nextTeam: 1 | 2       = winner === 1 ? 2 : 1;
    pkl.server.team              = nextTeam;
    pkl.server.serverNumber      = 1;
    pkl.server.serverName        = resolveServerName(state, nextTeam, 1);
    pkl.server.side              = 'even'; // placar 0 → sempre direita
    pkl.isFirstServerActive      = false;  // desativa first server rule
    // rallyOffset: alinha com o novo time sacador (nextTeam=1→0, nextTeam=2→1)
    pkl.server.rallyOffset       = nextTeam === 1 ? 0 : 1;

    // Sincroniza server global
    // serverNumber sempre 1 no início do novo game → sem +2
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
    // side: paridade do placar do time sacador após o ponto
    const teamScore = pkl.server.team === 1 ? pkl.score.team1 : pkl.score.team2;
    pkl.server.side = resolveSide(teamScore);

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
  const isAlternateServer =
    state.matchConfig.pickleballServiceMode === 'alternate-server';

  if (rallyWinner === pkl.server.team) {
    // ── Sacador ganhou ───────────────────────────────────────────────────────
    if (pkl.server.team === 1) pkl.score.team1++;
    else pkl.score.team2++;

    if (isAlternateServer) {
      // alternate-server na vitória: rotaciona para o parceiro
      rotateWithinTeam(pkl, state);
    } else {
      // serverNumber não muda; recalcula side pelo novo placar
      const teamScore = pkl.server.team === 1 ? pkl.score.team1 : pkl.score.team2;
      pkl.server.side = resolveSide(teamScore);
    }

  } else if (pkl.server.serverNumber === 1) {
    // ── Server 1 perdeu → passa para server 2 do mesmo time ─────────────────
    rotateToSecondServer(pkl, state);
    // side já atualizado dentro de rotateToSecondServer

  } else {
    // ── Server 2 perdeu → side-out ───────────────────────────────────────────
    performSideOut(pkl, state);
    // side e serverName já atualizados dentro de performSideOut
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
      performSideOut(pkl, state);
    }

  } else {
    // ── Sacador ganhou ────────────────────────────────────────────────────────
    const isSwitchSide = !isAlternateServer;
    if (isSwitchSide) {
      // switch-side: mesmo jogador continua, só troca de lado pela paridade
      const teamScore = pkl.server.team === 1 ? pkl.score.team1 : pkl.score.team2;
      pkl.server.side = resolveSide(teamScore);
    } else {
      // alternate-server: parceiro assume o saque, side pela paridade do novo placar
      rotateWithinTeam(pkl, state);
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
