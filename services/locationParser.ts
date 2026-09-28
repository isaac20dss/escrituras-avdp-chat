/**
 * locationParser.ts — Extrai "Cidade, UF" das mensagens do chat do YouTube
 * (usado na lista de presença).
 */

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

// Palavras que costumam vir ANTES da cidade e não fazem parte dela.
// Ex.: "Família em Maringá", "Cida e família em Maringá", "Boa noite de Recife", "Aqui em Curitiba"
const LEADING_NOISE = /^(?:[A-Za-zÀ-ÿ]+\s+e\s+(?=(?:minha\s+|nossa\s+|a\s+)?(?:fam[ií]lia|esposa|esposo|marido|filhos?|filhas?)\b))?(?:(?:minha|nossa|a|toda\s+a)\s+)?(?:fam[ií]lia|esposa|esposo|marido|filhos?|filhas?|galera|pessoal|todos|n[oó]s|estamos|estou|aqui|direto|assistindo|falando|moro|moramos|sou|somos|boa\s+noite|boa\s+tarde|bom\s+dia|ol[aá]|oi|paz\s+do\s+senhor|a\s+paz|am[eé]m|gl[oó]ria\s+a\s+deus|irm[aã]os?|igreja)(?=\s|$)\s*/i;
// Preposição solta que sobra no começo depois de tirar o ruído ("em Maringá" -> "Maringá")
const LEADING_PREPOSITION = /^(?:em|de|do|da|dos|das|no|na|nos|nas)\s+/i;

/** Remove saudações, "família em", "aqui de" etc. do começo do nome da cidade */
export const cleanCity = (raw: string): string => {
  let city = raw.trim().replace(/\s+/g, ' ');
  for (let i = 0; i < 6; i++) {
    const next = city.replace(LEADING_NOISE, '').replace(LEADING_PREPOSITION, '').trim();
    if (next === city) break;
    city = next;
  }
  return city;
};

const isValidCity = (city: string): boolean =>
  city.length >= 3 && !locStopWords.has(city.toLowerCase());


const formatCity = (raw: string): string => {
  return raw.trim().split(/\s+/).map(w => {
    const lower = w.toLowerCase();
    if (['de', 'da', 'do', 'das', 'dos', 'e'].includes(lower) && raw.trim().split(/\s+/).length > 1) {
      return lower;
    }
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }).join(' ');
};

export const extractLoc = (text: string): string | undefined => {
  if (!text || text.length < 3) return undefined;

  // Estratégia 1: Prefixo explícito + Cidade/UF  
  // Ex: "sou de São Paulo/SP", "moro em Recife-PE", "assistindo de Salvador, BA"
  const prefixWithUF = text.match(/\b(?:sou d[eao]|moro em|assistindo d[eao]|falando d[eao]|direto d[eao]|aqui d[eao]|lá d[eao])\s+([A-ZÀ-Úa-zà-ú][A-ZÀ-Úa-zà-ú\s]{1,25}?)\s*[\/\-,]\s*([A-Za-z]{2})\b/i);
  if (prefixWithUF) {
    const uf = prefixWithUF[2].toUpperCase();
    const city = cleanCity(prefixWithUF[1]);
    if (BRAZIL_STATES.has(uf) && isValidCity(city)) {
      return `${formatCity(city)}, ${uf}`;
    }
  }

  // Estratégia 2: Cidade + UF com separador (sem prefixo necessário)
  // Ex: "Belo Horizonte/MG", "Curitiba-PR", "Manaus, AM", "Rio de Janeiro / RJ"
  const cityUfSep = text.match(/\b([A-ZÀ-Úa-zà-ú][A-ZÀ-Úa-zà-ú\s]{1,25}?)\s*[\/\-,]\s*([A-Za-z]{2})\b/i);
  if (cityUfSep) {
    const uf = cityUfSep[2].toUpperCase();
    const city = cleanCity(cityUfSep[1]);
    if (BRAZIL_STATES.has(uf) && isValidCity(city)) {
      return `${formatCity(city)}, ${uf}`;
    }
  }

  // Estratégia 3: Cidade + UF separados por espaço (sem separador)
  // Ex: "Salvador BA", "São Paulo SP", "Recife PE"
  const cityUfSpace = text.match(/\b([A-ZÀ-Úa-zà-ú][A-ZÀ-Úa-zà-ú\s]{2,25}?)\s+([A-Z]{2})\b/);
  if (cityUfSpace) {
    const uf = cityUfSpace[2].toUpperCase();
    const city = cleanCity(cityUfSpace[1]);
    if (BRAZIL_STATES.has(uf) && isValidCity(city)) {
      return `${formatCity(city)}, ${uf}`;
    }
  }

  // Estratégia 4: Prefixo explícito sem UF
  // Ex: "sou de Campinas", "moro em Florianópolis", "aqui de Manaus"
  const prefixOnly = text.match(/\b(?:sou d[eao]|moro em|assistindo d[eao]|falando d[eao]|direto d[eao]|aqui d[eao]|lá d[eao])\s+([A-ZÀ-Úa-zà-ú][A-ZÀ-Úa-zà-ú\s]{2,30}?)(?:\s*[.!?;,]|\s+(?:com|e |assistindo|aqui|hoje|paz|amém|amem|bom|boa|glória|gloria)|$)/i);
  if (prefixOnly) {
    const rawLoc = prefixOnly[1].trim();
    // Remove trailing stop words
    const cleaned = cleanCity(rawLoc.replace(/\s+(?:com|e|assistindo|aqui|hoje|paz|amém|amem|bom|boa|glória|gloria)$/i, ''));
    if (isValidCity(cleaned)) {
      return formatCity(cleaned);
    }
  }

  return undefined;
};

