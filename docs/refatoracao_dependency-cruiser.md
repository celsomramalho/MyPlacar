🎯 Agora entendo a estrutura das 81 violações. Vou extrair os insights mais importantes para seu roteiro de refatoração:

📋 Relatório base do estudo: /docs/report

📋 Diagnóstico das 81 ViolaçõesTipos de Problemas Identificados:

no-orphans (Módulos Órfãos)

Arquivos não importados por ninguém
Exemplos: src/routes/index.ts, src/modules/teams/index.ts
Causa: Código antigo não removido ou módulos descontinuados

no-circular (Dependências Circulares) ⚠️ CRÍTICO

Padrões cíclicos envolvendo:

src/types.ts (tipos compartilhados)
src/modules/auth/index.ts (autenticação)
src/infrastructure/firebase/index.ts (Firebase)
src/modules/history/index.ts (histórico)
src/modules/game/GameContext.tsx (contexto do jogo)

Causa: Acoplamento excessivo entre módulos de domínio

🎯 Padrão Observado no seu PWA:Seu projeto segue esta arquitetura:textsrc/
├── types.ts (types compartilhados — ponto de acoplamento!)
├── modules/
│   ├── auth/
│   ├── game/
│   ├── history/
│   ├── teams/
│   ├── spectator/
│   ├── scoreboard/
│   ├── communications/
│   ├── admin/
│   ├── live/
│   ├── events/
│   └── partners/
├── infrastructure/
│   ├── firebase/
│   └── supabase/
└── utils/
    ├── tennisEngine.ts
    └── pickleballEngine.ts

🔴 Problema Central Identificado:src/types.ts é o hub de acoplamento! Todos os módulos dependem dele, e ele importa de vários módulos, criando ciclos.

Exemplo de ciclo típico:types.ts → modules/auth/index.ts → infrastructure/firebase/index.ts → types.ts ❌

🎯 Roteiro Estratégico de Refatoração: PWA de Placar Esportivo

Baseado na análise do dependency-cruiser com 81 violações, vou estruturar um plano de execução de micro passos granulares e seguros para transformar seu monolito disperso em uma arquitetura escalável.

📊 Introdução: Estratégia de Desenvolvimento Segura

Seu projeto apresenta:
156 módulos fortemente acoplados
505 dependências com 81 conflitos (ciclos + órfãos)
Hub crítico: src/types.ts gerando cascatas de dependências circulares

Estratégia:
✅ Diagnóstico profundo → Mapear ciclos e origens exatas
✅ Isolamento progressivo → Extrair módulos sem quebrar funcionalidade
✅ Convergência de tipos → Criar camada de tipos desacoplada (Domain Model)
✅ Validação contínua → Testes e verificações a cada passo

Por que micro passos? Cada mudança será testada antes de prosseguir, evitando que um erro de refatoração quebre toda a aplicação.

---

📋 Fase 1: Diagnóstico Profundo (Semana 1)

Objetivo: Mapear exatamente onde estão os 81 problemas

### 1.1 - Extrair lista detalhada de violações
- [ ] Rodar: `npx depcruise src --include-only "^src" > violations-detailed.json`
- [ ] Analisar quais módulos aparecem em MAIS ciclos (maior impacto)
- [ ] Identificar padrão: quantos ciclos envolvem `src/types.ts`?
- [ ] **Verificação:** Criar arquivo `VIOLATIONS_ANALYSIS.md` com top 10 ciclos

**Objetivo técnico:** Saber exatamente quais módulos (game, auth, history, etc.) estão mais acoplados para priorizar refatoração.

🔍 Fase 1.1 — Aprofundando a Extração de Violações

Vou estruturar um plano prático para você extrair, analisar e mapear exatamente quais dos 81 warnings são mais críticos para seu PWA de placar.

📊 Objetivo da Fase 1.1Transformar os 81 warnings brutos em um inventário estruturado que mostre:

✅ Quais módulos aparecem em MAIS ciclos (maior impacto)
✅ Qual é a cadeia exata de cada ciclo (para quebrar estrategicamente)
✅ Quantos ciclos envolvem src/types.ts (principal culpado)
✅ Padrões repetidos (ciclos que seguem o mesmo formato)

📋 Checklist Detalhado: Fase 1.11.

1.1 — Extrair relatório estruturado em JSON

