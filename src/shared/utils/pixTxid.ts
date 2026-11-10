/**
 * pixTxid.ts
 *
 * Gerador de identificador de transação (txid) para o Pix Estático do MyPlacar.
 *
 * Formato:  <eventPin>I<registrationId4>P<seq>
 * Exemplo:  1super8peleI0001P1  (1º pagamento),  1super8peleI0001P2  (2º pagamento)
 *
 * Regras do Banco Central do Brasil:
 * - O txid aceita ESTRITAMENTE caracteres alfanuméricos: [a-zA-Z0-9].
 * - Caracteres como underline (_), hífen (-) ou espaços são PROIBIDOS pelo BCB e causam "QR Code inválido".
 * - Limite máximo: 25 caracteres no Pix Estático.
 * - Usamos os prefixos "I" (Inscrição) e "P" (Pagamento) para separar os blocos com máxima legibilidade.
 */

import { sanitizePixTxid } from './pixBrCode';

export interface BuildPixTxidParams {
  /** PIN do evento (ex: "1super8pele"). */
  eventPin: string;
  /** ID numérico da inscrição (ex: 1 → "0001"). */
  registrationId: number | string | null | undefined;
  /**
   * Número de pagamentos já registrados no histórico `payments[]` da inscrição.
   * O seq gerado será payments.length + 1.
   * Ex: 0 → P1 (primeiro pagamento), 1 → P2 (segundo pagamento), etc.
   */
  paymentsCount: number;
}

/**
 * Gera o txid para identificar a cobrança Pix no extrato bancário.
 *
 * Exemplo de saída:
 * - eventPin="1super8pele", registrationId=1, paymentsCount=0  → "1super8peleI0001P1"
 * - eventPin="1super8pele", registrationId=1, paymentsCount=1  → "1super8peleI0001P2"
 */
export function buildPixTxid({
  eventPin,
  registrationId,
  paymentsCount,
}: BuildPixTxidParams): string {
  const seq = (paymentsCount ?? 0) + 1;
  const numId = Number(registrationId);
  const regId = String(!isNaN(numId) && numId > 0 ? numId : 1).padStart(4, '0');
  const suffix = `I${regId}P${seq}`;

  // Garante que o PIN não estoure os 25 chars junto com o sufixo
  const maxPinLen = Math.max(1, 25 - suffix.length);
  const cleanPin = eventPin
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .substring(0, maxPinLen);

  return sanitizePixTxid(`${cleanPin}${suffix}`);
}
