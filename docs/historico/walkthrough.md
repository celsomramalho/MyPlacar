# Walkthrough - Ajuste de Cores do Status de Live

Ajustamos e unificamos a identidade visual das tarjas e dos ícones de status no aplicativo, garantindo que o papel de **Controlador** utilize consistentemente a cor laranja 🟠 e o papel de **Observador** utilize a cor azul 🔵.

## Alterações Realizadas

### 1. Componente [LiveIndicator.tsx](file:///c:/Users/Celso%20Ramalho/Documents/GitHub/MyPlacar/src/components/LiveIndicator.tsx)
- Alterado o ícone de controle ativo `Gamepad2` da cor azul (`text-[#3b82f6]`) para **laranja** (`text-orange-500`) para alinhar com o restante do fluxo visual da live.

### 2. Tela Principal [ScoreboardScreen.tsx](file:///c:/Users/Celso%20Ramalho/Documents/GitHub/MyPlacar/src/screens/ScoreboardScreen.tsx)
- **Tarjas de Status no Topo (`liveBanner`):**
  - Invertida a cor de fundo da tarja do **Controlador** para **laranja** (`bg-[#f59e0b]`).
  - Invertida a cor de fundo da tarja do **Observador** para **azul** (`bg-blue-600`).
  - Atualizado o ícone da tarja de observação para `<Eye size={13} />`, mais coerente com a ação de observar.
- **Bloco de Dispositivos Conectados:**
  - O badge e o ícone do dispositivo ativo (`DeviceIcon`) foram atualizados de azul para **laranja** (`bg-orange-50 text-orange-700 border-orange-200 ring-orange-100` e `text-orange-500`), criando uma experiência visual perfeitamente coesa.

## Verificação Sugerida
- Abra a tela do placar em modo **Controlador** (Dono/Juiz):
  - A tarja no topo deve ser laranja e exibir a mensagem "Você está no controle do placar".
  - O indicador de Live no rodapé e o badge do dispositivo ativo devem estar destacados em laranja.
- Abra a tela do placar em modo **Observador** (Espectador):
  - A tarja no topo deve ser azul e exibir a mensagem "... está controlando · você está observando".
