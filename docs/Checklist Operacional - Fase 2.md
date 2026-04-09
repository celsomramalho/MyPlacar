# Checklist Fase 2
Use este roteiro para cada módulo migrado.

# Checklist Operacional - Fase 2
Objetivo: migrar um domínio para src/modules com baixo risco e sem arrastar acoplamentos antigos.

## 1. Escolha do módulo
Confirmar qual domínio será migrado agora.
Verificar se ele é relativamente isolado.
Definir o nome oficial do módulo em src/modules/<dominio>.

## 2. Mapeamento do domínio
Listar telas, componentes, hooks, serviços, tipos e utilitários que pertencem ao domínio.
Separar o que é realmente do domínio do que é compartilhado.
Identificar dependências externas: Firebase, Supabase, AI, storage, APIs.
Identificar dependências internas com outros domínios.

## 3. Definição de fronteira
Decidir o que fica dentro do módulo.
Decidir o que sobe para shared.
Decidir o que deve ser consumido via infrastructure.
Confirmar o que continuará legado temporário até a próxima migração.

## 4. Desenho mínimo do módulo
Criar apenas a estrutura necessária.
Garantir que o módulo tenha index.ts.
Evitar criar subpastas vazias sem uso imediato.

## 5. Regra de importação
Dentro do módulo: imports relativos podem existir.
Fora do módulo: consumir apenas via index.ts.
Substituir caminhos antigos por @modules, @shared e @infra quando aplicável.
Evitar novo código apontando para diretórios legados.

## 6. Migração do conteúdo
Mover primeiro os tipos e utilitários específicos do domínio.
Depois mover hooks e services do domínio.
Por fim mover componentes e telas ligadas ao domínio.
Não copiar e deixar duplicado por muito tempo.
Se precisar manter compatibilidade, usar reexport temporário.

## 7. Compat layer temporária
Criar apenas se for realmente necessário para reduzir risco.
Garantir que só faça reexport.
Não adicionar lógica nova.
Marcar como legado/depreciação.
Planejar remoção assim que o domínio estabilizar.

## 8. API pública do módulo
Expor no index.ts apenas o que outros lugares realmente precisam.
Não expor arquivos internos sem necessidade.
Evitar transformar o módulo em um novo “depósito global”.

## 9. Validação arquitetural
Confirmar que o módulo não importa arquivos internos de outro módulo.
Confirmar que shared não ganhou regra de negócio.
Confirmar que infrastructure não ganhou decisão de negócio.
Confirmar que nada novo foi criado em pastas legadas.

## 10. Validação técnica
Rodar build.
Rodar checagem de tipos.
Validar os fluxos básicos do domínio migrado.
Validar imports quebrados.
Validar se a app continua iniciando normalmente.

## 11. Limpeza imediata
Remover duplicações óbvias do domínio migrado.
Reduzir caminhos antigos assim que possível.
Atualizar imports restantes para o caminho novo.
Evitar deixar dois pontos de verdade para a mesma funcionalidade.

## 12. Encerramento do módulo
Fazer commit pequeno e específico.
Registrar qual domínio foi migrado.
Anotar pendências residuais, se houver.
Só avançar para o próximo módulo depois da validação.
Critérios de pronto por módulo
Considere o módulo concluído quando:

- ele tem pasta própria em src/modules
- a maior parte do código do domínio saiu do legado
- existe index.ts como API pública
- imports novos usam aliases corretos
- compat layers, se existirem, são mínimas
- build e tipagem estão ok
- não ficou duplicação longa

Ordem sugerida:
- partners
- auth
- history
- events
- settings
- scoreBoard
- spectator
- communications
- admin