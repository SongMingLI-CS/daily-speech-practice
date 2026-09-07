"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";

type Language = "zh" | "en";
type DailyCount = 1 | 3 | 5;

interface SettingsPayload {
  defaultLanguage: Language;
  dailyCount: DailyCount;
  timeZone: string;
}

const LANGUAGE_OPTIONS: { value: Language; label: string }[] = [
  { value: "zh", label: "中文" },
  { value: "en", label: "English" },
];

const COUNT_OPTIONS: { value: DailyCount; label: string }[] = [
  { value: 1, label: "每天 1 篇" },
  { value: 3, label: "每天 3 篇" },
  { value: 5, label: "每天 5 篇" },
];

const TIMEZONE_OPTIONS: { value: string; label: string }[] = [
  { value: "Asia/Shanghai", label: "北京时间 UTC+8" },
  { value: "Asia/Tokyo", label: "东京 UTC+9" },
  { value: "Asia/Singapore", label: "新加坡 UTC+8" },
  { value: "Asia/Kolkata", label: "印度 UTC+5:30" },
  { value: "Europe/London", label: "伦敦 UTC±0" },
  { value: "Europe/Paris", label: "巴黎 UTC+1" },
  { value: "America/New_York", label: "纽约 UTC-5" },
  { value: "America/Los_Angeles", label: "洛杉矶 UTC-8" },
  { value: "Australia/Sydney", label: "悉尼 UTC+10" },
  { value: "UTC", label: "UTC" },
];

