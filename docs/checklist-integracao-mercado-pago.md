# Checklist de Integração Mercado Pago para Inscrições de Eventos

Use este checklist para planejar, implementar, testar e publicar a integração de pagamentos das inscrições de eventos com Mercado Pago.

## Progresso da Integração

Atualizado em: 2026-09-15

- [x] Criado campo `paymentType` no cadastro do evento.
  - [x] Opção `manual`.
  - [x] Opção `mercadopago` exibida como "Automático (Mercado Pago)".
- [x] Mantido pagamento manual como padrão para eventos existentes e novos eventos.
- [x] Criado endpoint serverless para gerar preferência Mercado Pago.
- [x] Criado endpoint serverless para receber webhook Mercado Pago.
- [x] Adicionada validação de assinatura do webhook quando `MERCADO_PAGO_WEBHOOK_SECRET` estiver configurado.
- [x] Criado serviço frontend para iniciar checkout Mercado Pago.
- [x] Adicionado botão "Pagar inscrição" na tela do evento para inscrições pendentes.
- [x] Botão de pagamento automático aparece apenas em eventos configurados como `mercadopago`.
- [x] Eventos manuais continuam exigindo comprovante no formulário do participante.
- [x] Webhook registra pagamento aprovado no histórico `payments` da inscrição.
- [x] Webhook atualiza `paymentStatus`, `paidAmount`, `mercadoPagoCheckout` e `mercadoPagoLastPayment`.
- [x] Execução de `pnpm lint`.
- [x] Execução de `pnpm build`.
- [x] Credenciais de teste Mercado Pago recebidas para Brasil.
- [x] Access Token de teste confirmado para uso no ambiente local/homologação.
- [x] Usuário de teste Mercado Pago recebido.
- [x] Criado `.env.local` para variáveis locais de teste.
- [x] Confirmado que `.env.local` está ignorado pelo Git.
- [x] Configuradas `MERCADO_PAGO_ACCESS_TOKEN` e `MERCADO_PAGO_PUBLIC_KEY` de teste no `.env.local`.
- [x] Configurado `APP_BASE_URL` no `.env.local` apontando para deploy Vercel de teste.
- [x] Checkout Pro restrito a **Pix exclusivo** (`payment_methods` excluindo cartão, boleto e outros).
- [x] Pix configurado com expiração de 24 horas (`date_of_expiration`).
- [x] Campos `paymentMethod` e `expiresAt` registrados no `mercadoPagoCheckout` do Firestore.
- [ ] Obter/criar comprador de teste separado do vendedor para simular pagamento.
- [ ] Obter segredo de assinatura do webhook no painel Mercado Pago.
- [ ] Configurar variáveis de ambiente (`MERCADO_PAGO_ACCESS_TOKEN`, `APP_BASE_URL`) no Vercel.
- [ ] Testar criação real de preferência com credencial de teste.
- [ ] Testar webhook real do Mercado Pago.
- [ ] Validar visualmente o fluxo completo no navegador (Pix exclusivo).
- [ ] Definir política de expiração de inscrição pendente.

## 1. Visão Geral e Objetivos

- [x] Definir qual meio de integração será usado inicialmente.
  - [x] Checkout Pro.
  - [ ] Checkout Transparente ou Bricks, se houver necessidade de experiência totalmente embutida.
- [x] Definir o objetivo principal da integração.
  - [x] Receber pagamentos de inscrições.
  - [x] Confirmar inscrições automaticamente após pagamento aprovado.
  - [x] Registrar pagamentos pendentes, recusados e cancelados.
  - [x] Permitir conciliação financeira entre sistema e Mercado Pago.
- [x] Mapear o fluxo esperado do usuário.
  - [x] Escolher evento.
  - [x] Preencher inscrição.
  - [x] Gerar pagamento.
  - [x] Pagar no Mercado Pago.
  - [x] Retornar ao sistema.
  - [x] Receber confirmação após aprovação.
- [ ] Definir quando a vaga será reservada.
  - [ ] No momento da criação da inscrição.
  - [ ] Somente após pagamento aprovado.
  - [ ] Por tempo limitado enquanto o pagamento está pendente.

### Pontos de atenção

