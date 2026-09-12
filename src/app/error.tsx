"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app error]", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#152820] via-[#10241c] to-[#0a1a12] px-4 text-white">
      <div className="animate-rise-in w-full max-w-sm rounded-3xl border border-white/10 bg-black/25 p-6 text-center shadow-2xl shadow-black/40 backdrop-blur-md sm:p-8">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-amber-200/25 bg-amber-200/5 text-2xl">
          ⚠
        </div>
        <h1 className="text-xl font-semibold text-amber-50">页面出了点问题</h1>
        <p className="mt-2 text-sm leading-6 text-white/50">
          加载过程中发生了意外错误，请重试。若反复出现，请稍后再来。
        </p>
        {error.digest && (
          <p className="mt-3 text-xs text-white/30">错误编号：{error.digest}</p>
        )}
        <button
          type="button"
          onClick={reset}
          className="mt-6 w-full rounded-xl bg-gradient-to-r from-amber-200/90 to-amber-100/80 px-4 py-3 font-semibold text-[#1A3020] shadow-lg shadow-amber-900/20 transition-all hover:from-amber-100 hover:to-amber-50"
        >
          重新加载
        </button>
      </div>
    </div>
  );
}
