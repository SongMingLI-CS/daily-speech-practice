import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";

/** 需要登录才能访问的页面 */
const PROTECTED_PATHS = new Set(["/", "/records", "/settings"]);
/** 已登录用户不应再看到的页面 */
const AUTH_PATHS = new Set(["/login", "/register"]);

/**
 * 服务端路由守卫（Next.js 16 的 proxy 约定，即原 middleware）：
 * 未登录访问受保护页面时直接 307 到 /login，已登录访问登录/注册页时回到首页，
 * 避免出现「空壳页面再跳转」的闪烁。
 * API 路由仍由各 route handler 内部鉴权，不在此拦截。
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!PROTECTED_PATHS.has(pathname) && !AUTH_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  let hasToken = false;
  try {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });
    hasToken = Boolean(token);
  } catch (error) {
    // 例如 NEXTAUTH_SECRET 缺失：不阻断请求，交给各 route handler 兜底鉴权。
    console.error("[proxy] failed to read session token", error);
    return NextResponse.next();
  }

  if (PROTECTED_PATHS.has(pathname) && !hasToken) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (AUTH_PATHS.has(pathname) && hasToken) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/records", "/settings", "/login", "/register"],
};
