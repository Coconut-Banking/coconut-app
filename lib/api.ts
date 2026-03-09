import { useCallback } from "react";
import { useAuth } from "@clerk/expo";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";

export function useApiFetch() {
  const { getToken } = useAuth();

  return useCallback(
    async (
      path: string,
      opts: Omit<RequestInit, "body"> & { body?: object | FormData } = {}
    ) => {
      const token = await getToken();
      const headers: Record<string, string> = {
        ...(opts.headers as Record<string, string>),
      };
      if (token) headers["Authorization"] = `Bearer ${token}`;
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
    [getToken]
  );
}

export function getApiUrl() {
  return API_URL;
}
