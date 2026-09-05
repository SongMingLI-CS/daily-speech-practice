import NextAuth from "next-auth";
import { NextResponse, type NextRequest } from "next/server";

import { authOptions } from "@/auth";
import {
  checkRateLimit,
  getClientIp,
  getRateLimitHeaders,
  RateLimitConfigurationError,
} from "@/lib/rate-limit";

const handler = NextAuth(authOptions);

export { handler as GET };

export async function POST(request: NextRequest, context: { params: Promise<{ nextauth: string[] }> }) {
  if (request.nextUrl.pathname.endsWith("/callback/credentials")) {
    try {
      const result = await checkRateLimit("login", getClientIp(request));
      if (!result.success) {
        return NextResponse.json(
          { url: new URL("/login?error=RateLimited", request.url).toString() },
          { status: 429, headers: getRateLimitHeaders(result) },
        );
      }
    } catch (error) {
      if (error instanceof RateLimitConfigurationError) {
        console.error("[rate-limit] Production login limiter is not configured");
      } else {
        console.error("[rate-limit] Login limiter request failed", error);
      }
      return NextResponse.json(
        { url: new URL("/login?error=ServiceUnavailable", request.url).toString() },
        { status: 503 },
      );
    }
  }

  return handler(request, context);
}
