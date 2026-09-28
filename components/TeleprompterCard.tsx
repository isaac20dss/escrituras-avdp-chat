import React from 'react';
import { MessageSquare, Users } from 'lucide-react';
import { TeleprompterState } from '../types';
import Avatar from './Avatar';

/**
 * Cartão do teleprompter (560x940) compartilhado pelo Display (OBS) e pelo
 * preview do Painel de Controle. Os dois renderizam exatamente o mesmo
 * layout em tamanho real; o preview só aplica um transform: scale() por fora.
 * Assim a quebra de linha e a altura de rolagem são idênticas nos dois.
 */

export const CARD_WIDTH = 560;
export const CARD_HEIGHT = 940;

// Tolerância de parada automática: quantas linhas em branco rolam após o fim do texto
export const END_TOLERANCE_LINES = 1;
// Altura de linha do corpo (classe leading-relaxed = 1.625)
export const BODY_LINE_HEIGHT = 1.625;

export const BODY_CLASSES = "leading-relaxed text-white font-sans text-left [&>p]:mb-6 [&>ul]:mb-6 [&>ol]:mb-6 [&>ul]:list-disc [&>ul]:pl-6 [&>ol]:list-decimal [&>ol]:pl-6";

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
export const makeFocusOverlayHTML = (html: string, phrase: string): string => {
  if (!phrase || phrase.trim().length < 2) return html;
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return html.replace(
    new RegExp(`(${escaped})(?![^<>]*>)`, 'gi'),
    '<mark style="color:white;background:transparent;font-weight:inherit;font-size:inherit;">$1</mark>'
  );
};

interface TeleprompterCardProps {
  state: TeleprompterState;
  scrollRef: React.RefObject<HTMLDivElement>;
  /** Mostra o cartão (no Display segue state.isVisible; no preview fica sempre visível) */
  visible: boolean;
  /** HTML do corpo (o preview passa o texto com as marcas de busca) */
  bodyHtml?: string;
  /** Frase em foco (o preview desliga o foco enquanto há busca ativa) */
  focusText?: string;
  onScroll?: React.UIEventHandler<HTMLDivElement>;
  onMouseUp?: React.MouseEventHandler<HTMLDivElement>;
  scrollClassName?: string;
  /** Conteúdo exibido no modo escritura quando nenhuma escritura foi selecionada */
  emptyScriptPlaceholder?: React.ReactNode;
}

const TeleprompterCard: React.FC<TeleprompterCardProps> = ({
  state,
  scrollRef,
  visible,
  bodyHtml = state.selectedBody,
  focusText = state.highlightedText,
  onScroll,
  onMouseUp,
  scrollClassName = '',
  emptyScriptPlaceholder,
}) => {
  const hasFocus = !!focusText && focusText.trim().length >= 2;

  return (
    <div
      className={`
        relative
        backdrop-blur-[10px]
        border border-white/15
        rounded-2xl
        shadow-2xl
        transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]
        flex flex-col
        ${visible ? 'opacity-100' : 'opacity-0'}
      `}
      style={{
        width: `${CARD_WIDTH}px`,
        height: `${CARD_HEIGHT}px`,
        backgroundColor: `rgba(0, 0, 0, ${state.bgOpacity ?? 0.6})`,
        transform: `perspective(1800px) rotateY(${state.rotateY ?? 0}deg) ${visible ? 'translateY(0px)' : 'translateY(96px)'}`,
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
        onScroll={onScroll}
        onMouseUp={onMouseUp}
        className={`flex-1 p-10 overflow-y-auto no-scrollbar relative flex flex-col ${scrollClassName}`}
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

                    return (
                      <div key={user.authorKey || user.author || idx} className="bg-black/60 border border-white/10 rounded-xl p-5 shadow-lg backdrop-blur-sm animate-in slide-in-from-bottom-2 fade-in duration-300 flex items-center gap-4">
                        <Avatar
                          url={user.avatarUrl}
                          name={authorName}
                          className="w-14 h-14 rounded-full object-cover border-2 border-white/20 shrink-0 shadow-md"
                          fallbackClassName="w-14 h-14 rounded-full bg-red-600/30 border-2 border-red-500/30 flex items-center justify-center font-bold text-red-300 text-lg shrink-0 shadow-md"
                        />
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
                      <Avatar
                        url={msg.avatarUrl}
                        name={msg.author}
                        className="w-10 h-10 rounded-full object-cover border border-white/20 shrink-0 mt-0.5"
                        fallbackClassName="w-10 h-10 rounded-full bg-red-600/30 border border-red-500/30 flex items-center justify-center font-bold text-red-300 shrink-0 mt-0.5"
                      />
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
        ) : (!state.selectedTitle && emptyScriptPlaceholder) ? (
          emptyScriptPlaceholder
        ) : (
          // shrink-0: sem isso o flex-col encolhe esta div e o padding inferior é descartado
          <div
            className="min-h-full shrink-0"
            style={{ paddingBottom: `${END_TOLERANCE_LINES * state.fontSize * BODY_LINE_HEIGHT}px` }}
          >
            <h1 className="text-4xl font-bold leading-tight text-blue-400 mb-8 drop-shadow-md text-left font-sans tracking-wide uppercase">
              {state.selectedTitle}
            </h1>

            {/* Sistema de desfoque de foco — duas camadas sobrepostas */}
            <div style={{ position: 'relative' }}>

              {/* Camada 1: texto completo — desfocado quando há foco ativo */}
              <div
                className={BODY_CLASSES}
                style={{
                  fontSize: `${state.fontSize}px`,
                  filter: hasFocus ? `blur(${state.blurAmount}px)` : 'none',
                  opacity: hasFocus ? state.blurOpacity : 1,
                  transition: 'filter 0.45s ease, opacity 0.45s ease',
                  willChange: 'filter, opacity',
                }}
                dangerouslySetInnerHTML={{ __html: bodyHtml }}
              />

              {/* Camada 2: overlay com APENAS a frase destacada visível.
                  Posicionada em absolute, não afeta o layout (height).
                  Todo o texto é transparent exceto o mark da frase selecionada. */}
              {hasFocus && (
                <div
                  className={BODY_CLASSES}
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
                    __html: makeFocusOverlayHTML(state.selectedBody, focusText!)
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
  );
};

export default TeleprompterCard;
