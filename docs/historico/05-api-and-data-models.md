# API e Modelos de Dados (Firestore)

Este documento mapeia as estruturas TypeScript definidas em `src/types.ts` para coleções e documentos do Firestore. Use `src/types.ts` como fonte de verdade; toda alteração no shape do dado deve ser refletida ali.

Observação de nomenclatura
- Os nomes das coleções indicados abaixo são sugeridos com base nas interfaces; confirme no código (busque leituras/escritas no repo) e adapte se sua base de dados usar nomes diferentes.

Coleções principais
1) users
- Documento por usuário (ID preferencialmente: uid ou pin)
- Modelo (corresponde a `UserProfile`):
{
  "name": string,
  "nickname": string,
  "email": string,
  "phone": string,
  "pin": string,
  "gender": "M" | "F" | null,
  "isProfileComplete": boolean,
  "emailVerified": boolean,
  "authMethod": "pin" | "password",
  "qrCodeData": string | null,
  "isAdmin": boolean,
  "planType": "free" | "premium" | null,
  "premiumUntil": string | null, // ISO date
  "passkeyCredentialId": string | null,
  "passkeyPublicKey": string | null,
  "referredByPin": string | null
}
- Índices recomendados:
  - email (único)
  - pin
- Regras de segurança:
  - Usuário pode ler/escrever seu próprio documento (request.auth.uid === resource.id) a menos que seja isAdmin.

2) matches (partidas)
- Cada documento representa o estado atual de uma partida — corresponde a `GameState`.
- Campos principais (resumido):
{
  "matchId": string,
  "startTime": number, // timestamp ms
  "p1": { name, partnerName?, score, games, sets: number[], color? },
  "p2": { ... },
  "server": 1 | 2,
  "servingOrderOffset": number,
  "pointHistory": PointEvent[],
  "matchConfig": MatchSettings & { setsToWin: number },
  "history": [{ p1: string, p2: string, setScores: string }],
  "currentSet": number,
  "isMatchOver": boolean,
  "matchDuration": number,
  "isPaused": boolean,
  "controllers": { [controllerId]: ControllerRecord },
  "ownerPin": string,
  "tournamentMatchId": string?,
  "tournamentPin": string?,
  "pickleball": PickleballState?      // presente se sportType === 'pickleball'
}
- Exemplo mínimo:
{
  "matchId": "m_abc123",
  "startTime": 1680000000000,
  "p1": { "name": "João", "score": "15", "games": 0, "sets": [0] },
  "p2": { "name": "Maria", "score": "30", "games": 0, "sets": [0] },
  "server": 1,
  "pointHistory": [],
  "matchConfig": { "sportType": "tennis", "sets": 3, "gamesPerSet": 6, "voiceEnabled": false, "setsToWin": 2, ... },
  "currentSet": 1,
  "isMatchOver": false,
  "ownerPin": "1234"
}
- Índices recomendados:
  - ownerPin + startTime (para listar partidas de um dono)
  - tournamentPin + tournamentMatchId (para consultar partidas por torneio)
- Regras:
  - Escrita somente por controllers autorizados (controlada por ownerPin / controllers map e validação de request.auth quando houver)

3) match_history (ou history / matches_archive)
- Armazena resultados finais — corresponde a `MatchHistoryItem`.
- Campos principais:
{
  "id": string,
  "date": string, // legível
  "time": string,
  "sportType": string,
  "p1Name": string,
  "p1Partner": string?,
  "p2Name": string,
  "p2Partner": string?,
  "p1Color": string,
  "p2Color": string,
  "scoreSummary": string,
  "p1Sets": number[],
  "p2Sets": number[],
  "winner": string,
  "winnerTeam": 1 | 2,
  "duration": number,
  "isSynced": boolean,
  "ownerEmail": string?,
  "ownerPin": string?,
  "location": { lat: number, lng: number }?,
  "stats": { p1Aces, p2Aces, p1Faults, p2Faults, totalPoints },
  "pointHistory": PointEvent[],
  "involvedPins": string[]
}
- Índices recomendados:
  - ownerPin + date
  - sportType + date (se houver buscas por modalidade)

4) tournaments (ou events)
- Documentos do tipo `TournamentEvent` com arrays de `matches`, `pairs` e `config`.
{
  "pin": string,
  "name": string,
  "bannerUrl": string?,
  "active": boolean,
  "createdAt": number,
  "config": { ...TournamentConfig },
  "pairs": [ TournamentPair ],
  "matches": [ TournamentMatch ],
  "coAdminPins": [ string ]
}
- Campos internos:
  - TournamentConfig: { sportType, sets: 1|3|5, gamesPerSet, noAd, isLocked }
  - TournamentMatch: { id, pair1Id, pair2Id, status:'waiting'|'live'|'finished', result?, winnerPairId?, ownerPin? }
- Índices:
  - pin (principal)
  - createdAt

5) partners
- Mapeado para `Partner`
{
  "id": string,
  "name": string?,
  "nickname": string,
  "pin": string,
  "origin": "referral" | "qrcode" | "manual",
  "addedAt": number,
  "isSelected": boolean?,
  "gender": "M" | "F"?
}

6) communications (mensagens / enquetes)
- Modela `Communication` (mensagens/polls), com replies, reactions e flags de push/email.
{
  "id": string,
  "type": "message" | "poll",
  "title": string,
  "content": string,
  "authorId": string,
  "authorName": string,
  "createdAt": number,
  "targetUserId": string | "all",
  "isPinned": boolean,
  "expiresAt": number?,
  "poll": {
    "options": [PollOption],
    "totalVotes": number,
    "closed": boolean
  }?,
  "reactions": { [emoji]: [userIds] },
  "readBy": [userIds],
  "replies": [Reply],
  "pushSent": boolean,
  "emailSent": boolean
}

Coleções auxiliares / recomendadas
- settings (configurações globais / por dispositivo)
- controllers (mapa de controles remotos, se usado separadamente)
- icons / assets (metadados de icons/custom assets)
- queues (se o app usar filas de jogadores — `QueuePlayer`)

Recomendações de modelagem
- Use serverTimestamp() para campos createdAt / updatedAt quando apropriado.
- Para arrays grandes (pointHistory, matches em torneios), avalie se manter em subcoleções em vez de arrays embutidos (evita limites de tamanho de documento).
- Normalize quando precisar consultar por campos específicos (ex.: ter coleção matches e uma collection match_history em vez de depender só de arrays aninhados).

Índices Firestore sugeridos (exemplos)
- matches: ownerPin ASC, startTime DESC
- match_history: ownerPin ASC, date DESC
- tournaments: pin ASC, createdAt DESC
- communications: targetUserId ASC, createdAt DESC

Segurança e validação
- Regras devem:
  - Validar shapes (types) esperados para cada coleção.
  - Garantir que writes que alteram partidas venham de controllers autorizados ou do ownerPin.
  - Proteger campos administrativos (ex.: isAdmin, planType, premiumUntil).
  - Evitar exposição de dados sensíveis (passkeyPublicKey pode ser exposto; passkeyCredentialId deve ser protegido).

Como sincronizar documentação com código
- `src/types.ts` é a fonte de verdade. Ao alterar interfaces, atualize também este documento.
- Antes do deploy, execute validações manuais (ou testes) que garantam compatibilidade entre o cliente (App.tsx / componentes) e a modelagem Firestore.

Se quiser, gero:
- Regras de validação Firestore (exemplos de regras por coleção) baseadas nesses shapes.
- JSON de exemplo para import (seed) com 2–3 documentos por coleção.
