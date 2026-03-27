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

/** Clerk has a race: getToken() can return null right after isSignedIn. Retry a few times. */
async function getTokenWithRetry(
  getToken: (opts?: { skipCache?: boolean }) => Promise<string | null>,
  maxAttempts = 8
): Promise<string | null> {
  for (let i = 0; i < maxAttempts; i++) {
    const token = await getToken({ skipCache: i > 0 });
    if (token) return token;
    if (i < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, 350 * (i + 1)));
    }
  }
  return null;
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
      // SKIP_AUTH: never wait for token, return 401 so UI shows Connect state immediately
      if (SKIP_AUTH) return unauthResponse();

      const { isLoaded: loaded, isSignedIn: signedIn, getToken: gt } = ref.current;
      console.log(`[apiFetch] ${path} loaded=${loaded} signedIn=${signedIn}`);
      if (loaded && !signedIn) return unauthResponse();

      const token = await getTokenWithRetry(gt);
      if (!token) {
        if (loaded && !signedIn) return unauthResponse();
        // Token race window: don't hit backend unauthenticated.
        return new Response(
          JSON.stringify({ error: "Session token unavailable" }),
          {
            status: 425,
            headers: {
              "Content-Type": "application/json",
              "X-Coconut-Auth": "token-missing",
            },
          }
        );
      }

      const headers: Record<string, string> = {
        ...(opts.headers as Record<string, string>),
      };
      headers["Authorization"] = `Bearer ${token}`;
      if (
        opts.body &&
        typeof opts.body === "object" &&
        !(opts.body instanceof FormData)
      ) {
        headers["Content-Type"] = "application/json";
      }
      const url = `${API_URL.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
      let body: FormData | string | undefined;
      if (opts.body instanceof FormData) {
        body = opts.body;
      } else if (opts.body && typeof opts.body === "object" && !("uri" in opts.body)) {
        body = JSON.stringify(opts.body);
      } else {
        body = undefined;
      }
      return fetch(url, { ...opts, headers, body });
    },
    [getToken, isLoaded, isSignedIn]
  );
}

export function getApiUrl() {
  return API_URL;
}
