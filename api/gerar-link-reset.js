import process from "node:process";
import admin from "firebase-admin";

// Inicializa o Firebase Admin se ainda não foi inicializado
if (!admin.apps.length) {
  try {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!serviceAccountJson) {
      throw new Error("A variável de ambiente FIREBASE_SERVICE_ACCOUNT não está configurada.");
    }
    
    const serviceAccount = JSON.parse(serviceAccountJson);
    
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  } catch (error) {
    console.error("Erro ao inicializar Firebase Admin:", error);
  }
}

export default async function handler(req, res) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Origin', '*'); 
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const { email, continueUrl } = req.body || {};

  if (!email) {
    return res.status(400).json({ error: 'O e-mail é obrigatório' });
  }

  if (!admin.apps.length) {
    return res.status(500).json({ error: 'Firebase Admin não inicializado corretamente no servidor' });
  }

  try {
    // Definimos a Action Code Settings (opcional, mas recomendado para direcionar a volta)
    const actionCodeSettings = continueUrl ? {
      url: continueUrl,
      handleCodeInApp: true,
    } : undefined;

    // O Firebase pode gerar o link com o domínio errado dependendo da configuração no Console (Action URL).
    // Para evitar isso, extraímos apenas o token (oobCode) e montamos nosso próprio link limpo.
    const rawLink = await admin.auth().generatePasswordResetLink(email, actionCodeSettings);
    
    const urlObj = new URL(rawLink);
    const oobCode = urlObj.searchParams.get('oobCode');

    let finalLink = rawLink;
    if (oobCode && continueUrl) {
      const separator = continueUrl.includes('?') ? '&' : '?';
      finalLink = `${continueUrl}${separator}oobCode=${oobCode}`;
    } else if (oobCode) {
      finalLink = `https://www.myplacar.app.br/?mode=resetPassword&oobCode=${oobCode}&email=${encodeURIComponent(email)}`;
    }

    res.status(200).json({ success: true, link: finalLink });
  } catch (err) {
    console.error(`Erro ao gerar link de reset: ${err.message}`);
    res.status(500).json({ error: 'Falha interna ao gerar link de reset' });
  }
}
