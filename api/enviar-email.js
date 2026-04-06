import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import process from "node:process";

   const ses = new SESClient({
     region: process.env.AWS_REGION || 'us-east-1',
     credentials: {
       accessKeyId: process.env.AWS_ACCESS_KEY_ID,
       secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
     }
   });

   export default async function handler(req, res) {
     // CORS full (preflight + redirect)
     res.setHeader('Access-Control-Allow-Origin', '*');  // Mude para 'https://www.myplacar.app.br' em prod
     res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
     res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
     res.setHeader('Access-Control-Max-Age', '86400');

     if (req.method === 'OPTIONS') return res.status(204).end();

     if (req.method !== 'POST') return res.status(405).json({ error: 'POST apenas' });

     const { to, subject, html, text } = req.body || {};

     const params = {
       Source: 'no-reply@myplacar.app.br',
       Destination: { ToAddresses: [to] },
       Message: {
         Subject: { Data: subject || 'Teste' },
         Body: { Html: { Data: html || '<h1>Teste</h1>' }, Text: { Data: text || 'Teste' } }
       },
       ReplyToAddresses: ['celso@myplacar.app.br']
     };

     try {
       const command = new SendEmailCommand(params);
       const result = await ses.send(command);

       // Log para monitor (Vercel Logs + SES Console para bounces/DMARC)
       console.log(`DMARC Monitor: Enviado para ${to} | MessageId: ${result.MessageId}`);

       res.status(200).json({ success: true, messageId: result.MessageId });
     } catch (err) {
	   console.error(`DMARC Monitor Erro: ${err.message}`);
       res.status(500).json({ error: err.message });
     }
   }