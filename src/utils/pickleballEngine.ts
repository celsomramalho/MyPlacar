/**
 * pickleballEngine.ts — Motor dedicado ao Pickleball
 *
 * NÃO importa tennisEngine. NÃO conhece outros esportes.
 * O roteamento para este motor é feito exclusivamente por scoreEngine.ts.
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
 *   - Recebedor ganha → pontua E assume o saque (performSideOut).
 *   - Sacador ganha → pontua e mantém o saque.
 *
 *   Modos de saque em duplas (pickleballServiceMode):
 *
 *   'switch-side' (padrão WPL/APP — "Sacador troca de lado"):
 *     O mesmo jogador continua sacando enquanto o time vence rallies.
 *     O lado muda a cada ponto conforme a paridade do placar do time.
 *     Ao perder o saque, o outro time começa sempre com serverNumber = 1.
 *
 *   'alternate-server' ("Sacador não troca de lado"):
 *     Os dois jogadores do time se revezam a cada ponto conquistado.
 *     serverNumber 1 → sempre saca da direita (even, lado fixo).
 *     serverNumber 2 → sempre saca da esquerda (odd, lado fixo).
 *     Ao perder o saque, o outro time começa sempre com serverNumber = 1.
 *
 * Lado da quadra (CourtSide)
 *   - switch-side:      par → 'even' (direita), ímpar → 'odd' (esquerda).
 *   - alternate-server: serverNumber 1 → sempre 'even', serverNumber 2 → sempre 'odd'.
 *
 * First server rule (duplas)
 *   - Inferida por: currentSet === 0 && pointHistory.length === 0
 *   - Sem flag explícito no estado — não polui PickleballState.
 */

import { GameState, PickleballState, PickleballServerState, CourtSide } from '../types';

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

/** Atualiza server.side com base no placar atual do sacador. */
const updateSide = (pkl: PickleballState): void => {
  const sacadorScore =
    pkl.server.team === 1 ? pkl.score.team1 : pkl.score.team2;
  pkl.server.side = resolveSide(sacadorScore);
};

