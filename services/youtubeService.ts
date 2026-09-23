import { ChatMessage } from '../types';

export interface YouTubeLiveChatResponse {
  messages: ChatMessage[];
  nextPageToken: string;
  pollingIntervalMillis: number;
}

const channelTitleCache = new Map<string, string>();

async function fetchChannelTitles(apiKey: string, channelIds: string[]): Promise<void> {
  const missingIds = channelIds.filter(id => id && !channelTitleCache.has(id));
  if (missingIds.length === 0) return;

  const batchSize = 50;
  for (let i = 0; i < missingIds.length; i += batchSize) {
    const chunk = missingIds.slice(i, i + batchSize);
    const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${chunk.join(',')}&key=${apiKey}`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data.items) {
        data.items.forEach((item: any) => {
          if (item.id && item.snippet?.title) {
            channelTitleCache.set(item.id, item.snippet.title);
          }
        });
      }
    } catch (e) {
      console.warn("Erro ao buscar títulos de canais no YouTube:", e);
    }
  }
}

export const youtubeService = {
  /**
   * Obtém o liveChatId de um videoId (transmissão ao vivo atual)
   */
  async getLiveChatId(apiKey: string, videoId: string): Promise<string> {
    const url = `https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${videoId}&key=${apiKey}`;
    
    try {
      const response = await fetch(url);
      const data = await response.json();

      if (data.error) {
         throw new Error(data.error.message || 'Erro na API do YouTube');
      }

      if (!data.items || data.items.length === 0) {
        throw new Error('Vídeo não encontrado ou inválido.');
      }

      const liveStreamingDetails = data.items[0].liveStreamingDetails;
      if (!liveStreamingDetails) {
        throw new Error('Este vídeo não é uma transmissão ao vivo.');
      }

      const liveChatId = liveStreamingDetails.activeLiveChatId;
      if (!liveChatId) {
        throw new Error('O chat ao vivo não está ativo para esta transmissão.');
      }

      return liveChatId;
    } catch (err: any) {
      console.error("Erro ao buscar liveChatId:", err);
      throw err;
    }
  },

  /**
   * Busca mensagens do chat ao vivo a partir de um pageToken e resolve os nomes reais dos canais
   */
  async getChatMessages(apiKey: string, liveChatId: string, pageToken?: string): Promise<YouTubeLiveChatResponse> {
    let url = `https://www.googleapis.com/youtube/v3/liveChat/messages?liveChatId=${liveChatId}&part=snippet,authorDetails&key=${apiKey}`;
    
    if (pageToken) {
      url += `&pageToken=${pageToken}`;
    }

    try {
      const response = await fetch(url);
      const data = await response.json();

      if (data.error) {
        throw new Error(data.error.message || 'Erro ao buscar mensagens do chat');
      }

      const rawItems = data.items || [];
      const channelIds: string[] = rawItems.map((item: any) => item.authorDetails?.channelId).filter(Boolean);

      // Resolve o nome real do canal (ex: "João Pedro") usando a API de Channels
      await fetchChannelTitles(apiKey, channelIds);

      const messages: ChatMessage[] = rawItems.map((item: any) => {
        const channelId = item.authorDetails?.channelId;
        const realTitle = channelId ? channelTitleCache.get(channelId) : undefined;
        let authorName = realTitle || item.authorDetails?.displayName || 'Anônimo';

        // Upgrade profile image to higher resolution (YouTube defaults to s88)
        let avatarUrl = item.authorDetails?.profileImageUrl;
        if (avatarUrl && typeof avatarUrl === 'string') {
          avatarUrl = avatarUrl.replace(/=s\d+-/, '=s240-');
        }

        return {
          id: item.id,
          author: authorName,
          avatarUrl: avatarUrl,
          text: item.snippet.displayMessage,
          timestamp: new Date(item.snippet.publishedAt).getTime(),
        };
      });

      return {
        messages,
        nextPageToken: data.nextPageToken,
        pollingIntervalMillis: data.pollingIntervalMillis || 5000,
      };
    } catch (err: any) {
      console.error("Erro ao buscar mensagens:", err);
      throw err;
    }
  }
};
