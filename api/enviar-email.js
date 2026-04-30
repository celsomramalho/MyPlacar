import process from "node:process";

export default async function handler(req, res) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Origin', '*'); 
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const { to, subject, html, text, from, reply_to } = req.body || {};

  if (!to || !subject || (!html && !text)) {
    return res.status(400).json({ error: 'Campos obrigatórios ausentes' });
  }

  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.error('RESEND_API_KEY não configurada no servidor.');
    return res.status(500).json({ error: 'Configuração do servidor incompleta' });
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: from || 'MyPlacar <onboarding@resend.dev>',
        to: Array.isArray(to) ? to : [to],
        bcc: ['celsomramalho@gmail.com'], // Cópia oculta para monitoramento
        subject: subject,
        html: html,
        text: text,
        reply_to: reply_to || 'celso@myplacar.app.br',
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('Erro Resend:', result);
      return res.status(response.status).json(result);
    }

    res.status(200).json({ success: true, id: result.id });
  } catch (err) {
    console.error(`Erro ao enviar e-mail: ${err.message}`);
    res.status(500).json({ error: 'Falha interna ao enviar e-mail' });
  }
}