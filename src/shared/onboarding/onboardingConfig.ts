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
  config: {
    screenName: 'Times',
    intro: {
      title: 'Configuração dos times',
      description: 'Escale os jogadores, escolha as modalidades, organize ordens de saque e personalize cores para começar o jogo.',
      durationMs: 5000,
    },
    steps: [
      {
        targetId: 'times-clear-names',
        title: 'Limpar nomes',
        description: 'Apague rapidamente o nome de todos os jogadores para começar uma nova escalação.',
        placement: 'bottom',
      },
      {
        targetId: 'times-record-history',
        title: 'Gravar histórico',
        description: 'Mantenha ativo para salvar a partida nas suas estatísticas ou desative para uma disputa sem registro.',
        placement: 'bottom',
      },
      {
        targetId: 'times-modality-selector',
        title: 'Simples ou duplas',
        description: 'Alterne entre partida individual (1 contra 1) ou jogo em duplas (2 contra 2).',
        placement: 'bottom',
      },
      {
        targetId: 'times-shuffle-actions',
        title: 'Sorteio de saque e formação',
        description: 'Sorteie a ordem de sacadores e, em duplas, embaralhe a formação dos times usando o botão Sortear formação, caso seja duplas mistas para embaralhar a formação use o botão de Sortear Misto.',
        placement: 'bottom',
      },
      {
        targetId: 'times-team-colors',
        title: 'Cores dos times',
        description: 'Defina a cor de cada time para identificação rápida e destaque visual no placar.',
        placement: 'bottom',
      },
      {
        targetId: 'times-player-input',
        title: 'Recursos do jogador',
        description: 'cadastre um novo parceiro lendo o QR Code do atleta, dite nomes pelo microfone, escolha parceiros salvos e selecione o gênero.',
        example: 'Toque na câmera para lêr o QR Code ou no microfone para voz.',
        placement: 'bottom',
      },
      {
        targetId: 'times-swap-players',
        title: 'Inverter times e posições',
        description: 'Inverta a ordem dos sacadores da dupla pelo botão no topo do time ou troque os dois times de lado pelo botão central.',
        placement: 'top',
      },
      {
        targetId: 'times-start-match',
        title: 'Iniciar partida',
        description: 'Com os nomes preenchidos e o esporte selecionado, toque no botão para abrir o placar eletrônico e começar a partida. Caso o esporte esteja errado é só escolher no menu Regras',
        placement: 'top',
      },
    ],
  },

  partners: {
    screenName: 'Parceiros',
    intro: {
      title: 'Tela de parceiros',
      description: 'Aqui você gerencia seus parceiros de jogo: adicione novos, sincronize com a nuvem, convide amigos pelo seu link e gerencie a fila de espera para as partidas.',
      durationMs: 5000,
    },
    steps: [
      {
        targetId: 'partners-tabs',
        title: 'Lista e fila',
        description: 'Alterne entre a aba Lista (seus parceiros cadastrados) e Fila (próximos a entrar na quadra).',
        placement: 'bottom',
      },
      {
        targetId: 'partners-cloud-sync',
        title: 'Sincronização com a nuvem',
        description: 'Faça backup dos seus parceiros ou restaure-os de outro dispositivo. O indicador laranja aparece quando há parceiros locais ainda não enviados para a nuvem.',
        placement: 'bottom',
      },
      {
        targetId: 'partners-referral',
        title: 'Indique e ganhe',
        description: 'Compartilhe seu link ou QR code para convidar amigos. Quem se cadastrar pelo seu link vira seu parceiro automaticamente, aparecendo na lista como "indicado".',
        placement: 'bottom',
      },
      {
        targetId: 'partners-add-new',
        title: 'Adicionar parceiro',
        description: 'Escaneie o QR code do parceiro com a câmera ou digite o pin de 5 letras manualmente. O nome é preenchido automaticamente ao digitar um pin válido.',
        placement: 'bottom',
      },
      {
        targetId: 'partners-list',
        title: 'Lista de jogadores',
        description: 'Toque em um parceiro para selecioná-lo para o Time 1 ou Time 2. Toque novamente para mudar de time ou desmarcar. A borda colorida indica qual time ele está.',
        placement: 'top',
      },
      {
        targetId: 'partners-queue-section',
        title: 'Fila de espera',
        description: 'Gerencie quem entra na próxima partida. Digite nomes, use câmera ou microfone, vincule a um parceiro cadastrado e sorteie a formação dos times.',
        placement: 'top',
      },
    ],
  },

  rules: {
    screenName: 'Regras',
    intro: {
      title: 'Regras e configurações',
      description: 'Configure o esporte da partida, o formato de pontuação, tie-break, narração com inteligência artificial e preferências do relógio ou placar.',
      durationMs: 5000,
    },
    steps: [
      {
        targetId: 'rules-score-optimization',
        title: 'Otimização do placar',
        description: 'Ative o modo relógio para controle simplificado no pulso ou modo placar para exibição em tela cheia na quadra.',
        placement: 'bottom',
      },
      {
        targetId: 'rules-categories',
        title: 'Categorias de esporte',
        description: 'Escolha o grupo do esporte desejado, como esportes de raquete, coletivos ou individuais.',
        placement: 'bottom',
      },
      {
        targetId: 'rules-sports',
        title: 'Escolha do esporte',
        description: 'Selecione a modalidade específica da partida. O placar ajustará automaticamente o sistema de pontuação para o esporte escolhido.',
        placement: 'bottom',
      },
      {
        targetId: 'rules-match-rules',
        title: 'Regras da partida',
        description: 'Defina o número de sets, quantidade de games, regra de vantagem (no-ad) e troca de lado nos games ímpares.',
        placement: 'top',
      },
      {
        targetId: 'rules-tie-break',
        title: 'Configurações de tie-break',
        description: 'Configure quando o tie-break deve ocorrer, quantidade de pontos para vitória, diferença de dois pontos e regras de troca de lado.',
        placement: 'top',
      },
      {
        targetId: 'rules-voice-narration',
        title: 'Voz e narração por inteligência artificial',
        description: 'Habilite o narrador contextual para narrar pontos com emoção ou comandos de voz para pontuar sem tocar na tela.',
        placement: 'top',
      },
      {
        targetId: 'rules-local-settings',
        title: 'Configurações do dispositivo',
        description: 'Ajuste o brilho da tela, volume do som, tempo de escurecimento no relógio e tempo de bloqueio contra toques repetidos.',
        placement: 'top',
      },
      {
        targetId: 'rules-play-button',
        title: 'Iniciar partida',
        description: 'Toque no botão para salvar as regras configuradas e abrir o placar eletrônico da partida.',
        placement: 'bottom',
      },
    ],
  },

  history: {
    screenName: 'Histórico',
    intro: {
      title: 'Histórico de partidas',
      description: 'Consulte todos os jogos já registrados, envie para backup na nuvem, veja estatísticas detalhadas e compartilhe seus resultados.',
      durationMs: 5000,
    },
    steps: [
      {
        targetId: 'history-sync-stats',
        title: 'Registros locais e em nuvem',
        description: 'Acompanhe quantas partidas estão salvas na memória do aparelho e quantas já foram sincronizadas com a sua conta na nuvem.',
        placement: 'bottom',
      },
      {
        targetId: 'history-cloud-actions',
        title: 'Sincronização com a nuvem',
        description: 'Toque no botão laranja para enviar suas partidas pendentes para a nuvem ou no botão verde para baixar registros salvos em outro aparelho.',
        placement: 'bottom',
      },
      {
        targetId: 'history-search',
        title: 'Buscar partidas',
        description: 'Digite o nome de qualquer jogador ou dupla para filtrar rapidamente os jogos arquivados.',
        placement: 'bottom',
      },
      {
        targetId: 'history-day-group',
        title: 'Agrupamento e seleção por dia',
        description: 'As partidas são organizadas por data. Use o botão para selecionar todos os jogos de um dia e efetuar ações em lote, como exclusão.',
        placement: 'bottom',
      },
      {
        targetId: 'history-match-card',
        title: 'Cartão do jogo',
        description: 'Veja quem jogou, quem venceu, o placar dos sets, a modalidade e o status de sincronização. O ícone de mapa exibe onde o jogo foi disputado.',
        placement: 'top',
      },
      {
        targetId: 'history-match-details',
        title: 'Detalhes e estatísticas',
        description: 'Ao expandir o jogo, veja o placar de cada set, total de pontos, aces, faltas cometidas, linha do tempo e o botão para compartilhar o link da partida.',
        placement: 'top',
      },
    ],
  },

  profile: {
    screenName: 'Perfil',
    intro: {
      title: 'Seu perfil no MyPlacar',
      description: 'Mantenha seus dados sempre atualizados, personalize como você é chamado nas partidas, configure o nome deste aparelho e gerencie suas permissões.',
      durationMs: 5000,
    },
    steps: [
      {
        targetId: 'profile-header',
        title: 'Identificação e plano',
        description: 'Visualize sua foto de perfil, apelido principal, email de login e se sua conta possui selo de administrador ou plano premium.',
        placement: 'bottom',
      },
      {
        targetId: 'profile-name',
        title: 'Nome e como quer ser chamado',
        description: 'Preencha seu nome completo e o apelido pelo qual o narrador com inteligência artificial e o placar falarão o seu nome durante os pontos.',
        placement: 'bottom',
      },
      {
        targetId: 'profile-device-name',
        title: 'Nome deste aparelho',
        description: 'Defina um nome para este dispositivo (como celular, notebook ou relógio) para facilitar o pareamento e espelhamento em tempo real.',
        placement: 'bottom',
      },
      {
        targetId: 'profile-pin',
        title: 'Seu pin exclusivo',
        description: 'Código de cinco letras único da sua conta. Use o botão de olho para revelar ou ocultar. Compartilhe seu pin com parceiros para que possam adicioná-lo.',
        placement: 'bottom',
      },
      {
        targetId: 'profile-phone',
        title: 'Telefone e contato',
        description: 'Informe seu número de celular com ddd para receber comunicados de torneios e mensagens de seus parceiros.',
        placement: 'bottom',
      },
      {
        targetId: 'profile-privacy',
        title: 'Privacidade e permissões',
        description: 'Gerencie as permissões de microfone (para comandos e narração), localização (para registrar onde o jogo ocorreu), câmera (para qr code) e biometria.',
        placement: 'top',
      },
      {
        targetId: 'profile-save',
        title: 'Salvar perfil',
        description: 'Toque para salvar todas as alterações realizadas nos seus dados cadastrais e preferências.',
        placement: 'top',
      },
    ],
  },
};
