import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BroadcastChannel } from 'broadcast-channel';
import { MessageSquare, Users, MapPin } from 'lucide-react';
import { CHANNEL_NAME, DEFAULT_STATE, TeleprompterState } from '../types';
import { stateSyncService } from '../services/stateSync';

export function formatNamesList(names: (string | undefined | null)[]): string {
  if (!names || !Array.isArray(names) || names.length === 0) return '';
  const clean = names.filter((n): n is string => typeof n === 'string' && n.trim().length > 0);
  if (clean.length === 0) return '';
  if (clean.length === 1) return clean[0];
  if (clean.length === 2) return `${clean[0]} e ${clean[1]}`;
  return `${clean.slice(0, -1).join(', ')} e ${clean[clean.length - 1]}`;
}

/**
 * Gera o HTML do overlay de foco:
 * - Todo o texto tem color: transparent (invisível)  
 * - Só a frase destacada recebe color: white (visível)
 * Isso permite sobrepor sobre a camada desfocada e revelar apenas a frase.
 */
const makeFocusOverlayHTML = (html: string, phrase: string): string => {
  if (!phrase || phrase.trim().length < 2) return html;
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return html.replace(
    new RegExp(`(${escaped})(?![^<>]*>)`, 'gi'),
    '<mark style="color:white;background:transparent;font-weight:inherit;font-size:inherit;">$1</mark>'
  );
};

