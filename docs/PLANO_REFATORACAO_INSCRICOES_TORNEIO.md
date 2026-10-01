# 📋 Plano de Refatoração por Domínio: Inscrições de Torneio (Tournament Registration)

> **Status:** ✅ Concluído (100%)  
> **Data de Conclusão:** 30/09/2026  
> **Suíte de Testes:** 118/118 testes passando (20 testes dedicados para Inscrições)  
> **Auditoria Arquitetural:** 0 violações no `dependency-cruiser` (254 módulos, 877 dependências)

---

## 1. Diagnóstico do Estado Atual

O fluxo de inscrições de atletas em torneios atualmente concentra grande parte da complexidade funcional do MyPlacar, acumulando regras de validação cadastral, seleção de categorias, pareamento de duplas, cálculo financeiro e integração com gateway de pagamento (Mercado Pago).

### Mapeamento dos Arquivos Atuais

| Arquivo | Tamanho | Linhas | Responsabilidades Acumuladas |
| :--- | :---: | :---: | :--- |
| `src/modules/events/components/EventRegistrationForm.tsx` | **117.1 KB** | **2.557** | **God Component**: Identidade do atleta, seleção de categorias, busca de parceiro por PIN, cálculo de taxas, QR Code Pix Mercado Pago, polling de pagamento, upload de comprovante manual e aceite de regulamento. |
| `src/modules/admin/components/EventRegistrationsManager.tsx` | **59.5 KB** | **1.252** | Gestão admin de inscrições: listagem, busca, check-in por data, reconciliação de pagamentos Mercado Pago e correção de IDs. |
| `src/modules/admin/components/EventPaymentsView.tsx` | **14.6 KB** | ~380 | Visão consolidada de pagamentos manuais e automáticos. |
| `src/modules/events/components/registration/ParticipantMatchHistory.tsx` | **20.5 KB** | ~480 | Histórico de jogos do atleta no torneio. |
| `src/modules/events/components/registration/ParticipantRow.tsx` | **9.1 KB** | ~240 | Linha individual de atleta na lista pública. |
| `src/modules/events/services/eventRegistrationPeriod.ts` | **8.4 KB** | ~220 | Regras de período de inscrição, torneio ativo e validação de check-in. |
| `src/modules/events/services/mercadoPagoCheckout.ts` | **2.5 KB** | ~90 | Chamadas de API para criação de preferência e status Pix. |
| `src/modules/events/services/joinTournamentEvent.ts` | **5.2 KB** | ~140 | Serviço de entrada e persistência de inscrição. |

### Principais Dores e Sintomas
1. **Mega-Componente de 117 KB**: Dificuldade extrema de manutenção no `EventRegistrationForm.tsx`. Qualquer alteração no layout de pagamento corre risco de quebrar a validação de duplas ou a seleção de categorias.
2. **Mistura de UI e Gateway Financeiro**: Polling de status do Mercado Pago, geração de QR Code e efeitos sonoros misturados diretamente no meio do JSX.
3. **Ausência de Testes Unitários de Regras de Preço e Pareamento**: Não há testes automatizados para cálculo de cobrança de categorias múltiplas (`extraCategoryFee`) ou ordenação de gênero em duplas mistas.

---

## 2. Arquitetura Canônica Alvo

Unificar e modularizar o subdomínio sob `src/modules/events/domain/registration/`:

```text
src/modules/events/domain/registration/
├── types.ts                        # Contratos de inscrição, steps, pricing e checkout
├── engine/
│   ├── pricingEngine.ts            # Cálculo de valores (inscrição base + categorias extras)
│   ├── partnerValidator.ts         # Validações de duplas, gênero e regras de duplas mistas
│   └── vacancyCalculator.ts        # Cálculo de vagas restantes por categoria
├── hooks/
│   ├── useRegistrationForm.ts      # Máquina de estados do formulário em etapas (steps)
│   ├── useRegistrationPayment.ts   # Polling Pix Mercado Pago e upload de comprovante
│   └── useParticipantCheckIn.ts    # Lógica de check-in diário e validação de data
├── components/
│   ├── EventRegistrationModal.tsx  # Wrapper modal / container leve
│   ├── steps/
│   │   ├── AthleteIdentityStep.tsx # Nome, apelido, PIN, fone, camiseta, gênero
│   │   ├── CategorySelectionStep.tsx # Cards de categorias e contagem de vagas
│   │   ├── PartnerSelectionStep.tsx  # Busca por PIN e validação de parceiro
│   │   ├── PaymentCheckoutStep.tsx   # Escolha de pagamento (Pix MP ou Manual)
│   │   ├── PixPaymentView.tsx        # QR Code, código copia-e-cola e timer
│   │   └── RegulationStep.tsx        # Aceite de regulamento
│   ├── ParticipantRow.tsx          # Card/linha de participante
│   ├── ParticipantMatchHistory.tsx # Histórico de confrontos do participante
│   └── index.ts
└── index.ts                        # Ponto de entrada canônico do subdomínio
```

