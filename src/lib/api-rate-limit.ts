import "server-only";

import type { NextResponse } from "next/server";

import { apiError, type ApiFailure } from "@/lib/api-response";
import {
  checkRateLimit,
  getRateLimitHeaders,
  RateLimitConfigurationError,
  type RateLimitPolicy,
} from "@/lib/rate-limit";

export async function getRateLimitResponse(
  policy: RateLimitPolicy,
  identifier: string,
  message: string,
): Promise<NextResponse<ApiFailure> | null> {
  try {
    const result = await checkRateLimit(policy, identifier);
    if (result.success) return null;
    return apiError("RATE_LIMITED", message, 429, getRateLimitHeaders(result));
  } catch (error) {
    if (error instanceof RateLimitConfigurationError) {
      console.error("[rate-limit] Production limiter is not configured");
    } else {
      console.error("[rate-limit] Limiter request failed", error);
    }
    return apiError("SERVICE_UNAVAILABLE", "服务暂时不可用，请稍后重试", 503);
  }
}
