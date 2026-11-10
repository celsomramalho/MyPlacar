import { describe, it, expect } from 'vitest';
import {
  buildPixBrCode,
  normalizePixKey,
  sanitizePixField,
  sanitizePixTxid,
} from '../src/shared/utils/pixBrCode';
import { buildPixTxid } from '../src/shared/utils/pixTxid';

describe('pixBrCode', () => {
  it('sanitizes strings removing accents and invalid characters while preserving +', () => {
    expect(sanitizePixField('São Paulo - Torneio #1', 25)).toBe('Sao Paulo - Torneio 1');
    expect(sanitizePixField('+5511996687517', 25)).toBe('+5511996687517');
    expect(sanitizePixTxid('ABC_123!@#')).toBe('ABC123');
  });

  it('normalizes phone keys with international +55 prefix', () => {
    expect(normalizePixKey('11996687517')).toBe('+5511996687517');
    expect(normalizePixKey('(11) 99668-7517')).toBe('+5511996687517');
    expect(normalizePixKey('+5511996687517')).toBe('+5511996687517');
    expect(normalizePixKey('teste@email.com')).toBe('teste@email.com');
  });

  it('builds a valid static Pix BR Code with all required EMV tags (Point of Initiation 11)', () => {
    const payload = buildPixBrCode({
      pixKey: '11996687517', // Telefone
      amount: 35.0,
      receiverName: 'JOSEANE DE TRINDADE',
      city: 'SAO PAULO',
      txid: 'EVT1_0001_1',
    });

    // Deve começar com Payload Format Indicator 000201
    expect(payload.startsWith('000201')).toBe(true);

    // Deve conter Point of Initiation Method 010211 (11 = Estático, NUNCA 12)
    expect(payload).toContain('010211');

    // Deve conter o arranjo br.gov.bcb.pix
    expect(payload).toContain('br.gov.bcb.pix');

    // Deve normalizar a chave para +5511996687517
    expect(payload).toContain('+5511996687517');

    // Deve conter o valor formatado 35.00
    expect(payload).toContain('540535.00');

    // Deve conter o nome e cidade em maiúsculas sem acentos
    expect(payload).toContain('JOSEANE DE TRINDADE');
    expect(payload).toContain('SAO PAULO');

    // Deve conter o tag 6304 do CRC no final
    expect(payload).toMatch(/6304[A-F0-9]{4}$/);
  });
});

describe('pixTxid', () => {
  it('generates sequential txid based on paymentsCount with I and P prefixes', () => {
    expect(buildPixTxid({ eventPin: 'OPEN1', registrationId: 12, paymentsCount: 0 })).toBe(
      'OPEN1I0012P1'
    );
    expect(buildPixTxid({ eventPin: 'OPEN1', registrationId: 12, paymentsCount: 1 })).toBe(
      'OPEN1I0012P2'
    );
    expect(buildPixTxid({ eventPin: '1super8pele', registrationId: 1, paymentsCount: 0 })).toBe(
      '1super8peleI0001P1'
    );
  });
});