- [x] Evitar confirmar inscrição apenas pelo retorno do navegador.
- [ ] Definir uma regra clara para expiração de inscrições não pagas.
- [ ] Confirmar se Pix, boleto, cartão e outros meios terão regras diferentes.

## 2. Requisitos Iniciais e Pré-Requisitos Técnicos

- [x] Confirmar que o projeto possui backend capaz de chamar a API do Mercado Pago.
- [x] Confirmar que existe uma base de dados para salvar inscrições e pagamentos.
- [x] Criar ou revisar o modelo de inscrição.
  - [x] ID da inscrição.
  - [x] ID do evento.
  - [x] Dados do participante.
  - [x] Valor da inscrição.
  - [x] Status da inscrição.
  - [x] Data de criação.
  - [ ] Data de expiração, se aplicável.
- [x] Criar ou revisar o modelo de pagamento.
  - [x] ID interno do pagamento.
  - [x] ID da inscrição.
  - [x] ID da preferência Mercado Pago.
  - [x] ID do pagamento Mercado Pago.
  - [x] Valor esperado.
  - [x] Valor pago.
  - [x] Status do pagamento.
  - [x] Método de pagamento.
  - [x] Histórico de eventos recebidos.
- [x] Definir os status internos.
  - [x] `aguardando_pagamento`.
  - [x] `pagamento_pendente`.
  - [x] `paga`.
  - [x] `pagamento_recusado`.
  - [x] `cancelada`.
  - [ ] `expirada`.
- [ ] Confirmar que o ambiente de produção terá HTTPS.
- [ ] Definir onde as variáveis de ambiente serão configuradas.

### Pontos de atenção

- [x] Não salvar credenciais diretamente no código.
- [ ] Não usar apenas um campo de status sem histórico de transações.
- [x] Planejar idempotência desde o início, pois webhooks podem chegar mais de uma vez.

## 3. Conta, Credenciais e Ambiente de Testes

- [ ] Criar ou acessar a conta Mercado Pago da organização.
- [ ] Criar uma aplicação em Mercado Pago Developers.
- [x] Obter credenciais de teste.
  - [x] `Public Key` de teste.
  - [x] `Access Token` de teste.
- [ ] Obter credenciais de produção e guardar separadamente.
  - [ ] `Public Key` de produção.
  - [ ] `Access Token` de produção.
- [x] Criar conta de teste vendedor.
- [ ] Criar conta de teste comprador.
- [ ] Validar que comprador e vendedor de teste pertencem ao mesmo país.
- [x] Configurar variáveis de ambiente no desenvolvimento.
  - [x] `MERCADO_PAGO_PUBLIC_KEY`.
  - [x] `MERCADO_PAGO_ACCESS_TOKEN`.
  - [ ] `MERCADO_PAGO_WEBHOOK_SECRET`, se aplicável.
  - [x] `APP_BASE_URL` para teste local.
  - [ ] `APP_BASE_URL` pública para webhook real.
- [ ] Configurar ambiente de homologação, se existir.
- [ ] Garantir que produção e teste não compartilham credenciais.

### Pontos de atenção

- [ ] Não testar pagamento usando a mesma conta como vendedor e comprador.
- [ ] Fazer compras de teste em aba anônima para evitar conflito de sessão.
- [ ] Conferir se a credencial ativa corresponde ao ambiente correto.

## 4. Fluxo de Implementação

- [ ] Criar endpoint para iniciar pagamento.
  - [ ] Receber ID da inscrição ou dados necessários.
  - [ ] Validar se o evento aceita inscrições.
  - [ ] Validar valor atual da inscrição no backend.
  - [ ] Criar inscrição com status `aguardando_pagamento`.
- [ ] Criar preferência de pagamento no Mercado Pago.
  - [ ] Informar descrição do evento.
  - [ ] Informar valor.
  - [ ] Informar quantidade.
  - [ ] Informar dados do comprador, quando disponíveis.
  - [ ] Informar `external_reference` com o ID da inscrição.
  - [ ] Configurar URL de sucesso.
  - [ ] Configurar URL de falha.
  - [ ] Configurar URL de pagamento pendente.
  - [ ] Configurar URL de notificação, quando usada na preferência.
