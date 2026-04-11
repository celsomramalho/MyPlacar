import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

// Credenciais via variáveis de ambiente do Vercel
const ses = new SESClient({
  region: import.meta.env.VITE_AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId:     import.meta.env.VITE_AWS_ACCESS_KEY_ID,
    secretAccessKey: import.meta.env.VITE_AWS_SECRET_ACCESS_KEY,
  },
});

const FROM = 'MyPlacar <no-reply@myplacar.app.br>';
const REPLY_TO = 'suporte@myplacar.app.br';

// ─── Templates ───────────────────────────────────────────────────────────────

const buildVerificationEmail = (params: {
  to_name: string;
  pin_code: string;
  confirmation_link: string;
  app_access_link: string;
}): { subject: string; html: string; text: string } => ({
  subject: 'Confirme seu cadastro - MyPlacar',
  html: `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#fff">
      <img src="${params.app_access_link}/logo192.png" width="48" alt="MyPlacar" style="margin-bottom:24px"/>
      <h2 style="color:#1e3a5f;margin:0 0 8px">Olá, ${params.to_name}!</h2>
      <p style="color:#444;margin:0 0 24px">Para confirmar seu cadastro, use o código abaixo ou clique no botão.</p>
      <div style="background:#f4f7fb;border-radius:12px;padding:20px;text-align:center;margin-bottom:24px">
        <span style="font-size:36px;font-weight:900;letter-spacing:10px;color:#1e3a5f">${params.pin_code}</span>
        <p style="color:#888;margin:8px 0 0;font-size:13px">Válido por 30 minutos</p>
      </div>
      <a href="${params.confirmation_link}"
         style="display:block;background:#2563eb;color:#fff;text-decoration:none;border-radius:10px;padding:14px;text-align:center;font-weight:700;font-size:16px;margin-bottom:24px">
        Confirmar meu cadastro
      </a>
      <p style="color:#aaa;font-size:12px;margin:0">Se você não solicitou este cadastro, ignore este e-mail.</p>
    </div>
  `,
  text: `Olá, ${params.to_name}!\n\nSeu código de verificação: ${params.pin_code}\n\nOu acesse: ${params.confirmation_link}\n\nVálido por 30 minutos.`,
});

const buildWelcomeEmail = (params: {
  to_name: string;
  pin_code: string;
  app_access_link: string;
}): { subject: string; html: string; text: string } => ({
  subject: 'Seu PIN de acesso - MyPlacar',
  html: `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#fff">
      <img src="${params.app_access_link}/logo192.png" width="48" alt="MyPlacar" style="margin-bottom:24px"/>
      <h2 style="color:#1e3a5f;margin:0 0 8px">Bem-vindo, ${params.to_name}! 🎾</h2>
      <p style="color:#444;margin:0 0 24px">Seu cadastro foi confirmado. Guarde seu PIN de acesso:</p>
      <div style="background:#f4f7fb;border-radius:12px;padding:20px;text-align:center;margin-bottom:24px">
        <span style="font-size:36px;font-weight:900;letter-spacing:10px;color:#1e3a5f">${params.pin_code}</span>
        <p style="color:#888;margin:8px 0 0;font-size:13px">Seu identificador único no MyPlacar</p>
      </div>
      <a href="${params.app_access_link}"
         style="display:block;background:#2563eb;color:#fff;text-decoration:none;border-radius:10px;padding:14px;text-align:center;font-weight:700;font-size:16px;margin-bottom:24px">
        Acessar o MyPlacar
      </a>
      <p style="color:#aaa;font-size:12px;margin:0">Este PIN é pessoal e intransferível. Não compartilhe com ninguém.</p>
    </div>
  `,
  text: `Bem-vindo, ${params.to_name}!\n\nSeu PIN de acesso: ${params.pin_code}\n\nAcesse: ${params.app_access_link}`,
});

