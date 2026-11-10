/**
 * pixBrCode.ts
 *
 * Utilitário para geração do Pix Copia e Cola (BR Code / EMV® QR Code)
 * seguindo estritamente a especificação do Banco Central do Brasil.
 *
 * Referência: Manual de Padrões para Iniciação do Pix (BACEN)
 * https://www.bcb.gov.br/estabilidadefinanceira/pix
 */

/** Valida se 11 dígitos formam um CPF matematicamente válido. */
function isValidCpf(digits: string): boolean {
  if (digits.length !== 11 || /^(\d)\1+$/.test(digits)) return false;
  let sum = 0;
  let rest: number;
  for (let i = 1; i <= 9; i++) sum += parseInt(digits[i - 1], 10) * (11 - i);
  rest = (sum * 10) % 11;
  if (rest === 10 || rest === 11) rest = 0;
  if (rest !== parseInt(digits[9], 10)) return false;
  sum = 0;
  for (let i = 1; i <= 10; i++) sum += parseInt(digits[i - 1], 10) * (12 - i);
  rest = (sum * 10) % 11;
  if (rest === 10 || rest === 11) rest = 0;
  return rest === parseInt(digits[10], 10);
}

/**
 * Normaliza a chave Pix para o padrão exigido pelo DICT / Banco Central:
 * - Telefone: obrigatório formato internacional +55 (ex: +5511996687517)
 * - CPF: apenas números (11 dígitos)
 * - CNPJ: apenas números (14 dígitos)
 * - E-mail: minúsculas sem espaços
 * - Chave aleatória (EVP): formato UUID em minúsculas
 */
export function normalizePixKey(key: string): string {
  const trimmed = key.trim();

  // E-mail
  if (trimmed.includes('@')) {
    return trimmed.toLowerCase();
  }

  // Chave Aleatória / EVP (UUID)
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed);
  if (isUuid) {
    return trimmed.toLowerCase();
  }

  const digitsOnly = trimmed.replace(/\D/g, '');

  // Telefone que já começa com +55
  if (trimmed.startsWith('+55') && digitsOnly.length >= 12) {
    return `+${digitsOnly}`;
  }

  // CNPJ (14 dígitos)
  if (digitsOnly.length === 14) {
    return digitsOnly;
  }

  // 11 dígitos: diferenciar Celular de CPF
  if (digitsOnly.length === 11) {
    // Se foi digitado com máscara de telefone (ex: (11) 9...) ou não é CPF válido e o 3º dígito é 9
    const isLikelyPhone = trimmed.includes('(') || trimmed.includes('-') || !isValidCpf(digitsOnly);
    if (isLikelyPhone && digitsOnly[2] === '9') {
      return `+55${digitsOnly}`;
    }
    return digitsOnly;
  }

  // 10 dígitos (DDD + fixo)
  if (digitsOnly.length === 10) {
    return `+55${digitsOnly}`;
  }

  return trimmed;
}

/** Sanitiza uma string para campos EMV: sem acentos, chars válidos, tamanho limitado. */
export function sanitizePixField(value: string, maxLength: number): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .replace(/[^a-zA-Z0-9 @._\-+/]/g, '') // Mantém chars válidos EMV incluindo '+'
    .trim()
    .substring(0, maxLength);
}

/** Sanitiza o txid: estritamente alfanumérico [a-zA-Z0-9] conforme regex oficial do Banco Central. */
export function sanitizePixTxid(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .substring(0, 25) || '***';
}

/** Formata um campo EMV: ID (2 dígitos) + tamanho (2 dígitos) + valor. */
function emvField(id: string, value: string): string {
  const len = String(value.length).padStart(2, '0');
  return `${id}${len}${value}`;
}

/** Calcula o CRC16-CCITT (polinômio 0x1021, init 0xFFFF) exigido pelo padrão BR Code do BCB. */
function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export interface BuildPixBrCodeParams {
  /** Chave Pix do recebedor (CPF, CNPJ, e-mail, telefone ou chave aleatória). */
  pixKey: string;
  /** Valor da transação em reais (ex: 25.00). Se 0 ou omitido, valor livre. */
  amount?: number;
  /** Nome do recebedor — sanitizado e truncado em 25 chars. */
  receiverName: string;
  /** Cidade do recebedor — sanitizada e truncada em 15 chars. */
  city: string;
  /**
   * Identificador da transação (txid) — apenas letras e números, máx 25 chars.
   * Se omitido, usa '***' (Pix estático genérico).
   */
  txid?: string;
}

/**
 * Gera a string do Pix Copia e Cola (BR Code) conforme o padrão EMV® do Banco Central.
 */
export function buildPixBrCode({
  pixKey,
  amount,
  receiverName,
  city,
  txid,
}: BuildPixBrCodeParams): string {
  // ── Sanitização e normalização ───────────────────────────────────────────
  const cleanKey = normalizePixKey(pixKey);
  const cleanName = sanitizePixField(receiverName, 25).toUpperCase();
  const cleanCity = sanitizePixField(city, 15).toUpperCase();
  const cleanTxid = txid ? sanitizePixTxid(txid) : '***';

  // ── Campo 26 — Merchant Account Information (GUI + chave Pix) ─────────────
  // No Pix Estático, a tag 26 contém estritamente o arranjo (00) e a chave (01)
  // para garantir compatibilidade com todos os aplicativos bancários (Itaú, Nubank, etc).
  const gui = emvField('00', 'br.gov.bcb.pix');
  const keyField = emvField('01', cleanKey);
  const merchantAccount = emvField('26', gui + keyField);

  // ── Campo 62 — Additional Data Field Template (txid) ──────────────────────
  const txidField = emvField('05', cleanTxid);
  const additionalData = emvField('62', txidField);

  // ── Montagem do payload ──────────────────────────────────────────────────
  // Padrão BACEN BR Code Estático:
  // 00: 01 (versão)
  // 01: 11 (11 = Estático. NUNCA usar 12, pois 12 indica Dinâmico e exige URL)
  // 26: Merchant Account Information
  // 52: 0000 (Merchant Category Code)
  // 53: 986 (BRL)
  // 54: Valor (opcional)
  // 58: BR (País)
  // 59: Nome do recebedor (máx 25)
  // 60: Cidade do recebedor (máx 15)
  // 62: Dados adicionais (txid)
  // 6304: Prefixo do CRC16
  const payloadWithoutCrc = [
    emvField('00', '01'),
    emvField('01', '11'),           // 11 = Estático (multiuso)
    merchantAccount,
    emvField('52', '0000'),
    emvField('53', '986'),
    amount && amount > 0 ? emvField('54', amount.toFixed(2)) : '',
    emvField('58', 'BR'),
    emvField('59', cleanName),
    emvField('60', cleanCity),
    additionalData,
    '6304',
  ].join('');

  // ── Cálculo e concatenação do CRC16 ───────────────────────────────────────
  return payloadWithoutCrc + crc16(payloadWithoutCrc);
}