- [ ] Salvar dados da preferência no banco.
  - [ ] ID da preferência.
  - [ ] ID da inscrição.
  - [ ] Valor esperado.
  - [ ] Status inicial.
  - [ ] Data/hora da criação.
- [ ] Redirecionar usuário para o checkout.
- [ ] Criar endpoint de webhook.
  - [ ] Receber eventos do Mercado Pago por `POST`.
  - [ ] Responder rapidamente com status HTTP adequado.
  - [ ] Registrar payload recebido para auditoria.
- [ ] Ao receber webhook, consultar a API do Mercado Pago.
  - [ ] Buscar pagamento pelo ID informado.
  - [ ] Validar status real do pagamento.
  - [ ] Validar `external_reference`.
  - [ ] Validar valor e moeda.
  - [ ] Atualizar pagamento interno.
  - [ ] Atualizar inscrição.
- [ ] Criar tela de retorno ao usuário.
  - [ ] Sucesso.
  - [ ] Falha.
  - [ ] Pendente.
- [ ] Criar rotina administrativa para visualizar inscrições e pagamentos.

### Pontos de atenção

- [ ] Não confiar nos parâmetros da URL de retorno como confirmação final.
- [ ] Não permitir que o frontend informe o valor final sem validação do backend.
- [ ] Garantir que uma inscrição paga não possa ser paga novamente por engano.

## 5. Tratamento de Pagamentos Aprovados, Recusados e Pendentes

### Pagamento aprovado

- [ ] Confirmar que o status recebido é aprovado.
- [ ] Confirmar que o valor pago bate com o valor esperado.
- [ ] Confirmar que o pagamento pertence à inscrição correta.
- [ ] Marcar pagamento como aprovado.
- [ ] Marcar inscrição como `paga`.
- [ ] Registrar data de aprovação.
- [ ] Liberar vaga ou confirmar participação.
- [ ] Enviar confirmação ao participante, se houver notificação configurada.

### Pagamento recusado

- [ ] Marcar pagamento como recusado.
- [ ] Registrar motivo da recusa, quando disponível.
- [ ] Atualizar inscrição para `pagamento_recusado` ou manter como `aguardando_pagamento`.
- [ ] Permitir nova tentativa de pagamento, se a regra do evento permitir.
- [ ] Não confirmar vaga.

### Pagamento pendente

- [ ] Marcar pagamento como pendente.
- [ ] Atualizar inscrição para `pagamento_pendente`.
- [ ] Informar ao usuário que a confirmação ainda não ocorreu.
- [ ] Aguardar novo webhook de atualização.
- [ ] Aplicar prazo de expiração quando necessário.

### Pagamento cancelado ou expirado

- [ ] Marcar pagamento como cancelado ou expirado.
- [ ] Atualizar inscrição para `cancelada` ou `expirada`.
- [ ] Liberar vaga, se ela estava reservada.
- [ ] Registrar a origem do cancelamento.

### Pontos de atenção

- [ ] Pix e boleto podem permanecer pendentes até compensação.
- [ ] Webhook de aprovação pode chegar depois da tela de retorno.
- [ ] Webhook pode chegar mais de uma vez e precisa ser tratado sem duplicar efeitos.

## 6. Segurança, Validação e Boas Práticas

- [ ] Manter `Access Token` apenas no backend.
- [ ] Usar HTTPS em produção.
- [ ] Validar assinatura ou origem do webhook quando configurado.
- [ ] Consultar a API do Mercado Pago antes de alterar status definitivo.
- [ ] Validar `external_reference`.
- [ ] Validar valor pago.
- [ ] Validar moeda.
- [ ] Validar se a inscrição ainda existe.
- [ ] Validar se a inscrição ainda pode receber pagamento.
- [ ] Implementar idempotência.
  - [ ] Mesmo webhook recebido duas vezes não duplica confirmação.
  - [ ] Mesmo pagamento aprovado duas vezes não gera duas inscrições.
- [ ] Registrar logs técnicos.
  - [ ] ID da inscrição.
  - [ ] ID do pagamento.
  - [ ] Status anterior.
  - [ ] Status novo.
  - [ ] Payload resumido.
  - [ ] Data/hora.
