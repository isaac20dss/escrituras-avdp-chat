/**
 * companionParser.ts — Acompanhantes da lista de presença.
 *
 * Entende quem está assistindo junto com a pessoa:
 *   - nomes: "com a Ana e o João"           -> Ana, João
 *   - parentes: "eu e meu marido"           -> Marido
 *   - parente com nome: "com minha esposa Ana" -> Ana
 *   - família: "Cida e família em Maringá"  -> Família
 *
 * E ignora quando o parente aparece em pedido de oração ou saudação:
 *   "Deus abençoe minha mãe", "orem pelo meu filho", "boa noite irmãos",
 *   "boa noite família", "Família de Deus".
 */

import { isPlaceName } from './locationParser';

export const FAMILY_COMPANION = 'Família';

const normalize = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Parente (normalizado) -> como aparece na tela
const RELATIVES: Record<string, string> = {
  familia: 'Família', familias: 'Família', familiares: 'Família',
  esposa: 'Esposa', esposo: 'Esposo', marido: 'Marido', mulher: 'Esposa',
  filho: 'Filho', filha: 'Filha', filhos: 'Filhos', filhas: 'Filhas',
  neto: 'Neto', neta: 'Neta', netos: 'Netos', netas: 'Netas',
  mae: 'Mãe', pai: 'Pai', pais: 'Pais', mamae: 'Mãe', papai: 'Pai',
  sogra: 'Sogra', sogro: 'Sogro', sogros: 'Sogros',
  irma: 'Irmã', irmao: 'Irmão', irmas: 'Irmãs', irmaos: 'Irmãos',
  avo: 'Avó', avos: 'Avós', vo: 'Vó', vovo: 'Vovó',
  tia: 'Tia', tio: 'Tio', tias: 'Tias', tios: 'Tios',
  sobrinho: 'Sobrinho', sobrinha: 'Sobrinha', sobrinhos: 'Sobrinhos', sobrinhas: 'Sobrinhas',
  primo: 'Primo', prima: 'Prima', primos: 'Primos', primas: 'Primas',
  genro: 'Genro', nora: 'Nora', cunhada: 'Cunhada', cunhado: 'Cunhado', cunhados: 'Cunhados',
  namorada: 'Namorada', namorado: 'Namorado', noiva: 'Noiva', noivo: 'Noivo',
  criancas: 'Crianças', bebe: 'Bebê', amiga: 'Amiga', amigo: 'Amigo', amigas: 'Amigas', amigos: 'Amigos',
};
// "avó" e "avô" viram "avo" ao tirar acento: decide pelo acento original
const relativeLabel = (raw: string): string | undefined => {
  const n = normalize(raw);
  if (n === 'avo') return /ô/i.test(raw) ? 'Avô' : 'Avó';
  if (n === 'vo') return /ô/i.test(raw) ? 'Vô' : 'Vó';
  if (n === 'vovo') return /ô$/i.test(raw) ? 'Vovô' : 'Vovó';
  return RELATIVES[n];
};

const POSSESSIVES = new Set(['a', 'o', 'as', 'os', 'minha', 'meu', 'minhas', 'meus', 'nossa', 'nosso', 'nossas', 'nossos', 'toda', 'todo', 'todos', 'todas', 'sua', 'seu']);