- [ ] Rodar: npx depcruise src --format json > violations-raw.json
- [ ] Arquivo criado: violations-raw.json (contém estrutura completa)
- [ ] **Verificação:** abrir violations-raw.json em editor e confirmar que tem array de violations

**Objetivo técnico:** Ter dados estruturados (não texto bruto) para análise programática.

---

**Como fazer:**
1. Abra o terminal na raiz do seu projeto (onde está package.json)
2. Cole: `npx depcruise src --format json > violations-raw.json`
3. Espere terminar (~5-10s)
4. Verifique: `cat violations-raw.json | head -50` (mostra primeiras 50 linhas)

**Esperado:**
```json
{
  "summary": {
    "violations": 81,
    "errors": 0,
    "warnings": 81
  },
  "modules": [...],
  "violations": [
    {
      "type": "circular",
      "modules": ["src/types.ts", "src/modules/auth/index.ts", "..."]
    },
    ...
  ]
}
```json

---

### 1.1.2 — Processar JSON para extrair padrões

- [ ] Criar script Python: scripts/analyze-violations.py
- [ ] Script deve:
  - Ler violations-raw.json
  - Contar quantas vezes CADA módulo aparece em ciclos
  - Listar ciclos que envolvem src/types.ts
  - Agrupar por tipo (circular vs no-orphans)
- [ ] Rodar: python scripts/analyze-violations.py > violations-analysis.txt
- [ ] **Verificação:** arquivo violations-analysis.txt com resumo legível

**Objetivo técnico:** Automatizar análise de 81 violations manualmente seria muito trabalho.

---

**Script Python completo:**
```python
import json
from collections import defaultdict

# Ler JSON
with open('violations-raw.json', 'r') as f:
    data = json.load(f)

# Inicializar dicionários
module_count = defaultdict(int)  # Contar aparições
types_cycles = []                 # Ciclos com types.ts
circular_count = 0

# Processar violations
for violation in data.get('violations', []):
    if violation['type'] == 'circular':
        circular_count += 1
        modules = violation.get('modules', [])
        
        # Contar aparições de cada módulo
        for module in modules:
            module_count[module] += 1
        
        # Verificar se types.ts está envolvido
        if any('types.ts' in m for m in modules):
            types_cycles.append(modules)

# Ordenar por frequência
sorted_modules = sorted(module_count.items(), key=lambda x: x[1], reverse=True)

# Imprimir relatório
print("=" * 80)
print("ANÁLISE DE VIOLAÇÕES DE DEPENDÊNCIA")
print("=" * 80)
print(f"\nTotal de ciclos: {circular_count}")
print(f"Total de módulos únicos em ciclos: {len(module_count)}")
print(f"Ciclos envolvendo types.ts: {len(types_cycles)}\n")

print("TOP 15 MÓDULOS MAIS ACOPLADOS (aparecem em mais ciclos):")
print("-" * 80)
for i, (module, count) in enumerate(sorted_modules[:15], 1):
    print(f"{i:2d}. {module:60s} ({count:2d} ciclos)")

print("\n" + "=" * 80)
print(f"CICLOS CRÍTICOS COM types.ts ({len(types_cycles)}):")
print("=" * 80)
for i, cycle in enumerate(types_cycles[:5], 1):  # Top 5
    print(f"\nCiclo {i}:")
    print(" → ".join(cycle))
```python	

Como rodar:
1. Crie pasta: mkdir scripts
2 Salve script acima em: scripts/analyze-violations.py
3. Rodar: python scripts/analyze-violations.py > violations-analysis.txt
4. Ver resultado: cat violations-analysis.txt


---

### 1.1.3 — Extrair ciclos específicos manualmente

- [ ] Abrir violations-raw.json ou report.html
- [ ] Anotar os 5 ciclos com MAIS módulos envolvidos
- [ ] Para cada ciclo, anotar exatamente a cadeia:
  Exemplo: types.ts → auth → firebase → history → types.ts
- [ ] Criar arquivo: docs/TOP_5_CYCLES.md
- [ ] **Verificação:** docs/TOP_5_CYCLES.md tem 5 cadeias documentadas

**Objetivo técnico:** Saber exatamente ONDE quebrar cada ciclo.

---

**Template para docs/TOP_5_CYCLES.md:**

# Top 5 Ciclos Críticos (Ordem de Impacto)

## Ciclo 1: types.ts Hub
**Cadeia:**
src/types.ts 
  → src/modules/auth/index.ts 
  → src/infrastructure/firebase/index.ts 
  → src/modules/game/GameContext.tsx 
  → src/types.ts

