interface CreateMercadoPagoPreferenceInput {
  eventPin: string;
  entryEmail: string;
}

interface CreateMercadoPagoPreferenceResult {
  preferenceId: string;
  initPoint: string;
  sandboxInitPoint?: string;
  amount: number;
  externalReference: string;
}

export const createMercadoPagoPreference = async ({
  eventPin,
  entryEmail,
}: CreateMercadoPagoPreferenceInput): Promise<CreateMercadoPagoPreferenceResult> => {
  const response = await fetch('/api/mercadopago-create-preference', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventPin, entryEmail }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || 'Não foi possível iniciar o pagamento.');
  }

  return body as CreateMercadoPagoPreferenceResult;
};