---

## 3. Passo a Passo de Execução em Fases

### Fase 1: Suíte de Testes de Regressão (Rede de Segurança)
* Criar `tests/regression/registrationEngine.test.ts` cobrindo:
  * Cálculo correto de preço para 1 categoria, 2 categorias e categorias com desconto.
  * Validação de capacidade de vagas (`maxPlayersPerCategory`).
  * Regra de pareamento de dupla mista (`orderPairEntriesForMixed`: mulher sempre p1).
  * Validação de período ativo de inscrição e check-in.

### Fase 2: Isolamento de Tipos e Motores Puros
* Criar `domain/registration/types.ts`.
* Extrair `pricingEngine.ts`, `partnerValidator.ts` e `vacancyCalculator.ts`.
* Garantir 100% de funções puras (sem React, sem chamadas de rede diretas).

### Fase 3: Criação dos Hooks de Orquestração
* Implementar `useRegistrationForm.ts`:
  * Controle de etapas (`currentStep`: 'identity' | 'categories' | 'partners' | 'payment' | 'confirmation').
  * Validações de transição de cada etapa.
* Implementar `useRegistrationPayment.ts`:
  * Polling com cleanup automático no unmount.
  * Reprodução segura do som de sucesso.

### Fase 4: Decomposição do `EventRegistrationForm.tsx` em Subcomponentes
* Extrair os subcomponentes em `components/steps/`.
* Reduzir `EventRegistrationForm.tsx` de 2.557 linhas para ~200 linhas (apenas orquestração dos steps).
* Manter shim de compatibilidade em `src/modules/events/components/EventRegistrationForm.tsx`.

### Fase 5: Integração, Desacoplamento no Admin e Validação Final
* Atualizar `EventRegistrationsManager.tsx` e `EventDetailScreen.tsx` para usar os novos hooks e componentes.
* Executar suíte completa de testes (`pnpm test`).
* Executar verificação de tipos (`tsc --noEmit`).
* Executar auditoria de dependências (`dependency-cruiser`).

---

## 4. Tabela de Acompanhamento (Tracking Checklist)

| ID | Tarefa | Responsável | Status |
| :--- | :--- | :--- | :---: |
| **R-01** | Criar suíte de testes unitários para regras de inscrição e preços (`tests/regression/registrationEngine.test.ts`) | Dev / Agent | ✅ **Concluído** |
| **R-02** | Criar diretório `src/modules/events/domain/registration/` e isolar `types.ts` | Dev / Agent | ✅ **Concluído** |
| **R-03** | Extrair `pricingEngine.ts`, `partnerValidator.ts` e `vacancyCalculator.ts` com funções puras | Dev / Agent | ✅ **Concluído** |
| **R-04** | Criar hook `useRegistrationForm.ts` gerenciando o fluxo em steps | Dev / Agent | ✅ **Concluído** |
| **R-05** | Criar hook `useRegistrationPayment.ts` isolando Mercado Pago e comprovante manual | Dev / Agent | ✅ **Concluído** |
| **R-06** | Decompor `EventRegistrationForm.tsx` nos subcomponentes de steps (`components/steps/`) | Dev / Agent | ✅ **Concluído** |
| **R-07** | Reduzir `EventRegistrationForm.tsx` a um orquestrador limpo mantendo retrocompatibilidade | Dev / Agent | ✅ **Concluído** |
| **R-08** | Conectar `EventRegistrationsManager.tsx`, `EventDetailScreen.tsx` e `TournamentsScreen.tsx` ao domínio canônico | Dev / Agent | ✅ **Concluído** |
| **R-09** | Validar tipagem (`tsc --noEmit`), testes (`vitest`) e conformidade arquitetural (`dependency-cruiser`) | Dev / Agent | ✅ **Concluído** |

---

## 5. Matriz de Riscos e Mitigações

| Risco | Impacto | Mitigação |
| :--- | :---: | :--- |
| **Quebra de pagamento Pix no Mercado Pago** | Alto | Manter as assinaturas de `createMercadoPagoPixPayment` e isolar o polling em um hook específico com fallback claro. |
| **Inconsistência no registro de Duplas Mistas** | Médio | Cobrir com testes de regressão prévios na Fase 1 a regra `orderPairEntriesForMixed`. |
| **Perda de dados ao navegar entre steps** | Médio | O hook `useRegistrationForm` preserva o rascunho completo no estado centralizado até o envio final. |