**Módulos envolvidos:** 4
**Ponto de quebra recomendado:** Remover import de types.ts do firebase/index.ts

---

## Ciclo 2: [nome]
**Cadeia:**
[módulo A] → [módulo B] → [módulo C] → [módulo A]

**Módulos envolvidos:** [N]
**Ponto de quebra recomendado:** [Descrição]

---

[Ciclos 3, 4, 5 seguem o mesmo formato]markdown
---

### 1.1.4 — Mapear dependências entrantes/saintes por módulo crítico

- [ ] Para cada módulo do TOP 5 CYCLES, criar sub-arquivo:
  - docs/MODULE_DEPENDENCIES_auth.md
  - docs/MODULE_DEPENDENCIES_types.md
  - docs/MODULE_DEPENDENCIES_firebase.md
  - docs/MODULE_DEPENDENCIES_game.md
  - docs/MODULE_DEPENDENCIES_history.md
- [ ] Cada arquivo deve listar:
  - Quem IMPORTA este módulo? (dependências entrantes)
  - Este módulo IMPORTA quem? (dependências saintes)
  - Há imports circulares? Quais?
- [ ] **Verificação:** Rodar grep e anotar manualmente

**Objetivo técnico:** Entender padrão de acoplamento de cada módulo crítico.

---

**Exemplo: docs/MODULE_DEPENDENCIES_types.md**

# Dependências: src/types.ts

## Dependências ENTRANTES (quem importa types.ts)
- src/modules/auth/index.ts
- src/modules/game/GameContext.tsx
- src/modules/history/index.ts
- src/modules/scoreboard/Scoreboard.tsx
- src/infrastructure/firebase/index.ts
- src/utils/tennisEngine.ts
- src/utils/pickleballEngine.ts

**Total: 7 módulos dependem de types.ts**

---

## Dependências SAINTES (types.ts importa de)
- src/infrastructure/firebase/index.ts
- src/modules/auth/index.ts
- src/modules/game/GameContext.tsx

**Total: 3 módulos são importados por types.ts**

---

## Ciclos Identificados
1. types.ts → auth → firebase → types.ts
2. types.ts → game → types.ts
3. types.ts → history → auth → types.ts

---

## Causa Raiz
types.ts importa tipos que dependem de implementação (firebase configs, auth logic).
Solução: Mover tipos para módulos específicos (DDD).Como fazer com grep:bash12345# Encontrar quem importa types.ts
grep -r "from.*['\"].*types['\"]" src/ --include="*.ts" --include="*.tsx" | grep -v "types.ts" | head -20

# Encontrar imports DENTRO de types.ts
grep -E "^import|^export.*from" src/types.tsmarkdown
---

### 1.1.5 — Classificar violações por severidade

- [ ] Criar arquivo: docs/VIOLATIONS_SEVERITY.md
- [ ] Classificar cada um dos 81 warnings:
  - 🔴 CRÍTICO: Ciclo envolvendo +3 módulos E types.ts
  - 🟠 ALTO: Ciclo com +3 módulos OU types.ts
  - 🟡 MÉDIO: Ciclo com 2-3 módulos
  - 🟢 BAIXO: Módulo órfão ou ciclo com 2 módulos periféricos
- [ ] Contar:
  - Quantos CRÍTICOS?
  - Quantos ALTOS?
  - Quantos MÉDIOS?
  - Quantos BAIXOS?
- [ ] **Verificação:** Relatório de severidade criado

**Objetivo técnico:** Priorizar: quebrar críticos primeiro reduz impacto em cascata.

---

**Template: docs/VIOLATIONS_SEVERITY.md**

# Classificação de Severidade das 81 Violações

## 🔴 CRÍTICOS (Quebrar PRIMEIRO)
Ciclos com 3+ módulos envolvendo types.ts, auth, game ou firebase.

1. types.ts ↔ auth ↔ firebase (Impacto: 4 módulos)
2. types.ts ↔ game ↔ history (Impacto: 3 módulos)
...

**Subtotal: [X] críticos**

---

## 🟠 ALTOS (Quebrar em paralelo)
Ciclos com 2-3 módulos (não envolvendo types.ts).

1. auth ↔ firebase
2. game ↔ history
...

**Subtotal: [X] altos**

---

## 🟡 MÉDIOS (Quebrar depois)
Ciclos com 2 módulos; módulos órfãos não-críticos.

