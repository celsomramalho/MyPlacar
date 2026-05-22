import { emailService } from '@infra/email';
import type { Communication } from '@modules/communications/types';

/**
 * Serviço híbrido de notificações (Push + E-mail)
 */
export const notificationService = {
  /**
   * Envia notificações push via Firebase Cloud Messaging
   */
  sendPushNotification: (comm: Partial<Communication>, targetTokens: string[]) => {
    if (targetTokens.length === 0) return Promise.resolve();
    console.log(`[Push Notification] Enviando para ${targetTokens.length} dispositivos:`, {
      title: comm.title,
      body: comm.content?.substring(0, 100) + '...',
      type: comm.type
    });
    
    // Simulação de chamada de API
    return new Promise((resolve) => setTimeout(resolve, 1000));
  },

  /**
   * Envia e-mails formatados para os destinatários
   */
  sendEmailNotification: (comm: Partial<Communication>, targetEmails: string[], appUrl: string) => {
    if (targetEmails.length === 0) return Promise.resolve([]);
    console.log(`[Email Notification] Enviando para ${targetEmails.length} e-mails:`, {
      subject: comm.title,
      content: comm.content,
      recipients: targetEmails
    });

    // Envia e-mails reais usando o template de comunicado
    const promises = targetEmails.map(email => 
      emailService.sendEmail('announcement', {
        to_name: 'Usuário',
        email: email,
        title: comm.title || 'Comunicado MyPlacar',
        message: comm.content || '',
        app_url: appUrl
      })
    );

    return Promise.all(promises);
  },

  /**
   * Orquestra o envio híbrido baseado no tipo de comunicado
   */
  triggerHybridNotifications: async (comm: Partial<Communication>, users: { email: string, pushToken?: string }[], sendEmail: boolean = true, appUrl: string = globalThis.location.origin) => {
    const emails = users.map(u => u.email).filter(Boolean);
    const tokens = users.map(u => u.pushToken).filter(Boolean) as string[];

    const promises: Promise<unknown>[] = [
      notificationService.sendPushNotification(comm, tokens)
    ];

    if (sendEmail) {
      promises.push(notificationService.sendEmailNotification(comm, emails, appUrl));
    }

    const results = await Promise.allSettled(promises);

    return {
      pushSuccess: results[0].status === 'fulfilled',
      emailSuccess: sendEmail ? results[1]?.status === 'fulfilled' : false
    };
  }
};
