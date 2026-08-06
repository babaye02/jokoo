// Server-safe fetch helpers for Server Components.
// This module has NO "use client" directive on purpose so it can run in the
// Vercel serverless runtime that renders our pages.
// For interactive client-side API calls, use `./api` instead (which handles
// auth headers via localStorage — that helper is client-only).

// SSR fetches use the direct backend URL to avoid the self-fetch loop that
// happens when Vercel tries to fetch its own `/api/*` rewrite from a
// serverless function (which routes back through Vercel and can time out or
// return an empty response cached by the Data Cache).
function getBackendBase(): string {
  const url =
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    "https://jokoo-mobile-dev.emergent.host";
  return url.replace(/\/+$/, "") + "/api";
}

export async function api<T = unknown>(path: string): Promise<T> {
  const base = getBackendBase();
  const url = `${base}${path}`;
  try {
    const r = await fetch(url, {
      // Legal content evolves without redeploys. Never cache the SSR result:
      // a single bad response (empty array) would otherwise stick to the
      // Vercel Data Cache and permanently break the page.
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal:
        typeof AbortSignal !== "undefined" && (AbortSignal as unknown as { timeout?: (ms: number) => AbortSignal }).timeout
          ? (AbortSignal as unknown as { timeout: (ms: number) => AbortSignal }).timeout(10_000)
          : undefined,
    });
    if (!r.ok) {
      console.warn(`[api SSR] ${url} → HTTP ${r.status}`);
      throw new Error(await r.text());
    }
    return (await r.json()) as T;
  } catch (e) {
    console.warn(`[api SSR] ${url} failed:`, e);
    throw e;
  }
}

// Convenience: same as api() but ALWAYS resolves (returns fallback on error).
// Use for non-critical SSR data (e.g., legal center) to avoid page-blank states.
export async function apiSafe<T>(path: string, fallback: T): Promise<T> {
  try {
    return await api<T>(path);
  } catch {
    return fallback;
  }
}