1. utils/tennisEngine ↔ utils/pickleballEngine
...

**Subtotal: [X] médios**

---

## 🟢 BAIXOS (Deletar ou ignorar)
Módulos completamente órfãos; imports de pasta routes não usada.

**Subtotal: [X] baixos**

---

## RESUMO
- Críticos: [X]   → 10+ horas de refatoração
- Altos:    [X]   → 5-8 horas
- Médios:   [X]   → 2-3 horas
- Baixos:   [X]   → 1 hora

**Ordem recomendada:** Críticos → Altos → Médios → Baixosmarkdown

---

### 1.1.6 — Documentar atuais e estado esperado

- [ ] Criar: docs/PHASE_1.1_RESULTS.md
- [ ] Documentar:
  - Quantas violações foram encontradas (81 ✓)
  - Como estão distribuídas (críticas/altas/médias/baixas)
  - Quais 5 ciclos são piores
  - Qual módulo é o maior acoplador (esperado: types.ts)
  - Plano de ataque para Fase 2
- [ ] Exemplo de resumo esperado:

  # Resultados da Fase 1.1
  
  ## Achados
  - 81 violations: 45 ciclos + 36 órfãos
  - 15 módulos críticos envolvidos
  - types.ts está em 28 ciclos (34% do total!)
  - auth e firebase em 18 ciclos cada
  
  ## Impacto
  Se quebrarmos types.ts → reducção esperada: 35% das violations
  Se quebrarmos auth/firebase → reducção esperada: 25%
  
  ## Próxima Etapa
  Fase 1.2: Mapear tipos.ts e decidir quais migram para domínios

- [ ] Verificação: Documento criado e resumo é claro

**Objetivo técnico:** Ter snapshot do diagnóstico ANTES de refatorar (para medir progresso depois).markdown

---

## 🛠️ **Scripts Auxiliares (Opcional mas Útil)**

Se quiser automação extra, crie este script bash:
```bash
#!/bin/bash
# scripts/diagnose-violations.sh

echo "=== Diagnosticando Violações ==="
echo ""

echo "1. Gerando JSON de violations..."
npx depcruise src --format json > violations-raw.json
echo "   ✓ violations-raw.json criado"

echo ""
echo "2. Analisando com Python..."
python scripts/analyze-violations.py > violations-analysis.txt
echo "   ✓ violations-analysis.txt criado"

echo ""
echo "3. Procurando tipos.ts em ciclos..."
grep -c "types.ts" violations-raw.json && echo "   ✓ types.ts está em vários ciclos (esperado)"

echo ""
echo "4. Contando módulos únicos..."

echo ""
echo "=== Diagnóstico Concluído ==="
echo "Próximos arquivos criados:"
echo "  - violations-raw.json (dados brutos)"
echo "  - violations-analysis.txt (análise formatada)"
echo ""
echo "Próximas tarefas:"
echo "  - Anotar Top 5 cycles em docs/TOP_5_CYCLES.md"
echo "  - Criar docs/VIOLATIONS_SEVERITY.md"
echo "  - Documentar docs/PHASE_1.1_RESULTS.md"
```bash

✅ Checklist Resumido de Fase 1.1

Fase 1.1 — Extração de Violações

- [ ] 1.1.1: violations-raw.json criado
- [ ] 1.1.2: violations-analysis.py executado com sucesso
- [ ] 1.1.3: docs/TOP_5_CYCLES.md preenchido
- [ ] 1.1.4: docs/MODULE_DEPENDENCIES_*.md criados (5 arquivos)
- [ ] 1.1.5: docs/VIOLATIONS_SEVERITY.md pronto
- [ ] 1.1.6: docs/PHASE_1.1_RESULTS.md documentado

**Resultado esperado:** 
De "81 warnings" genéricos → Para "28 no types.ts + 18 no auth + 15 no firebase" + mapa exato de cada cicl



---

### 1.2 - Mapear dependências do `src/types.ts`
- [ ] Listar todos os imports de `src/types.ts`: `grep -r "from.*types" src/ | grep -v node_modules`
- [ ] Contar: quantos módulos importam de `types.ts`?
- [ ] Anotar: quais tipos REALMENTE precisam estar em `types.ts` vs. podem ser locais?
- [ ] **Verificação:** Criar mapa visual em `docs/TYPES_DEPENDENCY_MAP.md`

**Objetivo técnico:** Identificar tipos que podem ser descentralizados para quebrar ciclos.

