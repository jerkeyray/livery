export type VisualTextMetrics = {
  fontSize?: number;
  fontWeight?: number;
  letterSpacing?: number;
};

export type VisualTextBlock = {
  height: number;
  lines: string[];
  width: number;
};

const DEFAULT_FONT_SIZE = 13;

export function measureVisualText(value: string, metrics: VisualTextMetrics = {}) {
  const fontSize = finite(metrics.fontSize, DEFAULT_FONT_SIZE);
  const fontWeight = finite(metrics.fontWeight, 400);
  const letterSpacing = finite(metrics.letterSpacing, 0);
  const weightFactor = fontWeight >= 650 ? 1.018 : fontWeight >= 550 ? 1.009 : 1;
  let em = 0;
  for (const character of value) em += glyphAdvance(character);
  return Math.max(0, em * fontSize * weightFactor + Math.max(0, value.length - 1) * letterSpacing);
}

export function wrapVisualText(value: string, maxWidth: number, metrics: VisualTextMetrics = {}) {
  const width = Math.max(1, maxWidth);
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [""];

  const lines: string[] = [];
  let line = "";
  for (const sourceWord of words) {
    for (const part of splitOversizedWord(sourceWord, width, metrics)) {
      const candidate = line ? `${line} ${part}` : part;
      if (line && measureVisualText(candidate, metrics) > width) {
        lines.push(line);
        line = part;
      } else line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function measureVisualTextBlock(
  value: string,
  maxWidth: number,
  metrics: VisualTextMetrics & { lineHeight?: number } = {},
): VisualTextBlock {
  const lines = wrapVisualText(value, maxWidth, metrics);
  const lineHeight = finite(metrics.lineHeight, Math.ceil(finite(metrics.fontSize, DEFAULT_FONT_SIZE) * 1.38));
  return {
    height: lines.length * lineHeight,
    lines,
    width: Math.min(maxWidth, Math.max(...lines.map((line) => measureVisualText(line, metrics)), 0)),
  };
}

function splitOversizedWord(word: string, maxWidth: number, metrics: VisualTextMetrics) {
  if (measureVisualText(word, metrics) <= maxWidth) return [word];
  const parts: string[] = [];
  let part = "";
  for (const character of word) {
    const candidate = `${part}${character}`;
    if (part && measureVisualText(candidate, metrics) > maxWidth) {
      parts.push(part);
      part = character;
    } else part = candidate;
  }
  if (part) parts.push(part);
  return parts;
}

function glyphAdvance(character: string) {
  if (/\s/.test(character)) return 0.278;
  if (/[ilI1|!.,'`:;]/.test(character)) return 0.285;
  if (/[fjrt()\[\]{}]/.test(character)) return 0.37;
  if (/[mwMW@#%&]/.test(character)) return 0.82;
  if (/[ABCDEFGHJKLMNOPQRSTUVWXYZ]/.test(character)) return 0.64;
  if (/[0-9]/.test(character)) return 0.56;
  if (/[-_+=<>/\\]/.test(character)) return 0.5;
  if ((character.codePointAt(0) ?? 0) > 0x7f) return 0.68;
  return 0.52;
}

function finite(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
