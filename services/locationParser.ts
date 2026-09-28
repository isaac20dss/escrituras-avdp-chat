/**
 * locationParser.ts — Extrai "Cidade, UF" das mensagens do chat do YouTube
 * (usado na lista de presença).
 *
 * A cidade é conferida na lista oficial de municípios (brazilCities.ts):
 *   1. Procura a UF na mensagem ("PR", "pr", "Paraná") e testa as palavras
 *      logo antes dela contra os municípios daquela UF, da maior sequência
 *      para a menor ("Deus abençoe Maringá PR" -> "Maringá, PR").
 *   2. Sem UF, só aceita a cidade depois de uma expressão como "sou de",
 *      "moro em", "aqui de" — para não confundir "Jesus de Nazaré", "Natal",
 *      "Salvador" ou "Vitória" com cidades.
 *   3. Se não achar na lista (erro de digitação, cidade fora do Brasil),
 *      usa a regra antiga, mais permissiva, limitada a nomes curtos.
 */

import { CITIES_BY_UF } from './brazilCities';

const BRAZIL_STATES = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
]);

// Nome do estado por extenso (normalizado) -> UF
const STATE_NAMES: Record<string, string> = {
  'acre': 'AC', 'alagoas': 'AL', 'amapa': 'AP', 'amazonas': 'AM', 'bahia': 'BA',
  'ceara': 'CE', 'distrito federal': 'DF', 'espirito santo': 'ES', 'goias': 'GO',
  'maranhao': 'MA', 'mato grosso': 'MT', 'mato grosso do sul': 'MS', 'minas gerais': 'MG',
  'para': 'PA', 'paraiba': 'PB', 'parana': 'PR', 'pernambuco': 'PE', 'piaui': 'PI',
  'rio de janeiro': 'RJ', 'rio grande do norte': 'RN', 'rio grande do sul': 'RS',
  'rondonia': 'RO', 'roraima': 'RR', 'santa catarina': 'SC', 'sao paulo': 'SP',
  'sergipe': 'SE', 'tocantins': 'TO',
};
const MAX_STATE_WORDS = 4; // "rio grande do sul", "mato grosso do sul"
const MAX_CITY_WORDS = 7;
const STATE_LINKS = new Set(['do', 'da', 'de', 'em', 'no', 'na']);

// Expressões que indicam que a próxima palavra é a cidade (usadas quando não há UF)
const PLACE_PREFIXES = [
  'sou de', 'sou do', 'sou da', 'somos de', 'somos do', 'somos da',
  'moro em', 'moro no', 'moro na', 'moramos em',
  'aqui de', 'aqui do', 'aqui da', 'aqui em', 'daqui de',
  'la de', 'la do', 'la da',
  'direto de', 'direto do', 'direto da',
  'assistindo de', 'assistindo do', 'assistindo da',
  'falando de', 'falando do', 'falando da',
  'estou em', 'estamos em', 'to em', 'nos de', 'nos do', 'nos da',
  'familia de', 'familia do', 'familia da', 'familia em',
].map(p => p.split(' '));

const locStopWords = new Set([
  'casa', 'aqui', 'hoje', 'ontem', 'longe', 'deus', 'jesus', 'amém', 'amem',
  'boa', 'bom', 'boa noite', 'boa tarde', 'bom dia', 'noite', 'tarde', 'dia',
  'paz', 'graça', 'glória', 'gloria', 'senhor', 'live', 'chat', 'vivo',
  'todos', 'pessoal', 'gente', 'família', 'familia', 'igreja',
  'com', 'meu', 'minha', 'nome', 'sou', 'assistindo', 'falando',
]);