---

### 1.3 - Classificar módulos órfãos vs. críticos
- [ ] Extrair lista de `no-orphans` warnings
- [ ] Para cada módulo órfão: decidir se DELETAR ou se é código legado que será usado
- [ ] Classificar módulos críticos: auth, game, history (dependências entrantes)
- [ ] **Verificação:** Tabela em `docs/MODULE_CRITICALITY.md`

**Objetivo técnico:** Saber quais módulos são "estruturais" (auth, game) vs. "periféricos" (pode deletar).

---

### 1.4 - Analisar os 3 maiores ciclos
- [ ] Extrair do relatório: quais 3 ciclos têm mais módulos envolvidos?
- [ ] Para cada um: desenhar em texto qual é a cadeia exata
- [ ] Exemplo: `types → auth → firebase → history → types`
- [ ] **Verificação:** Arquivo `docs/TOP_3_CYCLES.md` com diagrama ASCII

**Objetivo técnico:** Entender a dinâmica de cada ciclo para quebrar estrategicamente.

---

📋 Fase 2: Refatoração de Tipos

Objetivo: Descentralizar types.ts e quebrar ciclos via tipos

### 2.1 - Criar Domain Types desacoplados
- [ ] Criar pasta: `src/domain/types/`
- [ ] Mover tipos de domínio para módulos específicos:
  - `src/domain/types/game.types.ts` (IGame, IScore, etc.)
  - `src/domain/types/auth.types.ts` (IUser, IAuth, etc.)
  - `src/domain/types/history.types.ts` (IMatch, IResult, etc.)
- [ ] Manter em `src/types.ts` APENAS tipos primitivos/interfaces globais (nunca imports internos)
- [ ] **Verificação:** Rodar `npx depcruise src` → verificar se violações diminuem

**Objetivo técnico:** Quebrar ciclo via tipos ao desacoplá-los por domínio.

---

### 2.2 - Criar re-export layer em cada módulo
- [ ] Em cada `src/modules/[modulo]/types.ts`:
```typescript
  // src/modules/game/types.ts
  export interface IGame { /* ... */ }
  export interface IScore { /* ... */ }
  // Nunca importar de ../types.ts (arquivo raiz)
```typescript
  
- [ ]  Atualizar imports em todos os componentes que usam esses tipos
- [ ]  Verificação: Grep para confirmar: grep -r "from.*src/types" src/modules/game/ | wc -l = 0

**Objetivo técnico:** Cada módulo é responsável por seus próprios tipos (isolamento).

---

