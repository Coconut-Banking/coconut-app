import { useCallback, useRef } from "react";
import { useAuth } from "@clerk/expo";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "https://coconut-lemon.vercel.app";
const SKIP_AUTH = process.env.EXPO_PUBLIC_SKIP_AUTH === "true";

function unauthResponse() {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json", "X-Coconut-Auth": "signed-out" },
  });
}

let _tokenPromise: Promise<string | null> | null = null;
let _lastGoodToken: string | null = null;

function isOfflineError(e: unknown): boolean {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return msg.includes("offline") || msg.includes("network request failed") || msg.includes("clerk_offline");
}

async function getTokenWithRetry(
  getToken: (opts?: { skipCache?: boolean }) => Promise<string | null>,
  maxAttempts = 4
): Promise<string | null> {
  if (_tokenPromise) return _tokenPromise;

  _tokenPromise = (async () => {
    // First: try the cache (no network) — works offline
    try {
      const cached = await getToken({ skipCache: false });
      if (cached) {
        _lastGoodToken = cached;
        return cached;
      }
    } catch (e) {
      if (isOfflineError(e)) {
        // Offline: return last known good token if available
        if (_lastGoodToken) {
          if (__DEV__) console.warn("[api] offline — using cached token");
          return _lastGoodToken;
        }
      }
    }

    // Then: retry with network refresh
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const token = await getToken({ skipCache: true });
        if (token) {
          _lastGoodToken = token;
          return token;
        }
      } catch (e) {
        const msg = (e instanceof Error ? e.message : String(e));
        if (__DEV__ && !isOfflineError(e)) console.warn("[api] getToken attempt", i, msg);
        if (isOfflineError(e) && _lastGoodToken) {
          if (__DEV__) console.warn("[api] offline — using cached token after retry");
          return _lastGoodToken;
        }
      }
      if (i < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, 400 * (i + 1)));
      }
    }
    return _lastGoodToken ?? null;
  })();

  try {
    return await _tokenPromise;
  } finally {
    _tokenPromise = null;
  }
}

export function useApiFetch() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const ref = useRef({ getToken, isLoaded, isSignedIn });
  ref.current = { getToken, isLoaded, isSignedIn };

  return useCallback(
    async (
      path: string,
      opts: Omit<RequestInit, "body"> & { body?: object | FormData } = {}
    ) => {
      if (SKIP_AUTH) return unauthResponse();

      const { isLoaded: loaded, isSignedIn: signedIn, getToken: gt } = ref.current;
      if (loaded && !signedIn) return unauthResponse();

      const token = await getTokenWithRetry(gt);
      if (!token) {
        if (loaded && !signedIn) return unauthResponse();
        return new Response(
          JSON.stringify({ error: "Session token unavailable" }),
          { status: 425, headers: { "Content-Type": "application/json", "X-Coconut-Auth": "token-missing" } }
        );
      }

      const headers: Record<string, string> = {
        ...(opts.headers as Record<string, string>),
        Authorization: `Bearer ${token}`,
      };
      if (opts.body && typeof opts.body === "object" && !(opts.body instanceof FormData)) {
        headers["Content-Type"] = "application/json";
      }

      const url = `${API_URL.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
      let body: FormData | string | undefined;
      if (opts.body instanceof FormData) {
        body = opts.body;
      } else if (opts.body && typeof opts.body === "object") {
        body = JSON.stringify(opts.body);
      }

      if (__DEV__) console.log(`[api] → ${(opts.method ?? "GET").toUpperCase()} ${path}`);

      const controller = new AbortController();
      const timeoutMs = path.includes("plaid/transactions") ? 45_000 : 20_000;
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, { ...opts, headers, body, signal: controller.signal });
        clearTimeout(timer);
        if (__DEV__) console.log(`[api] ← ${path} ${response.status}`);
        return response;
      } catch (e) {
        clearTimeout(timer);
        const isAbort = e instanceof DOMException && e.name === "AbortError";
        const msg = isAbort ? "Network request timed out" : (e instanceof Error ? e.message : "Network request failed");
        if (__DEV__) console.warn(`[api] fetch failed: ${path}`, msg);
        return new Response(
          JSON.stringify({ error: isAbort ? "Request timed out. Please try again." : "Network request failed. Check your connection and retry." }),
          { status: 503, statusText: msg, headers: { "Content-Type": "application/json" } }
        );
      }
    },
    []
  );
}

export function getApiUrl() {
  return API_URL;
}
