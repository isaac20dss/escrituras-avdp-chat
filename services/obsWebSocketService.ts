import { OBSConnectionSettings } from '../types';

type OBSOpCode = 0 | 1 | 2 | 5 | 6 | 7;

interface OBSMessage<T = Record<string, unknown>> {
  op: OBSOpCode;
  d: T;
}

interface OBSHelloPayload {
  rpcVersion: number;
  authentication?: {
    challenge: string;
    salt: string;
  };
}

interface OBSRequestStatus {
  code: number;
  comment?: string;
  result: boolean;
}

interface OBSRequestResponsePayload {
  requestId: string;
  requestStatus: OBSRequestStatus;
  responseData?: Record<string, unknown>;
}

interface PendingRequest {
  reject: (reason?: unknown) => void;
  resolve: (value: Record<string, unknown> | undefined) => void;
}

const encoder = new TextEncoder();

const toBase64 = (buffer: ArrayBuffer): string => {
  let binary = '';
  const bytes = new Uint8Array(buffer);

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary);
};

const sha256Base64 = async (value: string): Promise<string> => {
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return toBase64(hash);
};

const buildAuthenticationString = async (
  password: string,
  salt: string,
  challenge: string
): Promise<string> => {
  const secret = await sha256Base64(password + salt);
  return sha256Base64(secret + challenge);
};

const makeRequestId = (): string =>
  `obs-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export const htmlToOBSPlainText = (html: string): string => {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h1|h2|h3|h4|h5|h6)>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

class OBSWebSocketService {
  private socket: WebSocket | null = null;
  private pendingRequests = new Map<string, PendingRequest>();
  private helloResolver: ((payload: OBSHelloPayload) => void) | null = null;
  private helloRejecter: ((reason?: unknown) => void) | null = null;
  private identifiedResolver: (() => void) | null = null;
  private identifiedRejecter: ((reason?: unknown) => void) | null = null;
  private connected = false;

  get isConnected(): boolean {
    return this.connected && this.socket?.readyState === WebSocket.OPEN;
  }

  async connect(settings: OBSConnectionSettings): Promise<void> {
    if (this.isConnected) {
      return;
    }

    await this.disconnect();

    this.socket = new WebSocket(settings.url);

    const hello = await new Promise<OBSHelloPayload>((resolve, reject) => {
      this.helloResolver = resolve;
      this.helloRejecter = reject;

      if (!this.socket) {
        reject(new Error('OBS socket was not created.'));
        return;
      }

      this.socket.onmessage = this.handleMessage;
      this.socket.onerror = () => {
        reject(new Error('Falha ao conectar no websocket do OBS.'));
      };
      this.socket.onclose = () => {
        this.connected = false;
        this.helloRejecter?.(new Error('OBS fechou a conexao antes da identificacao.'));
        this.identifiedRejecter?.(new Error('OBS fechou a conexao antes de concluir a identificacao.'));
        this.helloResolver = null;
        this.helloRejecter = null;
        this.identifiedResolver = null;
        this.identifiedRejecter = null;
      };
    });

    const identifyPayload: Record<string, unknown> = {
      rpcVersion: hello.rpcVersion,
    };

    if (hello.authentication) {
      identifyPayload.authentication = await buildAuthenticationString(
        settings.password,
        hello.authentication.salt,
        hello.authentication.challenge
      );
    }

    this.socket?.send(JSON.stringify({
      op: 1,
      d: identifyPayload,
    }));

    await new Promise<void>((resolve, reject) => {
      this.identifiedResolver = resolve;
      this.identifiedRejecter = reject;
    });

    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;

    this.pendingRequests.forEach(({ reject }) => {
      reject(new Error('OBS websocket desconectado.'));
    });
    this.pendingRequests.clear();

    if (this.socket) {
      this.socket.onmessage = null;
      this.socket.onerror = null;
      this.socket.onclose = null;
      if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) {
        this.socket.close();
      }
      this.socket = null;
    }
  }

  async setTextSource(sourceName: string, text: string): Promise<void> {
    if (!sourceName.trim()) {
      return;
    }

    await this.sendRequest('SetInputSettings', {
      inputName: sourceName,
      inputSettings: {
        text,
      },
      overlay: true,
    });
  }

  async setSceneItemEnabled(sceneName: string, sourceName: string, enabled: boolean): Promise<void> {
    if (!sceneName.trim() || !sourceName.trim()) {
      return;
    }

    const response = await this.sendRequest('GetSceneItemId', {
      sceneName,
      sourceName,
    });

    const sceneItemId = response?.sceneItemId;
    if (typeof sceneItemId !== 'number') {
      throw new Error(`Nao foi possivel localizar "${sourceName}" na cena "${sceneName}".`);
    }

    await this.sendRequest('SetSceneItemEnabled', {
      sceneName,
      sceneItemId,
      sceneItemEnabled: enabled,
    });
  }

  private sendRequest(
    requestType: string,
    requestData?: Record<string, unknown>
  ): Promise<Record<string, unknown> | undefined> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('OBS websocket nao esta conectado.'));
    }

    const requestId = makeRequestId();

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(requestId, { resolve, reject });

      this.socket?.send(JSON.stringify({
        op: 6,
        d: {
          requestType,
          requestId,
          requestData,
        },
      }));
    });
  }

  private handleMessage = (event: MessageEvent<string>) => {
    const message = JSON.parse(event.data) as OBSMessage;

    if (message.op === 0) {
      this.helloResolver?.(message.d as unknown as OBSHelloPayload);
      this.helloResolver = null;
      this.helloRejecter = null;
      return;
    }

    if (message.op === 2) {
      this.identifiedResolver?.();
      this.identifiedResolver = null;
      this.identifiedRejecter = null;
      return;
    }

    if (message.op !== 7) {
      return;
    }

    const payload = message.d as unknown as OBSRequestResponsePayload;
    const pending = this.pendingRequests.get(payload.requestId);
    if (!pending) {
      return;
    }

    this.pendingRequests.delete(payload.requestId);

    if (!payload.requestStatus.result) {
      pending.reject(
        new Error(payload.requestStatus.comment || `OBS request failed with code ${payload.requestStatus.code}.`)
      );
      return;
    }

    pending.resolve(payload.responseData);
  };
}

export const obsWebSocketService = new OBSWebSocketService();
