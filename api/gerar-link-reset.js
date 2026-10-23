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
    // Verifica se o usuário existe no Firebase Auth.
    // Usuários antigos que só usavam PIN existem apenas no Firestore e precisam
    // ter a conta criada no Firebase Auth antes de receber o link de reset.
    try {
      await admin.auth().getUserByEmail(email);
    } catch (notFoundErr) {
      if (notFoundErr.code === 'auth/user-not-found') {
        // Cria a conta no Firebase Auth sem senha — o usuário vai definir
        // a primeira senha clicando no link de redefinição.
        await admin.auth().createUser({
          email: email,
          emailVerified: true,
        });
        console.log(`Conta Firebase Auth criada para usuário antigo de PIN: ${email}`);
      } else {
        throw notFoundErr;
      }
    }

    // Gera o link de reset sem actionCodeSettings para garantir que o rawLink
    // contenha o oobCode diretamente nos query params, sem passar por Firebase
    // Dynamic Links ou Firebase Hosting redirect que podem remover o oobCode.
    const rawLink = await admin.auth().generatePasswordResetLink(email);

    // Extrai o oobCode do link gerado pelo Firebase Admin
    let oobCode = null;
    try {
      const urlObj = new URL(rawLink);
      oobCode = urlObj.searchParams.get('oobCode');

      // Caso o rawLink seja um link do Firebase Hosting (__/auth/action),
      // o oobCode já estará em searchParams diretamente.
      if (!oobCode) {
        // Tenta extrair de continueUrl aninhado, se existir
        const nested = urlObj.searchParams.get('continueUrl');
        if (nested) {
          oobCode = new URL(nested).searchParams.get('oobCode');
        }
      }
    } catch (parseErr) {
      console.error(`Erro ao parsear rawLink: ${parseErr.message}`);
    }

    if (!oobCode) {
      console.error(`oobCode não encontrado no rawLink: ${rawLink}`);
      return res.status(500).json({ error: 'Não foi possível extrair o código de redefinição.' });
    }

    // Monta o link final apontando diretamente para o app com os parâmetros necessários.
    // Isso evita qualquer redirect intermediário do Firebase que poderia remover o oobCode.
    const baseUrl = continueUrl
      ? continueUrl.split('?')[0]                  // usa apenas a origem do continueUrl
      : 'https://www.myplacar.app.br/';

    const finalUrl = new URL(baseUrl);
    finalUrl.searchParams.set('mode', 'resetPassword');
    finalUrl.searchParams.set('oobCode', oobCode);
    finalUrl.searchParams.set('email', email.toLowerCase().trim());

    res.status(200).json({ success: true, link: finalUrl.toString() });
  } catch (err) {
    console.error(`Erro ao gerar link de reset: ${err.message}`);
    res.status(500).json({ error: 'Falha interna ao gerar link de reset' });
  }
}
