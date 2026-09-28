/**
 * companionParser.ts — Regras de acompanhantes da lista de presença.
 */

export const FAMILY_COMPANION = 'Família';

const normalize = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// A pessoa está com a própria família: "e família", "com a família",
// "eu e minha família", "minha família e eu", "nossa família aqui"...
const OWN_FAMILY = /(?:^|[^a-z])(?:e|com|eu e|junto com)\s+(?:a\s+|minha\s+|nossa\s+|toda\s+a\s+|toda\s+)?familia\b|(?:^|[^a-z])(?:minha|nossa)\s+familia\b/;

// Mensagem que COMEÇA com "Família" + lugar/presença: "Família em Maringá, PR",
// "Família presente", "Família toda aqui" — mas não "Família de Deus", "Família AVDP".
const FAMILY_AT_START = /^\W*familia\s+(?:em|de|do|da|no|na|presente|presentes|aqui|toda|reunida|assistindo)\b/;
const CHURCH_FAMILY = /^\W*familia\s+(?:de\s+deus|da\s+fe|da\s+igreja|avdp|abencoada|amada|querida)\b/;

// Não é acompanhante quando "família" é saudação à igreja ou pedido de oração:
// "boa noite família", "boa noite minha família AVDP", "Deus abençoe minha família",
// "orem pela minha família", "família AVDP".
const NOT_COMPANION = /(?:boa noite|boa tarde|bom dia|ola|oi|paz|amada|querida|abencoe|abencoa|guarde|proteja|cuide|cura|restaura|salve|salva|pela|pelas|por|pra|para|ore|orem|oracao|oracoes|intercedam)\s+(?:a\s+|minha\s+|nossa\s+|toda\s+a\s+)?familia\b/;

/** true quando a mensagem diz que a pessoa está com a família dela */
export const mentionsOwnFamily = (text: string): boolean => {
  if (!text) return false;
  const t = normalize(text);
  if (FAMILY_AT_START.test(t) && !CHURCH_FAMILY.test(t)) return true;
  if (!OWN_FAMILY.test(t)) return false;
  // Se TODAS as menções de "família" são saudação/oração, não conta
  const mentions = t.match(/familia\b/g)?.length || 0;
  const excluded = t.match(new RegExp(NOT_COMPANION.source, 'g'))?.length || 0;
  return mentions > excluded;
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