### 2.3 - Eliminar imports circulares de types.ts
- [ ]  Revisar src/types.ts: remover QUALQUER import de src/modules/*
- [ ]  Se houver, mover esses tipos para o respectivo módulo
- [ ]  Exemplo: se types.ts tinha import { IGame } from './modules/game' → mover IGame para game/types.ts
- [ ]  Verificação: npx depcruise src/types.ts → verificar se tem imports internos

**Objetivo técnico:** types.ts nunca importa de módulos (quebra ciclo na raiz).

---

### 2.4 - Validar integridade de tipos
- [ ]  Compilar TypeScript: npx tsc --noEmit
- [ ]  Verificar se há erros de tipo faltante
- [ ]  Se houver, ajustar imports locais
- [ ]  Verificação: Build sucede sem warnings

**Objetivo técnico:** Garantir que refatoração de tipos não quebrou type-checking.



---

## 📋 **Fase 3: Extração de Hooks Customizados (Semana 3)**

### Objetivo: Mover lógica fragmentada de `app.tsx` para hooks reutilizáveis

### 3.1 - Identificar lógica duplicada em `app.tsx`
- [ ] Analisar `app.tsx`: quais operações se repetem 3+ vezes?
  - Atualizar placar?
  - Validar regras de jogo?
  - Gerenciar estado de áudio?
- [ ] Documentar padrões em `docs/APP_LOGIC_INVENTORY.md`
- [ ] **Verificação:** Lista de 5-10 operações críticas identificadas

**Objetivo técnico:** Saber QUAL lógica extrair primeiro (maior impacto).

---

### 3.2 - Criar hook `useScoreboardEngine`
- [ ] Criar: `src/hooks/useScoreboardEngine.ts`
- [ ] Mover TODA lógica de placar de `app.tsx` para esse hook
- [ ] Hook deve retornar: `{ score, updateScore, resetScore, validateRule }`
- [ ] **Verificação:** `app.tsx` chama hook, placar ainda funciona

**Objetivo técnico:** Centralizar lógica de pontuação (reduz duplicação).

---

### 3.3 - Criar hook `useGameRules`
- [ ] Criar: `src/hooks/useGameRules.ts`
- [ ] Mover validações de regras (tennis vs pickleball)
- [ ] Hook retorna: `{ applyRule, getRuleSet, validateMove }`
- [ ] Usar `tennisEngine.ts` e `pickleballEngine.ts` como camada de serviço
- [ ] **Verificação:** Regras de jogo funcionam, sem código em `app.tsx`

**Objetivo técnico:** Isolar rules engine em hook reutilizável.

---

### 3.4 - Criar hook `useVoiceControl`
- [ ] Criar: `src/hooks/useVoiceControl.ts`
- [ ] Mover toda lógica de reconhecimento de voz
- [ ] Retorna: `{ isListening, transcript, startListening, stopListening }`
- [ ] **Verificação:** Voz funciona, nenhuma referência a voz em `app.tsx`

**Objetivo técnico:** Desacoplar voz (pode trocar provider depois).

---

### 3.5 - Refatorar `app.tsx` com os 3 hooks
- [ ] Remover toda lógica de `app.tsx`
- [ ] Deixar APENAS: JSX de componentes + chamadas de hooks
- [ ] `app.tsx` deve ter máximo 150 linhas
- [ ] **Verificação:** `wc -l src/app.tsx` < 150 e funciona 100%

**Objetivo técnico:** `app.tsx` torna-se orquestrador, não executor.


### 4.1 - Criar Service Layer
- [ ] Criar pasta: `src/services/`
- [ ] Criar serviços:
  - `src/services/scoreboardService.ts` (operações de placar)
  - `src/services/gameRulesService.ts` (validação de regras)
  - `src/services/historyService.ts` (persistência de histórico)
  - `src/services/authService.ts` (operações de autenticação)
- [ ] Cada service: **NÃO** importa de hooks, apenas types
- [ ] **Verificação:** Cada service é testável isoladamente

**Objetivo técnico:** Camada de negócio desacoplada de UI.

---

### 4.2 - Implementar gerenciador de estado (Zustand/Redux Lite)
- [ ] Criar: `src/store/gameStore.ts`
```typescript
  // Exemplo com Zustand (mais simples)
  export const useGameStore = create((set) => ({
    score: { home: 0, away: 0 },
    updateScore: (team, points) => set(state => ({
      score: { ...state.score, [team]: state.score[team] + points }
    }))
  }))
```typescript

- [ ] Mover estado global para store (não em Context/useState disperso)
- [ ] Verificação: App funciona usando store centralizadamente

**Objetivo técnico:** Single source of truth para estado (evita duplicação).

---

### 4.3 - Refatorar hooks para usar store
- [ ] Atualizar useScoreboardEngine para usar useGameStore
- [ ] Remover useState local de pontuação
- [ ] Todos os hooks consomem do store centralizado
- [ ] Verificação: grep -r "useState.*score" src/hooks/ | wc -l = 0

**Objetivo técnico:** Hooks orquestram store, não mantêm estado.

---

### 4.4 - Validar dependências do store

- [ ] Rodar: npx depcruise src
- [ ] Verificar se ciclos diminuíram (esperado: -30 a -50% das violações)
- [ ] Documentar progresso em docs/REFACTORING_PROGRESS.md
- [ ] Verificação: Relatório mostra redução de violações

**Objetivo técnico:** Medir impacto das mudanças via dependency-cruiser.



---

## 📋 **Fase 5: Modularização e Limpeza (Semana 5)**

### Objetivo: Reorganizar código por domínio (DDD Lite)

### 5.1 - Estruturar módulos por domínio
- [ ] Reorganizar `src/modules/` com padrão:

src/modules/game/
├── types.ts          # IGame, IScore
├── services/
│   └── gameRulesService.ts
├── hooks/
│   └── useGameState.ts
├── components/
│   ├── Scoreboard.tsx
│   └── GameControls.tsx
└── index.ts          # Re-exports públicos

- [ ] Aplicar para: auth, history, teams, events, partners
- [ ] **Verificação:** Cada módulo é independente e testável

**Objetivo técnico:** Organização Clara por domínio (facilita manutenção).

---

### 5.2 - Implementar barrel exports (`index.ts`)
- [ ] Criar `src/modules/[modulo]/index.ts`:
```typescript
  export * from './types'
  export { default as GameComponent } from './components/Game'
  export { useGameRules } from './hooks/useGameRules'
```typescript
  
- [ ] Sempre importar via barrel: import { GameComponent } from 'src/modules/game'
- [ ] Nunca: import { GameComponent } from 'src/modules/game/components/Game'
- [ ] Verificação: grep -r "from.*modules/[^/]*/[^/]*\.[^/]*" src/ = 0

