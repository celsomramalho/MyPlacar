import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface LocalWebSocketServerPlugin {
  startWebApp(): Promise<{ ip: string; webPort: number; webUrl: string }>;
  start(options: { pin: string }): Promise<{ ip: string; port: number; webPort?: number; webUrl?: string }>;
  send(options: { message: string }): Promise<void>;
  stop(): Promise<void>;
  addListener(event: 'status', listener: (event: { status: string; error?: string }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'message', listener: (event: { message: string }) => void): Promise<PluginListenerHandle>;
}

export const localWebSocketServer = registerPlugin<LocalWebSocketServerPlugin>('LocalWebSocketServer');
