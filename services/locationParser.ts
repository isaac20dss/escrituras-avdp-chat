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
 *
 * Proteções contra palavra comum virar cidade (ver COMMON_WORD_CITIES e
 * AMBIGUOUS_UF): "tô feliz rs" não vira "Feliz, RS"; "estamos em vitória"
 * não vira "Vitória"; "sou do Salvador" (Jesus) não vira "Salvador".
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
// Nome do estado para exibir quando a pessoa diz só o estado ("sou do Paraná")
const STATE_DISPLAY: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará',
  DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso',
  MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná',
  PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte',
  RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina',
  SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
};
// Estados cujo nome é igual ao da capital: aí vale a cidade
const STATE_EQUALS_CAPITAL = new Set(['sao paulo', 'rio de janeiro']);

// Siglas que também são palavras comuns em chat: "se", "to" (tô), "pe" (pé),
// "es" (és), "ce" (cê), "rs" (risada), "mt" (muito), "go", "ma" (má), "pa" (pá)...
// Escritas em minúsculo só valem se vierem depois de "/", "-", "," ou no fim da mensagem.
const AMBIGUOUS_UF = new Set(['SE', 'TO', 'PE', 'ES', 'MA', 'AL', 'AM', 'PA', 'CE', 'GO', 'RS', 'MT', 'MS']);

// Municípios cujo nome é uma palavra comum (ou termo de igreja/sobrenome).
// Sem UF na mensagem, só valem depois de "sou de", "moro em" e parecidos;
// com sigla ambígua ("rs", "mt"...), só se a sigla estiver em MAIÚSCULA de propósito.
// Conferidos na lista do IBGE (todos existem como município).
const COMMON_WORD_CITIES = new Set([
  'feliz', 'vitoria', 'gloria', 'graca', 'natal', 'salvador', 'fortaleza', 'esperanca',
  'alegria', 'alegre', 'sorriso', 'bonito', 'formosa', 'messias', 'divino', 'trindade',
  'belem', 'nazare', 'canaa', 'betania', 'jerico', 'galileia', 'palestina', 'paraiso',
  'milagres', 'socorro', 'redencao', 'consolacao', 'piedade', 'imaculada', 'romaria', 'sacramento',
  'rosario', 'assuncao', 'conceicao', 'natividade', 'livramento', 'triunfo', 'conquista', 'harmonia',
  'uniao', 'liberdade', 'saude', 'extrema', 'descanso', 'saudades', 'solidao', 'sossego',
  'segredo', 'mansidao', 'pureza', 'riqueza', 'fartura', 'fortuna', 'progresso', 'primavera',
  'aurora', 'alvorada', 'estrela', 'mirante', 'horizonte', 'planalto', 'jardim', 'prata',
  'ouro', 'diamante', 'esmeralda', 'cristal', 'perola', 'luz', 'cruz', 'capela',
  'igrejinha', 'encantado', 'encanto', 'modelo', 'central', 'oriente', 'palma', 'palmas',
  'serra', 'lagoa', 'porto', 'barra', 'pedra', 'mata', 'chapada', 'colina',
  'coluna', 'pilar', 'salto', 'moeda', 'valente', 'gentil', 'nobres', 'serio',
  'moreno', 'castelo', 'condado', 'princesa', 'conde', 'maravilha', 'maravilhas', 'independencia',
  'inocencia', 'caridade', 'alianca', 'amparo', 'recreio', 'reserva', 'registro', 'passagem',
  'passos', 'posse', 'placas', 'delta', 'fama', 'farol', 'flores', 'floresta',
  'esteio', 'escada', 'estreito', 'fronteira', 'cachoeira', 'cascavel', 'formiga', 'pimenta',
  'canela', 'pitanga', 'laje', 'lajes', 'brejo', 'areia', 'barreiras', 'tesouro',
  'missal', 'quilombo', 'renascenca', 'regeneracao', 'resplendor', 'vigia', 'vitoria da conquista', 'bom jesus',
  'boa vista', 'bela vista', 'nova esperanca', 'boa esperanca', 'santa cruz', 'vera cruz', 'bom sucesso', 'nova gloria',
  'bom conselho', 'bom principio', 'bom retiro', 'monte santo', 'santa luz', 'terra santa', 'nova alianca', 'vista alegre',
  'campo alegre', 'alto alegre', 'bom despacho', 'boa ventura', 'bom jardim', 'nova uniao', 'santa fe', 'feliz natal',
  'barao', 'capitao', 'queimadas', 'parana', 'bandeirantes', 'bandeira', 'chaves', 'machado',
  'franca', 'castro', 'mendes', 'teixeira', 'barbosa', 'cardoso', 'cunha', 'martins',
  'assis', 'santos', 'santana', 'mariana', 'carolina', 'madalena', 'lourdes', 'denise',
  'claudia', 'mercedes', 'vera', 'iracema', 'olimpia', 'angelica', 'leopoldina', 'catarina',
  'oliveira', 'sousa', 'sales', 'medeiros', 'cavalcante', 'prado', 'viana',
]);

