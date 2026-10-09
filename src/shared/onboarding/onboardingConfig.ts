export interface OnboardingStep {
  targetId: string;
  title: string;
  description: string;
  example?: string;
  placement?: 'top' | 'bottom';
}

export interface ScreenOnboardingConfig {
  screenName: string;
  intro: {
    title: string;
    description: string;
    durationMs?: number;
  };
  steps: OnboardingStep[];
}

export const ONBOARDING_CONFIG: Record<string, ScreenOnboardingConfig> = {
  home: {
    screenName: 'Home',
    intro: {
      title: 'Bem-vindo ao MyPlacar!',
      description: 'Gerencie de forma simples suas partidas de seus esportes favoritos. Aqui você acessa tudo rapidamente: crie partidas, gerencie seus times, configure regras. parceiros e seus torneios.',
      durationMs: 5000,
    },
    steps: [
      {
        targetId: 'home-item-perfil',
        title: 'Perfil',
        description: 'Toque aqui para editar seu apelido, foto, dados e preferências da sua conta.',
      },
      {
        targetId: 'home-item-times',
        title: 'Times',
        description: 'Cadastre e gerencie duplas ou equipes para agilizar o início das partidas.',
        example: 'Ex.: Time A vs Time B',
      },
      {
        targetId: 'home-item-play',
        title: 'Play',
        description: 'Controle o placar da partida no modo offline ou ao vivo e se precisar ajustar regras configuradas para o esporte é só ir em regras.',
      },
      {
        targetId: 'home-item-regras',
        title: 'Regras',
        description: 'Configure número de sets, games, deuce e super tiebreak das suas partidas para cada esporte.',
      },
      {
        targetId: 'home-item-parceiros',
        title: 'Parceiros',
        description: 'Mantenha sua lista de amigos e parceiros de jogo sempre organizada.',
      },
      {
        targetId: 'home-item-historico',
        title: 'Histórico',
        description: 'Veja os resultados, estatísticas e detalhes de todos os jogos anteriores.',
      },
      {
        targetId: 'home-item-torneios',
        title: 'Torneios',
        description: 'Acompanhe inscrições, suas partidas e pontuação dos seus torneios e eventos.',
      },
      {
        targetId: 'home-item-versao',
        title: 'Versão do app',
        description: 'Verifique se há novas atualizações disponíveis para o seu MyPlacar com apenas um toque.',
        placement: 'top',
      },
    ],
  },
  tournaments: {
    screenName: 'Torneios',
    intro: {
      title: 'Central de torneios',
      description: 'Aqui você localiza torneios abertos, realiza sua inscrição com PIN e acompanha suas chaves e jogos.',
      durationMs: 5000,
    },
    steps: [
      {
        targetId: 'tournaments-search-bar',
        title: 'Localizar torneios',
        description: 'Digite o PIN fornecido pelo organizador ou o nome do evento para encontrar e entrar rapidamente.',
        example: 'Ex.: Digite o PIN ou nome do torneio',
      },
      {
        targetId: 'tournaments-available-section',
        title: 'Torneios disponíveis',
        description: 'Veja todos os eventos abertos ao público, datas, valores e faça sua inscrição direta com um toque.',
      },
      {
        targetId: 'tournaments-registrations-section',
        title: 'Minhas inscrições',
        description: 'Acesse seus torneios, classificação por categoria, seus times e partidas.',
      },
    ],
  },
  'athlete-registration': {
    screenName: 'Inscrição do atleta',
    intro: {
      title: 'Inscrição no evento',
      description: 'Siga as etapas para confirmar seus dados, escolher suas categorias, definir duplas e concluir seu pagamento.',
      durationMs: 5000,
    },
    steps: [
      {
        targetId: 'reg-step-identity',
        title: 'Atleta',
        description: 'Confira e preencha seus dados cadastrais, como nome, WhatsApp, gênero e tamanho de camiseta.',
      },
      {
        targetId: 'reg-step-information',
        title: 'Informações',
        description: 'Leia o regulamento, orientações gerais, data do evento e regras específicas da competição.',
      },
      {
        targetId: 'reg-step-categories',
        title: 'Categorias',
        description: 'Selecione em quais categorias você vai competir (ex.: Open, Misto, Iniciante, etc.).',
      },
      {
        targetId: 'reg-step-partners',
        title: 'Duplas',
        description: 'Defina seu parceiro ou parceira para cada categoria selecionada ou deixe em aberto se permitido.',
      },
      {
        targetId: 'reg-step-payment',
        title: 'Pagamento',
        description: 'Visualize o valor total da inscrição e finalize o pagamento com segurança via Pix.',
      },
    ],
  },
  'event-detail': {
    screenName: 'Detalhes do torneio',
    intro: {
      title: 'Painel do atleta no evento',
      description: 'Acompanhe sua inscrição, faça check-in no dia dos jogos, consulte categorias, times e partidas.',
      durationMs: 5000,
    },
    steps: [
      {
        targetId: 'event-detail-registration-card',
        title: 'Minha inscrição',
        description: 'Faça check-in no dia das partidas e gerencie os detalhes da sua inscrição.',
      },
      {
        targetId: 'event-detail-actions-card',
        title: 'Compartilhamento e regulamento',
        description: 'Compartilhe o link do evento no WhatsApp e consulte o regulamento completo da competição.',
      },
      {
        targetId: 'event-detail-history-card',
        title: 'Meu histórico',
        description: 'Acompanhe os resultados e estatísticas das suas partidas já disputadas neste evento.',
        placement: 'top',
      },
      {
        targetId: 'event-detail-categories-selector',
        title: 'Categorias do ranking',
        description: 'Selecione a categoria desejada para visualizar os participantes, chaves e jogos.',
      },
      {
        targetId: 'event-detail-subtabs-container',
        title: 'Inscritos, times e jogos',
        description: 'Navegue entre a lista de atletas inscritos, as duplas formadas e o calendário de partidas.',
        placement: 'bottom',
      },
    ],
  },
};