const DisplayOutput: React.FC = () => {
  const [state, setState] = useState<TeleprompterState>(DEFAULT_STATE);
  const scrollRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastScrollTimeRef = useRef<number>(0);
  const accumulatedScrollRef = useRef<number>(0);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const lastBroadcastRef = useRef<number>(0);

  const stateRef = useRef(state);
  stateRef.current = state;
  const smoothedSpeedRef = useRef(state.scrollSpeed);

  /**
   * Aplica um estado recebido (seja via BroadcastChannel ou WebSocket).
   * Ajusta o scroll se houver uma posição forçada pelo operador.
   */
  const applyState = useCallback((msg: TeleprompterState) => {
    setState(msg);
    if (scrollRef.current && msg.scrollTop !== undefined) {
      const el = scrollRef.current;
      const targetPx = msg.scrollTop * (el.scrollHeight - el.clientHeight);
      const currentPct = el.scrollHeight > el.clientHeight
        ? el.scrollTop / (el.scrollHeight - el.clientHeight)
        : 0;
      if (Math.abs(currentPct - msg.scrollTop) > 0.02) {
        el.scrollTop = targetPx;
        accumulatedScrollRef.current = 0;
      }
    }
  }, []);

  // Escuta via BroadcastChannel (mesmo browser) e WebSocket local (OBS)
  useEffect(() => {
    channelRef.current = new BroadcastChannel(CHANNEL_NAME);
    channelRef.current.onmessage = (msg: TeleprompterState) => applyState(msg);

    stateSyncService.connect();
    const unsubscribe = stateSyncService.onMessage((msg: TeleprompterState) => applyState(msg));

    return () => {
      channelRef.current?.close();
      unsubscribe();
      stateSyncService.disconnect();
    };
  }, [applyState]);

  // Reseta scroll apenas se a seleção de texto/título mudar
  useEffect(() => {
    if (scrollRef.current) {
      accumulatedScrollRef.current = 0;
    }
  }, [state.selectedTitle]);

  // Lógica de scroll ultra-suave com interpolação de velocidade
  useEffect(() => {
    if (state.isScrolling && state.isVisible) {
      let lastTime = 0;

      const animate = (time: number) => {
        if (!lastTime) lastTime = time;
        const delta = Math.min(time - lastTime, 100);
        lastTime = time;

        if (scrollRef.current) {
          const targetSpeed = stateRef.current.scrollSpeed;
          // Interpolação suave (lerp) para mudanças de velocidade sem trancos
          smoothedSpeedRef.current += (targetSpeed - smoothedSpeedRef.current) * Math.min(1, delta * 0.008);

          const basePixelsPerSecond = smoothedSpeedRef.current * 25;
          const fontFactor = stateRef.current.fontSize / 32;
          const pixelsPerSecond = basePixelsPerSecond * fontFactor;
          const pixelsToScroll = (pixelsPerSecond * delta) / 1000;

          scrollRef.current.scrollTop += pixelsToScroll;

          const now = Date.now();
          if (now - lastBroadcastRef.current > 100) {
            const el = scrollRef.current;
            const scrollable = el.scrollHeight - el.clientHeight;
            const scrollPct = scrollable > 0 ? el.scrollTop / scrollable : 0;
            const scrollState = { ...stateRef.current, scrollTop: scrollPct };
            channelRef.current?.postMessage(scrollState);
            stateSyncService.send(scrollState);
            lastBroadcastRef.current = now;
          }
        }
        animationFrameRef.current = requestAnimationFrame(animate);
      };

      animationFrameRef.current = requestAnimationFrame(animate);
    } else {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [state.isScrolling, state.isVisible]);

  const hasFocus = state.highlightedText && state.highlightedText.trim().length >= 2;
  const bodyClasses = "leading-relaxed text-white font-sans text-left [&>p]:mb-6 [&>ul]:mb-6 [&>ol]:mb-6 [&>ul]:list-disc [&>ul]:pl-6 [&>ol]:list-decimal [&>ol]:pl-6";

  return (
    <div 
      className="w-screen h-screen bg-transparent overflow-hidden relative flex items-end justify-start p-12"
      style={{ perspective: '1800px' }}
    >
      <div
        className={`
          relative
          w-[560px] h-[940px]
          backdrop-blur-[10px] 
          border border-white/15 
          rounded-2xl 
          shadow-2xl 
          transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]
          flex flex-col
          ${state.isVisible ? 'opacity-100' : 'opacity-0'}
        `}
        style={{
          backgroundColor: `rgba(0, 0, 0, ${state.bgOpacity ?? 0.6})`,
          transform: `perspective(1800px) rotateY(${state.rotateY ?? 0}deg) ${state.isVisible ? 'translateY(0px)' : 'translateY(96px)'}`,
          transformStyle: 'preserve-3d',
          backfaceVisibility: 'visible',
        }}
      >
        <div 
          className="absolute top-0 left-0 right-0 h-24 z-10 pointer-events-none rounded-t-2xl"
          style={{ background: `linear-gradient(to bottom, rgba(0,0,0,${Math.min(1, (state.bgOpacity ?? 0.6) * 1.3)}), transparent)` }}
        />
        <div
          ref={scrollRef}
          className="flex-1 p-10 overflow-y-auto no-scrollbar relative flex flex-col"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {state.mode === 'chat' ? (
            <div className="flex flex-col min-h-full pb-8">
              {state.chatSubMode === 'presence' ? (
                /* Exibição da Lista de Presença na Tela ordenada por chegada */
                (state.presenceUsers && state.presenceUsers.length > 0) ? (
                  <div className="flex flex-col gap-4">
                    {state.presenceUsers.map((user, idx) => {
                      if (!user || !user.author) return null;
                      const authorName = user.author || 'Anônimo';
                      const companions = Array.isArray(user.companions) ? user.companions : [];
                      const allNames = formatNamesList([authorName, ...companions]);
                      const initialChar = (typeof authorName === 'string' && authorName.trim().length > 0)
                        ? authorName.trim().charAt(0).toUpperCase()
                        : '?';

                      return (
                        <div key={user.author || idx} className="bg-black/60 border border-white/10 rounded-xl p-5 shadow-lg backdrop-blur-sm animate-in slide-in-from-bottom-2 fade-in duration-300 flex items-center gap-4">
                          {user.avatarUrl ? (
                            <img src={user.avatarUrl} alt={authorName} className="w-14 h-14 rounded-full object-cover border-2 border-white/20 shrink-0 shadow-md" />
                          ) : (
                            <div className="w-14 h-14 rounded-full bg-red-600/30 border-2 border-red-500/30 flex items-center justify-center font-bold text-red-300 text-lg shrink-0 shadow-md">
                              {initialChar}
                            </div>
                          )}
                          <div className="flex flex-col justify-center min-w-0 flex-1 gap-1">
                            <p className="font-bold text-white leading-tight" style={{ fontSize: `${state.fontSize * 0.85}px` }}>
                              {allNames}
                            </p>
                            {user.location && (
                              <p className="font-semibold text-white/80 leading-tight" style={{ fontSize: `${state.fontSize * 0.75}px` }}>
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
                /* Exibição do Chat Geral */
                (state.chatMessages && state.chatMessages.length > 0) ? (
                  <div className="flex flex-col gap-4">
                    {state.chatMessages.map(msg => (
                      <div key={msg.id} className="bg-black/60 border border-white/10 rounded-xl p-4 shadow-lg backdrop-blur-sm animate-in slide-in-from-bottom-2 fade-in duration-300 flex items-start gap-3">
                        {msg.avatarUrl ? (
                          <img src={msg.avatarUrl} alt={msg.author || 'Anônimo'} className="w-10 h-10 rounded-full object-cover border border-white/20 shrink-0 mt-0.5" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-red-600/30 border border-red-500/30 flex items-center justify-center font-bold text-red-300 shrink-0 mt-0.5">
                            {(msg.author && typeof msg.author === 'string' && msg.author.trim().length > 0) ? msg.author.trim().charAt(0).toUpperCase() : '?'}
                          </div>
                        )}
                        <div className="flex-1 overflow-hidden">
                          <p className="font-bold text-red-400 mb-1 truncate" style={{ fontSize: `${state.fontSize * 0.7}px` }}>
                            {msg.author}
                          </p>
                          <p className="text-white leading-snug" style={{ fontSize: `${state.fontSize}px` }}>
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
            <div className="min-h-full pb-[600px]">
              <h1 className="text-4xl font-bold leading-tight text-blue-400 mb-8 drop-shadow-md text-left font-sans tracking-wide uppercase">
                {state.selectedTitle}
              </h1>

              {/* Sistema de desfoque de foco — duas camadas sobrepostas */}
              <div style={{ position: 'relative' }}>

                {/* Camada 1: texto completo — desfocado quando há foco ativo */}
                <div
                  className={bodyClasses}
                  style={{
                    fontSize: `${state.fontSize}px`,
                    filter: hasFocus ? `blur(${state.blurAmount}px)` : 'none',
                    opacity: hasFocus ? state.blurOpacity : 1,
                    transition: 'filter 0.45s ease, opacity 0.45s ease',
                    willChange: 'filter, opacity',
                  }}
                  dangerouslySetInnerHTML={{ __html: state.selectedBody }}
                />

                {/* Camada 2: overlay com APENAS a frase destacada visível.
                    Posicionada em absolute, não afeta o layout (height).
                    Todo o texto é transparent exceto o mark da frase selecionada. */}
                {hasFocus && (
                  <div
                    className={bodyClasses}
                    style={{
                      fontSize: `${state.fontSize}px`,
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      color: 'transparent',
                      pointerEvents: 'none',
                      userSelect: 'none',
                    }}
                    dangerouslySetInnerHTML={{
                      __html: makeFocusOverlayHTML(state.selectedBody, state.highlightedText)
                    }}
                  />
                )}

              </div>
            </div>
          )}
        </div>
        <div 
          className="absolute bottom-0 left-0 right-0 h-32 z-10 pointer-events-none rounded-b-2xl"
          style={{ background: `linear-gradient(to top, rgba(0,0,0,${Math.min(1, (state.bgOpacity ?? 0.6) * 1.5)}), transparent)` }}
        />
        {state.isScrolling && (
          <div className="absolute bottom-6 right-6 flex gap-1 items-end opacity-40 z-20">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="w-1.5 bg-blue-400 animate-bounce rounded-full"
                style={{ height: (i + 1) * 6 + 'px', animationDelay: i * 0.1 + 's' }}
              ></div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DisplayOutput;