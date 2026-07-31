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

import { localWebSocketServer } from './LocalWebSocketServer';
import type { PluginListenerHandle } from '@capacitor/core';

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
  logs: string[];
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
  private nativeServerListeners: PluginListenerHandle[] = [];
  private logs: string[] = [];
  private currentStatus: LocalSyncStatus = 'idle';

  constructor(
    onStateChange: (state: LocalSyncState) => void,
    onGameStateReceived: (gameState: unknown) => void
  ) {
    this.onStateChange = onStateChange;
    this.onGameStateReceived = onGameStateReceived;
  }

  private emit(status: LocalSyncStatus, extra?: Partial<LocalSyncState>) {
    this.currentStatus = status;
    this.onStateChange({
      role: this.role,
      status,
      pin: this.pin,
      controllerIp: this.controllerIp,
      error: extra?.error ?? null,
      logs: this.logs,
      ...extra,
    });
  }

  private log(message: string) {
    const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    this.logs = [...this.logs, `${time}  ${message}`].slice(-8);
    this.emit(this.currentStatus);
  }

  private isWebEnvironment(): boolean {
    return (
      typeof (window as any).Capacitor === 'undefined' ||
      !(window as any).Capacitor?.isNativePlatform?.()
    );
  }

  // ─── MODO CONTROLADOR ─────────────────────────────────────────────────────────

  startAsController(pin: string): void {
    this.logs = [];
    this.role = 'controller';
    this.pin = pin;
    this.emit('waiting_mirror');
    this.log(`Controlador iniciado. PIN ${pin}`);
    this.startControllerBroadcast(pin);
  }

  /** Conecta o controlador (relógio/PWA) ao servidor do celular espelho. */
  connectControllerToPhone(phoneIp: string): void {
    if (this.role !== 'controller' || !this.pin) return;
    const ip = phoneIp.trim().replace(/^ws:\/\//, '').replace(/:\d+\/?$/, '');
    if (!ip) {
      this.log('IP vazio. Digite o IP do celular antes de conectar.');
      this.emit('error', { error: 'Digite o IP do celular para iniciar a conexão.' });
      return;
    }
    this.controllerIp = ip;
    this.log(`Tentando conectar ao celular em ${ip}:8080`);
    this.closeBroadcastChannels();
    this.connectControllerWebSocket(this.pin, ip);
  }

  private connectControllerWebSocket(pin: string, ip: string): void {
    const url = `ws://${ip}:8080`;
    try {
      this.ws?.close();
      this.ws = new WebSocket(url);
      this.ws.onopen = () => {
        this.log('Conexão aberta. Enviando PIN ao celular...');
        this.ws?.send(JSON.stringify({ type: 'handshake', pin }));
      };
      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data) as LocalSyncPayload;
          if (msg.type === 'ack' && msg.ok) {
            this.log('Celular confirmou o PIN. Espelhamento conectado.');
            this.emit('connected');
            this.startPingInterval();
          }
        } catch { /* ignora mensagens malformadas */ }
      };
      this.ws.onerror = () => {
        const httpsWarning = typeof window !== 'undefined' && window.location.protocol === 'https:'
          ? ' O PWA está em HTTPS e o navegador pode bloquear ws:// local.'
          : '';
        this.log(`Falha ao conectar em ${url}.${httpsWarning}`);
        this.emit('error', {
          error: `Não foi possível conectar ao celular em ${url}. Verifique o IP, a rede local e se o PWA HTTPS bloqueou ws://.`,
        });
      };
      this.ws.onclose = () => {
        if (this.role === 'controller') {
          this.log('Conexão encerrada pelo navegador ou pelo celular.');
          if (this.currentStatus !== 'error') this.emit('disconnected');
        }
      };
    } catch {
      const httpsWarning = typeof window !== 'undefined' && window.location.protocol === 'https:'
        ? ' O Chrome pode bloquear ws:// quando o PWA está em HTTPS.'
        : '';
      this.log(`O navegador não conseguiu abrir ${url}.${httpsWarning}`);
      this.emit('error', { error: `Não foi possível abrir a conexão local em ${url}.${httpsWarning}` });
    }
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

    // Polling reserva no localStorage caso o evento storage nao tenha disparado na mesma janela
    const pollInterval = setInterval(() => {
      try {
        const item = localStorage.getItem(`myplacar_handshake_${pin}`);
        if (item) {
          const msg = JSON.parse(item);
          handleMessage(msg);
        }
      } catch { /* best effort */ }
    }, 500);

    setTimeout(() => clearInterval(pollInterval), 15000);
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
    this.logs = [];
    this.role = 'mirror';
    this.pin = pin;
    this.controllerIp = controllerIp ?? null;
    this.emit('connecting');
    this.log(`Espelho iniciado. PIN ${pin}`);

    if (!this.isWebEnvironment()) {
      this.startNativeMirrorServer(pin);
      return;
    }

    if (controllerIp && controllerIp.trim() !== '') {
      this.connectMirrorWebSocket(pin, controllerIp.trim());
    } else {
      this.connectMirrorBroadcast(pin);
    }
  }

  private async startNativeMirrorServer(pin: string): Promise<void> {
    try {
      this.nativeServerListeners = await Promise.all([
      localWebSocketServer.addListener('status', event => {
          if (event.status === 'waiting') { this.log('Servidor local ativo. Aguardando o relógio...'); this.emit('waiting_mirror'); }
          if (event.status === 'connected') { this.log('Relógio conectado ao servidor local.'); this.emit('connected'); }
          if (event.status === 'disconnected') { this.log('Relógio desconectado.'); this.emit('disconnected'); }
          if (event.status === 'error') { this.log(`Erro no servidor: ${event.error || 'desconhecido'}`); this.emit('error', { error: event.error || 'Erro no servidor local.' }); }
        }),
        localWebSocketServer.addListener('message', event => {
          try {
            const msg = JSON.parse(event.message) as LocalSyncPayload;
            if (msg.type === 'handshake') this.log('PIN recebido do relógio. Validando...');
            if (msg.type === 'game_state' && msg.gameState) this.onGameStateReceived(msg.gameState);
            if (msg.type === 'ping') void localWebSocketServer.send({ message: JSON.stringify({ type: 'pong', timestamp: Date.now() }) });
          } catch { /* ignora mensagens malformadas */ }
        }),
      ]);
      const result = await localWebSocketServer.start({ pin });
      this.controllerIp = result.ip;
      this.log(`Servidor pronto em ${result.ip}:8080`);
      this.emit('waiting_mirror');
    } catch (error) {
      this.emit('error', { error: error instanceof Error ? error.message : 'Não foi possível iniciar o servidor local.' });
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

    // Polling reserva no localStorage para o Espelho detectar a resposta de conexao
    const pollAckInterval = setInterval(() => {
      try {
        const ackItem = localStorage.getItem(`myplacar_ack_${pin}`);
        if (ackItem) {
          handlePayload(JSON.parse(ackItem));
        }
        const stateItem = localStorage.getItem(`myplacar_gamestate_${pin}`);
        if (stateItem) {
          handlePayload(JSON.parse(stateItem));
        }
      } catch { /* best effort */ }
    }, 400);

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

    // Para o retry após 15 segundos ou ao conectar
    setTimeout(() => {
      clearInterval(handshakeInterval);
      clearInterval(pollAckInterval);
    }, 15000);
  }

  private connectMirrorWebSocket(pin: string, ip: string): void {
    const url = `ws://${ip}:8080`;
    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.log(`Conexão aberta em ${url}. Enviando PIN...`);
        this.ws!.send(JSON.stringify({ type: 'handshake', pin }));
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const msg: LocalSyncPayload = JSON.parse(event.data);
          if (msg.type === 'ack' && msg.ok) {
            this.log('Controlador confirmou o PIN. Espelhamento conectado.');
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
        this.log(`Falha ao conectar em ${url}.`);
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
    this.nativeServerListeners.forEach(listener => listener.remove());
    this.nativeServerListeners = [];
    if (!this.isWebEnvironment()) void localWebSocketServer.stop();

    this.emit('idle');
  }

  private closeBroadcastChannels(): void {
    if (this.broadcastChannel) { this.broadcastChannel.close(); this.broadcastChannel = null; }
    if (this.broadcastPeerChannel) { this.broadcastPeerChannel.close(); this.broadcastPeerChannel = null; }
  }
}
