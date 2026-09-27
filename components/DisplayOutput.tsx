import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BroadcastChannel } from 'broadcast-channel';
import { CHANNEL_NAME, DEFAULT_STATE, TeleprompterState } from '../types';
import { stateSyncService } from '../services/stateSync';
import TeleprompterCard from './TeleprompterCard';

// Mantido para compatibilidade com imports existentes
export { formatNamesList } from './TeleprompterCard';

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

          // Parada automática ao chegar no fim do texto (+ tolerância de linhas em branco).
          // Desliga isScrolling e avisa o painel para o botão voltar para "ROLAR".
          const endEl = scrollRef.current;
          if (
            stateRef.current.mode !== 'chat' &&
            endEl.scrollHeight > endEl.clientHeight &&
            endEl.scrollTop >= endEl.scrollHeight - endEl.clientHeight - 1
          ) {
            const stoppedState = { ...stateRef.current, isScrolling: false, scrollTop: 1 };
            stateRef.current = stoppedState;
            setState(stoppedState);
            channelRef.current?.postMessage(stoppedState);
            stateSyncService.send(stoppedState);
            animationFrameRef.current = null;
            return;
          }

          const now = Date.now();
          if (now - lastBroadcastRef.current > 40) {
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

  return (
    <div 
      className="w-screen h-screen bg-transparent overflow-hidden relative flex items-end justify-start p-12"
      style={{ perspective: '1800px' }}
    >
      <TeleprompterCard state={state} scrollRef={scrollRef} visible={state.isVisible} />
    </div>
  );
};

export default DisplayOutput;