// Municípios que também são nomes de pessoa: sozinhos, contam como nome (acompanhante),
// não como lugar ("com a esposa Vitória"). Com UF ("Vitória ES") continuam sendo cidade.
const PERSON_NAME_CITIES = new Set([
  'mariana', 'vera', 'vitoria', 'claudia', 'carolina', 'cristina', 'claudio', 'denise', 'iracema',
  'madalena', 'lourdes', 'gloria', 'graca', 'aparecida', 'conceicao', 'fatima', 'penha', 'socorro',
  'luz', 'cruz', 'angelica', 'olimpia', 'leopoldina', 'catarina',
]);
for (const n of PERSON_NAME_CITIES) COMMON_WORD_CITIES.add(n);

// Capitais com nome de palavra: grandes demais para exigir sigla maiúscula.
// "fortaleza ce", "vitória - es" valem; "tô feliz rs" continua não valendo.
const COMMON_WORD_CAPITALS = new Set(['salvador', 'fortaleza', 'natal', 'vitoria', 'belem', 'palmas']);

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

// Prefixos que indicam claramente origem/moradia. Só estes aceitam cidade com nome
// de palavra comum ("sou de Salvador" sim; "sou do Salvador", "estamos em vitória" não).
const STRONG_ORIGIN_PREFIXES = new Set([
  'sou de', 'somos de', 'moro em', 'moramos em', 'aqui de', 'daqui de', 'la de',
  'direto de', 'assistindo de', 'falando de',
]);

