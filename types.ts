export interface TeleprompterState {
  selectedTitle: string;
  selectedBody: string;
  isVisible: boolean;
  isScrolling: boolean;
  scrollSpeed: number; // 1 to 10
  scrollTop: number;   // Percentual 0-1 da posição de scroll
  fontSize: number;    // Font size in pixels
  highlightedText: string; // Frase destacada pelo operador
  blurAmount: number;      // Desfoque em px (0-20)
  blurOpacity: number;     // Opacidade do texto desfocado (0-1)
  rotateY: number;         // Rotação no eixo Y em graus (-180 a 180)
  bgOpacity: number;       // Opacidade do fundo (0 a 1)
  mode?: 'script' | 'chat'; // Modo de exibição
  chatMessages?: ChatMessage[]; // Mensagens de chat para exibição
  chatSubMode?: 'all' | 'presence'; // Exibir chat geral ou apenas lista de presença
  presenceUsers?: PresenceUser[];   // Lista de presença ordenada por chegada
  isVoiceActive?: boolean; // Acompanhamento por voz ativado
  voiceStatus?: 'off' | 'listening' | 'tracking' | 'unsupported';
}

export interface ChatMessage {
  id: string;
  author: string;
  avatarUrl?: string;
  text: string;
  timestamp: number;
}

export interface PresenceUser {
  author: string;
  avatarUrl?: string;
  location?: string;
  companions?: string[];
  firstSeenTimestamp?: number;
}

export const CHANNEL_NAME = 'obs_teleprompter_channel';

export const DEFAULT_STATE: TeleprompterState = {
  selectedTitle: "Waiting for content...",
  selectedBody: "<p>Select a script section from the control panel to display it here.</p>",
  isVisible: false,
  isScrolling: false,
  scrollSpeed: 3,
  scrollTop: 0,
  fontSize: 32,
  highlightedText: '',
  blurAmount: 6,
  blurOpacity: 0.18,
  rotateY: 0,
  bgOpacity: 0.6,
  mode: 'script',
  chatMessages: [],
  chatSubMode: 'all',
  presenceUsers: [],
  isVoiceActive: false,
  voiceStatus: 'off',
};

export interface ScriptSection {
  id: string;
  title: string;
  body: string;
}

export interface OBSConnectionSettings {
  enabled: boolean;
  url: string;
  password: string;
  sceneName: string;
  titleSourceName: string;
  bodySourceName: string;
}

export const DEFAULT_OBS_SETTINGS: OBSConnectionSettings = {
  enabled: false,
  url: 'ws://127.0.0.1:4455',
  password: '',
  sceneName: '',
  titleSourceName: '',
  bodySourceName: '',
};
