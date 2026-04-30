const FROM = import.meta.env.VITE_RESEND_FROM || 'MyPlacar <onboarding@resend.dev>';
const REPLY_TO = import.meta.env.VITE_AWS_SES_REPLY_TO || 'celso@myplacar.app.br';

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

const buildAnnouncementEmail = (params: {
  to_name: string;
  title: string;
  message: string;
  app_url: string;
}): { subject: string; html: string; text: string } => ({
  subject: params.title,
  html: `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#fff">
      <img src="${params.app_url}/logo192.png" width="48" alt="MyPlacar" style="margin-bottom:24px"/>
      <h2 style="color:#1e3a5f;margin:0 0 16px">${params.title}</h2>
      <div style="color:#444;line-height:1.6;margin-bottom:32px">
        ${params.message.replace(/\n/g, '<br>')}
      </div>
      <a href="${params.app_url}"
         style="display:block;background:#2563eb;color:#fff;text-decoration:none;border-radius:10px;padding:14px;text-align:center;font-weight:700;font-size:16px;margin-bottom:24px">
        Acessar o MyPlacar
      </a>
      <p style="color:#aaa;font-size:12px;margin:0">Enviado por MyPlacar Notification System</p>
    </div>
  `,
  text: `${params.title}\n\n${params.message}\n\nAcesse: ${params.app_url}`,
});

// ─── Função principal ─────────────────────────────────────────────────────────

type EmailTemplate = 'verification' | 'welcome' | 'recovery' | 'announcement';

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
  announcement: {
    to_name: string;
    email: string;
    title: string;
    message: string;
    app_url: string;
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
      } else if (template === 'recovery') {
        content = buildRecoveryEmail(params as TemplateParams['recovery']);
      } else {
        content = buildAnnouncementEmail(params as TemplateParams['announcement']);
      }

      // IMPORTANTE: Chamamos a nossa própria API interna da Vercel
      // Se estiver em dev, apontamos para a URL de produção ou localhost conforme o caso
      const apiBase = (import.meta.env.DEV) 
        ? 'https://myplacar.app.br' // Ajuste para sua URL de produção para testar em dev
        : '';

      const response = await fetch(`${apiBase}/api/enviar-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: FROM,
          to: (params as { email: string }).email,
          subject: content.subject,
          html: content.html,
          text: content.text,
          reply_to: REPLY_TO,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('[emailService] Erro na API interna:', errorData);
        return false;
      }

      const data = await response.json();
      console.log('[emailService] E-mail enviado com sucesso via API interna:', data.id);
      return true;
    } catch (error) {
      console.error('[emailService] Erro ao enviar via API interna:', error);
      return false;
    }
  },
};