function readPayload(payload: unknown): SettingsPayload | null {
  if (!payload || typeof payload !== "object") return null;
  const data = (payload as { data?: unknown }).data;
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  if (
    (record.defaultLanguage === "zh" || record.defaultLanguage === "en") &&
    (record.dailyCount === 1 || record.dailyCount === 3 || record.dailyCount === 5) &&
    typeof record.timeZone === "string"
  ) {
    return {
      defaultLanguage: record.defaultLanguage,
      dailyCount: record.dailyCount,
      timeZone: record.timeZone,
    };
  }
  return null;
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-black/20 p-5 backdrop-blur-md sm:p-6">
      <h2 className="text-sm font-semibold tracking-wide text-amber-100/90">{title}</h2>
      {description && <p className="mt-1 text-xs leading-5 text-white/40">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}
export default function SettingsPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [language, setLanguage] = useState<Language>("zh");
  const [dailyCount, setDailyCount] = useState<DailyCount>(3);
  const [timeZone, setTimeZone] = useState("Asia/Shanghai");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const currentPasswordRef = useRef<HTMLInputElement>(null);
  const newPasswordRef = useRef<HTMLInputElement>(null);
  const deleteEmailRef = useRef<HTMLInputElement>(null);
  const [nameSaving, setNameSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [router, status]);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    fetch("/api/settings")
      .then(async (response) => {
        const payload = readPayload(await response.json());
        if (cancelled || !response.ok || !payload) return;
        setLanguage(payload.defaultLanguage);
        setDailyCount(payload.dailyCount);
        setTimeZone(payload.timeZone);
      })
      .catch(() => {
        // 读取失败沿用默认值
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  const handleSave = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultLanguage: language, dailyCount, timeZone }),
      });
      const payload: unknown = await response.json();
      const message =
        payload && typeof payload === "object"
          ? String((payload as { message?: unknown }).message ?? "")
          : "";
      if (!response.ok) throw new Error(message || "保存失败");
      setNotice({ kind: "ok", text: message || "设置已保存" });
    } catch (err) {
      setNotice({
        kind: "err",
        text: err instanceof Error ? err.message : "保存失败，请稍后重试",
      });
    } finally {
      setSaving(false);
    }
  };

  const readMessage = (payload: unknown, fallback: string): string => {
    if (!payload || typeof payload !== "object") return fallback;
    const message = (payload as { message?: unknown }).message;
    return typeof message === "string" && message ? message : fallback;
  };

  const handleNameSave = async () => {
    const name = nameInputRef.current?.value.trim() ?? "";
    if (!name) {
      setNotice({ kind: "err", text: "昵称不能为空" });
      return;
    }
    setNameSaving(true);
    setNotice(null);
    try {
      const response = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(readMessage(payload, "保存失败"));
      setNotice({ kind: "ok", text: readMessage(payload, "昵称已更新") + "（重新登录后全局生效）" });
    } catch (err) {
      setNotice({
        kind: "err",
        text: err instanceof Error ? err.message : "保存失败，请稍后重试",
      });
    } finally {
      setNameSaving(false);
    }
  };

  const handlePasswordSave = async () => {
    const currentPassword = currentPasswordRef.current?.value ?? "";
    const newPassword = newPasswordRef.current?.value ?? "";
    if (newPassword.length < 8) {
      setNotice({ kind: "err", text: "新密码至少 8 个字符" });
      return;
    }
    setPasswordSaving(true);
    setNotice(null);
    try {
      const response = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(readMessage(payload, "修改失败"));
      if (currentPasswordRef.current) currentPasswordRef.current.value = "";
      if (newPasswordRef.current) newPasswordRef.current.value = "";
      setNotice({ kind: "ok", text: readMessage(payload, "密码已更新") });
    } catch (err) {
      setNotice({
        kind: "err",
        text: err instanceof Error ? err.message : "修改失败，请稍后重试",
      });
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    const email = deleteEmailRef.current?.value.trim() ?? "";
    if (!email) {
      setNotice({ kind: "err", text: "请输入用于确认的邮箱" });
      return;
    }
    if (email !== session?.user?.email) {
      setNotice({ kind: "err", text: "确认邮箱与登录邮箱不一致" });
      return;
    }
    if (!window.confirm("确定永久删除账号吗？所有打卡记录与录音将被移除，且无法恢复。")) return;
    setDeletingAccount(true);
    setNotice(null);
    try {
      const response = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(readMessage(payload, "删除失败"));
      await signOut({ callbackUrl: "/login" });
    } catch (err) {
      setNotice({
        kind: "err",
        text: err instanceof Error ? err.message : "删除失败，请稍后重试",
      });
      setDeletingAccount(false);
    }
  };

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#152820] via-[#10241c] to-[#0a1a12]" />
    );
  }


  return (
    <div className="min-h-full bg-gradient-to-br from-[#152820] via-[#10241c] to-[#0a1a12]">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-1/4 top-0 h-96 w-96 rounded-full bg-amber-300/5 blur-3xl" />
        <div className="absolute -right-1/4 bottom-0 h-96 w-96 rounded-full bg-emerald-300/5 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-2xl space-y-5 px-4 py-8 sm:px-6 sm:py-12">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white/60 transition-colors hover:bg-white/10 hover:text-white/90"
          >
            ← 返回首页
          </Link>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="rounded-lg border border-red-300/30 px-3 py-1.5 text-sm text-red-200/80 transition-colors hover:bg-red-400/10"
          >
            退出登录
          </button>
        </div>

        <header className="animate-rise-in pt-2">
          <p className="mb-2 text-xs uppercase tracking-[0.4em] text-amber-200/50">Settings</p>
          <h1 className="text-3xl font-bold text-amber-50 sm:text-4xl">个人设置</h1>
          <p className="mt-2 text-sm leading-6 text-white/50">
            管理你的练习偏好与账号信息，所有改动即时同步到每日打卡。
          </p>
        </header>

        {notice && (
          <div
            className={`rounded-xl border px-4 py-3 text-sm ${
              notice.kind === "ok"
                ? "border-emerald-300/30 bg-emerald-400/5 text-emerald-100"
                : "border-red-400/30 bg-red-950/40 text-red-200"
            }`}
          >
            {notice.text}
          </div>
        )}

        <Section title="账号" description="登录状态与身份信息">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm text-white/90">
                {session?.user?.name ?? session?.user?.email ?? "未知用户"}
              </p>
              <p className="truncate text-xs text-white/40">{session?.user?.email}</p>
            </div>
            <span className="shrink-0 rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">
              已登录
            </span>
          </div>
        </Section>

        <Section title="练习偏好" description="这些偏好会在「生成今日挑战」时作为默认选项。">
          <div className="space-y-5">
            <div>
              <p className="mb-2 text-xs text-white/50">默认语言</p>
              <div className="inline-flex rounded-xl border border-white/10 bg-white/5 p-1">
                {LANGUAGE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setLanguage(option.value)}
                    className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                      language === option.value
                        ? "bg-amber-200/90 text-[#1A3020] shadow-sm"
                        : "text-white/60 hover:text-white/90"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs text-white/50">每日篇数</p>
              <div className="inline-flex flex-wrap gap-2">
                {COUNT_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setDailyCount(option.value)}
                    className={`rounded-lg border px-4 py-2 text-sm transition-all ${
                      dailyCount === option.value
                        ? "border-amber-200/60 bg-amber-200/15 text-amber-100"
                        : "border-white/15 text-white/60 hover:bg-white/10"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="text-xs text-white/50">时区（用于打卡日期与连续天数）</span>
              <select
                value={timeZone}
                onChange={(event) => setTimeZone(event.target.value)}
                className="mt-2 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-white outline-none transition-colors focus:border-amber-200/40"
              >
                {TIMEZONE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value} className="bg-[#1A3020] text-white">
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !loaded}
                className="rounded-xl bg-gradient-to-r from-amber-200/90 to-amber-100/80 px-6 py-2.5 text-sm font-semibold text-[#1A3020] shadow-lg shadow-amber-900/20 transition-all hover:from-amber-100 hover:to-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "保存中..." : "保存设置"}
              </button>
            </div>
          </div>
        </Section>

        <Section title="账号管理" description="修改登录昵称或密码。昵称修改后需重新登录才会全局更新。">
          <div className="space-y-6">
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                void handleNameSave();
              }}
            >
              <label className="block text-sm text-white/75">
                昵称
                <input
                  ref={nameInputRef}
                  defaultValue={session?.user?.name ?? session?.user?.email ?? ""}
                  maxLength={40}
                  className="mt-2 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-white outline-none transition-colors focus:border-amber-200/50"
                />
              </label>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={nameSaving}
                  className="rounded-xl bg-gradient-to-r from-amber-200/90 to-amber-100/80 px-6 py-2.5 text-sm font-semibold text-[#1A3020] shadow-lg shadow-amber-900/20 transition-all hover:from-amber-100 hover:to-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {nameSaving ? "保存中..." : "保存昵称"}
                </button>
              </div>
            </form>

            <form
              className="space-y-3 border-t border-white/10 pt-5"
              onSubmit={(event) => {
                event.preventDefault();
                void handlePasswordSave();
              }}
            >
              <p className="text-xs leading-5 text-white/40">
                仅对邮箱密码注册的账号可用（第三方登录账号无密码）。
              </p>
              <label className="block text-sm text-white/75">
                当前密码
                <input
                  ref={currentPasswordRef}
                  type="password"
                  autoComplete="current-password"
                  className="mt-2 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-white outline-none transition-colors focus:border-amber-200/50"
                />
              </label>
              <label className="block text-sm text-white/75">
                新密码
                <input
                  ref={newPasswordRef}
                  type="password"
                  minLength={8}
                  maxLength={72}
                  autoComplete="new-password"
                  className="mt-2 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-white outline-none transition-colors focus:border-amber-200/50"
                />
              </label>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={passwordSaving}
                  className="rounded-xl border border-amber-200/40 px-6 py-2.5 text-sm font-medium text-amber-100 transition-colors hover:bg-amber-200/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {passwordSaving ? "修改中..." : "修改密码"}
                </button>
              </div>
            </form>
          </div>
        </Section>

        <Section
          title="危险操作"
          description="删除账号将同时移除全部打卡记录与录音文件，此操作不可恢复。"
        >
          <label className="block text-sm text-white/75">
            输入登录邮箱 {session?.user?.email ? `（${session.user.email}）` : ""} 以确认
            <input
              ref={deleteEmailRef}
              type="email"
              autoComplete="off"
              className="mt-2 w-full rounded-xl border border-red-300/30 bg-white/5 px-4 py-3 text-white outline-none transition-colors placeholder:text-white/25 focus:border-red-300/50"
            />
          </label>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              disabled={deletingAccount}
              onClick={() => void handleDeleteAccount()}
              className="rounded-xl border border-red-300/40 px-6 py-2.5 text-sm font-medium text-red-200 transition-colors hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deletingAccount ? "删除中..." : "永久删除账号"}
            </button>
          </div>
        </Section>

        <p className="text-center text-xs text-white/25">当前版本仍在迭代中，更多功能陆续加入。</p>
      </div>
    </div>
  );
}

