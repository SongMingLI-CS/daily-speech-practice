import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#152820] via-[#10241c] to-[#0a1a12] px-4 text-white">
      <div className="animate-rise-in w-full max-w-sm rounded-3xl border border-white/10 bg-black/25 p-6 text-center shadow-2xl shadow-black/40 backdrop-blur-md sm:p-8">
        <p className="mb-3 text-xs uppercase tracking-[0.28em] text-amber-200/60">
          Daily Speech Practice
        </p>
        <h1 className="text-3xl font-semibold text-amber-50">404</h1>
        <p className="mt-2 text-sm leading-6 text-white/50">
          找不到你要访问的页面，可能链接已经失效。
        </p>
        <Link
          href="/"
          className="mt-6 inline-block w-full rounded-xl bg-gradient-to-r from-amber-200/90 to-amber-100/80 px-4 py-3 font-semibold text-[#1A3020] shadow-lg shadow-amber-900/20 transition-all hover:from-amber-100 hover:to-amber-50"
        >
          返回首页
        </Link>
      </div>
    </div>
  );
}
