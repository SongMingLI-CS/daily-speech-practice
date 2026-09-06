import { tokenize } from "@/lib/speech-score";

export type DiffLanguage = "zh" | "en";

export interface ReferenceToken {
  /** 参考文本中的原始子串 */
  text: string;
  /** 在参考文本中的起始下标（含） */
  start: number;
  /** 在参考文本中的结束下标（不含） */
  end: number;
  /** 该 token 是否被转写文本覆盖 */
  matched: boolean;
}

export interface DiffSegment {
  text: string;
  /** false 表示「遗漏/未读」，应在界面中高亮 */
  matched: boolean;
}

export interface SentenceSpan {
  text: string;
  start: number;
  end: number;
}

export interface SentenceDiff {
  text: string;
  segments: DiffSegment[];
  matched: number;
  total: number;
  coverage: number;
  passed: boolean;
}

const SENTENCE_ENDERS = new Set([".", "。", "．", "！", "!", "？", "?", "；", ";", "\n"]);

function isReferenceTokenChar(character: string): boolean {
  return /[\p{Script=Han}a-z0-9]/u.test(character);
}

function normalizeKey(text: string): string {
  return text.normalize("NFKC").toLowerCase();
}

function tokenizeReferenceWithSpans(
  text: string,
  language: DiffLanguage,
): Array<{ key: string; start: number; end: number }> {
  if (language === "zh") {
    const tokens: Array<{ key: string; start: number; end: number }> = [];
    let offset = 0;
    for (const character of Array.from(text)) {
      const key = normalizeKey(character);
      if (isReferenceTokenChar(key)) {
        tokens.push({ key, start: offset, end: offset + character.length });
      }
      offset += character.length;
    }
    return tokens;
  }

  const tokens: Array<{ key: string; start: number; end: number }> = [];
  for (const match of text.matchAll(/[a-z0-9']+/gi)) {
    const start = match.index ?? 0;
    tokens.push({
      key: normalizeKey(match[0]),
      start,
      end: start + match[0].length,
    });
  }
  return tokens;
}

/**
 * 贪心顺序对齐：按顺序为每个参考 token 寻找下一个相等的转写 token。
 * 用于界面差异高亮，与计分用的 LCS 保持语义一致（顺序保持、忽略大小写）。
 */
function alignGreedy(referenceKeys: string[], transcriptKeys: string[]): boolean[] {
  const matched = new Array<boolean>(referenceKeys.length).fill(false);
  let cursor = 0;
  for (let index = 0; index < referenceKeys.length; index += 1) {
    for (let candidate = cursor; candidate < transcriptKeys.length; candidate += 1) {
      if (transcriptKeys[candidate] === referenceKeys[index]) {
        matched[index] = true;
        cursor = candidate + 1;
        break;
      }
    }
  }
  return matched;
}

export function diffReferenceTokens(
  reference: string,
  transcript: string,
  language: DiffLanguage,
): ReferenceToken[] {
  const spans = tokenizeReferenceWithSpans(reference, language);
  const matched = alignGreedy(
    spans.map((token) => token.key),
    tokenize(transcript, language),
  );
  return spans.map((token, index) => ({
    text: reference.slice(token.start, token.end),
    start: token.start,
    end: token.end,
    matched: matched[index],
  }));
}

export function diffReferenceSegments(
  reference: string,
  transcript: string,
  language: DiffLanguage,
): DiffSegment[] {
  const tokens = diffReferenceTokens(reference, transcript, language);
  const segments: DiffSegment[] = [];
  let cursor = 0;
  for (const token of tokens) {
    if (token.start > cursor) {
      segments.push({ text: reference.slice(cursor, token.start), matched: true });
    }
    segments.push({ text: token.text, matched: token.matched });
    cursor = token.end;
  }
  if (cursor < reference.length) {
    segments.push({ text: reference.slice(cursor), matched: true });
  }
  return segments;
}

export function splitSentences(content: string): SentenceSpan[] {
  const sentences: SentenceSpan[] = [];
  const length = content.length;
  let cursor = 0;

  while (cursor < length) {
    while (cursor < length && /\s/.test(content[cursor])) cursor += 1;
    if (cursor >= length) break;

    const start = cursor;
    while (cursor < length && !SENTENCE_ENDERS.has(content[cursor])) cursor += 1;
    if (cursor < length) cursor += 1; // 带上句末标点

    const text = content.slice(start, cursor).trim();
    if (text) sentences.push({ text, start, end: cursor });
  }

  return sentences;
}

export function diffSentences(
  content: string,
  transcript: string,
  language: DiffLanguage,
  passThreshold = 60,
): SentenceDiff[] {
  const sentences = splitSentences(content);
  if (sentences.length === 0) return [];

  const tokens = diffReferenceTokens(content, transcript, language);

  return sentences.map((sentence) => {
    const sentenceTokens = tokens.filter(
      (token) => token.start >= sentence.start && token.end <= sentence.end,
    );
    const matchedCount = sentenceTokens.filter((token) => token.matched).length;
    const total = sentenceTokens.length;
    const coverage = total === 0 ? 100 : Math.round((matchedCount / total) * 100);

    const segments: DiffSegment[] = [];
    let cursor = sentence.start;
    for (const token of sentenceTokens) {
      if (token.start > cursor) {
        segments.push({ text: content.slice(cursor, token.start), matched: true });
      }
      segments.push({ text: token.text, matched: token.matched });
      cursor = token.end;
    }
    if (cursor < sentence.end) {
      segments.push({ text: content.slice(cursor, sentence.end), matched: true });
    }

    return {
      text: sentence.text,
      segments,
      matched: matchedCount,
      total,
      coverage,
      passed: total === 0 || coverage >= passThreshold,
    };
  });
}
