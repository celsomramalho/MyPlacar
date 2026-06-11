## README.md

# [Nome do Projeto]

Documentação estruturada para consumo por IA. Esta base serve como fonte de verdade para o desenvolvimento.

## Estrutura de Documentação
- **README.md**: Visão geral e navegação.
- **ARCHITECTURE.md**: Estrutura técnica.
- **DOMAINS.md**: Domínios de negócio.
- **FLOWS.md**: Fluxos críticos.
- **RULES.md**: Regras de negócio.
- **DEPENDENCIES.md**: Integrações.
- **FILES_INDEX.md**: Catálogo de arquivos chave.
- **GLOSSARY.md**: Terminologia.
- **MAINTENANCE.md**: Governança da documentação.

## Como usar
1. Leia primeiro: README.md e GLOSSARY.md.
2. Consulte ARCHITECTURE.md para entender a estrutura.
3. Use FILES_INDEX.md para localizar implementações.

---

## ARCHITECTURE.md

# Arquitetura do Sistema

## Visão Geral
[Breve descrição da arquitetura, ex: Microsserviços, Monólito Modular]

## Módulos Principais
- **[Nome do Módulo]**: [Responsabilidade principal]
  - Dependências: [Lista]
  - Prioridade: [P0/P1/P2]

## Fluxo de Dados
[Descrição de como os dados trafegam entre módulos]

---

## DOMAINS.md

# Domínios de Negócio

## Domínio: [Nome do Domínio]
- **Responsabilidade**: [O que este domínio resolve]
- **Entidades**: [Principais objetos de negócio]
- **Limites**: [O que este domínio NÃO faz]

---

## FLOWS.md

# Fluxos Críticos

## Fluxo: [Nome do Fluxo]
- **Entrada**: [Dados necessários]
- **Passos**:
  1. [Passo 1]
  2. [Passo 2]
- **Validações**: [Regras aplicadas]
- **Saída**: [Resultado esperado]
- **Arquivos Envolvidos**: [Lista de arquivos]

---

## RULES.md

# Regras de Negócio

## Regra: [Nome da Regra]
- **Aplicação**: [Quando se aplica]
- **Exceções**: [Casos onde não se aplica]
- **Impacto**: [O que acontece se violada]
- **Fonte**: [Documento ou stakeholder]

---

## DEPENDENCIES.md

# Dependências e Integrações

## Internas
- [Módulo A] -> [Módulo B]

## Externas
- [Serviço/API]: [Finalidade]
- [Versão/Protocolo]: [Detalhes]

---

## FILES_INDEX.md

# Índice de Arquivos Chave

## Template de Registro
- **Arquivo**: [Caminho/Nome]
- **Propósito**: [Descrição curta]
- **Responsabilidade**: [Qual módulo/domínio gerencia]
- **Prioridade**: [P0/P1/P2]

---

## GLOSSARY.md

# Glossário

- **[Termo]**: [Definição clara e concisa]

---

## MAINTENANCE.md

# Manutenção da Documentação

## Regras de Atualização
- **Quando**: Sempre que uma regra de negócio ou arquitetura mudar.
- **Quem**: Desenvolvedor responsável pela alteração.
- **Como**: Atualizar o arquivo correspondente antes de submeter o PR.
- **Evitar Ruído**: Mantenha descrições diretas. Remova comentários obsoletos.