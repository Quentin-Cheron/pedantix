import { normalize, stem } from "./normalize";

export type Token = {
  raw: string;
  isWord: boolean;
  norm: string;
  stem: string;
  inTitle: boolean;
};

export type GuessRecord = {
  index: number;
  raw: string;
  norm: string;
  hits: number;
  similarity: number;
  hintLevel: HintLevel;
  isNew: boolean;
};

export type HintLevel = "red" | "orange" | "yellow" | "green";

const WORD_RE = /(\p{L}+(?:['’]\p{L}+)?|\p{N}+)/u;

export function tokenize(text: string, inTitle: boolean): Token[] {
  const tokens: Token[] = [];
  const split = text.split(/(\p{L}+(?:['’]\p{L}+)?|\p{N}+)/u);
  for (const part of split) {
    if (!part) continue;
    if (WORD_RE.test(part)) {
      const norm = normalize(part);
      tokens.push({
        raw: part,
        isWord: true,
        norm,
        stem: stem(norm),
        inTitle,
      });
    } else {
      tokens.push({ raw: part, isWord: false, norm: "", stem: "", inTitle });
    }
  }
  return tokens;
}

export function buildTokens(title: string, extract: string): Token[] {
  const titleTokens = tokenize(title, true);
  const sep: Token = {
    raw: "\n\n",
    isWord: false,
    norm: "",
    stem: "",
    inTitle: false,
  };
  const bodyTokens = tokenize(extract, false);
  return [...titleTokens, sep, ...bodyTokens];
}

export type RevealMatch = {
  matched: boolean;
  variant: boolean;
};

export function matchToken(token: Token, gNorm: string, gStem: string): RevealMatch {
  if (!token.isWord || !token.norm) return { matched: false, variant: false };
  if (token.norm === gNorm) return { matched: true, variant: false };
  if (
    gStem.length >= 3 &&
    token.stem === gStem &&
    (token.norm.startsWith(gStem) || gNorm.startsWith(token.stem))
  ) {
    return { matched: true, variant: true };
  }
  return { matched: false, variant: false };
}

export function isAutoRevealed(token: Token): boolean {
  if (!token.isWord) return true;
  if (!token.norm) return true;
  return false;
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const previous = new Array<number>(b.length + 1);
  const current = new Array<number>(b.length + 1);

  for (let j = 0; j <= b.length; j++) previous[j] = j;

  for (let i = 1; i <= a.length; i++) {
    current[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost
      );
    }
    for (let j = 0; j <= b.length; j++) previous[j] = current[j];
  }

  return previous[b.length];
}

function normalizedSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const distance = levenshteinDistance(a, b);
  return Math.max(0, 1 - distance / maxLen);
}

function commonPrefixLength(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && a[i] === b[i]) i++;
  return i;
}

export const MIN_HINT_SIMILARITY = 0.62;

export function tokenSimilarity(token: Token, gNorm: string, gStem: string): number {
  if (!token.isWord || !token.norm) return 0;
  if (token.norm === gNorm) return 1;

  const base = normalizedSimilarity(gNorm, token.norm);
  const minLen = Math.min(gNorm.length, token.norm.length);
  const maxLen = Math.max(gNorm.length, token.norm.length);
  const lengthRatio = minLen / maxLen;
  const prefixRatio = commonPrefixLength(gNorm, token.norm) / minLen;
  const sameStem = gStem.length >= 4 && token.stem === gStem;

  let score = base * 0.55 + prefixRatio * 0.3 + lengthRatio * 0.15;

  if (sameStem) {
    score = Math.max(score, 0.84);
  } else {
    // Avoid false positives from words that look similar but have different stems.
    score = Math.min(score, 0.59);
  }

  return score;
}

function bestSimilarity(
  state: {
    tokens: Token[];
    revealed: Set<string>;
  },
  gNorm: string,
  gStem: string
): number {
  const seen = new Set<string>();
  let best = 0;

  for (const t of state.tokens) {
    if (!t.isWord || !t.norm) continue;
    if (state.revealed.has(t.norm)) continue;
    if (seen.has(t.norm)) continue;
    seen.add(t.norm);

    best = Math.max(best, tokenSimilarity(t, gNorm, gStem));
    if (best >= 1) break;
  }

  return best;
}

export function hintFromSimilarity(similarity: number): HintLevel {
  if (similarity >= 0.88) return "green";
  if (similarity >= 0.74) return "yellow";
  if (similarity >= MIN_HINT_SIMILARITY) return "orange";
  return "red";
}

export function applyGuess(
  state: {
    tokens: Token[];
    revealed: Set<string>;
    guesses: GuessRecord[];
    guessesByNorm: Map<string, number>;
    lastGuessNorm: string | null;
    lastGuessIndex: number | null;
  },
  raw: string
): { state: typeof state; hits: number; flash: Set<string> } {
  const norm = normalize(raw.trim());
  if (!norm || state.guessesByNorm.has(norm))
    return { state, hits: 0, flash: new Set() };

  const gStem = stem(norm);
  const similarity = bestSimilarity(state, norm, gStem);
  const hintLevel = hintFromSimilarity(similarity);
  let hits = 0;
  const newRevealed = new Set(state.revealed);
  const flash = new Set<string>();

  for (const t of state.tokens) {
    if (!t.isWord) continue;
    const wasRevealed = newRevealed.has(t.norm);
    const m = matchToken(t, norm, gStem);
    if (m.matched) {
      if (!wasRevealed) {
        newRevealed.add(t.norm);
        flash.add(t.norm);
      }
      hits++;
    }
  }

  const index = state.guesses.length;
  const record: GuessRecord = {
    index,
    raw: raw.trim(),
    norm,
    hits,
    similarity,
    hintLevel,
    isNew: hits > 0,
  };
  const guessesByNorm = new Map(state.guessesByNorm);
  guessesByNorm.set(norm, index);

  return {
    state: {
      ...state,
      revealed: newRevealed,
      guesses: [...state.guesses, record],
      guessesByNorm,
      lastGuessNorm: norm,
      lastGuessIndex: index,
    },
    hits,
    flash,
  };
}
