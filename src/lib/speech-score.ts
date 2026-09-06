export interface BaselineSpeechScores {
  pronunciation: number;
  fluency: number;
  completeness: number;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function tokenize(text: string, language: "zh" | "en"): string[] {
  const normalized = text.normalize("NFKC").toLowerCase();
  if (language === "zh") {
    return Array.from(normalized).filter((character) => /[\p{Script=Han}a-z0-9]/u.test(character));
  }
  return normalized.match(/[a-z0-9']+/g) ?? [];
}

function longestCommonSubsequenceLength(left: string[], right: string[]): number {
  const previous = new Uint16Array(right.length + 1);
  const current = new Uint16Array(right.length + 1);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] =
        left[leftIndex - 1] === right[rightIndex - 1]
          ? previous[rightIndex - 1] + 1
          : Math.max(previous[rightIndex], current[rightIndex - 1]);
    }
    previous.set(current);
    current.fill(0);
  }

  return previous[right.length];
}

export function calculateCompletenessScore(
  reference: string,
  transcript: string,
  language: "zh" | "en",
): number {
  const referenceTokens = tokenize(reference, language).slice(0, 4_000);
  const transcriptTokens = tokenize(transcript, language).slice(0, 4_000);
  if (referenceTokens.length === 0) return 0;
  const matched = longestCommonSubsequenceLength(referenceTokens, transcriptTokens);
  return clampScore((matched / referenceTokens.length) * 100);
}

export function calculatePronunciationConfidence(
  logprobs: Array<{ logprob?: number }> | undefined,
): number {
  const usable = logprobs
    ?.map((item) => item.logprob)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!usable?.length) return 70;
  const meanProbability =
    usable.reduce((sum, logprob) => sum + Math.exp(logprob), 0) / usable.length;
  return clampScore(meanProbability * 100);
}

export function calculateFluencyScore(
  reference: string,
  durationMs: number,
  language: "zh" | "en",
): number {
  const units = tokenize(reference, language).length;
  if (units === 0 || durationMs <= 0) return 0;
  const expectedUnitsPerMinute = language === "zh" ? 240 : 140;
  const actualUnitsPerMinute = units / (durationMs / 60_000);
  const ratio = actualUnitsPerMinute / expectedUnitsPerMinute;
  const deviation = Math.abs(Math.log(Math.max(ratio, 0.05)));
  return clampScore(100 - deviation * 45);
}

export function calculateOverallScore(scores: BaselineSpeechScores): number {
  return clampScore(
    scores.pronunciation * 0.35 +
      scores.fluency * 0.35 +
      scores.completeness * 0.3,
  );
}
