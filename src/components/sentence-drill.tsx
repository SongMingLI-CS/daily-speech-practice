"use client";

import { useMemo, useState } from "react";

import { diffSentences } from "@/lib/speech-diff";
import type { ExerciseLanguage } from "@/types/exercise";

function SentenceDrill({
  content,
  transcript,
  language,
  onRehearse,
}: {
  content: string;
  transcript: string;
  language: ExerciseLanguage;
  onRehearse: () => void;
}) {
  const [onlyMissed, setOnlyMissed] = useState(false);
  const sentences = useMemo(
    () => diffSentences(content, transcript, language),
    [content, transcript, language],
  );

  if (sentences.length === 0) return null;

  const passedCount = sentences.filter((sentence) => sentence.passed).length;
  const missedCount = sentences.length - passedCount;
  const visible = onlyMissed
    ? sentences.filter((sentence) => !sentence.passed)
    : sentences;

  return (
    <div className="mt-4 rounded-xl border border-amber-200/20 bg-amber-200/[0.04] p-4">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-amber-100/85">逐句精练 · 差异对照</h3>
          <p className="mt-0.5 text-xs text-white/45">
            已达标 {passedCount}/{sentences.length} 句 · 黄色高亮为遗漏内容
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOnlyMissed((value) => !value)}
          className="shrink-0 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/60 transition-colors hover:bg-white/10"
        >
          {onlyMissed ? "显示全部" : `只看待重练（${missedCount}）`}
        </button>
      </div>

      <ol className="mt-3 space-y-2">
        {visible.map((sentence, index) => (
          <li key={index} className="flex gap-3 rounded-lg bg-black/20 p-3">
            <span
              className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                sentence.passed
                  ? "bg-emerald-400/20 text-emerald-200"
                  : "bg-amber-300/25 text-amber-200"
              }`}
            >
              {sentence.passed ? "✓" : "!"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-6 text-white/85">
                {sentence.segments.map((segment, segmentIndex) =>
                  segment.matched ? (
                    <span key={segmentIndex}>{segment.text}</span>
                  ) : (
                    <mark
                      key={segmentIndex}
                      className="rounded bg-amber-300/25 px-0.5 text-amber-100"
                    >
                      {segment.text}
                    </mark>
                  ),
                )}
              </p>
              <p className="mt-1 text-xs text-white/40">
                覆盖率 {sentence.coverage}% · 匹配 {sentence.matched}/{sentence.total}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/10 pt-3">
        <p className="text-xs text-white/40">对照待重练句子重新录音，可刷新评分</p>
        <button
          type="button"
          onClick={onRehearse}
          className="shrink-0 rounded-lg bg-amber-200/90 px-4 py-1.5 text-xs font-medium text-[#1A3020] transition-colors hover:bg-amber-100"
        >
          重练本题
        </button>
      </div>
    </div>
  );
}

export { SentenceDrill };
