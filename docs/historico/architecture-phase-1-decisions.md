# Decisoes Arquiteturais - Fase 1

Projeto: MyPlacar PWA  
Data de referencia: 9 de abril de 2026

## 1. Objetivo
Encerrar a fase 1 da reforma arquitetural do MyPlacar PWA, consolidando a base estrutural para a migracao incremental por dominio na fase 2.

Esta fase nao tem como objetivo refatorar regra de negocio nem reescrever telas grandes. O foco e definir a arquitetura-alvo, padronizar fronteiras e preparar uma migracao segura.

## 2. Arquitetura adotada
A arquitetura oficial do frontend passa a ser modular por dominio.

Estrutura-alvo:

```text
src/
  modules/
  shared/
  infrastructure/
  routes/
  App.tsx
  main.tsx
```

### Responsabilidade de cada camada
`modules/`  
Contem funcionalidades organizadas por dominio de negocio. Cada modulo deve concentrar sua UI, hooks, servicos, tipos e regras daquele contexto.

`shared/`  
Contem recursos reutilizaveis e genericos, sem dependencia de regra de negocio especifica.

`infrastructure/`  
Contem integracoes tecnicas externas, como Firebase, Supabase, AI e clientes HTTP.

`routes/`  
Contem composicao de rotas e navegacao da aplicacao. Essa camada sera efetivamente consolidada na fase 3.

## 3. Regras de dependencia
As seguintes regras passam a orientar toda alteracao futura:

1. `modules` pode depender de `shared` e `infrastructure`.
2. `shared` nao pode depender de `modules`.
3. `infrastructure` nao pode depender de `modules`.
4. Um modulo nao deve importar arquivos internos de outro modulo.
5. Comunicacao entre modulos deve ocorrer apenas por API publica exposta em `index.ts`.
6. Regra de negocio pertence ao modulo, nao ao `shared`.
7. `infrastructure` deve conter acesso tecnico, nunca decisao de negocio.

## 4. Padrao de imports
Os aliases existentes passam a ser o padrao oficial para novos codigos e para os modulos migrados.

### Aliases oficiais
- `@modules/*`
- `@shared/*`
- `@infra/*`
- `@routes/*`

### Regras de uso
1. Dentro do mesmo modulo, imports relativos sao permitidos.
2. Fora do modulo, usar alias e API publica.
3. Novos modulos nao devem importar caminhos legados se ja houver equivalente na nova estrutura.
4. Codigo novo deve nascer no destino final, e nao em pastas legadas.

## 5. Fonte oficial de infraestrutura
A camada `infrastructure` passa a ser a fonte oficial das integracoes externas.

### Decisao
- Firebase deve ser consumido a partir de `src/infrastructure/firebase`.
- Supabase deve ser consumido a partir de `src/infrastructure/supabase`.
- Outras integracoes tecnicas devem seguir o mesmo padrao.

### Regra para arquivos legados
Arquivos antigos fora de `infrastructure` podem existir temporariamente apenas como compat layers.

Esses arquivos:
- nao recebem logica nova
- apenas reexportam
- devem conter indicacao de legado/depreciacao
- devem ser removidos gradualmente na fase 2

## 6. Politica de compatibilidade temporaria
Durante a migracao da fase 2, compat layers serao permitidas apenas como recurso transitorio para reduzir risco.

### Regras
1. Compat layer so pode reexportar.
2. Compat layer nao pode virar ponto oficial de uso.
3. Compat layer nao pode receber comportamento novo.
4. Compat layer deve existir pelo menor tempo possivel.
5. Ao concluir a migracao de um dominio, os caminhos antigos daquele dominio devem ser eliminados ou esvaziados.

## 7. Politica para diretorios legados
As pastas antigas continuam existindo temporariamente, mas entram em estado de congelamento arquitetural.

### Diretorios legados congelados
- `src/components`
- `src/hooks`
- `src/services`
- `src/screens`
- `src/utils`
- arquivos raiz legados equivalentes, quando houver

### Regra
Nenhuma funcionalidade nova deve nascer nesses diretorios.