**Objetivo técnico:** Encapsulamento: módulo controla o que expõe.

---

### 5.3 - Deletar módulos órfãos
- [ ] Para cada módulo da lista no-orphans (Fase 1.3):
		Se não for usado: rm -rf src/modules/[modulo]
		Documentar em docs/DELETED_MODULES.md por quê
- [ ] Rodar testes após cada deleção
- [ ] Verificação: no-orphans warnings desaparecem

**Objetivo técnico:** Remover código morto (reduz complexidade).

---

### 5.4 - Consolidar utilitários duplicados
- [ ] Revisar src/utils/:
		tennisEngine.ts vs. pickleballEngine.ts
		Há funções duplicadas?
- [ ] Refatorar em padrão Strategy:
```typescript
  // src/utils/gameEngine.ts
  interface IGameEngine {
    validateScore(score: IScore): boolean
    applyRules(move: IMove): IScore
  }
  export class TennisEngine implements IGameEngine { ... }
  export class PickleballEngine implements IGameEngine { ... }
```typescript
  
- [ ] Verificação: Uma única classe base, duas implementações

**Objetivo técnico:** DRY Principle: eliminar duplicação via polimorfismo.



---

## 📋 **Fase 6: Testes e Validação (Semana 6)**

### Objetivo: Garantir que refatoração não quebrou funcionalidade

### 6.1 - Criar testes de regressão
- [ ] Criar: `tests/regression/scoreboard.test.ts`
```typescript
  describe('Scoreboard', () => {
    it('should increment score correctly', () => {
      const { updateScore, getScore } = renderHook(() => useScoreboardEngine())
      updateScore('home', 1)
      expect(getScore()).toEqual({ home: 1, away: 0 })
    })
    it('should apply tennis rules', () => {
      const { applyRule } = renderHook(() => useGameRules('tennis'))
      const result = applyRule({ home: 20, away: 20 })
      expect(result.requiresTiebreak).toBe(true)
    })
  })
```typescript
  
- [ ] Rodar: npm test -- --coverage
- [ ] Verificação: Cobertura > 70% das funções críticas

**Objetivo técnico:** Validar que lógica refatorada funciona igual à original.

---

### 6.2 - Teste de integração: fluxo completo
- [ ] Criar: tests/integration/game-flow.test.ts
		Iniciar jogo
		Atualizar placar (voz + botão)
		Aplicar regra
		Histórico registra corretamente
- [ ] Rodar teste manualmente
- [ ] Verificação: Fluxo funciona end-to-end

**Objetivo técnico:** Validar que módulos refatorados trabalham juntos.

---

### 6.3 - Rodar dependency-cruiser novamente
- [ ] Executar: npx depcruise src --output-to report-final.html
- [ ] Comparar com report.html inicial:
		Violações iniciais: 81
		Violações finais: objetivo < 20
- [ ] Documentar redução em docs/REFACTORING_RESULTS.md
- [ ] Verificação: Redução de 70%+ em ciclos

**Objetivo técnico:** alidar impacto quantitativo da refatoração.

---

### 6.4 - Auditoria de Performance
- [ ] Medir: Lighthouse score antes/depois
- [ ] Medir: Bundle size (esperado: redução via tree-shaking)
- [ ] Medir: Time to Interactive (TTI)
- [ ] Verificação: Sem degradação de performance

**Objetivo técnico:** Garantir refatoração também melhorou performance.markdown



---

## 📋 **Fase 7: Documentação e Skills/Automação (Semana 7)**

### Objetivo: Documentar decisões e criar automação para future-proof

### 7.1 - Documentar arquitetura final
- [ ] Criar `docs/ARCHITECTURE.md`:

  # Arquitetura Final
  
  ## Camadas
  1. **Components** → JSX puro (Presentational)
  2. **Hooks** → Orquestração e estado local
  3. **Store** (Zustand) → Estado global centralizado
  4. **Services** → Lógica de negócio (firebase, rules, history)
  5. **Types** → Domain models por módulo
  
  ## Dependências Permitidas
  - Components → Hooks
  - Hooks → Services, Store, Types
  - Services → Types, Infraestrutura
  - Nunca circular!
  
