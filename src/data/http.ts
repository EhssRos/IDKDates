// Small fetch helpers. Uses only fetch and AbortController, which exist in browsers, Node and React Native.

export class HttpError extends Error {
  constructor(public status: number, url: string) { super(`HTTP ${status} for ${url}`); }
}

/** fetch with a timeout that also stops when `signal` aborts. */
export async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 30000, signal?: AbortSignal): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  const onAbort = () => ctl.abort();
  if (signal) {
    if (signal.aborted) ctl.abort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

export async function getJson<T>(url: string, ms = 15000, signal?: AbortSignal): Promise<T> {
  const r = await fetchWithTimeout(url, {}, ms, signal);
  if (!r.ok) throw new HttpError(r.status, url);
  return r.json() as Promise<T>;
}

export const isAbort = (e: unknown) => e instanceof Error && e.name === "AbortError";
