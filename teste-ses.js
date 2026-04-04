   import 'dotenv/config';
   import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

   const ses = new SESClient({ 
     region: 'us-east-1',
     credentials: {  // Hardcode aqui para teste
       accessKeyId: 'AKIA5KZXBEBYHTYAJC7G',  // Sua Access Key ID
       secretAccessKey: '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'  // Sua Secret
     }
   });
   
async function testeEnvio() {
  const params = {
    Source: 'no-reply@myplacar.app.br',
    Destination: { ToAddresses: ['seu-email-verificado@gmail.com'] },
    Message: {
      Subject: { Data: 'Teste SES MyPlacar' },
      Body: {
        Html: { Data: '<h1>Teste enviado com sucesso!</h1><p>Placar pronto.</p>' },
        Text: { Data: 'Teste enviado com sucesso! Placar pronto.' }
      }
    }
  };

  try {
    const command = new SendEmailCommand(params);
    const result = await ses.send(command);
    console.log('✅ Enviado! MessageId:', result.MessageId);
  } catch (err) {
    console.error('❌ Erro:', err.message);
  }
}

testeEnvio();