// Palavras que, na mesma frase, indicam pedido de oração (não é acompanhante)
const PRAYER = /\b(?:abencoe|abencoa|abencoar|abencoai|ore|orem|orar|oracao|oracoes|intercedam|intercessao|cura|curar|cure|saude|proteja|protege|guarde|guarda|cuide|restaure|restaura|salve|livre|livra|doente|internad[oa]|hospital|falecid[oa]|luto|saudades?)\b/;
// Parente logo depois de "pelo/pela/por/pra" ("orem pelo meu filho")
const FOR_SOMEONE = /\b(?:pel[oa]s?|por|pra|para)\s+(?:(?:a|o|as|os|minha|meu|minhas|meus|nossa|nosso)\s+)?$/;
// Saudação antes do parente ("boa noite família", "paz irmãos", "boa noite minha família")
const GREETING = /\b(?:boa noite|boa tarde|bom dia|ola|oi|paz|amad[oa]s?|querid[oa]s?|salve|alo)\s+(?:(?:a|o|as|os|minha|meu|minhas|meus|nossa|nosso)\s+)?$/;
// "Família" como igreja ("Família de Deus", "Família AVDP")
const CHURCH_FAMILY = /^\s*(?:de\s+deus|da\s+fe|da\s+igreja|avdp|abencoada|amada|querida|crista)\b/;
// Mensagem que começa com "Família" + lugar/presença ("Família em Maringá")
const FAMILY_AT_START = /^\W*familia\s+(?:em|de|do|da|no|na|presente|presentes|aqui|toda|reunida|assistindo)\b/;

// "Pai"/"Filho" como Deus/Jesus: "Pai celestial", "o Filho de Deus", "meu Pai amado"
const DIVINE_AFTER = /^\s*(?:de deus|do ceu|celestial|eterno|amado|querido|santo|bondoso|misericordioso|nosso|todo poderoso)\b/;
const DIVINE_WORDS = new Set(['pai', 'filho', 'papai']);
// Nunca contam como companhia no começo da mensagem (são saudação/oração): "Irmãos, boa noite", "Pai, obrigado"
const NOT_AT_START = new Set(['Irmãos', 'Irmãs', 'Pai', 'Família', 'Amigos', 'Amigas']);

const NOT_A_NAME = new Set([
  'casa', 'igreja', 'tv', 'live', 'chat', 'deus', 'jesus', 'amem', 'pessoal', 'todos', 'todas',
  'aqui', 'hoje', 'juntos', 'juntas', 'eu', 'ele', 'ela', 'eles', 'elas', 'voces', 'vcs', 'gente',
  'senhor', 'cristo', 'fe', 'paz', 'gloria', 'amor', 'carinho', 'alegria', 'muito', 'muita',
  'presente', 'presentes', 'assistindo', 'nos', 'mim', 'ti', 'voce', 'vc', 'irmaos', 'irmas',
]);

const titleCase = (s: string): string =>
  s.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');

/** Divide a mensagem em frases; pedido de oração é avaliado por frase */
const clauses = (text: string): string[] => text.split(/[.!?;\n]+/).filter(c => c.trim().length > 0);

/**
 * Parentes mencionados como companhia ("eu e meu marido", "com os filhos",
 * "minha esposa e eu", "Cida e família em Maringá").
 */
const findRelatives = (clause: string): { labels: string[]; claimedNames: Set<string> } => {
  const labels: string[] = [];
  const claimedNames = new Set<string>(); // nomes logo após o parente ("esposa Ana")
  const n = normalize(clause);
  if (PRAYER.test(n)) return { labels, claimedNames };

  const words = Array.from(clause.matchAll(/[A-Za-zÀ-ÿ]+/g));
  for (let i = 0; i < words.length; i++) {
    const raw = words[i][0];
    const label = relativeLabel(raw);
    if (!label) continue;

    const before = n.slice(0, words[i].index).replace(/\s+/g, ' ');
    if (GREETING.test(before) || FOR_SOMEONE.test(before)) continue;
    const after = n.slice((words[i].index ?? 0) + raw.length);
    if (DIVINE_WORDS.has(normalize(raw)) && (DIVINE_AFTER.test(after) || (i > 0 && /^[A-Z]/.test(raw)))) continue;
    if (label === FAMILY_COMPANION && CHURCH_FAMILY.test(n.slice((words[i].index ?? 0) + raw.length))) continue;

    // Precisa indicar companhia: "e/com/eu e (meu/minha)? parente" ou "meu/minha parente"
    // Volta sobre "a", "minha", "toda a"... e olha a palavra antes deles
    let j = i - 1;
    while (j >= 0 && POSSESSIVES.has(normalize(words[j][0]))) j--;
    const possessives = words.slice(j + 1, i).map(w => normalize(w[0]));
    const linkWord = j >= 0 ? normalize(words[j][0]) : undefined;
    const startsMessage = linkWord === undefined && !NOT_AT_START.has(label);
    const linked =
      linkWord === 'e' || linkWord === 'com' || linkWord === 'junto' ||
      possessives.some(w => ['minha', 'meu', 'minhas', 'meus', 'nossa', 'nosso'].includes(w));
    const familyAtStart = label === FAMILY_COMPANION && FAMILY_AT_START.test(n);
    if (!linked && !familyAtStart && !startsMessage) continue;

    // "com minha esposa Ana" -> o nome "Ana" é quem conta
    const next = words[i + 1]?.[0];
    const gapToNext = next ? clause.slice((words[i].index ?? 0) + raw.length, words[i + 1].index) : '';
    if (next && /^\s+$/.test(gapToNext) && /^[A-ZÀ-Þ]/.test(next) && !relativeLabel(next)
        && !NOT_A_NAME.has(normalize(next)) && !isPlaceName(next)
        && !['e', 'em', 'de', 'da', 'do'].includes(normalize(next))) {
      claimedNames.add(titleCase(next));
      continue;
    }
    labels.push(label);
  }
  return { labels, claimedNames };
};

