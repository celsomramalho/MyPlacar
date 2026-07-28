// ─── src/infrastructure/network/LocalSyncService.ts ──────────────────────────
// Servico de sincronismo local P2P sem internet.
//
// ARQUITETURA:
//   Controlador (Celular com app instalado):
//       - Em ambiente web/dev: usa BroadcastChannel (comunicacao entre abas do PC)
//       - Em producao nativa (Capacitor): usaria plugin de WebSocket server
//   Espe/lho (Relogio / Navegador Web):
//       - Conecta via WebSocket ao IP local do celular na porta 8080
//       - Em ambiente web/dev: usa BroadcastChannel
//
// FLUXO DE PAREAMENTO com PIN:
//   1. Controlador gera PIN de 4 digitos
//   2. Controlador inicia o servidor/broadcast
//   3. Usuario digita o PIN (e IP se WS real) no dispositivo Espelho
//   4. Espelho envia { type: 'handshake', pin: '1234' }
//   5. Controlador valida e responde { type: 'ack', ok: true }
//   6. Toda mudanca no gameState e enviada ao Espelho via broadcast/WS
// ─────────────────────────────────────────────────────────────────────────────

export type LocalSyncRole = 'controller' | 'mirror' | 'none';

export type LocalSyncStatus =
  | 'idle'
  | 'waiting_mirror'
  | 'connecting'
  | 'connected'
  | 'error'
  | 'disconnected';

export interface LocalSyncState {
  role: LocalSyncRole;
  status: LocalSyncStatus;
  pin: string | null;
  controllerIp: string | null;
  error: string | null;
}

export interface LocalSyncPayload {
  type: 'handshake' | 'ack' | 'game_state' | 'ping' | 'pong';
  pin?: string;
  ok?: boolean;
  gameState?: unknown;
  timestamp?: number;
}

