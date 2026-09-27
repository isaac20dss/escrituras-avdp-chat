import React, { useEffect, useState } from 'react';

/**
 * Foto de perfil do YouTube com fallback.
 *
 * As fotos personalizadas (yt3/yt4.ggpht.com) recusam a imagem (403) quando o
 * navegador envia o Referer de outro site (ex.: http://localhost:3000). Só os
 * avatares automáticos de letra passavam. Por isso:
 *   1. carrega direto sem enviar Referer;
 *   2. se falhar, carrega pelo servidor local (server.cjs /avatar);
 *   3. se falhar de novo, mostra a inicial do nome.
 */

const LOCAL_AVATAR_PROXY = (url: string) => `http://localhost:3001/avatar?url=${encodeURIComponent(url)}`;

interface AvatarProps {
  url?: string;
  name?: string;
  /** Classes da imagem (tamanho, borda, etc.) */
  className: string;
  /** Classes do círculo com a inicial, usado quando não há foto */
  fallbackClassName: string;
  fallbackStyle?: React.CSSProperties;
}

const Avatar: React.FC<AvatarProps> = ({ url, name, className, fallbackClassName, fallbackStyle }) => {
  // 0 = direto, 1 = via servidor local, 2 = desistiu (mostra inicial)
  const [attempt, setAttempt] = useState(0);

  useEffect(() => { setAttempt(0); }, [url]);

  const initial = (typeof name === 'string' && name.trim().length > 0) ? name.trim().charAt(0).toUpperCase() : '?';

  if (!url || attempt >= 2) {
    return <div className={fallbackClassName} style={fallbackStyle}>{initial}</div>;
  }

  return (
    <img
      src={attempt === 0 ? url : LOCAL_AVATAR_PROXY(url)}
      alt={name || 'Anônimo'}
      className={className}
      referrerPolicy="no-referrer"
      loading="eager"
      onError={() => setAttempt(a => a + 1)}
    />
  );
};

export default Avatar;
