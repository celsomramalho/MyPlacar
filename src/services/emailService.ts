
export const emailService = {
  sendEmail: async (templateId: string, templateParams: any) => {
    const data = {
      service_id: 'service_2p1sm56', 
      template_id: templateId,
      user_id: 'A7y2Vx7kzDN-rI1yL', 
      template_params: templateParams,
    };

    try {
      const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      return response.ok;
    } catch (error) {
      console.error('Erro EmailJS:', error);
      return false;
    }
  }
};