- [ ] Criar trilha de auditoria para ajustes manuais.
- [ ] Mascarar dados sensíveis em logs.

### Erros comuns

- [ ] Credencial de produção usada em desenvolvimento.
- [ ] Credencial de teste publicada em produção.
- [ ] Atualização de inscrição feita pelo frontend.
- [ ] Falta de validação do valor pago.
- [ ] Webhook lento ou com processamento pesado.
- [ ] Falta de tratamento para pagamento pendente.
- [ ] Falta de rotina para inscrições expiradas.

## 7. Testes Antes de Ir Para Produção

- [ ] Testar criação de inscrição com pagamento.
- [ ] Testar pagamento aprovado com cartão.
- [ ] Testar pagamento recusado.
- [ ] Testar pagamento pendente.
- [ ] Testar Pix, se habilitado.
- [ ] Testar boleto, se habilitado.
- [ ] Testar usuário fechando a aba antes do retorno.
- [ ] Testar retorno de sucesso sem webhook imediato.
- [ ] Testar webhook chegando antes do retorno do usuário.
- [ ] Testar webhook duplicado.
- [ ] Testar pagamento com valor divergente.
- [ ] Testar inscrição inexistente.
- [ ] Testar inscrição já paga.
- [ ] Testar evento com vagas esgotadas.
- [ ] Testar tentativa de pagamento após expiração da inscrição.
- [ ] Testar falha de comunicação com Mercado Pago.
- [ ] Testar tela administrativa de acompanhamento.
- [ ] Testar logs de erro.
- [ ] Testar envio de confirmação ao participante.
- [ ] Testar conciliação entre pagamento Mercado Pago e banco local.

### Critérios de aceite

- [ ] Pagamento aprovado confirma inscrição automaticamente.
- [ ] Pagamento recusado não confirma inscrição.
- [ ] Pagamento pendente não confirma inscrição antes da aprovação.
- [ ] Webhook duplicado não causa efeito duplicado.
- [ ] Valor divergente bloqueia confirmação automática.
- [ ] Logs permitem rastrear uma transação ponta a ponta.
- [ ] Administrador consegue identificar inscrições com problema.

## 8. Publicação e Monitoramento Pós-Implantação

- [ ] Configurar credenciais de produção.
- [ ] Configurar URL produtiva de webhook com HTTPS.
- [ ] Conferir variáveis de ambiente no ambiente produtivo.
- [ ] Fazer deploy da integração.
- [ ] Realizar pagamento real de baixo valor.
- [ ] Confirmar recebimento do webhook em produção.
- [ ] Confirmar atualização automática da inscrição.
- [ ] Confirmar que o usuário visualiza o status correto.
- [ ] Confirmar que logs foram gerados.
- [ ] Monitorar primeiros pagamentos reais.
- [ ] Criar alerta para webhooks com erro.
- [ ] Criar alerta para pagamentos aprovados sem inscrição confirmada.
- [ ] Criar rotina de conciliação diária.
- [ ] Revisar inscrições pendentes antigas.
- [ ] Documentar procedimento de suporte.
- [ ] Documentar procedimento de correção manual.

### Recomendações para reduzir riscos

- [ ] Publicar primeiro com um evento controlado ou inscrição de teste.
- [ ] Manter feature flag para ativar/desativar pagamento online.
- [ ] Ter plano de rollback.
- [ ] Manter logs detalhados nos primeiros dias.
- [ ] Validar diariamente pagamentos aprovados no Mercado Pago contra inscrições pagas no sistema.
- [ ] Evitar mudanças simultâneas em preço, inscrição e pagamento durante o lançamento.

## 9. Checklist Final de Go-Live

- [ ] Credenciais de produção configuradas.
- [ ] Credenciais de teste removidas do ambiente produtivo.
- [ ] Webhook produtivo configurado.
- [ ] HTTPS ativo.
- [ ] Pagamento aprovado testado.
- [ ] Pagamento recusado testado.
- [ ] Pagamento pendente testado.
- [ ] Idempotência validada.
- [ ] Logs validados.
- [ ] Painel administrativo validado.
- [ ] Processo de suporte definido.
- [ ] Responsável pelo monitoramento definido.
- [ ] Responsável por correções emergenciais definido.
