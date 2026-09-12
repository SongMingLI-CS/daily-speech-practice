/**
 * 判断对象存储（Cloudflare R2）是否配置了真实可用的凭据。
 *
 * 关键点：必须忽略从 `.env.example` 复制来的占位值（replace-me / your-account-id 等），
 * 否则会把「假配置」当成真实 R2，导致本地兜底存储被跳过、上传全部指向不存在的端点。
 * 同类问题此前已在 Upstash 限流器上出现过，因此这里独立成可测试的纯函数。
 */
const PLACEHOLDER_PATTERN = /replace|your-account|your-instance|example|xxx/i;

export interface R2Env {
  [key: string]: string | undefined;
  R2_ENDPOINT?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_BUCKET_NAME?: string;
}

export function isR2Configured(env: R2Env = process.env): boolean {
  const { R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME } =
    env;
  if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
    return false;
  }
  if (!/^https?:\/\//.test(R2_ENDPOINT)) return false;
  if (
    PLACEHOLDER_PATTERN.test(
      `${R2_ENDPOINT} ${R2_ACCESS_KEY_ID} ${R2_SECRET_ACCESS_KEY} ${R2_BUCKET_NAME}`,
    )
  ) {
    return false;
  }
  return true;
}
