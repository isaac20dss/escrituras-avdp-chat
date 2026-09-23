/**
 * stateSync.ts — Serviço de sincronização de estado via WebSocket local
 *
 * Este serviço substitui o BroadcastChannel, permitindo que o DisplayOutput
 * dentro do OBS (processo Chromium isolado) receba atualizações do Painel.
 *
 * Comportamento:
 *   - Conecta automaticamente ao servidor local ws://localhost:3001
 *   - Reconecta automaticamente após desconexões
 *   - ControlPanel usa send() para publicar estado
 *   - DisplayOutput usa onMessage() para receber estado
 */

import { TeleprompterState } from '../types';

const WS_URL = 'ws://localhost:3001';
const RECONNECT_DELAY_MS = 2000;

type StateListener = (state: TeleprompterState) => void;

class StateSyncService {
  private socket: WebSocket | null = null;
  private listeners: Set<StateListener> = new Set();
  private shouldReconnect = true;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  /** Inicializa a conexão WebSocket. Chame isso uma vez ao montar o componente. */
  connect(): void {
    this.shouldReconnect = true;
    this._open();
  }

  /** Encerra a conexão e cancela reconexões automáticas. */
  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.onclose = null; // evita reconexão no close manual
      this.socket.close();
      this.socket = null;
    }
  }

  /** Envia o estado atual para todos os outros clientes via servidor. */
  send(state: TeleprompterState): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(state));
    }
  }

  /** Registra um callback para receber atualizações de estado. */
  onMessage(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Status de conexão. */
  get isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  private _open(): void {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      this.socket = new WebSocket(WS_URL);
    } catch {
      this._scheduleReconnect();
      return;
    }

    this.socket.onopen = () => {
      console.log('[StateSync] Conectado ao servidor WS local.');
    };

    this.socket.onmessage = (event: MessageEvent<string>) => {
      try {
        const state = JSON.parse(event.data) as TeleprompterState;
        this.listeners.forEach((fn) => fn(state));
      } catch {
        // ignora mensagens malformadas
      }
    };

    this.socket.onclose = () => {
      console.warn('[StateSync] Conexão encerrada.');
      this.socket = null;
      if (this.shouldReconnect) {
        this._scheduleReconnect();
      }
    };

    this.socket.onerror = () => {
      // onerror sempre é seguido de onclose, então deixamos o onclose cuidar da reconexão
    };
  }

  private _scheduleReconnect(): void {
    if (this.reconnectTimer || !this.shouldReconnect) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this._open();
    }, RECONNECT_DELAY_MS);
  }
}

export const stateSyncService = new StateSyncService();
