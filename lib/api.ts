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

async function getTokenWithRetry(
  getToken: (opts?: { skipCache?: boolean }) => Promise<string | null>,
  maxAttempts = 4
): Promise<string | null> {
  if (_tokenPromise) return _tokenPromise;

  _tokenPromise = (async () => {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const token = await getToken({ skipCache: i > 0 });
        if (token) return token;
      } catch (e) {
        if (__DEV__) console.warn("[api] getToken attempt", i, (e as Error)?.message);
      }
      if (i < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, 300 * (i + 1)));
      }
    }
    return null;
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

      try {
        const response = await fetch(url, { ...opts, headers, body });
        if (__DEV__) console.log(`[api] ← ${path} ${response.status}`);
        return response;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Network request failed";
        if (__DEV__) console.warn(`[api] fetch failed: ${path}`, msg);
        return new Response(
          JSON.stringify({ error: "Network request failed. Check your connection and retry." }),
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