- [ ] Verificação: Time consegue entender arquitetura lendo doc

**Objetivo técnico:** Conhecimento compartilhado evita regressão.

---

### 7.2 - Criar .dependency-cruiserrc.cjs com regras
- [ ] Configurar regras proibitivas:
```javascript
module.exports = {
    rules: [
      {
        name: 'no-circular',
        severity: 'error'
      },
      {
        name: 'no-orphans',
        severity: 'warn'
      },
      {
        name: 'no-violations-of-module-boundaries',
        from: 'src/modules',
        to: ['src/app.tsx'] // modules não podem importar de app.tsx
      }
    ]
  }
```javascript  
  
- [ ] Rodar: npx depcruise src deve retornar 0 errors
- [ ] Verificação: CI/CD pode bloquear PRs com violações

**Objetivo técnico:** Automatizar guardrails de arquitetura.

---

### 7.3 - Criar Skill de Auditoria de Arquitetura (IA)
- [ ] (OPCIONAL) Criar skill/prompt no Adapta ONE para:
		Analisar novo código antes de PR
		Detectar: imports que violam boundaries, types circulares
		Sugerir refatoração


- [ ] Exemplo de prompt:
```markdown  
Você é um auditor de arquitetura. Analise este código:
  
  [PASTED CODE]
  
  Detecte violações:
  1. Imports circulares?
  2. Module boundary violations?
  3. Types espalhados desnecessariamente?
  4. Funções duplicadas?
  
  Sugira refatoração.
```markdown   
  
- [ ] Verificação: Skill funciona em novo código

**Objetivo técnico:** Automação contínua para manter arquitetura limpa.

---

### 7.4 - Criar Checklist de Code Review
- [ ] Documento: docs/CODE_REVIEW_CHECKLIST.md

  ## Checklist de PR
  - [ ] Nenhum import circular?
  - [ ] Types localizados em módulo (não em src/types.ts)?
  - [ ] Serviço não importa de componentes?
  - [ ] Hook não contém JSX?
  - [ ] Dependency-cruiser pass (0 errors)?
  - [ ] Testes passam com cobertura > 70%?
- [ ] Verificação: Time usa checklist em todo PR

**Objetivo técnico:** Prevenir regressão via disciplina.markdown

---

## 🚀 **Dicas de Otimização no Claude Free**

### Problema: Perda de contexto entre mensagens

**Solução 1: Dividir em blocos de contexto**Mensagem 1: "Vamos refatorar Phase 1 (Diagnóstico). Aqui estão as 4 tarefas:"
[cole checklist de 1.1-1.4]Mensagem 2: "Pronto com Phase 1. Agora Phase 2 (Tipos):"
[cole checklist de 2.1-2.5]markdown

**Solução 2: Criar arquivo de referência**
- Salve em `docs/REFACTORING_PLAN.md` o plano completo
- Antes de cada phase, cole o arquivo inteiro: "Continuando de Phase X..."
- Claude refaz contexto completo facilmente

**Solução 3: Usar Drafts/Notas**
- Mantenha aberto: `docs/CURRENT_PHASE_PROGRESS.md`
- Atualize a cada conversa com Claude
- Cole no início: "Status atual:" + arquivo

---

## 📊 **Checklist de Progresso Global**

## Semana 1-2: Diagnóstico + Tipos
- [ ] Fase 1 (Diagnóstico) completa
- [ ] Fase 2 (Types refactoring) completa
- [ ] dependency-cruiser mostra redução de 20-30%

## Semana 3-4: Hooks + Store
- [ ] Fase 3 (Hooks) completa
- [ ] Fase 4 (Store) completa
- [ ] dependency-cruiser mostra redução de 50%+

## Semana 5-6: Modularização + Testes
- [ ] Fase 5 (Modularização) completa
- [ ] Fase 6 (Testes) completa
- [ ] Cobertura de testes > 70%

## Semana 7: Documentação
- [ ] Fase 7 (Docs) completa
- [ ] dependency-cruiser: 0 errors, < 10 warnings
- [ ] Arquitetura documentada e validada

**Objetivo Final:** De 81 violações → < 10 violações (87% de redução)