const locStopWords = new Set([
  'casa', 'aqui', 'hoje', 'ontem', 'longe', 'deus', 'jesus', 'amém', 'amem',
  'boa', 'bom', 'boa noite', 'boa tarde', 'bom dia', 'noite', 'tarde', 'dia',
  'paz', 'graça', 'glória', 'gloria', 'senhor', 'live', 'chat', 'vivo',
  'todos', 'pessoal', 'gente', 'família', 'familia', 'igreja',
  'com', 'meu', 'minha', 'nome', 'sou', 'assistindo', 'falando',
  'cristo', 'fé', 'fe', 'luz', 'vitória', 'vitoria', 'graca', 'céu', 'ceu', 'sião', 'siao',
  'oração', 'oracao', 'louvor', 'bênção', 'bencao', 'salvador', 'espírito santo', 'espirito santo',
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
  start: number; // posição na mensagem
  end: number;
}

const tokenize = (text: string): Token[] =>
  Array.from(text.matchAll(/[A-Za-zÀ-ÿ'’]+/g)).map(m => ({
    raw: m[0],
    norm: normalize(m[0]),
    start: m.index ?? 0,
    end: (m.index ?? 0) + m[0].length,
  }));

/** Mensagem toda em maiúsculas (aí maiúscula não indica sigla de propósito) */
const isAllCaps = (text: string): boolean => {
  const letters = text.replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (letters.length < 6) return false;
  const upper = letters.replace(/[^A-ZÀ-Þ]/g, '').length;
  return upper / letters.length > 0.8;
};

/**
 * Uma sigla ambígua ("rs", "se", "mt"...) logo depois da cidade só vale se:
 *  - foi escrita em MAIÚSCULA numa mensagem normal ("Feliz RS"), ou
 *  - a cidade não é palavra comum (ou é capital) E há separador ("aracaju/se", "aracaju - se")
 *    ou a sigla é a última palavra ("aracaju se").
 */
const acceptsStateCode = (
  text: string, tokens: Token[], ufIndex: number, cityEnd: number, cityNorm: string, allCaps: boolean
): boolean => {
  const tok = tokens[ufIndex];
  if (!AMBIGUOUS_UF.has(tok.norm.toUpperCase())) return true;
  if (tok.raw === tok.raw.toUpperCase() && !allCaps) return true;
  if (COMMON_WORD_CITIES.has(cityNorm) && !COMMON_WORD_CAPITALS.has(cityNorm)) return false;
  const gap = text.slice(tokens[cityEnd - 1].end, tok.start);
  const hasSeparator = /[\/,\-(]/.test(gap) || cityEnd !== ufIndex; // "Belém do Pará"
  const isLast = ufIndex === tokens.length - 1;
  return hasSeparator || isLast;
};

const joinNorm = (tokens: Token[], start: number, end: number): string =>
  tokens.slice(start, end).map(t => t.norm).join(' ');

/** Etapa 1: UF (sigla ou nome) na mensagem + município daquela UF logo antes */
const findWithState = (text: string, tokens: Token[]): string | undefined => {
  const allCaps = isAllCaps(text);
  for (let i = 0; i < tokens.length; i++) {
    // Candidatos de UF que começam na posição i: [uf, quantas palavras ocupa, é sigla?]
    const candidates: [string, number, boolean][] = [];
    const tok = tokens[i];
    if (tok.norm.length === 2 && BRAZIL_STATES.has(tok.norm.toUpperCase())) {
      candidates.push([tok.norm.toUpperCase(), 1, true]);
    }
    for (let n = MAX_STATE_WORDS; n >= 1; n--) {
      if (i + n > tokens.length) continue;
      const name = joinNorm(tokens, i, i + n);
      const uf = STATE_NAMES[name];
      // "para" sem acento é preposição; só vale "Pará" escrito com acento
      if (uf && !(name === 'para' && !/[áÁ]/.test(tok.raw))) {
        candidates.push([uf, n, false]);
        break;
      }
    }

    // A cidade termina logo antes da UF, ou antes de um "do/de/da" ("Belém do Pará")
    const ends = [i];
    if (i > 0 && STATE_LINKS.has(tokens[i - 1].norm)) ends.push(i - 1);

    for (const [uf, , isCode] of candidates) {
      const cities = cityByUf.get(uf);
      if (!cities) continue;
      for (const end of ends) {
        // Da sequência mais longa para a mais curta
        for (let n = Math.min(MAX_CITY_WORDS, end); n >= 1; n--) {
          const cityNorm = joinNorm(tokens, end - n, end);
          const name = cities.get(cityNorm);
          if (!name) continue;
          if (isCode && !acceptsStateCode(text, tokens, i, end, cityNorm, allCaps)) continue;
          return `${name}, ${uf}`;
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
    const strong = STRONG_ORIGIN_PREFIXES.has(prefix.join(' '));
    for (let n = Math.min(MAX_CITY_WORDS, tokens.length - start); n >= 1; n--) {
      const nameNorm = joinNorm(tokens, start, start + n);

      // Só o estado ("sou do Paraná", "moro no Rio Grande do Sul")
      const stateUf = STATE_NAMES[nameNorm];
      if (stateUf && !STATE_EQUALS_CAPITAL.has(nameNorm)) {
        if (nameNorm === 'para' && !/[áÁ]/.test(tokens[start].raw)) continue;
        return STATE_DISPLAY[stateUf];
      }

      const entries = cityAnywhere.get(nameNorm);
      if (!entries) continue;
      // Palavra comum ("Vitória", "Salvador", "Natal"...) só com prefixo forte de origem
      if (COMMON_WORD_CITIES.has(nameNorm) && !strong) continue;
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
  // Município conhecido ou palavra comum já foi julgado pelas etapas 1 e 2
  !cityAnywhere.has(normalize(city)) &&
  !COMMON_WORD_CITIES.has(normalize(city)) &&
  !STATE_NAMES[normalize(city)] &&
  // Nenhuma palavra do nome pode ser termo comum ("Salvador Jesus", "Vitória Cristo")
  !normalize(city).split(/\s+/).some(w => locStopWords.has(w) || COMMON_WORD_CITIES.has(w)) &&
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
  return findWithState(text, tokens) || findAfterPrefix(tokens) || findFallback(text);
};

/** true quando o texto é um lugar (município, estado ou "Cidade UF") — usado para não virar acompanhante */
export const isPlaceName = (text: string): boolean => {
  const n = normalize(text.trim());
  if (!n) return false;
  if (PERSON_NAME_CITIES.has(n)) return false;
  if (cityAnywhere.has(n) || STATE_NAMES[n] || BRAZIL_STATES.has(n.toUpperCase())) return true;
  return findWithState(text, tokenize(text)) !== undefined;
};
