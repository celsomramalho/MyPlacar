/**
 * Hook: useRegistrationPayment
 *
 * Abstrai e encapsula o fluxo de checkout e pagamentos de inscrição:
 *   1. Geração de cobrança Pix via Mercado Pago (com QR Code e Copia-e-Cola).
 *   2. Polling seguro de verificação de status com cleanup automático no unmount.
 *   3. Disparo do feedback sonoro de sucesso ao aprovar o Pix.
 *   4. Gerenciamento de comprovantes para pagamento manual (transferência bancária).
 *
 * @see docs/PLANO_REFATORACAO_INSCRICOES_TORNEIO.md — Fase 3
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  createMercadoPagoPixPayment,
  getMercadoPagoPaymentStatus,
  type PixPaymentResult,
} from '@modules/events/services/mercadoPagoCheckout';
import { playPaymentSuccessSound } from '@shared/utils/soundEffects';

export interface PixCheckoutData {
  paymentId?: string;
  qrCode?: string;
  qrCodeBase64?: string;
  ticketUrl?: string;
  expiresAt?: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
}

export interface UseRegistrationPaymentOptions {
  eventPin: string;
  payerEmail: string;
  payerName: string;
  dueAmount: number;
  onPaymentApproved?: () => void;
  pollingIntervalMs?: number;
}

export interface UseRegistrationPaymentResult {
  pixData: PixCheckoutData | null;
  isCreatingPix: boolean;
  pixError: string | null;
  isApproved: boolean;
  createPix: () => Promise<void>;
  cancelPix: () => void;
  manualReceiptFile: File | null;
  setManualReceiptFile: (file: File | null) => void;
}

export function useRegistrationPayment({
  eventPin,
  payerEmail,
  payerName,
  dueAmount,
  onPaymentApproved,
  pollingIntervalMs = 5000,
}: UseRegistrationPaymentOptions): UseRegistrationPaymentResult {
  const [pixData, setPixData] = useState<PixCheckoutData | null>(null);
  const [isCreatingPix, setIsCreatingPix] = useState(false);
  const [pixError, setPixError] = useState<string | null>(null);
  const [isApproved, setIsApproved] = useState(false);
  const [manualReceiptFile, setManualReceiptFile] = useState<File | null>(null);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isApprovedRef = useRef(false);

  // ─── Limpeza do Polling ───────────────────────────────────────────────────
  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  // ─── Criar Cobrança Pix ────────────────────────────────────────────────────
  const createPix = useCallback(async () => {
    if (dueAmount <= 0) return;
    setIsCreatingPix(true);
    setPixError(null);

    try {
      const result: PixPaymentResult = await createMercadoPagoPixPayment({
        eventPin,
        entryEmail: payerEmail,
      });

      if (!result.qrCode) {
        throw new Error('Falha ao gerar QR Code Pix');
      }

      const checkout: PixCheckoutData = {
        paymentId: result.paymentId,
        qrCode: result.qrCode,
        qrCodeBase64: result.qrCodeBase64,
        expiresAt: result.expiresAt,
        amount: result.amount || dueAmount,
        status: (result.status as PixCheckoutData['status']) || 'pending',
      };

      setPixData(checkout);

      // Inicia o polling de verificação de aprovação se houver paymentId
      if (result.paymentId) {
        stopPolling();
        pollIntervalRef.current = setInterval(async () => {
          if (isApprovedRef.current) return;
          try {
            const statusResult = await getMercadoPagoPaymentStatus({
              paymentId: result.paymentId,
              eventPin,
              email: payerEmail,
            });
            if (statusResult.paymentStatus === 'approved' || statusResult.status === 'approved') {
              isApprovedRef.current = true;
              setIsApproved(true);
              setPixData((prev) => (prev ? { ...prev, status: 'approved' } : null));
              stopPolling();
              try { playPaymentSuccessSound(); } catch {}
              onPaymentApproved?.();
            }
          } catch (pollErr) {
            console.warn('[useRegistrationPayment] Erro no polling de status:', pollErr);
          }
        }, pollingIntervalMs);
      }
    } catch (err: any) {
      console.error('[useRegistrationPayment] Erro ao criar Pix:', err);
      setPixError(err.message || 'Erro ao gerar Pix');
    } finally {
      setIsCreatingPix(false);
    }
  }, [dueAmount, eventPin, payerEmail, onPaymentApproved, pollingIntervalMs, stopPolling]);

  const cancelPix = useCallback(() => {
    stopPolling();
    setPixData(null);
    setPixError(null);
    setIsApproved(false);
    isApprovedRef.current = false;
  }, [stopPolling]);

  return {
    pixData,
    isCreatingPix,
    pixError,
    isApproved,
    createPix,
    cancelPix,
    manualReceiptFile,
    setManualReceiptFile,
  };
}