/** Nomes depois de "com", "junto com", "eu e" ("com a Ana e o João") */
const findNames = (clause: string): string[] => {
  const n = normalize(clause);
  if (PRAYER.test(n)) return [];
  const match = clause.match(/\b(?:junto com|assistindo com|com|eu e)\s+([^.\n!?:;]+)/i);
  if (!match) return [];

  const segment = match[1]
    // para no lugar/tempo: "com a Ana de Maringá", "com o João aqui"
    .split(/\s(?:de|do|da|em|no|na|moro|assistindo|falando|direto|aqui|hoje|presente|presentes)(?=\s|$)/i)[0];

  return segment
    .split(/\s*(?:,|\se\s|&)\s*/i)
    .map(part => {
      const ws = part.trim().split(/\s+/).filter(Boolean);
      while (ws.length && POSSESSIVES.has(normalize(ws[0]))) ws.shift();
      if (ws.length && relativeLabel(ws[0])) ws.shift(); // parente: tratado em findRelatives
      return ws.join(' ');
    })
    .filter(p =>
      p.length >= 2 && p.length <= 25 &&
      /^[A-Za-zÀ-ÿ]/.test(p) &&
      p.split(/\s+/).length <= 3 &&
      !p.split(/\s+/).some(w => NOT_A_NAME.has(normalize(w)) || relativeLabel(w)) &&
      !isPlaceName(p) && !p.split(/\s+/).some(w => w.length === 2 && isPlaceName(w))
    )
    .map(titleCase);
};

/** Junta acompanhantes sem repetir (ignora maiúsculas e acentos) */
export const mergeCompanions = (current: string[], extra: string[]): string[] => {
  const seen = new Set(current.map(normalize));
  const out = [...current];
  for (const c of extra) {
    const key = normalize(c);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(c);
    }
  }
  return out;
};

/**
 * Acompanhantes citados na mensagem (nomes e parentes), sem repetir e sem
 * incluir a própria pessoa.
 */
export const extractCompanions = (text: string, authorName: string, selfName?: string): string[] => {
  if (!text || text.length < 3) return [];
  let result: string[] = [];
  for (const clause of clauses(text)) {
    const { labels, claimedNames } = findRelatives(clause);
    result = mergeCompanions(result, [...findNames(clause), ...claimedNames, ...labels]);
  }

  const author = normalize(authorName || '');
  const self = selfName ? normalize(selfName) : undefined;
  return result
    .filter(c => {
      const k = normalize(c);
      if (author && (author.includes(k) || k.includes(author))) return false;
      if (self && (self.includes(k) || k.includes(self))) return false;
      return true;
    })
    .slice(0, 6);
};

/** true quando a mensagem diz que a pessoa está com a família dela */
export const mentionsOwnFamily = (text: string): boolean =>
  extractCompanions(text, '').includes(FAMILY_COMPANION);
