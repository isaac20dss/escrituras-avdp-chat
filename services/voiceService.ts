// Web Speech API TypeScript definitions
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

/**
 * Normaliza um texto para comparação:
 * remove marcas HTML, pontuação, acentos e converte para minúsculas.
 */
export function normalizeText(text: string): string {
  return text
    .replace(/<[^>]*>?/gm, ' ') // Remove tags HTML
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ') // Remove pontuações
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Encontra a posição percentual (0.0 a 1.0) do trecho falado no texto completo.
 */
export function findMatchPercentage(fullHtml: string, spokenText: string): number | null {
  const normSpoken = normalizeText(spokenText);
  if (!normSpoken || normSpoken.length < 4) return null;

  const normFull = normalizeText(fullHtml);
  if (!normFull) return null;

  // Quebra a fala em palavras recentes (últimas 3 a 6 palavras faladas)
  const spokenWords = normSpoken.split(' ');
  const recentSnippet = spokenWords.slice(-5).join(' ');

  // Busca correspondência exata do snippet recente
  let matchIndex = normFull.indexOf(recentSnippet);

  // Se não achar as 5 palavras completas, tenta com as últimas 3 palavras
  if (matchIndex === -1 && spokenWords.length >= 3) {
    const shorterSnippet = spokenWords.slice(-3).join(' ');
    matchIndex = normFull.indexOf(shorterSnippet);
  }

  // Se não encontrar, tenta busca parcial por palavras individuais consecutivas
  if (matchIndex === -1 && spokenWords.length >= 2) {
    for (let i = spokenWords.length - 2; i >= 0; i--) {
      const pair = spokenWords.slice(i, i + 2).join(' ');
      matchIndex = normFull.indexOf(pair);
      if (matchIndex !== -1) break;
    }
  }

  if (matchIndex === -1) return null;

  // Retorna a proporção de caracteres onde a frase foi encontrada
  const pct = matchIndex / Math.max(1, normFull.length);
  return Math.min(1, Math.max(0, pct));
}

class VoiceService {
  private recognition: any = null;
  private isListening = false;
  private onMatchCallback: ((pct: number) => void) | null = null;
  private onStatusCallback: ((status: 'off' | 'listening' | 'tracking' | 'error' | 'unsupported') => void) | null = null;
  private currentFullHtml = '';

  public isSupported(): boolean {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  public setScriptureContent(html: string) {
    this.currentFullHtml = html;
  }

  public start(
    currentHtml: string,
    onMatch: (pct: number) => void,
    onStatusChange: (status: 'off' | 'listening' | 'tracking' | 'error' | 'unsupported') => void
  ) {
    if (!this.isSupported()) {
      onStatusChange('unsupported');
      return;
    }

    this.currentFullHtml = currentHtml;
    this.onMatchCallback = onMatch;
    this.onStatusCallback = onStatusChange;
    this.isListening = true;

    const SpeechClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SpeechClass();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'pt-BR';

    this.recognition.onstart = () => {
      if (this.onStatusCallback) this.onStatusCallback('listening');
    };

    this.recognition.onresult = (event: any) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript + ' ';
      }

      if (transcript.trim()) {
        const pct = findMatchPercentage(this.currentFullHtml, transcript);
        if (pct !== null && this.onMatchCallback) {
          this.onMatchCallback(pct);
          if (this.onStatusCallback) this.onStatusCallback('tracking');
        }
      }
    };

    this.recognition.onerror = (event: any) => {
      console.warn('Voice recognition error:', event.error);
      if (event.error === 'not-allowed') {
        this.isListening = false;
        if (this.onStatusCallback) this.onStatusCallback('error');
      }
    };

    this.recognition.onend = () => {
      // Reconexão automática se ainda deve estar ativo
      if (this.isListening) {
        try {
          this.recognition.start();
        } catch (e) {
          // Ignora se já estiver iniciando
        }
      } else {
        if (this.onStatusCallback) this.onStatusCallback('off');
      }
    };

    try {
      this.recognition.start();
    } catch (e) {
      console.error('Failed to start speech recognition', e);
    }
  }

  public stop() {
    this.isListening = false;
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {}
      this.recognition = null;
    }
    if (this.onStatusCallback) this.onStatusCallback('off');
  }
}

export const voiceService = new VoiceService();
