/**
 * 外部 Provider 调用统一走这里：内置超时与指数退避重试。
 *
 * 只对「可能瞬时失败」的情况重试（网络错误 / 408 / 425 / 429 / 5xx），
 * 4xx 业务错误立即返回交给调用方处理，绝不在这里伪造成功响应。
 */

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export interface FetchWithRetryOptions {
  /** 额外重试次数（不含首次请求），默认 2。 */
  retries?: number;
  /** 首次退避基准毫秒数，按 2^n 增长，默认 400ms。 */
  baseDelayMs?: number;
  /** 单次请求超时毫秒数，默认 60s。 */
  timeoutMs?: number;
  /** 每次即将重试时回调，便于结构化日志。 */
  onRetry?: (attempt: number, error: unknown) => void;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options: FetchWithRetryOptions = {},
): Promise<Response> {
  const { retries = 2, baseDelayMs = 400, timeoutMs = 60_000, onRetry } = options;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
      // 非瞬时错误，或已经是最后一次尝试：原样返回，由调用方判定。
      if (!RETRYABLE_STATUS.has(response.status) || attempt === retries) {
        return response;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === retries) throw error;
    }

    onRetry?.(attempt + 1, lastError);
    await sleep(baseDelayMs * 2 ** attempt);
  }

  throw lastError instanceof Error ? lastError : new Error("REQUEST_FAILED");
}
