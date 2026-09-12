import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchWithRetry } from "@/lib/http";

function jsonResponse(status: number): Response {
  return new Response("{}", { status });
}

describe("fetchWithRetry", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns the first successful response without retrying", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200));
    vi.stubGlobal("fetch", fetchMock);

    const response = await fetchWithRetry(
      "https://example.com",
      {},
      { baseDelayMs: 0 },
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries retryable 5xx responses and eventually succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(503))
      .mockResolvedValueOnce(jsonResponse(200));
    vi.stubGlobal("fetch", fetchMock);

    const onRetry = vi.fn();
    const response = await fetchWithRetry(
      "https://example.com",
      {},
      { baseDelayMs: 0, onRetry },
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("does not retry non-retryable 4xx responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(400));
    vi.stubGlobal("fetch", fetchMock);

    const response = await fetchWithRetry(
      "https://example.com",
      {},
      { baseDelayMs: 0 },
    );

    expect(response.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns the retryable response once retries are exhausted", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(500));
    vi.stubGlobal("fetch", fetchMock);

    const response = await fetchWithRetry(
      "https://example.com",
      {},
      { baseDelayMs: 0, retries: 1 },
    );

    expect(response.status).toBe(500);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws after exhausting retries on network errors", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchWithRetry("https://example.com", {}, { baseDelayMs: 0, retries: 1 }),
    ).rejects.toThrow("network down");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
