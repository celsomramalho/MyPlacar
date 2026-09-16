export interface PixPaymentResult {
  paymentId: string;
  status: string;
  qrCode: string;
  qrCodeBase64?: string;
  amount: number;
  expiresAt: string;
  externalReference: string;
}

export interface PixPaymentStatusResult {
  paymentId: string;
  status: string;
  paymentStatus: string;
}

export const createMercadoPagoPixPayment = async ({
  eventPin,
  entryEmail,
}: {
  eventPin: string;
  entryEmail: string;
}): Promise<PixPaymentResult> => {
  const deviceId =
    typeof window !== 'undefined'
      ? (window as unknown as { MP_DEVICE_SESSION_ID?: string }).MP_DEVICE_SESSION_ID || undefined
      : undefined;

  const response = await fetch('/api/mercadopago-create-preference', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventPin, entryEmail, deviceId }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || 'Não foi possível iniciar o pagamento Pix.');
  }

  return body as PixPaymentResult;
};

export const getMercadoPagoPaymentStatus = async ({
  paymentId,
  eventPin,
  email,
}: {
  paymentId: string;
  eventPin: string;
  email: string;
}): Promise<PixPaymentStatusResult> => {
  const params = new URLSearchParams({ paymentId, eventPin, email });
  const response = await fetch(`/api/mercadopago-payment-status?${params}`);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || 'Erro ao consultar status do pagamento.');
  }
  return body as PixPaymentStatusResult;
};

// Mantém compatibilidade com código que ainda usa o nome antigo
export const createMercadoPagoPreference = createMercadoPagoPixPayment;