/** Minúsculas, sem acentos, sem apóstrofo ("Pau d'Arco" -> "pau darco") */
const normalize = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’`´]/g, '');

// Índices montados uma vez: por UF e em todo o Brasil
const cityByUf = new Map<string, Map<string, string>>();
const cityAnywhere = new Map<string, { name: string; uf: string }[]>();
for (const [uf, list] of Object.entries(CITIES_BY_UF)) {
  const m = new Map<string, string>();
  for (const name of list.split('|')) {
    const key = normalize(name);
    m.set(key, name);
    const entries = cityAnywhere.get(key) || [];
    entries.push({ name, uf });
    cityAnywhere.set(key, entries);
  }
  cityByUf.set(uf, m);
}

interface Token {
  raw: string;   // como foi digitado
  norm: string;  // normalizado
}

const tokenize = (text: string): Token[] =>
  (text.match(/[A-Za-zÀ-ÿ'’]+/g) || []).map(raw => ({ raw, norm: normalize(raw) }));

const joinNorm = (tokens: Token[], start: number, end: number): string =>
  tokens.slice(start, end).map(t => t.norm).join(' ');

/** Etapa 1: UF (sigla ou nome) na mensagem + município daquela UF logo antes */
const findWithState = (tokens: Token[]): string | undefined => {
  for (let i = 0; i < tokens.length; i++) {
    // Candidatos de UF que começam na posição i: [uf, quantas palavras ocupa]
    const candidates: [string, number][] = [];
    const tok = tokens[i];
    if (tok.norm.length === 2 && BRAZIL_STATES.has(tok.norm.toUpperCase())) {
      candidates.push([tok.norm.toUpperCase(), 1]);
    }
    for (let n = MAX_STATE_WORDS; n >= 1; n--) {
      if (i + n > tokens.length) continue;
      const name = joinNorm(tokens, i, i + n);
      const uf = STATE_NAMES[name];
      // "para" sem acento é preposição; só vale "Pará" escrito com acento
      if (uf && !(name === 'para' && !/[áÁ]/.test(tok.raw))) {
        candidates.push([uf, n]);
        break;
      }
    }

    // A cidade termina logo antes da UF, ou antes de um "do/de/da" ("Belém do Pará")
    const ends = [i];
    if (i > 0 && STATE_LINKS.has(tokens[i - 1].norm)) ends.push(i - 1);

    for (const [uf] of candidates) {
      const cities = cityByUf.get(uf);
      if (!cities) continue;
      for (const end of ends) {
        // Da sequência mais longa para a mais curta
        for (let n = Math.min(MAX_CITY_WORDS, end); n >= 1; n--) {
          const name = cities.get(joinNorm(tokens, end - n, end));
          if (name) return `${name}, ${uf}`;
        }
      }
    }
  }
  return undefined;
};

/** Etapa 2: sem UF — município logo depois de "sou de", "moro em", etc. */
const findAfterPrefix = (tokens: Token[]): string | undefined => {
  for (let i = 0; i < tokens.length; i++) {
    const prefix = PLACE_PREFIXES.find(p => p.every((w, k) => tokens[i + k]?.norm === w));
    if (!prefix) continue;
    const start = i + prefix.length;
    for (let n = Math.min(MAX_CITY_WORDS, tokens.length - start); n >= 1; n--) {
      const entries = cityAnywhere.get(joinNorm(tokens, start, start + n));
      if (!entries) continue;
      // Nome existe em uma UF só -> "Cidade, UF"; em várias (ex.: "Santa Maria") -> só a cidade
      return entries.length === 1 ? `${entries[0].name}, ${entries[0].uf}` : entries[0].name;
    }
  }
  return undefined;
};

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

const CONNECTORS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

/** Regra antiga (sem lista) só aceita nomes curtos: no máximo 2 palavras além de "de/da/do" */
const isValidFallbackCity = (city: string): boolean =>
  city.length >= 3 &&
  !locStopWords.has(city.toLowerCase()) &&
  city.split(/\s+/).filter(w => !CONNECTORS.has(w.toLowerCase())).length <= 2;

const formatCity = (raw: string): string => {
  return raw.trim().split(/\s+/).map(w => {
    const lower = w.toLowerCase();
    if (CONNECTORS.has(lower) && raw.trim().split(/\s+/).length > 1) {
      return lower;
    }
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }).join(' ');
};

/** Etapa 3: regra antiga (sem lista), para erro de digitação ou cidade fora do Brasil */
const findFallback = (text: string): string | undefined => {
  // Prefixo explícito + Cidade/UF — Ex: "sou de Marinca/PR"
  const prefixWithUF = text.match(/\b(?:sou d[eao]|moro em|assistindo d[eao]|falando d[eao]|direto d[eao]|aqui d[eao]|lá d[eao])\s+([A-ZÀ-Úa-zà-ú][A-ZÀ-Úa-zà-ú\s]{1,25}?)\s*[\/\-,]\s*([A-Za-z]{2})\b/i);
  if (prefixWithUF) {
    const uf = prefixWithUF[2].toUpperCase();
    const city = cleanCity(prefixWithUF[1]);
    if (BRAZIL_STATES.has(uf) && isValidFallbackCity(city)) {
      return `${formatCity(city)}, ${uf}`;
    }
  }

  // Cidade + UF com separador — Ex: "Marinca-PR", "Marinca, PR"
  const cityUfSep = text.match(/\b([A-ZÀ-Úa-zà-ú][A-ZÀ-Úa-zà-ú\s]{1,25}?)\s*[\/\-,]\s*([A-Za-z]{2})\b/i);
  if (cityUfSep) {
    const uf = cityUfSep[2].toUpperCase();
    const city = cleanCity(cityUfSep[1]);
    if (BRAZIL_STATES.has(uf) && isValidFallbackCity(city)) {
      return `${formatCity(city)}, ${uf}`;
    }
  }

  // Prefixo explícito sem UF — Ex: "sou de Lisboa", "moro em Orlando"
  const prefixOnly = text.match(/\b(?:sou d[eao]|moro em|assistindo d[eao]|falando d[eao]|direto d[eao]|aqui d[eao]|lá d[eao])\s+([A-ZÀ-Ú][A-ZÀ-Úa-zà-ú\s]{2,30}?)(?:\s*[.!?;,]|\s+(?:com|e |assistindo|aqui|hoje|paz|amém|amem|bom|boa|glória|gloria)|$)/);
  if (prefixOnly) {
    const cleaned = cleanCity(prefixOnly[1].replace(/\s+(?:com|e|assistindo|aqui|hoje|paz|amém|amem|bom|boa|glória|gloria)$/i, ''));
    if (isValidFallbackCity(cleaned)) {
      return formatCity(cleaned);
    }
  }

  return undefined;
};

export const extractLoc = (text: string): string | undefined => {
  if (!text || text.length < 3) return undefined;
  const tokens = tokenize(text);
  return findWithState(tokens) || findAfterPrefix(tokens) || findFallback(text);
};