// ─── Gerador de PIN ───────────────────────────────────────────────────────────
export function generatePin(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// ─── LocalSyncService ─────────────────────────────────────────────────────────
export class LocalSyncService {
  private ws: WebSocket | null = null;
  private role: LocalSyncRole = 'none';
  private pin: string | null = null;
  private onStateChange: (state: LocalSyncState) => void;
  private onGameStateReceived: (gameState: unknown) => void;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private controllerIp: string | null = null;
  private broadcastChannel: BroadcastChannel | null = null;
  private broadcastPeerChannel: BroadcastChannel | null = null;

  constructor(
    onStateChange: (state: LocalSyncState) => void,
    onGameStateReceived: (gameState: unknown) => void
  ) {
    this.onStateChange = onStateChange;
    this.onGameStateReceived = onGameStateReceived;
  }

  private emit(status: LocalSyncStatus, extra?: Partial<LocalSyncState>) {
    this.onStateChange({
      role: this.role,
      status,
      pin: this.pin,
      controllerIp: this.controllerIp,
      error: extra?.error ?? null,
      ...extra,
    });
  }

  private isWebEnvironment(): boolean {
    return (
      typeof (window as any).Capacitor === 'undefined' ||
      !(window as any).Capacitor?.isNativePlatform?.()
    );
  }

  // ─── MODO CONTROLADOR ─────────────────────────────────────────────────────────

  startAsController(pin: string): void {
    this.role = 'controller';
    this.pin = pin;
    this.emit('waiting_mirror');
    this.startControllerBroadcast(pin);
  }

  private startControllerBroadcast(pin: string): void {
    this.broadcastChannel = new BroadcastChannel(`myplacar-mirror-${pin}`);
    this.broadcastPeerChannel = new BroadcastChannel(`myplacar-controller-${pin}`);

    const handleMessage = (msg: LocalSyncPayload) => {
      if (msg.type === 'handshake' && msg.pin === pin) {
        const ackPayload: LocalSyncPayload = { type: 'ack', ok: true, pin };
        this.broadcastPeerChannel?.postMessage(ackPayload);
        try {
          localStorage.setItem(`myplacar_ack_${pin}`, JSON.stringify({ ...ackPayload, _t: Date.now() }));
        } catch { /* best effort */ }
        this.emit('connected');
      }
      if (msg.type === 'ping') {
        this.broadcastPeerChannel?.postMessage({ type: 'pong', timestamp: Date.now() });
      }
    };

    this.broadcastChannel.onmessage = (event: MessageEvent<LocalSyncPayload>) => {
      handleMessage(event.data);
    };

    // Escuta evento de localStorage para compatibilidade cross-tab/window total
    const storageHandler = (e: StorageEvent) => {
      if (e.key === `myplacar_handshake_${pin}` && e.newValue) {
        try {
          const msg = JSON.parse(e.newValue);
          handleMessage(msg);
        } catch { /* best effort */ }
      }
    };
    window.addEventListener('storage', storageHandler);
  }

  broadcastGameState(gameState: unknown): void {
    if (this.role !== 'controller') return;
    const payload: LocalSyncPayload = {
      type: 'game_state',
      gameState,
      timestamp: Date.now(),
    };
    if (this.broadcastPeerChannel) {
      this.broadcastPeerChannel.postMessage(payload);
    }
    if (this.pin) {
      try {
        localStorage.setItem(`myplacar_gamestate_${this.pin}`, JSON.stringify(payload));
      } catch { /* best effort */ }
    }
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  // ─── MODO ESPELHO ─────────────────────────────────────────────────────────────

  startAsMirror(pin: string, controllerIp?: string): void {
    this.role = 'mirror';
    this.pin = pin;
    this.controllerIp = controllerIp ?? null;
    this.emit('connecting');

    if (this.isWebEnvironment() || !controllerIp) {
      this.connectMirrorBroadcast(pin);
    } else {
      this.connectMirrorWebSocket(pin, controllerIp);
    }
  }

  private connectMirrorBroadcast(pin: string): void {
    this.broadcastChannel = new BroadcastChannel(`myplacar-mirror-${pin}`);
    this.broadcastPeerChannel = new BroadcastChannel(`myplacar-controller-${pin}`);

    const handlePayload = (msg: LocalSyncPayload) => {
      if (msg.type === 'ack' && msg.ok) {
        this.emit('connected');
        this.startPingInterval();
      }
      if (msg.type === 'game_state' && msg.gameState) {
        this.onGameStateReceived(msg.gameState);
      }
    };

    this.broadcastPeerChannel.onmessage = (event: MessageEvent<LocalSyncPayload>) => {
      handlePayload(event.data);
    };

    // Escuta via LocalStorage
    const storageHandler = (e: StorageEvent) => {
      if ((e.key === `myplacar_ack_${pin}` || e.key === `myplacar_gamestate_${pin}`) && e.newValue) {
        try {
          const msg = JSON.parse(e.newValue);
          handlePayload(msg);
        } catch { /* best effort */ }
      }
    };
    window.addEventListener('storage', storageHandler);

    // Envia handshake inicial via Broadcast + LocalStorage com retries
    const sendHandshake = () => {
      const payload: LocalSyncPayload = { type: 'handshake', pin };
      this.broadcastChannel?.postMessage(payload);
      try {
        localStorage.setItem(`myplacar_handshake_${pin}`, JSON.stringify({ ...payload, _t: Date.now() }));
      } catch { /* best effort */ }
    };

    sendHandshake();
    const handshakeInterval = setInterval(sendHandshake, 800);

    // Para o retry após 10 segundos ou ao conectar
    setTimeout(() => clearInterval(handshakeInterval), 10000);
  }

  private connectMirrorWebSocket(pin: string, ip: string): void {
    const url = `ws://${ip}:8080`;
    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.ws!.send(JSON.stringify({ type: 'handshake', pin }));
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const msg: LocalSyncPayload = JSON.parse(event.data);
          if (msg.type === 'ack' && msg.ok) {
            this.emit('connected');
            this.startPingInterval();
          }
          if (msg.type === 'game_state' && msg.gameState) {
            this.onGameStateReceived(msg.gameState);
          }
        } catch {
          // ignora mensagens malformadas
        }
      };

      this.ws.onerror = () => {
        this.emit('error', {
          error: `Nao foi possivel conectar em ${url}. Verifique o IP e o PIN.`,
        });
        this.scheduleReconnect(pin, ip);
      };

      this.ws.onclose = () => {
        if (this.role === 'mirror') {
          this.emit('disconnected');
          this.scheduleReconnect(pin, ip);
        }
      };
    } catch {
      this.emit('error', { error: 'Endereco invalido.' });
    }
  }

  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      if (this.broadcastChannel) {
        this.broadcastChannel.postMessage({ type: 'ping' });
      } else if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 5000);
  }

  private scheduleReconnect(pin: string, ip: string): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.role === 'mirror') {
        this.connectMirrorWebSocket(pin, ip);
      }
    }, 3000);
  }

  // ─── Limpeza ──────────────────────────────────────────────────────────────────

  stop(): void {
    this.role = 'none';
    this.pin = null;
    this.controllerIp = null;

    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.pingInterval) { clearInterval(this.pingInterval); this.pingInterval = null; }
    if (this.ws) { this.ws.close(); this.ws = null; }
    if (this.broadcastChannel) { this.broadcastChannel.close(); this.broadcastChannel = null; }
    if (this.broadcastPeerChannel) { this.broadcastPeerChannel.close(); this.broadcastPeerChannel = null; }

    this.emit('idle');
  }
}
