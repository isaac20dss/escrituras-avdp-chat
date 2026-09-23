import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BroadcastChannel } from 'broadcast-channel'; 
import { Play, Pause, Eye, EyeOff, RefreshCw, Cast, Sliders, AlertTriangle, Save, Type, Plus, Minus, Plug, Radio, ChevronUp, ChevronDown, Highlighter, X, Search, RotateCw, Layers, MessageSquare, Users, Download, PlayCircle, StopCircle, Mic, MicOff, Copy, Check, MapPin, BarChart3, Database, Upload, Edit3 } from 'lucide-react';
import { CHANNEL_NAME, DEFAULT_OBS_SETTINGS, DEFAULT_STATE, OBSConnectionSettings, TeleprompterState, ScriptSection, ChatMessage } from '../types';
import { fetchScriptSections, extractDocId, DEFAULT_DOC_ID } from '../services/docService';
import { htmlToOBSPlainText, obsWebSocketService } from '../services/obsWebSocketService';
import { stateSyncService } from '../services/stateSync';
import { youtubeService } from '../services/youtubeService';
import { voiceService } from '../services/voiceService';
import { audienceDatabaseService } from '../services/audienceDatabaseService';
import { formatNamesList } from './DisplayOutput';

const ControlPanel: React.FC = () => {
  const [sections, setSections] = useState<ScriptSection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  
  const [docInput, setDocInput] = useState('');
  const [currentDocId, setCurrentDocId] = useState(DEFAULT_DOC_ID);
  const [isEditingId, setIsEditingId] = useState(false);
  
  const [state, setState] = useState<TeleprompterState>(DEFAULT_STATE);
  const [obsSettings, setObsSettings] = useState<OBSConnectionSettings>(DEFAULT_OBS_SETTINGS);
  const [obsConnected, setObsConnected] = useState(false);
  const [obsStatus, setObsStatus] = useState<string>('OBS desconectado');
  const [obsSyncError, setObsSyncError] = useState<string | null>(null);
  const [obsExpanded, setObsExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const previewScrollRef = useRef<HTMLDivElement>(null);
  const isInternalUpdate = useRef(false);
  const syncTimeoutRef = useRef<number | null>(null);
  const searchTimeoutRef = useRef<number | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [previewScale, setPreviewScale] = useState<number>(1);

  // Chat Mode States
  const DEFAULT_API_KEY: string = (import.meta as any).env?.VITE_YOUTUBE_API_KEY ?? '';
  const [ytApiKey, setYtApiKey] = useState(DEFAULT_API_KEY);
  const [ytVideoId, setYtVideoId] = useState('');
  const [ytLiveChatId, setYtLiveChatId] = useState('');
  const [presenceKeyword, setPresenceKeyword] = useState('');
  const [isPollingChat, setIsPollingChat] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [presenceUsers, setPresenceUsers] = useState<{ author: string; avatarUrl?: string; location?: string; companions?: string[] }[]>([]);
  const [copiedPresence, setCopiedPresence] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  
  const [editingUserIndex, setEditingUserIndex] = useState<number | null>(null);
  const [editAuthor, setEditAuthor] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editCompanions, setEditCompanions] = useState('');
  
  const pollingTimeoutRef = useRef<number | null>(null);
  const nextPageTokenRef = useRef<string | undefined>(undefined);
  const chatMessagesRef = useRef<ChatMessage[]>([]); // Mantém o histórico completo localmente

  const updateState = useCallback((newState: Partial<TeleprompterState>) => {
    setState(prev => {
      const updated = { ...prev, ...newState };
      // Envia via BroadcastChannel (abas do mesmo browser)
      channelRef.current?.postMessage(updated);
      // Envia via WebSocket local (OBS Browser Source)
      stateSyncService.send(updated);
      return updated;
    });
  }, []);

  // Load chat configs from local storage on mount
  useEffect(() => {
    const savedApiKey = localStorage.getItem('obs_teleprompter_yt_api_key');
    const savedVideoId = localStorage.getItem('obs_teleprompter_yt_video_id');
    const savedKeyword = localStorage.getItem('obs_teleprompter_presence_keyword');
    if (savedApiKey) setYtApiKey(savedApiKey);
    else setYtApiKey(DEFAULT_API_KEY);
    if (savedVideoId) setYtVideoId(savedVideoId);
    if (savedKeyword) setPresenceKeyword(savedKeyword);
  }, []);

  // Sync state.mode with UI selection if needed, although state.mode is the single source of truth now
  const setPanelMode = (mode: 'script' | 'chat') => {
    updateState({ mode });
  };

  const handleStartChat = async () => {
    if (!ytApiKey || !ytVideoId) {
      setChatError('Preencha a API Key e o Video ID.');
      return;
    }
    setChatError(null);
    setIsPollingChat(true);
    nextPageTokenRef.current = undefined;

    localStorage.setItem('obs_teleprompter_yt_api_key', ytApiKey);
    localStorage.setItem('obs_teleprompter_yt_video_id', ytVideoId);
    localStorage.setItem('obs_teleprompter_presence_keyword', presenceKeyword);

    try {
      const chatId = await youtubeService.getLiveChatId(ytApiKey, ytVideoId);
      setYtLiveChatId(chatId);
      pollChatMessages(chatId);
    } catch (err: any) {
      setChatError(err.message || 'Erro ao conectar ao chat.');
      setIsPollingChat(false);
    }
  };

  const handleStopChat = () => {
    setIsPollingChat(false);
    setYtLiveChatId('');
    if (pollingTimeoutRef.current) {
      clearTimeout(pollingTimeoutRef.current);
    }
  };

  const pollChatMessages = useCallback(async (chatId: string) => {
    if (!isPollingChat && !chatId) return;
    
    try {
      const response = await youtubeService.getChatMessages(ytApiKey, chatId, nextPageTokenRef.current);
      nextPageTokenRef.current = response.nextPageToken;
      
      if (response.messages.length > 0) {
        // Atualizar lista completa local
        const newAllMessages = [...chatMessagesRef.current, ...response.messages];
        chatMessagesRef.current = newAllMessages;

        // Extrair nomes únicos e localização (se presente em qualquer mensagem)
        const keywordLower = presenceKeyword.toLowerCase().trim();
        const BRAZIL_STATES = new Set([
          'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 
          'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 
          'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
        ]);

        const locStopWords = new Set([
          'casa', 'aqui', 'hoje', 'ontem', 'longe', 'deus', 'jesus', 'amém', 'amem',
          'boa', 'bom', 'boa noite', 'boa tarde', 'bom dia', 'noite', 'tarde', 'dia',
          'paz', 'graça', 'glória', 'gloria', 'senhor', 'live', 'chat', 'vivo',
          'todos', 'pessoal', 'gente', 'família', 'familia', 'igreja',
          'com', 'meu', 'minha', 'nome', 'sou', 'assistindo', 'falando',
        ]);

        const formatCity = (raw: string): string => {
          return raw.trim().split(/\s+/).map(w => {
            const lower = w.toLowerCase();
            if (['de', 'da', 'do', 'das', 'dos', 'e'].includes(lower) && raw.trim().split(/\s+/).length > 1) {
              return lower;
            }
            return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
          }).join(' ');
        };

        const extractLoc = (text: string): string | undefined => {
          if (!text || text.length < 3) return undefined;

          // Estratégia 1: Prefixo explícito + Cidade/UF  
          // Ex: "sou de São Paulo/SP", "moro em Recife-PE", "assistindo de Salvador, BA"
          const prefixWithUF = text.match(/\b(?:sou d[eao]|moro em|assistindo d[eao]|falando d[eao]|direto d[eao]|aqui d[eao]|lá d[eao])\s+([A-ZÀ-Úa-zà-ú][A-ZÀ-Úa-zà-ú\s]{1,25}?)\s*[\/\-,]\s*([A-Za-z]{2})\b/i);
          if (prefixWithUF) {
            const uf = prefixWithUF[2].toUpperCase();
            if (BRAZIL_STATES.has(uf)) {
              return `${formatCity(prefixWithUF[1])}, ${uf}`;
            }
          }

          // Estratégia 2: Cidade + UF com separador (sem prefixo necessário)
          // Ex: "Belo Horizonte/MG", "Curitiba-PR", "Manaus, AM", "Rio de Janeiro / RJ"
          const cityUfSep = text.match(/\b([A-ZÀ-Úa-zà-ú][A-ZÀ-Úa-zà-ú\s]{1,25}?)\s*[\/\-,]\s*([A-Za-z]{2})\b/i);
          if (cityUfSep) {
            const uf = cityUfSep[2].toUpperCase();
            const city = cityUfSep[1].trim();
            if (BRAZIL_STATES.has(uf) && city.length >= 3 && !locStopWords.has(city.toLowerCase())) {
              return `${formatCity(city)}, ${uf}`;
            }
          }

          // Estratégia 3: Cidade + UF separados por espaço (sem separador)
          // Ex: "Salvador BA", "São Paulo SP", "Recife PE"
          const cityUfSpace = text.match(/\b([A-ZÀ-Úa-zà-ú][A-ZÀ-Úa-zà-ú\s]{2,25}?)\s+([A-Z]{2})\b/);
          if (cityUfSpace) {
            const uf = cityUfSpace[2].toUpperCase();
            const city = cityUfSpace[1].trim();
            if (BRAZIL_STATES.has(uf) && city.length >= 3 && !locStopWords.has(city.toLowerCase())) {
              return `${formatCity(city)}, ${uf}`;
            }
          }

          // Estratégia 4: Prefixo explícito sem UF
          // Ex: "sou de Campinas", "moro em Florianópolis", "aqui de Manaus"
          const prefixOnly = text.match(/\b(?:sou d[eao]|moro em|assistindo d[eao]|falando d[eao]|direto d[eao]|aqui d[eao]|lá d[eao])\s+([A-ZÀ-Úa-zà-ú][A-ZÀ-Úa-zà-ú\s]{2,30}?)(?:\s*[.!?;,]|\s+(?:com|e |assistindo|aqui|hoje|paz|amém|amem|bom|boa|glória|gloria)|$)/i);
          if (prefixOnly) {
            const rawLoc = prefixOnly[1].trim();
            // Remove trailing stop words
            const cleaned = rawLoc.replace(/\s+(?:com|e|assistindo|aqui|hoje|paz|amém|amem|bom|boa|glória|gloria)$/i, '').trim();
            if (cleaned.length >= 3 && !locStopWords.has(cleaned.toLowerCase())) {
              return formatCity(cleaned);
            }
          }

          return undefined;
        };

        const extractSelfPersonName = (text: string): string | undefined => {
          if (!text) return undefined;
          const match = text.match(/\b(?:sou\s+[oa]?|meu\s+nome\s+é|aqui\s+é\s+[oa]?)\s+([A-ZÀ-Úa-z]{3,20}(?:\s+[A-ZÀ-Úa-z]{3,20})?)\b/i);
          if (match) {
            const raw = match[1].trim();
            const stopWords = ['casa', 'igreja', 'ao vivo', 'deus', 'jesus', 'amem', 'amém', 'hoje', 'pessoal'];
            if (!stopWords.includes(raw.toLowerCase())) {
              return raw.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
            }
          }
          return undefined;
        };

        const extractComp = (text: string, currentAuthorName: string, selfName?: string): string[] => {
          if (!text || text.length < 5) return [];
          const match = text.match(/\b(?:com|junto com|assistindo com|com a|com o|com minha|com meu|eu e|eu e a|eu e o)\s+([^.\n!?:;]+)/i);
          if (!match) return [];

          const rawSegment = match[1].trim();
          const cleanSegment = rawSegment
            .split(/\b(?:de|em|moro em|assistindo de|falando de|direto de)\b/i)[0]
            .replace(/\b(?:e esposa|e marido|e filho|e filha|e irmao|e irma|minha|meu|familia|familiares|todos|aqui|hoje|juntos)\b/gi, ' ')
            .trim();

          const parts = cleanSegment
            .split(/\s*(?:,| e | & )\s*/i)
            .map(p => p.replace(/^(?:a|o|minha|meu|esposa|marido|filho|filha|irmao|irma)\s+/i, '').trim())
            .filter(p => p.length >= 2 && p.length <= 25 && !/^(casa|igreja|tv|live|chat|deus|jesus|amem|pessoal|todos)$/i.test(p));

          const authorLower = currentAuthorName.toLowerCase();
          const selfLower = selfName?.toLowerCase();

          const unique = Array.from(new Set(parts))
            .map(name => name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' '))
            .filter(name => {
              const nameLower = name.toLowerCase();
              if (authorLower.includes(nameLower) || nameLower.includes(authorLower)) return false;
              if (selfLower && (selfLower.includes(nameLower) || nameLower.includes(selfLower))) return false;
              return true;
            });

          return unique.slice(0, 5);
        };

        setPresenceUsers(prev => {
          const userMap = new Map<string, { authorKey: string; author: string; avatarUrl?: string; location?: string; companions?: string[]; firstSeenTimestamp?: number }>();
          prev.forEach(u => {
            const k = (u as any).authorKey || u.author;
            if (k) {
              userMap.set(k, { authorKey: k, ...u, companions: u.companions ? [...u.companions] : undefined });
            }
          });

          if (response && Array.isArray(response.messages)) {
            response.messages.forEach(m => {
              if (!m || !m.author || typeof m.author !== 'string' || !m.text || typeof m.text !== 'string') return;

              if (!keywordLower || m.text.toLowerCase().includes(keywordLower)) {
                const foundLoc = extractLoc(m.text);
                const selfName = extractSelfPersonName(m.text);
                const effectiveAuthor = selfName || m.author;
                const foundComp = extractComp(m.text, effectiveAuthor, selfName);

                // Busca a localização salva no banco de dados local
                const savedLoc = audienceDatabaseService.getSavedLocation(effectiveAuthor) || audienceDatabaseService.getSavedLocation(m.author);
                const effectiveLoc = foundLoc || savedLoc;

                // Grava presença e estatísticas no banco de dados local
                audienceDatabaseService.recordParticipant(effectiveAuthor, m.avatarUrl, effectiveLoc, foundComp);

                const mapKey = m.author;

                if (!userMap.has(mapKey)) {
                  userMap.set(mapKey, { 
                    authorKey: mapKey,
                    author: effectiveAuthor, 
                    avatarUrl: m.avatarUrl,
                    location: effectiveLoc,
                    companions: foundComp.length > 0 ? foundComp : undefined,
                    firstSeenTimestamp: m.timestamp || Date.now()
                  });
                } else {
                  const existing = userMap.get(mapKey);
                  if (!existing) return;
                  let updated = false;

                  if (selfName && existing.author !== selfName) {
                    existing.author = selfName;
                    updated = true;
                  }

                  if (m.avatarUrl) {
                    existing.avatarUrl = m.avatarUrl;
                    updated = true;
                  }

                  if (effectiveLoc && effectiveLoc !== existing.location) {
                    existing.location = effectiveLoc;
                    updated = true;
                  }

                  if (foundComp.length > 0) {
                    const currentComps = existing.companions || [];
                    const authorLower = (existing.author || '').toLowerCase();
                    const newCompsFiltered = foundComp.filter(c => c && !authorLower.includes(c.toLowerCase()) && !c.toLowerCase().includes(authorLower));
                    const combined = Array.from(new Set([...currentComps, ...newCompsFiltered]));
                    if (combined.length !== currentComps.length) {
                      existing.companions = combined;
                      updated = true;
                    }
                  }

                  if (updated) {
                    userMap.set(mapKey, { ...existing });
                  }
                }
              }
            });
          }

          const nextList = Array.from(userMap.values());
          nextList.sort((a, b) => (a.firstSeenTimestamp || 0) - (b.firstSeenTimestamp || 0));

          updateState({ presenceUsers: nextList });

          return nextList;
        });

        // Limitar array enviado ao OBS para as últimas 50 mensagens para não pesar
        const last50 = newAllMessages.slice(-50);
        updateState({ chatMessages: last50 });
      }

      // Continuar polling se ainda estiver ativo
      // We need to check if isPollingChat is still true but in a timeout closure it might be stale.
      // A ref could be used, or just clear timeout on stop.
      pollingTimeoutRef.current = window.setTimeout(() => {
        pollChatMessages(chatId);
      }, response.pollingIntervalMillis || 5000);
      
    } catch (err: any) {
      setChatError(err.message || 'Erro ao buscar mensagens. Polling interrompido.');
      setIsPollingChat(false);
    }
  }, [ytApiKey, presenceKeyword, updateState]);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollingTimeoutRef.current) clearTimeout(pollingTimeoutRef.current);
    };
  }, []);

  const copyPresenceList = () => {
    const lines = presenceUsers.map(u => {
      let line = u.author;
      if (u.companions && u.companions.length > 0) {
        line += ` (com ${u.companions.join(', ')})`;
      }
      if (u.location) {
        line += ` — ${u.location}`;
      }
      return line;
    });
    const textToCopy = lines.join('\n');
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopiedPresence(true);
      setTimeout(() => setCopiedPresence(false), 2000);
    });
  };

  const handleStartEditUser = (index: number) => {
    const user = presenceUsers[index];
    if (!user) return;
    setEditingUserIndex(index);
    setEditAuthor(user.author);
    setEditLocation(user.location || '');
    setEditCompanions(user.companions ? user.companions.join(', ') : '');
  };

  const handleSaveUserEdit = () => {
    if (editingUserIndex === null) return;
    const user = presenceUsers[editingUserIndex];
    if (!user) return;

    const newAuthor = editAuthor.trim() || user.author;
    const newLocation = editLocation.trim() || undefined;
    const newComps = editCompanions
      .split(',')
      .map(c => c.trim())
      .filter(c => c.length > 0);

    const updatedUser = {
      ...user,
      author: newAuthor,
      location: newLocation,
      companions: newComps.length > 0 ? newComps : undefined
    };

    const nextList = [...presenceUsers];
    nextList[editingUserIndex] = updatedUser;
    setPresenceUsers(nextList);

    // Sincroniza com o display e OBS
    updateState({ presenceUsers: nextList });

    // Grava as alterações no banco de dados local para salvar para transmissões futuras
    audienceDatabaseService.recordParticipant(newAuthor, user.avatarUrl, newLocation, newComps);

    setEditingUserIndex(null);
  };

  useEffect(() => {
    if (!previewContainerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        if (width > 0) {
          setPreviewScale(width / 560);
        }
      }
    });
    observer.observe(previewContainerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    // Aplica um percentual de scroll (0-1) ao div de preview do painel
    const applyScrollPercent = (pct: number) => {
      if (!previewScrollRef.current) return;
      const el = previewScrollRef.current;
      el.scrollTop = pct * (el.scrollHeight - el.clientHeight);
    };

    // BroadcastChannel: comunicação entre abas do mesmo browser
    channelRef.current = new BroadcastChannel(CHANNEL_NAME);
    channelRef.current.onmessage = (msg: TeleprompterState) => {
      isInternalUpdate.current = true;
      setState(msg);
      if (msg.scrollTop !== undefined) applyScrollPercent(msg.scrollTop);
      setTimeout(() => { isInternalUpdate.current = false; }, 50);
    };

    // WebSocket local: comunicação com OBS Browser Source (processo isolado)
    stateSyncService.connect();
    const unsubscribe = stateSyncService.onMessage((msg: TeleprompterState) => {
      isInternalUpdate.current = true;
      setState(msg);
      if (msg.scrollTop !== undefined) applyScrollPercent(msg.scrollTop);
      setTimeout(() => { isInternalUpdate.current = false; }, 50);
    });

    const savedId = localStorage.getItem('obs_teleprompter_doc_id');
    if (savedId) {
      setCurrentDocId(savedId);
      setDocInput(savedId);
    } else {
      setDocInput(DEFAULT_DOC_ID);
    }

    const savedObsSettings = localStorage.getItem('obs_teleprompter_obs_settings');
    if (savedObsSettings) {
      try {
        const parsed = JSON.parse(savedObsSettings) as Partial<OBSConnectionSettings>;
        setObsSettings({ ...DEFAULT_OBS_SETTINGS, ...parsed, password: '' });
      } catch (parseError) {
        console.warn('Could not parse OBS settings from localStorage.', parseError);
      }
    }

    return () => {
      unsubscribe();
      stateSyncService.disconnect();
      channelRef.current?.close();
      void obsWebSocketService.disconnect();
    };
  }, []);



  const loadData = useCallback(async () => {
    if (!currentDocId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchScriptSections(currentDocId);
      setSections(data);
      setLastUpdated(new Date());
    } catch (err) {
      setError("Failed to load script. Check permissions or URL.");
      setSections([]);
    } finally {
      setLoading(false);
    }
  }, [currentDocId]);

  useEffect(() => {
    loadData();
  }, [currentDocId]);

  const handleDocIdSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const extracted = extractDocId(docInput);
    if (extracted) {
      setCurrentDocId(extracted);
      setDocInput(extracted);
      localStorage.setItem('obs_teleprompter_doc_id', extracted);
      setIsEditingId(false);
    } else {
      setError("Invalid Google Doc URL or ID");
    }
  };

  const handleSectionClick = (section: ScriptSection) => {
    updateState({ 
      selectedTitle: section.title,
      selectedBody: section.body,
      scrollTop: 0 
    });
    if (previewScrollRef.current) previewScrollRef.current.scrollTop = 0;
  };

  const handleManualScroll = () => {
    if (isInternalUpdate.current || !previewScrollRef.current) return;
    const el = previewScrollRef.current;
    const scrollable = el.scrollHeight - el.clientHeight;
    const pct = scrollable > 0 ? el.scrollTop / scrollable : 0;
    updateState({ scrollTop: pct });
  };

  // Captura seleção de texto no preview e envia como highlight
  const handlePreviewMouseUp = () => {
    const selected = window.getSelection()?.toString().trim();
    if (selected && selected.length > 1) {
      updateState({ highlightedText: selected });
      window.getSelection()?.removeAllRanges();
    }
  };

  const clearHighlight = () => updateState({ highlightedText: '' });

  // Destaca matches de busca no HTML (apenas no preview — não vai para o OBS)
  const applySearchMarks = (html: string, query: string): string => {
    if (!query || query.trim().length < 2) return html;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return html.replace(
      new RegExp(`(${escaped})(?![^<>]*>)`, 'gi'),
      '<mark class="tp-search-mark" style="background:rgba(250,204,21,0.4);border-radius:2px;padding:0 2px;color:inherit;">$1</mark>'
    );
  };

  // Scroll até o primeiro match da busca
  useEffect(() => {
    if (!searchQuery || !previewScrollRef.current) return;
    if (searchTimeoutRef.current) window.clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = window.setTimeout(() => {
      const firstMatch = previewScrollRef.current?.querySelector('.tp-search-mark') as HTMLElement | null;
      if (firstMatch) firstMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 200);
    return () => { if (searchTimeoutRef.current) window.clearTimeout(searchTimeoutRef.current); };
  }, [searchQuery, state.selectedBody]);

  // Quantidade de matches da busca
  const searchMatchCount = (() => {
    if (!searchQuery || searchQuery.trim().length < 2) return 0;
    const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const plain = state.selectedBody.replace(/<[^>]+>/g, '');
    return (plain.match(new RegExp(escaped, 'gi')) || []).length;
  })();

  const bodyClasses = "leading-relaxed text-white font-sans text-left [&>p]:mb-6 [&>ul]:mb-6 [&>ol]:mb-6 [&>ul]:list-disc [&>ul]:pl-6 [&>ol]:list-decimal [&>ol]:pl-6";

  const toggleVisibility = () => updateState({ isVisible: !state.isVisible });
  const toggleScroll = () => updateState({ isScrolling: !state.isScrolling });

  const toggleVoiceControl = () => {
    if (state.isVoiceActive) {
      voiceService.stop();
      updateState({ isVoiceActive: false, voiceStatus: 'off' });
    } else {
      if (!voiceService.isSupported()) {
        alert('O seu navegador não possui suporte nativo para reconhecimento de voz da Web Speech API. Recomendamos usar o Google Chrome ou Microsoft Edge.');
        return;
      }
      updateState({ isVoiceActive: true, voiceStatus: 'listening' });
      voiceService.start(
        state.selectedBody,
        (pct) => {
          updateState({ scrollTop: pct });
        },
        (status) => {
          updateState({ voiceStatus: status });
        }
      );
    }
  };

  // Atualiza o conteúdo da escritura no serviço de voz quando muda a seleção
  useEffect(() => {
    voiceService.setScriptureContent(state.selectedBody);
  }, [state.selectedBody]);
  const handleSpeedChange = (e: React.ChangeEvent<HTMLInputElement>) => updateState({ scrollSpeed: Number(e.target.value) });
  
  const adjustFontSize = (delta: number) => {
    const newSize = Math.max(16, Math.min(120, state.fontSize + delta));
    updateState({ fontSize: newSize });
  };

  const updateOBSSettings = (newSettings: Partial<OBSConnectionSettings>) => {
    setObsSettings((prev) => {
      const next = { ...prev, ...newSettings };
      localStorage.setItem(
        'obs_teleprompter_obs_settings',
        JSON.stringify({ ...next, password: '' })
      );
      return next;
    });
  };

  const syncStateToOBS = useCallback(async (force = false) => {
    if ((!obsConnected && !force) || !obsSettings.enabled) {
      return;
    }

    try {
      setObsSyncError(null);

      await Promise.all([
        obsWebSocketService.setTextSource(obsSettings.titleSourceName, state.selectedTitle || ''),
        obsWebSocketService.setTextSource(
          obsSettings.bodySourceName,
          htmlToOBSPlainText(state.selectedBody || '')
        ),
      ]);

      if (obsSettings.sceneName.trim()) {
        await Promise.all([
          obsWebSocketService.setSceneItemEnabled(
            obsSettings.sceneName,
            obsSettings.titleSourceName,
            state.isVisible
          ),
          obsWebSocketService.setSceneItemEnabled(
            obsSettings.sceneName,
            obsSettings.bodySourceName,
            state.isVisible
          ),
        ]);
      }

      setObsStatus('Conteudo sincronizado com o OBS');
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : 'Falha ao sincronizar com o OBS.';
      setObsSyncError(message);
      setObsStatus('Erro na sincronizacao com o OBS');
    }
  }, [obsConnected, obsSettings, state.isVisible, state.selectedBody, state.selectedTitle]);

  useEffect(() => {
    if (!obsConnected || !obsSettings.enabled) {
      return;
    }

    if (syncTimeoutRef.current) {
      window.clearTimeout(syncTimeoutRef.current);
    }

    syncTimeoutRef.current = window.setTimeout(() => {
      void syncStateToOBS();
    }, 120);

    return () => {
      if (syncTimeoutRef.current) {
        window.clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [obsConnected, obsSettings.enabled, state.isVisible, state.selectedBody, state.selectedTitle, syncStateToOBS]);

  const handleOBSConnect = async () => {
    setObsSyncError(null);
    setObsStatus('Conectando ao OBS...');

    try {
      await obsWebSocketService.connect(obsSettings);
      setObsConnected(true);
      setObsStatus('Conectado ao OBS');
      await syncStateToOBS(true);
    } catch (connectError) {
      const message = connectError instanceof Error ? connectError.message : 'Falha ao conectar ao OBS.';
      setObsConnected(false);
      setObsSyncError(message);
      setObsStatus('Falha na conexao com o OBS');
    }
  };

  const handleOBSDisconnect = async () => {
    await obsWebSocketService.disconnect();
    setObsConnected(false);
    setObsStatus('OBS desconectado');
  };

  return (
    <div className="flex h-screen bg-gray-900 text-white font-sans overflow-hidden">

      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <div className="w-1/3 min-w-[320px] border-r border-gray-700 flex flex-col bg-gray-800">

        {/* Mode Toggle */}
        <div className="flex p-2 bg-gray-900 border-b border-gray-700 shrink-0">
          <button 
            onClick={() => setPanelMode('script')}
            className={`flex-1 py-2 text-xs font-semibold rounded-md flex items-center justify-center gap-2 transition-colors ${state.mode !== 'chat' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`}
          >
            <Type size={14} /> Escrituras
          </button>
          <button 
            onClick={() => setPanelMode('chat')}
            className={`flex-1 py-2 text-xs font-semibold rounded-md flex items-center justify-center gap-2 transition-colors ${state.mode === 'chat' ? 'bg-red-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`}
          >
            <MessageSquare size={14} /> Chat ao Vivo
          </button>
        </div>

        {/* Sub-Mode Toggle para Modo Chat: Chat Geral vs Lista de Presença na Tela */}
        {state.mode === 'chat' && (
          <div className="flex p-2 bg-gray-900/90 border-b border-gray-700/80 shrink-0 gap-2">
            <button 
              onClick={() => updateState({ chatSubMode: 'all' })}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-md flex items-center justify-center gap-1.5 transition-all ${
                (state.chatSubMode ?? 'all') === 'all' 
                  ? 'bg-red-600 text-white shadow' 
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
              }`}
            >
              <MessageSquare size={13} /> Chat Geral
            </button>
            <button 
              onClick={() => updateState({ chatSubMode: 'presence' })}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-md flex items-center justify-center gap-1.5 transition-all ${
                state.chatSubMode === 'presence' 
                  ? 'bg-red-600 text-white shadow' 
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
              }`}
            >
              <Users size={13} /> Presença na Tela
            </button>
          </div>
        )}

        {/* Cabeçalho — documento e refresh (Só visível em Escrituras) */}
        {state.mode !== 'chat' && (
          <div className="p-4 border-b border-gray-700 bg-gray-900 flex flex-col gap-3 shadow-md z-10 flex-shrink-0">
          <div className="relative">
             {!isEditingId ? (
                <div className="flex items-center justify-between group">
                   <div className="flex flex-col overflow-hidden">
                      <span className="text-[10px] uppercase text-gray-500 font-bold tracking-wider">Documento Conectado</span>
                      <div className="text-sm text-blue-300 truncate font-mono" title={currentDocId}>
                        {currentDocId.substring(0, 20)}...
                      </div>
                   </div>
                   <button onClick={() => setIsEditingId(true)} className="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded text-gray-300 transition-colors">Alterar</button>
                </div>
             ) : (
                <form onSubmit={handleDocIdSubmit} className="flex gap-2">
                   <input 
                      type="text" 
                      value={docInput}
                      onChange={(e) => setDocInput(e.target.value)}
                      placeholder="Cole o link do Google Doc"
                      className="flex-1 bg-gray-800 border border-gray-600 rounded text-xs px-2 py-1 text-white focus:outline-none focus:border-blue-500"
                      autoFocus
                   />
                   <button type="submit" className="bg-blue-600 hover:bg-blue-500 p-1.5 rounded text-white transition-colors"><Save size={14} /></button>
                </form>
             )}
          </div>
          <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-800">
             <div className="flex items-center gap-2 text-gray-400">
               <Cast size={14} />
               <span className="text-xs">{lastUpdated ? `Atualizado: ${lastUpdated.toLocaleTimeString()}` : 'Não carregado'}</span>
             </div>
             <button onClick={loadData} disabled={loading} className="flex items-center gap-1.5 text-xs bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded-full transition-all disabled:opacity-50">
               <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
               Atualizar
             </button>
           </div>
        </div>
        )}

        {/* Área de conteúdo dinâmico da Sidebar */}
        <div className="flex-1 overflow-y-auto relative no-scrollbar">
          {state.mode !== 'chat' ? (
            <div className="p-2 space-y-2">
          {error && (
             <div className="p-4 bg-red-900/20 border border-red-700/50 rounded-lg text-red-200 text-sm flex gap-3 items-start">
                <AlertTriangle className="shrink-0 text-red-400" size={18} />
                <div className="overflow-hidden">
                   <p className="font-semibold mb-1">Erro de Conexão</p>
                   <p className="text-xs opacity-80 break-words">{error}</p>
                   <button onClick={loadData} className="mt-2 text-xs bg-red-900/50 hover:bg-red-800 px-2 py-1 rounded">Tentar novamente</button>
                </div>
             </div>
          )}
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => handleSectionClick(section)}
              className={`w-full text-left p-4 rounded-lg transition-all border border-transparent ${
                state.selectedTitle === section.title ? 'bg-blue-600 border-blue-400 shadow-lg' : 'bg-gray-700 hover:bg-gray-600'
              }`}
            >
              <p className="font-medium text-sm line-clamp-1">{section.title}</p>
              <p className="text-xs mt-1 line-clamp-1 opacity-60 italic">{section.body.replace(/<[^>]*>?/gm, ' ')}</p>
            </button>
          ))}
            </div>
          ) : (
            <div className="p-4 flex flex-col gap-4">
              <div className="bg-gray-900/50 p-4 rounded-xl border border-gray-700/50 flex flex-col gap-3">
                <h3 className="text-xs uppercase text-gray-400 font-bold tracking-wider mb-1">Configuração do Chat</h3>
                
                <div>
                  <label className="text-[10px] text-gray-500 mb-1 block">YouTube API Key</label>
                  <input type="password" value={ytApiKey} onChange={e => setYtApiKey(e.target.value)} placeholder="AIzaSy..." className="w-full bg-gray-800 border border-gray-600 rounded text-xs px-3 py-2 text-white focus:outline-none focus:border-red-500" />
                </div>
                
                <div>
                  <label className="text-[10px] text-gray-500 mb-1 block">ID do Vídeo / Live</label>
                  <input type="text" value={ytVideoId} onChange={e => setYtVideoId(e.target.value)} placeholder="Ex: dQw4w9WgXcQ" className="w-full bg-gray-800 border border-gray-600 rounded text-xs px-3 py-2 text-white focus:outline-none focus:border-red-500" />
                </div>

                <div>
                  <label className="text-[10px] text-gray-500 mb-1 block">Filtro por Palavra (Opcional)</label>
                  <input type="text" value={presenceKeyword} onChange={e => setPresenceKeyword(e.target.value)} placeholder="Vazio = captura todas as pessoas (1ª fala)" className="w-full bg-gray-800 border border-gray-600 rounded text-xs px-3 py-2 text-white focus:outline-none focus:border-red-500" />
                </div>

                {chatError && (
                  <div className="p-3 bg-red-900/20 border border-red-700/50 rounded-lg text-red-200 text-xs">
                    {chatError}
                  </div>
                )}

                {!isPollingChat ? (
                  <button onClick={handleStartChat} className="mt-2 w-full bg-red-600 hover:bg-red-500 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors">
                    <PlayCircle size={16} /> Conectar ao YouTube
                  </button>
                ) : (
                  <button onClick={handleStopChat} className="mt-2 w-full bg-gray-700 hover:bg-gray-600 border border-gray-500 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors text-white">
                    <StopCircle size={16} /> Parar Conexão
                  </button>
                )}
              </div>

              <div className="bg-gray-900/50 p-4 rounded-xl border border-gray-700/50 flex flex-col gap-3 min-h-[200px]">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs uppercase text-gray-400 font-bold tracking-wider flex items-center gap-2">
                    <Users size={14} /> Lista de Presença
                  </h3>
                  <span className="text-xs font-mono bg-gray-800 px-2 py-1 rounded-full text-gray-300">
                    {presenceUsers.length} {presenceUsers.length === 1 ? 'conta' : 'contas'} ({presenceUsers.reduce((sum, u) => sum + 1 + (u && Array.isArray(u.companions) ? u.companions.length : 0), 0)} pessoas)
                  </span>
                </div>
                
                <div className="flex-1 bg-gray-800/50 rounded-lg border border-gray-700 p-2 overflow-y-auto max-h-[320px]">
                  {presenceUsers.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-xs text-gray-500 text-center p-4 italic">
                      {presenceKeyword 
                        ? `Nenhum comentário com a palavra "${presenceKeyword}" capturado ainda.`
                        : `Aguardando a primeira mensagem das pessoas no chat...`
                      }
                    </div>
                  ) : (
                    <ul className="space-y-2">
                      {presenceUsers.map((user, i) => (
                        <li key={i} className="text-xs text-gray-300 p-2 rounded flex flex-col gap-2 border bg-gray-800/40 border-gray-700/60 hover:bg-gray-700/40 transition-all">
                          {editingUserIndex === i ? (
                            /* Formulário de Edição do Participante */
                            <div className="flex flex-col gap-2 p-1 bg-gray-900/80 rounded border border-blue-500/40">
                              <span className="font-bold text-[11px] text-blue-300">Editar Informações</span>
                              <input 
                                type="text"
                                value={editAuthor}
                                onChange={(e) => setEditAuthor(e.target.value)}
                                placeholder="Nome da pessoa"
                                className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
                              />
                              <input 
                                type="text"
                                value={editCompanions}
                                onChange={(e) => setEditCompanions(e.target.value)}
                                placeholder="Acompanhantes (separados por vírgula)"
                                className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
                              />
                              <input 
                                type="text"
                                value={editLocation}
                                onChange={(e) => setEditLocation(e.target.value)}
                                placeholder="Cidade, UF"
                                className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
                              />
                              <div className="flex items-center gap-2 mt-1">
                                <button 
                                  onClick={handleSaveUserEdit}
                                  className="flex-1 bg-green-600 hover:bg-green-500 text-white font-bold py-1 rounded text-[11px] transition-colors"
                                >
                                  Salvar
                                </button>
                                <button 
                                  onClick={() => setEditingUserIndex(null)}
                                  className="bg-gray-700 hover:bg-gray-600 text-gray-300 font-bold px-2 py-1 rounded text-[11px] transition-colors"
                                >
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          ) : (
                            /* Card Normal do Participante */
                            <>
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 overflow-hidden flex-1">
                                  {/* Foto de perfil */}
                                  {user.avatarUrl ? (
                                    <img src={user.avatarUrl} alt={user.author || 'Anônimo'} className="w-7 h-7 rounded-full object-cover shrink-0 border border-white/20" />
                                  ) : (
                                    <div className="w-7 h-7 rounded-full bg-red-900/50 border border-red-700/50 flex items-center justify-center font-bold text-[10px] text-red-300 shrink-0">
                                      {(user.author && typeof user.author === 'string' && user.author.trim().length > 0) ? user.author.trim().charAt(0).toUpperCase() : '?'}
                                    </div>
                                  )}

                                  <div className="flex flex-col min-w-0 flex-1">
                                    <span className="font-bold truncate text-white leading-tight">{user.author}</span>
                                    {user.location && (
                                      <span className="text-[10px] text-gray-400 flex items-center gap-1 leading-tight">
                                        <MapPin size={9} className="text-blue-400" /> {user.location}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <button 
                                  onClick={() => handleStartEditUser(i)}
                                  title="Editar nome, acompanhantes e local"
                                  className="text-gray-400 hover:text-blue-400 p-1.5 rounded hover:bg-gray-700/60 transition-colors shrink-0"
                                >
                                  <Edit3 size={13} />
                                </button>
                              </div>

                              {user.companions && user.companions.length > 0 && (
                                <div className="text-[10px] text-purple-300 bg-purple-900/30 px-2 py-0.5 rounded border border-purple-800/40 flex items-center gap-1 font-medium">
                                  <Users size={10} className="text-purple-400 shrink-0" />
                                  <span>com {user.companions.join(', ')}</span>
                                </div>
                              )}
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <button 
                  onClick={copyPresenceList}
                  disabled={presenceUsers.length === 0}
                  className={`w-full py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all border ${
                    copiedPresence 
                      ? 'bg-green-600/20 border-green-500 text-green-400' 
                      : 'bg-gray-700 hover:bg-gray-600 text-white border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed'
                  }`}
                >
                  {copiedPresence ? <Check size={14} /> : <Copy size={14} />}
                  {copiedPresence ? 'Copiado para a Área de Transferência!' : 'Copiar Lista'}
                </button>

                <button 
                  onClick={() => setShowStatsModal(true)}
                  className="w-full bg-blue-900/40 hover:bg-blue-800/60 border border-blue-700/50 py-2 rounded-lg text-xs font-bold text-blue-200 flex items-center justify-center gap-2 transition-colors mt-1"
                >
                  <BarChart3 size={14} /> Estatísticas & Banco de Dados (Privado)
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal de Estatísticas de Audiência (Privado do Operador) */}
        {showStatsModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-gray-900 border border-gray-700 rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
              {/* Cabeçalho do Modal */}
              <div className="p-4 border-b border-gray-800 flex items-center justify-between bg-gray-800/50">
                <div className="flex items-center gap-2 text-blue-400">
                  <Database size={18} />
                  <h2 className="font-bold text-sm text-white">Banco de Dados Local & Estatísticas de Audiência</h2>
                </div>
                <button onClick={() => setShowStatsModal(false)} className="text-gray-400 hover:text-white p-1 rounded transition-colors">
                  <X size={18} />
                </button>
              </div>

              {/* Conteúdo do Modal */}
              <div className="p-5 overflow-y-auto flex flex-col gap-5">
                <div className="bg-blue-950/40 border border-blue-800/50 rounded-xl p-3.5 text-xs text-blue-200 leading-relaxed">
                  🔒 <strong>Área Privada:</strong> Registra automaticamente cada transmissão em que o espectador esteve presente e salva a cidade padrão dele para preencher nas próximas transmissões.
                </div>

                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs uppercase text-gray-400 font-bold tracking-wider flex items-center gap-2">
                      <BarChart3 size={14} /> Ranking de Assiduidade ({audienceDatabaseService.getAllStats().length} Espectadores Registrados)
                    </h3>
                  </div>

                  <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                    {audienceDatabaseService.getAllStats().length === 0 ? (
                      <div className="text-xs text-gray-500 italic p-6 text-center">Nenhum histórico gravado ainda. Conecte ao chat ao vivo para registrar!</div>
                    ) : (
                      audienceDatabaseService.getAllStats().map((rec, i) => (
                        <div key={i} className="bg-gray-800/60 border border-gray-700/60 rounded-xl p-3 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            {rec.avatarUrl ? (
                              <img src={rec.avatarUrl} alt={rec.author} className="w-9 h-9 rounded-full object-cover shrink-0 border border-white/10" />
                            ) : (
                              <div className="w-9 h-9 rounded-full bg-blue-900/40 border border-blue-700/40 flex items-center justify-center font-bold text-xs text-blue-300 shrink-0">
                                {rec.author.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div className="flex flex-col">
                              <span className="font-bold text-xs text-white">{rec.author}</span>
                              {rec.defaultLocation ? (
                                <span className="text-[10px] text-gray-300 flex items-center gap-1 mt-0.5">
                                  <MapPin size={9} className="text-blue-400" /> {rec.defaultLocation} (Salvo)
                                </span>
                              ) : (
                                <span className="text-[9px] text-gray-500 italic mt-0.5">Sem localização gravada</span>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-col items-end shrink-0">
                            <span className="text-xs font-mono font-bold text-green-400 bg-green-900/30 px-2 py-0.5 rounded border border-green-700/40">
                              {rec.totalStreams} {rec.totalStreams === 1 ? 'transmissão' : 'transmissões'}
                            </span>
                            <span className="text-[9px] text-gray-500 mt-1">Última: {rec.lastStreamDate}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Rodapé / Ações JSON */}
              <div className="p-4 border-t border-gray-800 bg-gray-900 flex items-center justify-between gap-3">
                <button 
                  onClick={() => audienceDatabaseService.exportDatabaseJSON()}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition-colors shadow"
                >
                  <Download size={14} /> Salvar Arquivo JSON do Banco
                </button>
                <label className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold py-2 px-3 rounded-lg border border-gray-600 flex items-center justify-center gap-2 cursor-pointer transition-colors">
                  <Upload size={14} /> Importar Backup JSON
                  <input 
                    type="file" 
                    accept=".json" 
                    className="hidden" 
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (evt) => {
                          if (evt.target?.result) {
                            const ok = audienceDatabaseService.importDatabaseJSON(evt.target.result as string);
                            if (ok) alert('Banco de dados local atualizado com sucesso!');
                            else alert('Erro ao carregar o arquivo JSON.');
                          }
                        };
                        reader.readAsText(file);
                      }
                    }}
                  />
                </label>
              </div>
            </div>
          </div>
        )}

        {/* OBS WebSocket — gaveta colapsável fixada na base da sidebar */}
        <div className="border-t border-gray-700 bg-gray-900 flex-shrink-0">

          {/* Barra de toggle — sempre visível */}
          <button
            onClick={() => setObsExpanded(prev => !prev)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-800/60 transition-colors group"
          >
            <div className="flex items-center gap-2.5">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 transition-colors ${
                obsConnected
                  ? 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.8)] animate-pulse'
                  : 'bg-gray-600'
              }`} />
              <span className="text-xs font-semibold text-gray-400 group-hover:text-gray-200 transition-colors uppercase tracking-wider">
                OBS WebSocket
              </span>
              <span className="text-[10px] text-gray-600">
                {obsConnected ? '— Conectado' : '— Desconectado'}
              </span>
            </div>
            <div className="text-gray-600 group-hover:text-gray-400 transition-colors">
              {obsExpanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            </div>
          </button>

          {/* Painel expandível — abre para cima via maxHeight */}
          <div
            className="overflow-hidden transition-all duration-300 ease-in-out"
            style={{ maxHeight: obsExpanded ? '600px' : '0px' }}
          >
            <div className="px-4 pb-4 pt-1 flex flex-col gap-3 border-t border-gray-800">
              <div className="flex items-center justify-between pt-2">
                <span className="text-[10px] uppercase text-gray-500 font-bold tracking-wider">Status</span>
                <span className="text-xs text-gray-400">{obsStatus}</span>
              </div>

              <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={obsSettings.enabled}
                  onChange={(e) => updateOBSSettings({ enabled: e.target.checked })}
                  className="rounded border-gray-600 bg-gray-800"
                />
                Sincronizar texto com fontes do OBS
              </label>

              <input
                type="text"
                value={obsSettings.url}
                onChange={(e) => updateOBSSettings({ url: e.target.value })}
                placeholder="ws://127.0.0.1:4455"
                className="bg-gray-800 border border-gray-700 rounded text-xs px-2 py-2 text-white focus:outline-none focus:border-blue-500"
              />
              <input
                type="password"
                value={obsSettings.password}
                onChange={(e) => updateOBSSettings({ password: e.target.value })}
                placeholder="Senha do websocket (se houver)"
                className="bg-gray-800 border border-gray-700 rounded text-xs px-2 py-2 text-white focus:outline-none focus:border-blue-500"
              />
              <input
                type="text"
                value={obsSettings.sceneName}
                onChange={(e) => updateOBSSettings({ sceneName: e.target.value })}
                placeholder="Cena no OBS (opcional)"
                className="bg-gray-800 border border-gray-700 rounded text-xs px-2 py-2 text-white focus:outline-none focus:border-blue-500"
              />
              <input
                type="text"
                value={obsSettings.titleSourceName}
                onChange={(e) => updateOBSSettings({ titleSourceName: e.target.value })}
                placeholder="Fonte de título no OBS"
                className="bg-gray-800 border border-gray-700 rounded text-xs px-2 py-2 text-white focus:outline-none focus:border-blue-500"
              />
              <input
                type="text"
                value={obsSettings.bodySourceName}
                onChange={(e) => updateOBSSettings({ bodySourceName: e.target.value })}
                placeholder="Fonte de corpo no OBS"
                className="bg-gray-800 border border-gray-700 rounded text-xs px-2 py-2 text-white focus:outline-none focus:border-blue-500"
              />

              {obsSyncError && (
                <div className="p-2.5 bg-red-900/20 border border-red-700/50 rounded-lg text-red-200 text-xs">
                  {obsSyncError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                {obsConnected ? (
                  <button
                    onClick={handleOBSDisconnect}
                    className="flex items-center justify-center gap-2 bg-gray-700 hover:bg-gray-600 rounded-lg px-3 py-2 text-xs font-semibold transition-colors"
                  >
                    <Plug size={13} /> Desconectar
                  </button>
                ) : (
                  <button
                    onClick={handleOBSConnect}
                    className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 rounded-lg px-3 py-2 text-xs font-semibold transition-colors"
                  >
                    <Plug size={13} /> Conectar
                  </button>
                )}
                <button
                  onClick={() => void syncStateToOBS()}
                  disabled={!obsConnected || !obsSettings.enabled}
                  className="flex items-center justify-center gap-2 bg-gray-700 hover:bg-gray-600 rounded-lg px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Cast size={13} /> Enviar agora
                </button>
              </div>
            </div>
          </div>

        </div>
        {/* ── fim sidebar ── */}
      </div>

      {/* ── Área de controle principal ──────────────────────────────── */}
      <div className="flex-1 flex flex-col justify-between bg-gray-900 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-gray-800 via-gray-900 to-black overflow-hidden relative">
        
        {/* Área central com indicador de status e Monitor */}
        <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 gap-3 sm:gap-4 min-h-0 overflow-hidden">
          <div className="flex items-center gap-3 shrink-0">
            <div className={`w-3 h-3 rounded-full ${state.isVisible ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.7)] animate-pulse' : 'bg-red-500'}`} />
            <span className="text-sm font-semibold tracking-widest uppercase text-gray-400">{state.isVisible ? 'NO AR' : 'OFFLINE'}</span>
          </div>

          {/* Monitor de Script proporcional ao Display Output (560:940) */}
          <div 
            ref={previewContainerRef}
            className="relative w-full max-w-[560px] aspect-[560/940] flex-1 min-h-0 backdrop-blur-[10px] rounded-xl border border-gray-700 flex flex-col overflow-hidden shadow-2xl mx-auto transition-colors duration-300"
            style={{ 
              backgroundColor: `rgba(0, 0, 0, ${state.bgOpacity ?? 0.6})`,
              perspective: `${1800 * previewScale}px`
            }}
          >
            <div className="absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-black/60 to-transparent z-10 pointer-events-none" />

            {/* Barra de cabeçalho do monitor */}
            <div className="absolute top-2 left-4 right-4 flex items-center justify-between z-20 gap-2">
              <span className="text-[10px] font-mono text-gray-500 uppercase tracking-widest flex-shrink-0">
                Monitor (560x940)
              </span>

              {/* Campo de busca */}
              <div className={`flex items-center gap-1.5 flex-1 min-w-0 transition-all duration-200 ${
                showSearch ? 'opacity-100' : 'opacity-0 pointer-events-none w-0'
              }`}>
                <div className="flex items-center gap-1 bg-gray-800/80 border border-gray-600 rounded-full px-2 py-0.5 flex-1 min-w-0">
                  <Search size={9} className="text-gray-500 flex-shrink-0" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar no texto..."
                    className="bg-transparent text-[10px] text-white placeholder-gray-600 outline-none w-full"
                  />
                  {searchQuery && (
                    <span className="text-[9px] text-gray-500 flex-shrink-0">
                      {searchMatchCount > 0 ? `${searchMatchCount}` : '0'}
                    </span>
                  )}
                </div>
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="text-gray-600 hover:text-gray-400">
                    <X size={10} />
                  </button>
                )}
              </div>

              {/* Controles do lado direito */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {/* Toggle busca */}
                <button
                  onClick={() => {
                    setShowSearch(prev => {
                      const next = !prev;
                      if (next) setTimeout(() => searchInputRef.current?.focus(), 50);
                      if (!next) setSearchQuery('');
                      return next;
                    });
                  }}
                  className={`p-1 rounded transition-colors ${
                    showSearch ? 'text-blue-400 bg-blue-500/20' : 'text-gray-600 hover:text-gray-400'
                  }`}
                  title="Buscar no texto"
                >
                  <Search size={11} />
                </button>

                {/* Chip do highlight ativo */}
                {state.highlightedText ? (
                  <div className="flex items-center gap-1">
                    <div className="flex items-center gap-1 bg-white/10 border border-white/20 rounded-full px-2 py-0.5 max-w-[120px]">
                      <Highlighter size={8} className="text-gray-300 flex-shrink-0" />
                      <span className="text-[9px] text-gray-300 truncate">{state.highlightedText}</span>
                    </div>
                    <button onClick={clearHighlight} className="text-gray-600 hover:text-red-400 transition-colors">
                      <X size={11} />
                    </button>
                  </div>
                ) : (
                  <span className="text-[9px] text-gray-600 italic">Selecione para focar</span>
                )}
              </div>
            </div>
            
            <div 
              ref={previewScrollRef}
              onScroll={handleManualScroll}
              onMouseUp={handlePreviewMouseUp}
              className="flex-1 overflow-y-auto no-scrollbar relative select-text cursor-text transition-transform duration-300 ease-out"
              style={{ 
                padding: `${40 * previewScale}px`,
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
                transform: `perspective(${1800 * previewScale}px) rotateY(${state.rotateY ?? 0}deg)`,
                transformStyle: 'preserve-3d',
                backfaceVisibility: 'visible',
              }}
            >
              {state.mode === 'chat' ? (
                <div className="flex flex-col min-h-full pb-8">
                  {state.chatSubMode === 'presence' ? (
                    (presenceUsers && presenceUsers.length > 0) ? (
                      <div className="flex flex-col gap-4">
                        {presenceUsers.map((user, idx) => {
                          if (!user || !user.author) return null;
                          const authorName = user.author || 'Anônimo';
                          const companions = Array.isArray(user.companions) ? user.companions : [];
                          const allNames = formatNamesList([authorName, ...companions]);
                          const initialChar = (typeof authorName === 'string' && authorName.trim().length > 0)
                            ? authorName.trim().charAt(0).toUpperCase()
                            : '?';

                          return (
                            <div key={user.author || idx} className="bg-black/60 border border-white/10 rounded-xl p-4 shadow-lg backdrop-blur-sm animate-in slide-in-from-bottom-2 fade-in duration-300 flex items-center gap-3">
                              {user.avatarUrl ? (
                                <img src={user.avatarUrl} alt={authorName} className="rounded-full object-cover border-2 border-white/20 shrink-0 shadow-md" style={{ width: `${48 * previewScale}px`, height: `${48 * previewScale}px` }} />
                              ) : (
                                <div className="rounded-full bg-red-600/30 border-2 border-red-500/30 flex items-center justify-center font-bold text-red-300 shrink-0 shadow-md" style={{ width: `${48 * previewScale}px`, height: `${48 * previewScale}px`, fontSize: `${16 * previewScale}px` }}>
                                  {initialChar}
                                </div>
                              )}
                              <div className="flex flex-col justify-center min-w-0 flex-1 gap-0.5">
                                <p className="font-bold text-white leading-tight" style={{ fontSize: `${(state.fontSize * 0.85) * previewScale}px` }}>
                                  {allNames}
                                </p>
                                {user.location && (
                                  <p className="font-semibold text-white/80 leading-tight" style={{ fontSize: `${(state.fontSize * 0.75) * previewScale}px` }}>
                                    {user.location}
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center text-gray-500 italic text-center h-full">
                        <Users size={32} className="mb-2 opacity-50" />
                        Aguardando a chegada dos participantes...
                      </div>
                    )
                  ) : (
                    (state.chatMessages && state.chatMessages.length > 0) ? (
                      <div className="flex flex-col gap-4">
                        {state.chatMessages.map(msg => (
                          <div key={msg.id} className="bg-black/60 border border-white/10 rounded-xl p-4 shadow-lg backdrop-blur-sm animate-in slide-in-from-bottom-2 fade-in duration-300 flex items-start gap-2.5">
                            {msg.avatarUrl ? (
                              <img src={msg.avatarUrl} alt={msg.author || 'Anônimo'} className="rounded-full object-cover border border-white/20 shrink-0 mt-0.5" style={{ width: `${32 * previewScale}px`, height: `${32 * previewScale}px` }} />
                            ) : (
                              <div className="rounded-full bg-red-600/30 border border-red-500/30 flex items-center justify-center font-bold text-red-300 shrink-0 mt-0.5" style={{ width: `${32 * previewScale}px`, height: `${32 * previewScale}px`, fontSize: `${12 * previewScale}px` }}>
                                {(msg.author && typeof msg.author === 'string' && msg.author.trim().length > 0) ? msg.author.trim().charAt(0).toUpperCase() : '?'}
                              </div>
                            )}
                            <div className="flex-1 overflow-hidden">
                              <p className="font-bold text-red-400 mb-1 truncate" style={{ fontSize: `${(state.fontSize * 0.7) * previewScale}px` }}>
                                {msg.author}
                              </p>
                              <p className="text-white leading-snug" style={{ fontSize: `${state.fontSize * previewScale}px` }}>
                                {msg.text}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center text-gray-500 italic text-center h-full">
                        <MessageSquare size={32} className="mb-2 opacity-50" />
                        Aguardando mensagens do chat...
                      </div>
                    )
                  )}
                </div>
              ) : (
                state.selectedTitle ? (
                  <div className="min-h-full pb-[600px]">
                    <h1 
                      className="font-bold leading-tight text-blue-400 drop-shadow-md text-left font-sans tracking-wide uppercase"
                      style={{
                        fontSize: `${36 * previewScale}px`,
                        marginBottom: `${32 * previewScale}px`,
                      }}
                    >
                      {state.selectedTitle}
                    </h1>

                    {/* Preview com blur de foco (duas camadas) + busca */}
                    <div style={{ position: 'relative' }}>

                      {/* Camada 1: texto completo com busca marcada, desfocado quando há foco ativo */}
                      <div
                        className={bodyClasses}
                        style={{
                          fontSize: `${state.fontSize * previewScale}px`,
                          filter: (state.highlightedText && !searchQuery) ? `blur(${(state.blurAmount ?? 6) * previewScale}px)` : 'none',
                          opacity: (state.highlightedText && !searchQuery) ? (state.blurOpacity ?? 0.18) : 1,
                          transition: 'filter 0.45s ease, opacity 0.45s ease',
                          willChange: 'filter, opacity',
                        }}
                        dangerouslySetInnerHTML={{ __html: applySearchMarks(state.selectedBody, searchQuery) }}
                      />

                      {/* Camada 2: overlay (só aparece quando há foco E sem busca ativa) */}
                      {state.highlightedText && !searchQuery && (() => {
                        const escaped = state.highlightedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const overlayHTML = state.selectedBody.replace(
                          new RegExp(`(${escaped})(?![^<>]*>)`, 'gi'),
                          '<mark style="color:white;background:transparent;font-weight:inherit;font-size:inherit;">$1</mark>'
                        );
                        return (
                          <div
                            className={bodyClasses}
                            style={{
                              fontSize: `${state.fontSize * previewScale}px`,
                              position: 'absolute',
                              top: 0, left: 0, right: 0,
                              color: 'transparent',
                              pointerEvents: 'none',
                              userSelect: 'none',
                            }}
                            dangerouslySetInnerHTML={{ __html: overlayHTML }}
                          />
                        );
                      })()}

                    </div>
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-600 italic">Selecione uma escritura no menu lateral...</div>
                )
              )}
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-black/60 to-transparent z-10 pointer-events-none" />
          </div>
        </div>

        {/* Deck de controles fixado na parte inferior completa */}
        <div className="w-full border-t border-gray-700/80 bg-gray-800/95 backdrop-blur px-6 py-4 shadow-2xl flex-shrink-0">
          <div className="w-full max-w-7xl mx-auto flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 sm:gap-6">
            
            {/* Visibilidade */}
            <div className="flex sm:flex-col gap-2 items-center justify-between sm:justify-center border-b sm:border-b-0 sm:border-r border-gray-700/80 pb-3 sm:pb-0 sm:pr-6 shrink-0">
               <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">VISIBILIDADE</span>
               <button
                onClick={toggleVisibility}
                className={`w-full sm:w-24 h-12 sm:h-20 rounded-xl sm:rounded-2xl flex sm:flex-col items-center justify-center gap-2 transition-all transform active:scale-95 ${
                  state.isVisible ? 'bg-red-500/10 border-2 border-red-500 text-red-500' : 'bg-green-500/10 border-2 border-green-500 text-green-500'
                }`}
              >
                {state.isVisible ? <EyeOff size={22} /> : <Eye size={22} />}
                <span className="font-bold text-xs">{state.isVisible ? 'OCULTAR' : 'MOSTRAR'}</span>
              </button>
            </div>

            {/* Opções (Velocidade, Fonte, Ângulo Y, Fundo) com Grid Responsivo */}
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
               {/* Velocidade */}
               <div className="bg-gray-900/60 p-3 rounded-xl border border-gray-700/50 flex flex-col justify-between gap-2">
                 <div className="flex justify-between items-center">
                   <div className="flex items-center gap-2 text-gray-400">
                      <Sliders size={13} />
                      <label className="text-[10px] font-bold uppercase tracking-wider">Velocidade</label>
                   </div>
                   <span className="text-[10px] font-mono bg-gray-800 px-2 py-0.5 rounded text-white border border-gray-700">{state.scrollSpeed}x</span>
                 </div>
                 <input type="range" min="1" max="10" step="0.5" value={state.scrollSpeed} onChange={handleSpeedChange} className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                 <div className="flex gap-2">
                    <button
                       onClick={toggleScroll}
                       disabled={!state.isVisible}
                       className={`flex-1 p-2 rounded-lg flex items-center justify-center gap-2 transition-all font-semibold text-xs ${
                         !state.isVisible ? 'opacity-50 cursor-not-allowed bg-gray-700 text-gray-500' :
                         state.isScrolling ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                       }`}
                    >
                       {state.isScrolling ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                       {state.isScrolling ? 'PAUSAR' : 'ROLAR'}
                    </button>

                    <button
                       onClick={toggleVoiceControl}
                       disabled={!state.isVisible || state.mode === 'chat'}
                       title={state.mode === 'chat' ? 'Voz indisponível no modo Chat' : 'Acompanhamento por Voz da Fala'}
                       className={`px-3 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all font-semibold text-xs border ${
                         !state.isVisible || state.mode === 'chat' ? 'opacity-40 cursor-not-allowed bg-gray-800 text-gray-600 border-gray-700' :
                         state.isVoiceActive 
                           ? state.voiceStatus === 'tracking'
                             ? 'bg-green-600/20 border-green-500 text-green-400 shadow-lg shadow-green-500/20 animate-pulse'
                             : 'bg-red-600/20 border-red-500 text-red-400 animate-pulse'
                           : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700 hover:text-white'
                       }`}
                    >
                       {state.isVoiceActive ? <Mic size={14} /> : <MicOff size={14} />}
                       {state.isVoiceActive 
                         ? (state.voiceStatus === 'tracking' ? 'VOZ OK' : 'OUVINDO')
                         : 'VOZ'
                       }
                    </button>
                  </div>
               </div>

               {/* Fonte */}
               <div className="bg-gray-900/60 p-3 rounded-xl border border-gray-700/50 flex flex-col justify-between gap-2">
                 <div className="flex justify-between items-center">
                   <div className="flex items-center gap-2 text-gray-400">
                      <Type size={13} />
                      <label className="text-[10px] font-bold uppercase tracking-wider">Fonte</label>
                   </div>
                   <span className="text-[10px] font-mono bg-gray-800 px-2 py-0.5 rounded text-white border border-gray-700">{state.fontSize}px</span>
                 </div>
                 <div className="flex gap-1.5">
                    <button 
                      onClick={() => adjustFontSize(-2)}
                      className="flex-1 bg-gray-700 hover:bg-gray-600 py-1.5 rounded-lg flex items-center justify-center transition-colors"
                      title="Diminuir Fonte"
                    >
                      <Minus size={14} />
                    </button>
                    <button 
                      onClick={() => adjustFontSize(2)}
                      className="flex-1 bg-gray-700 hover:bg-gray-600 py-1.5 rounded-lg flex items-center justify-center transition-colors"
                      title="Aumentar Fonte"
                    >
                      <Plus size={14} />
                    </button>
                 </div>
                 <div className="flex gap-1">
                    {[24, 32, 48, 64].map(size => (
                      <button 
                        key={size}
                        onClick={() => updateState({ fontSize: size })}
                        className={`flex-1 text-[9px] py-1 rounded border transition-all ${state.fontSize === size ? 'bg-blue-600/20 border-blue-500 text-blue-400' : 'bg-transparent border-gray-700 text-gray-500 hover:border-gray-500'}`}
                      >
                        {size}
                      </button>
                    ))}
                 </div>
               </div>

               {/* Rotação Eixo Y */}
               <div className="bg-gray-900/60 p-3 rounded-xl border border-gray-700/50 flex flex-col justify-between gap-2">
                 <div className="flex justify-between items-center">
                   <div className="flex items-center gap-2 text-gray-400">
                      <RotateCw size={13} />
                      <label className="text-[10px] font-bold uppercase tracking-wider">Ângulo Y</label>
                   </div>
                   <span className="text-[10px] font-mono bg-gray-800 px-2 py-0.5 rounded text-white border border-gray-700">{state.rotateY ?? 0}°</span>
                 </div>
                 <input 
                   type="range" 
                   min="-180" 
                   max="180" 
                   step="1" 
                   value={state.rotateY ?? 0} 
                   onChange={(e) => updateState({ rotateY: Number(e.target.value) })} 
                   className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500" 
                 />
                 <div className="flex gap-1">
                    {[-180, -90, 0, 90, 180].map(angle => (
                      <button 
                        key={angle}
                        onClick={() => updateState({ rotateY: angle })}
                        className={`flex-1 text-[9px] py-1 rounded border transition-all ${(state.rotateY ?? 0) === angle ? 'bg-blue-600/20 border-blue-500 text-blue-400' : 'bg-transparent border-gray-700 text-gray-500 hover:border-gray-500'}`}
                      >
                        {angle}°
                      </button>
                    ))}
                 </div>
               </div>

               {/* Opacidade do Fundo */}
               <div className="bg-gray-900/60 p-3 rounded-xl border border-gray-700/50 flex flex-col justify-between gap-2">
                 <div className="flex justify-between items-center">
                   <div className="flex items-center gap-2 text-gray-400">
                      <Layers size={13} />
                      <label className="text-[10px] font-bold uppercase tracking-wider">Fundo</label>
                   </div>
                   <span className="text-[10px] font-mono bg-gray-800 px-2 py-0.5 rounded text-white border border-gray-700">{Math.round((state.bgOpacity ?? 0.6) * 100)}%</span>
                 </div>
                 <input 
                   type="range" 
                   min="0" 
                   max="1" 
                   step="0.05" 
                   value={state.bgOpacity ?? 0.6} 
                   onChange={(e) => updateState({ bgOpacity: Number(e.target.value) })} 
                   className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500" 
                 />
                 <div className="flex gap-1">
                    {[0, 0.3, 0.6, 0.9, 1].map(op => (
                      <button 
                        key={op}
                        onClick={() => updateState({ bgOpacity: op })}
                        className={`flex-1 text-[9px] py-1 rounded border transition-all ${Math.abs((state.bgOpacity ?? 0.6) - op) < 0.02 ? 'bg-blue-600/20 border-blue-500 text-blue-400' : 'bg-transparent border-gray-700 text-gray-500 hover:border-gray-500'}`}
                      >
                        {Math.round(op * 100)}%
                      </button>
                    ))}
                 </div>
               </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ControlPanel;
