"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { getProviders, signIn } from "next-auth/react";
import { FormEvent, useEffect, useState } from "react";

type AuthMode = "login" | "register";

interface OAuthProviderOption {
  id: string;
  name: string;
}

function readMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;
  const message = (payload as Record<string, unknown>).message;
  return typeof message === "string" ? message : fallback;
}

export function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [oauthProviders, setOauthProviders] = useState<OAuthProviderOption[]>([]);
  const isRegister = mode === "register";

  useEffect(() => {
    void getProviders().then((providers) => {
      if (!providers) return;
      setOauthProviders(
        Object.values(providers)
          .filter((provider) => provider.type === "oauth")
          .map(({ id, name }) => ({ id, name })),
      );
    });
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      if (isRegister) {
        const response = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password }),
        });
        const payload: unknown = await response.json();
        if (!response.ok) throw new Error(readMessage(payload, "注册失败"));
      }

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (!result?.ok) {
        const message =
          result?.error === "RateLimited"
            ? "登录尝试过于频繁，请稍后再试"
            : result?.error === "ServiceUnavailable"
              ? "登录服务暂时不可用"
              : "邮箱或密码不正确";
        throw new Error(message);
      }

      router.replace("/");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "请求失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#111] px-4 py-12 text-white">
      <section className="w-full max-w-sm">
        <p className="mb-3 text-xs uppercase tracking-[0.28em] text-white/40">
          Daily Speech Practice
        </p>
        <h1 className="mb-2 text-3xl font-semibold">
          {isRegister ? "创建账号" : "欢迎回来"}
        </h1>
        <p className="mb-8 text-sm leading-6 text-white/50">
          {isRegister ? "每个账号拥有独立的练习进度与个人设置。" : "登录后继续今天的表达训练。"}
        </p>

        <form className="space-y-4" onSubmit={handleSubmit}>
          {isRegister && (
            <label className="block text-sm text-white/70">
              昵称
              <input
                required
                maxLength={40}
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-2 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-white outline-none focus:border-white/40"
              />
            </label>
          )}
          <label className="block text-sm text-white/70">
            邮箱
            <input
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-white outline-none focus:border-white/40"
            />
          </label>
          <label className="block text-sm text-white/70">
            密码
            <input
              required
              type="password"
              minLength={8}
              maxLength={72}
              autoComplete={isRegister ? "new-password" : "current-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-white outline-none focus:border-white/40"
            />
          </label>

          {error && (
            <p className="rounded-xl border border-red-400/30 bg-red-950/40 px-4 py-3 text-sm text-red-200">
              {error}
            </p>
          )}

          <button
            disabled={submitting}
            className="w-full rounded-xl bg-white px-4 py-3 font-medium text-black transition hover:bg-white/85 disabled:opacity-50"
          >
            {submitting ? "处理中..." : isRegister ? "注册并登录" : "登录"}
          </button>
        </form>

        {oauthProviders.length > 0 && (
          <div className="mt-6 space-y-3 border-t border-white/10 pt-6">
            {oauthProviders.map((provider) => (
              <button
                key={provider.id}
                type="button"
                onClick={() => signIn(provider.id, { callbackUrl: "/" })}
                className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/10"
              >
                使用 {provider.name} 继续
              </button>
            ))}
          </div>
        )}

        <p className="mt-6 text-sm text-white/50">
          {isRegister ? "已有账号？" : "还没有账号？"}{" "}
          <Link className="text-white underline underline-offset-4" href={isRegister ? "/login" : "/register"}>
            {isRegister ? "直接登录" : "立即注册"}
          </Link>
        </p>
      </section>
    </main>
  );
}
