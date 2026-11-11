export interface Span {
  start: number;
  end: number;
}

const FOLD: Record<string, string> = {
  "\u2018": "'", "\u2019": "'", "\u201c": '"', "\u201d": '"', "\u2013": "-", "\u2014": "-", "\u00a0": " ",
};

// Normalized view of text plus a map from each normalized char back to its
// original offset, so a quote found in normalized space maps to a real span.
export function normalizeWithMap(text: string): { norm: string; map: number[] } {
  let norm = "";
  const map: number[] = [];
  let lastSpace = true;
  for (let i = 0; i < text.length; i++) {
    let ch = FOLD[text[i]] ?? text[i];
    if (/\s/.test(ch)) {
      if (lastSpace) continue;
      ch = " ";
      lastSpace = true;
    } else {
      lastSpace = false;
      ch = ch.toLowerCase();
    }
    norm += ch;
    map.push(i);
  }
  return { norm: norm.trimEnd(), map };
}

export function normalize(text: string): string {
  return normalizeWithMap(text).norm.trim();
}

export function locateQuote(input: string, quote: string): Span | null {
  if (!quote) return null;
  const exact = input.indexOf(quote);
  if (exact >= 0) return { start: exact, end: exact + quote.length };
  const { norm, map } = normalizeWithMap(input);
  const q = normalize(quote).replace(/^["']|["']$/g, "");
  if (q.length < 8) return null;
  const at = norm.indexOf(q);
  if (at < 0) return null;
  return { start: map[at], end: map[at + q.length - 1] + 1 };
}

export function spanMatches(input: string, span: Span, quote: string): boolean {
  if (!Number.isInteger(span.start) || !Number.isInteger(span.end)) return false;
  if (span.start < 0 || span.end > input.length || span.end <= span.start) return false;
  return normalize(input.slice(span.start, span.end)) === normalize(quote).replace(/^["']|["']$/g, "");
}