const buildRecoveryEmail = (params: {
  to_name: string;
  pin_code?: string;
  reset_link?: string;
  app_access_link: string;
}): { subject: string; html: string; text: string } => {
  // Usuário com senha → envia link de reset
  if (params.reset_link) {
    return {
      subject: 'Redefinição de senha - MyPlacar',
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#fff">
          <img src="${params.app_access_link}/logo192.png" width="48" alt="MyPlacar" style="margin-bottom:24px"/>
          <h2 style="color:#1e3a5f;margin:0 0 8px">Olá, ${params.to_name}!</h2>
          <p style="color:#444;margin:0 0 24px">Recebemos uma solicitação para redefinir sua senha. Clique no botão abaixo:</p>
          <a href="${params.reset_link}"
             style="display:block;background:#2563eb;color:#fff;text-decoration:none;border-radius:10px;padding:14px;text-align:center;font-weight:700;font-size:16px;margin-bottom:24px">
            Redefinir minha senha
          </a>
          <p style="color:#888;font-size:13px;margin:0 0 16px">O link expira em 1 hora.</p>
          <p style="color:#aaa;font-size:12px;margin:0">Se você não solicitou isso, ignore este e-mail — sua senha permanece a mesma.</p>
        </div>
      `,
      text: `Olá, ${params.to_name}!\n\nLink para redefinir sua senha:\n${params.reset_link}\n\nExpira em 1 hora.`,
    };
  }
  // Usuário com PIN → envia o PIN
  return {
    subject: 'Recuperação de acesso - MyPlacar',
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#fff">
        <img src="${params.app_access_link}/logo192.png" width="48" alt="MyPlacar" style="margin-bottom:24px"/>
        <h2 style="color:#1e3a5f;margin:0 0 8px">Olá, ${params.to_name}!</h2>
        <p style="color:#444;margin:0 0 24px">Seu PIN de acesso ao MyPlacar:</p>
        <div style="background:#f4f7fb;border-radius:12px;padding:20px;text-align:center;margin-bottom:24px">
          <span style="font-size:36px;font-weight:900;letter-spacing:10px;color:#1e3a5f">${params.pin_code}</span>
        </div>
        <a href="${params.app_access_link}"
           style="display:block;background:#2563eb;color:#fff;text-decoration:none;border-radius:10px;padding:14px;text-align:center;font-weight:700;font-size:16px;margin-bottom:24px">
          Acessar o MyPlacar
        </a>
        <p style="color:#aaa;font-size:12px;margin:0">Se você não solicitou isso, ignore este e-mail.</p>
      </div>
    `,
    text: `Olá, ${params.to_name}!\n\nSeu PIN de acesso: ${params.pin_code}\n\nAcesse: ${params.app_access_link}`,
  };
};

// ─── Função principal ─────────────────────────────────────────────────────────

type EmailTemplate = 'verification' | 'welcome' | 'recovery';

type TemplateParams = {
  verification: {
    to_name: string;
    email: string;
    pin_code: string;
    confirmation_link: string;
    app_access_link: string;
  };
  welcome: {
    to_name: string;
    email: string;
    pin_code: string;
    app_access_link: string;
  };
  recovery: {
    to_name: string;
    email: string;
    pin_code?: string;
    reset_link?: string;
    app_access_link: string;
  };
};

export const emailService = {
  sendEmail: async <T extends EmailTemplate>(
    template: T,
    params: TemplateParams[T]
  ): Promise<boolean> => {
    try {
      let content: { subject: string; html: string; text: string };

      if (template === 'verification') {
        content = buildVerificationEmail(params as TemplateParams['verification']);
      } else if (template === 'welcome') {
        content = buildWelcomeEmail(params as TemplateParams['welcome']);
      } else {
        content = buildRecoveryEmail(params as TemplateParams['recovery']);
      }

      const command = new SendEmailCommand({
        Source: FROM,
        ReplyToAddresses: [REPLY_TO],
        Destination: { ToAddresses: [(params as { email: string }).email] },
        Message: {
          Subject: { Data: content.subject, Charset: 'UTF-8' },
          Body: {
            Html: { Data: content.html, Charset: 'UTF-8' },
            Text: { Data: content.text, Charset: 'UTF-8' },
          },
        },
      });

      await ses.send(command);
      return true;
    } catch (error) {
      console.error('[emailService] Erro ao enviar via SES:', error);
      return false;
    }
  },
};
