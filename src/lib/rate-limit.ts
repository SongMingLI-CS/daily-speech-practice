import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { NextRequest } from "next/server";

export type RateLimitPolicy =
  | "login"
  | "register"
  | "generate"
  | "exercisesToday"
  | "upload"
  | "assessment"
  | "audio"
  | "checkin"
  | "settings"
  | "assessmentStatus"
  | "history";

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

interface LocalWindow {
  count: number;
  reset: number;
}

const POLICY_CONFIG: Record<
  RateLimitPolicy,
  { requests: number; windowMs: number; duration: "1 m" | "15 m" | "1 h" }
> = {
  login: { requests: 10, windowMs: 15 * 60_000, duration: "15 m" },
  register: { requests: 5, windowMs: 60 * 60_000, duration: "1 h" },
  generate: { requests: 10, windowMs: 60 * 60_000, duration: "1 h" },
  exercisesToday: { requests: 240, windowMs: 60 * 60_000, duration: "1 h" },
  upload: { requests: 20, windowMs: 60 * 60_000, duration: "1 h" },
  assessment: { requests: 30, windowMs: 60 * 60_000, duration: "1 h" },
  assessmentStatus: { requests: 3_000, windowMs: 60 * 60_000, duration: "1 h" },
  audio: { requests: 120, windowMs: 60 * 60_000, duration: "1 h" },
  checkin: { requests: 60, windowMs: 60_000, duration: "1 m" },
  settings: { requests: 30, windowMs: 60_000, duration: "1 m" },
  history: { requests: 60, windowMs: 60 * 60_000, duration: "1 h" },
};

const distributedLimiters = new Map<RateLimitPolicy, Ratelimit>();
const localWindows = new Map<string, LocalWindow>();
let warnedAboutLocalFallback = false;

export class RateLimitConfigurationError extends Error {
  constructor() {
    super("Upstash Redis environment variables are not configured");
    this.name = "RateLimitConfigurationError";
  }
}

function hasUsableUpstashCredentials(): boolean {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return false;
  const combined = `${url} ${token}`;
  // 跳过 .env.example 复制来的占位值，避免把它们当成真实配置去请求
  if (/replace|your-instance|your-account|example|xxx/i.test(combined)) return false;
  return /^https?:\/\//.test(url);
}

function getDistributedLimiter(policy: RateLimitPolicy): Ratelimit | null {
  if (!hasUsableUpstashCredentials()) return null;

  const url = process.env.UPSTASH_REDIS_REST_URL!;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!;

  const cached = distributedLimiters.get(policy);
  if (cached) return cached;

  const config = POLICY_CONFIG[policy];
  const limiter = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(config.requests, config.duration),
    analytics: true,
    prefix: `daily-speech:${policy}`,
  });
  distributedLimiters.set(policy, limiter);
  return limiter;
}

function checkLocalLimit(policy: RateLimitPolicy, identifier: string): RateLimitResult {
  if (!warnedAboutLocalFallback) {
    console.warn("[rate-limit] Using development-only in-memory rate limiter");
    warnedAboutLocalFallback = true;
  }

  const config = POLICY_CONFIG[policy];
  const key = `${policy}:${identifier}`;
  const now = Date.now();
  const current = localWindows.get(key);
  const window = !current || current.reset <= now
    ? { count: 0, reset: now + config.windowMs }
    : current;
  window.count += 1;
  localWindows.set(key, window);

  return {
    success: window.count <= config.requests,
    limit: config.requests,
    remaining: Math.max(0, config.requests - window.count),
    reset: window.reset,
  };
}

/**
 * 生产环境默认要求分布式限流（Upstash），避免多实例下限额被放大。
 * 单实例自托管部署可显式设置 RATE_LIMIT_ALLOW_IN_MEMORY=1 启用进程内限流。
 */
function isInMemoryLimiterAllowed(): boolean {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.RATE_LIMIT_ALLOW_IN_MEMORY === "1"
  );
}

export async function checkRateLimit(
  policy: RateLimitPolicy,
  identifier: string,
): Promise<RateLimitResult> {
  const limiter = getDistributedLimiter(policy);
  if (limiter) return limiter.limit(identifier);
  if (!isInMemoryLimiterAllowed()) {
    throw new RateLimitConfigurationError();
  }
  return checkLocalLimit(policy, identifier);
}

export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

export function getRateLimitHeaders(result: RateLimitResult): HeadersInit {
  const retryAfter = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.reset / 1000)),
    ...(result.success ? {} : { "Retry-After": String(retryAfter) }),
  };
}