Eles devem apenas:
- manter compatibilidade temporaria
- ser esvaziados gradualmente
- servir como origem de migracao para `modules`, `shared` ou `infrastructure`

### Status operacional
A partir do encerramento da fase 1:
- essas pastas nao sao mais destino oficial de desenvolvimento
- correcoes pontuais sao permitidas quando necessarias para manter a aplicacao funcionando
- novos componentes, hooks, servicos, utilitarios e regras devem nascer na arquitetura oficial
- qualquer excecao deve ser tratada como manutencao transitoria, e nao como continuidade da estrutura antiga

## 8. Criterio para mover algo para shared
Nem tudo reutilizavel deve ir imediatamente para `shared`.

Um item so deve ir para `shared` quando:
- for realmente transversal
- nao carregar regra de negocio especifica
- tiver uso claro em mais de um dominio, ou forte expectativa realista disso

### Regra pratica
Se houver duvida, o codigo fica primeiro no modulo.
So depois ele sobe para `shared` se a reutilizacao se confirmar.

## 9. Padrao estrutural dos modulos
Cada modulo tera liberdade para comecar simples.
Nao e obrigatorio criar todas as subpastas desde o inicio.

### Estrutura minima recomendada
```text
modules/nome-do-modulo/
  index.ts
```

### Estrutura expandida quando necessario
```text
modules/nome-do-modulo/
  components/
  hooks/
  services/
  store/
  types/
  screens/
  index.ts
```

### Regra
A estrutura interna do modulo deve crescer por necessidade real, nao por cerimonia.

## 10. API publica dos modulos
Todo modulo deve expor uma API publica em `index.ts`.

### Objetivo
- reduzir acoplamento
- esconder estrutura interna
- facilitar reorganizacao futura
- impedir importacoes cruzadas frageis

### Regra
Consumidores externos ao modulo devem importar somente do `index.ts` do modulo.

## 11. Escopo encerrado da fase 1
A fase 1 sera considerada concluida quando estas decisoes estiverem assumidas como padrao do projeto:

- arquitetura modular por dominio definida como oficial
- aliases definidos como padrao de import
- `infrastructure` definida como fonte oficial das integracoes
- regras de dependencia definidas
- politica de compat layers definida
- diretorios legados declarados como congelados
- padrao de API publica por modulo definido
- criterio de uso de `shared` definido
- estrutura minima de modulo definida
- ordem de execucao da fase 2 definida

## 12. Diretriz para a fase 2
A fase 2 sera executada por dominio, com migracao incremental e validacao continua.

### Estrategia
1. selecionar um modulo
2. mapear arquivos pertencentes ao dominio
3. mover para `modules/<dominio>`
4. ajustar imports para aliases e API publica
5. manter compatibilidade temporaria so se necessario
6. validar build
7. registrar commit
8. seguir para o proximo dominio

### Ordem sugerida
1. `partners`
2. `auth`
3. `history`
4. `events`
5. `settings`
6. `scoreBoard`
7. `spectator`
8. `communications`
9. `admin`

## 13. Fora do escopo da fase 1
Os itens abaixo nao fazem parte do encerramento da fase 1:

- quebrar `App.tsx`
- implantar roteamento final
- refatorar telas gigantes
- reescrever regra de negocio
- otimizar performance estrutural fina
- reorganizar tudo de uma vez

Esses pontos pertencem principalmente a fase 3.

## 14. Principio operacional
A migracao deve priorizar seguranca, clareza e reversibilidade.

### Regras praticas
- fazer mudancas pequenas
- evitar duplicacao longa
- evitar mover arquivos sem redefinir fronteiras
- preferir migracao completa de um dominio por vez
- nao carregar acoplamentos antigos para dentro de `modules`

## 15. Resumo executivo
A fase 1 nao termina quando a pasta existe. Ela termina quando a estrutura nova vira a referencia oficial do projeto.

A partir deste documento:
- o destino arquitetural esta definido
- as fronteiras entre camadas estao definidas
- o uso de aliases esta definido
- a infraestrutura oficial esta definida
- o legado esta formalmente congelado
- a fase 2 pode comecar com seguranca