// ─────────────────────────────────────────────────────────────────────────────
// Inicialização
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cria o PickleballState inicial quando uma partida de pickleball começa.
 * Chamada em scoreEngine.ts → incrementScore, na primeira vez que
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

  return {
    score: { team1: 0, team2: 0 },
    server: {
      team,
      serverNumber,
      serverName,
      side: 'even', // placar 0 → par → direita (sempre no início)
    },
    isGameOver:          false,
    isMatchOver:         false,
    winner:              null,
    isFirstServerActive: applyFirstServer,
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
 * Saque passa para o time adversário.
 *
 * switch-side (padrão):
 *   Novo time começa sempre com serverNumber = 1.
 *   Side determinado pela paridade do placar do novo time.
 *
 * alternate-server:
 *   O serverNumber é derivado da paridade do placar do novo time:
 *     placar par   → serverNumber = 1 → side 'even' (direita)
 *     placar ímpar → serverNumber = 2 → side 'odd'  (esquerda)
 *   Isso garante que, ao assumir o saque, o jogador correto já esteja
 *   posicionado no lado certo — independente de quem estava sacando antes.
 */
const performSideOut = (pkl: PickleballState, state: GameState): void => {
  pkl.server.team = pkl.server.team === 1 ? 2 : 1;

  const newTeamScore = pkl.server.team === 1 ? pkl.score.team1 : pkl.score.team2;
  const isAlternate  = state.matchConfig.pickleballServiceMode === 'alternate-server';

  if (isAlternate && state.matchConfig.isDoubles) {
    // Deriva serverNumber da paridade do placar do novo time
    pkl.server.serverNumber = newTeamScore % 2 === 0 ? 1 : 2;
    pkl.server.side         = pkl.server.serverNumber === 1 ? 'even' : 'odd';
  } else {
    // switch-side ou simples: sempre começa com serverNumber = 1
    pkl.server.serverNumber = 1;
    pkl.server.side         = resolveSide(newTeamScore);
  }

  pkl.server.serverName   = resolveServerName(state, pkl.server.team, pkl.server.serverNumber);
  pkl.isFirstServerActive = false;
};

/**
 * Rotaciona entre os dois jogadores do time (alternate-server).
 * Mantém o time, alterna serverNumber 1 ↔ 2.
 * Lado é FIXO por número do servidor:
 *   serverNumber 1 → sempre 'even' (direita)
 *   serverNumber 2 → sempre 'odd'  (esquerda)
 */
const rotateWithinTeam = (pkl: PickleballState, state: GameState): void => {
  pkl.server.serverNumber = pkl.server.serverNumber === 1 ? 2 : 1;
  pkl.server.serverName   = resolveServerName(
    state, pkl.server.team, pkl.server.serverNumber
  );
  // Lado fixo por número do servidor — independe do placar
  pkl.server.side = pkl.server.serverNumber === 1 ? 'even' : 'odd';
};

// ─────────────────────────────────────────────────────────────────────────────
// Verificação de vitória do game
// ─────────────────────────────────────────────────────────────────────────────

const checkGameWinner = (
  pkl: PickleballState,
  state: GameState
): 1 | 2 | null => {
  const target    = Number(state.matchConfig.gamesPerSet) || 11;
  const winByTwo  = state.matchConfig.tieBreakWinByTwo ?? true;
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
 *   Simples (qualquer serviceMode):
 *     Sacador ganha  → pontua, mantém saque, side por paridade do placar
 *     Sacador perde  → pontua o recebedor, performSideOut (troca direta)
 *
 *   Duplas — switch-side (padrão WPL/APP):
 *     Sacador ganha  → pontua, mesmo sacador, side por paridade do placar
 *     Sacador perde  → pontua o recebedor, performSideOut (novo time, serverNumber=1)
 *
 *   Duplas — alternate-server:
 *     Sacador ganha  → pontua, rotateWithinTeam (parceiro assume, lado fixo)
 *     Sacador perde  → pontua o recebedor, performSideOut (novo time, serverNumber=1)
 */
const processRallyScoring = (
  pkl: PickleballState,
  state: GameState,
  rallyWinner: 1 | 2
): void => {
  const isDoubles       = state.matchConfig.isDoubles;
  const isAlternate     = state.matchConfig.pickleballServiceMode === 'alternate-server';

  // Sempre pontua
  if (rallyWinner === 1) pkl.score.team1++;
  else pkl.score.team2++;

  if (rallyWinner !== pkl.server.team) {
    // ── Recebedor ganhou → troca o saque ─────────────────────────────────────
    // Igual para simples e duplas, qualquer serviceMode:
    // performSideOut já atualiza team, serverNumber=1, serverName e side do novo time.
    performSideOut(pkl, state);

  } else {
    // ── Sacador ganhou → mantém saque ────────────────────────────────────────
    if (isDoubles && isAlternate) {
      // alternate-server: rotaciona para o parceiro; lado é fixo por serverNumber
      rotateWithinTeam(pkl, state);
    } else {
      // switch-side (ou simples): mesmo sacador, side por paridade do placar
      const teamScore = pkl.server.team === 1 ? pkl.score.team1 : pkl.score.team2;
      pkl.server.side = resolveSide(teamScore);
    }
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Entry point público — chamado por scoreEngine.ts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Processa um ponto no pickleball.
 * state já é deep-clone feito em scoreEngine.incrementScore.
 * Sincroniza state.server, state.p1/p2.score e state.isMatchOver
 * com o GameState global para compatibilidade com o restante da UI.
 */
export const incrementScorePickleball = (
  state: GameState,
  rallyWinner: 1 | 2
): GameState => {
  // scoreEngine.ts garante que state.pickleball existe antes de chamar aqui,
  // mas mantemos a guarda para compatibilidade com estados restaurados do
  // localStorage em versões antigas (sem o campo pickleball).
  if (!state.pickleball) {
    state.pickleball = initPickleballState(state);
  }
  // Garante campo adicionado em versão posterior — default seguro.
  if (state.pickleball.isFirstServerActive === undefined) {
    state.pickleball.isFirstServerActive = false;
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
  const target   = Number(state.matchConfig.gamesPerSet) || 11;
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
