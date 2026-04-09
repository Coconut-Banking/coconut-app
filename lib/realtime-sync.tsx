import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { AppState, DeviceEventEmitter } from "react-native";
import { useAuth } from "@clerk/expo";
import { getRealtimeClient } from "./supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

const TABLES = ["split_transactions", "settlements", "group_members"] as const;
const DEBOUNCE_MS = 500;
const TOKEN_REFRESH_MS = 50_000;
const MAX_ERRORS = 3;
const RETRY_DELAY_MS = 30_000;

const RealtimeSyncContext = createContext<null>(null);

export function RealtimeSyncProvider({ children }: { children: ReactNode }) {
  const { getToken } = useAuth();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tokenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSubscribed = useRef(false);
  const errorCount = useRef(0);

  const emitUpdate = () => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      DeviceEventEmitter.emit("groups-updated");
    }, DEBOUNCE_MS);
  };

  const refreshAuth = async () => {
    const client = getRealtimeClient();
    if (!client) return;
    try {
      const token = await getToken({ template: "supabase" });
      if (token) {
        client.realtime.setAuth(token);
      } else if (__DEV__) {
        console.warn("[realtime-sync] getToken({ template: 'supabase' }) returned null — check Clerk JWT template");
      }
    } catch {
      if (__DEV__) console.warn("[realtime-sync] token refresh failed");
    }
  };

  const subscribe = async () => {
    const client = getRealtimeClient();
    if (!client || isSubscribed.current) return;

    if (__DEV__) console.log("[realtime-sync] subscribing…");
    errorCount.current = 0;
    await refreshAuth();

    const channel = client.channel("groups-sync");
    for (const table of TABLES) {
      channel.on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table },
        () => emitUpdate(),
      );
    }

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        isSubscribed.current = true;
        errorCount.current = 0;
        if (__DEV__) console.log("[realtime-sync] connected");
        return;
      }

      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        isSubscribed.current = false;
        errorCount.current += 1;

        if (errorCount.current === 1 && __DEV__) {
          console.warn(
            `[realtime-sync] channel ${status} — will retry ${MAX_ERRORS} times then back off`,
          );
        }

        if (errorCount.current >= MAX_ERRORS) {
          if (__DEV__) {
            console.warn(
              `[realtime-sync] ${MAX_ERRORS} consecutive errors, tearing down. ` +
                "Check: (1) supabase_realtime publication includes tables, " +
                "(2) RLS SELECT policies, (3) Clerk JWT is Supabase-compatible. " +
                `Will retry in ${RETRY_DELAY_MS / 1000}s.`,
            );
          }
          teardownChannel();
          scheduleRetry();
        }
      }
    });

    channelRef.current = channel;
    tokenTimer.current = setInterval(() => refreshAuth(), TOKEN_REFRESH_MS);
  };

  const scheduleRetry = () => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    retryTimer.current = setTimeout(() => {
      retryTimer.current = null;
      subscribe();
    }, RETRY_DELAY_MS);
  };

  const teardownChannel = () => {
    if (tokenTimer.current) {
      clearInterval(tokenTimer.current);
      tokenTimer.current = null;
    }
    if (channelRef.current) {
      const client = getRealtimeClient();
      if (client) client.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    isSubscribed.current = false;
  };

  const unsubscribe = () => {
    if (retryTimer.current) {
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }
    teardownChannel();
  };

  useEffect(() => {
    subscribe();

    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        if (!isSubscribed.current) subscribe();
        else refreshAuth();
        DeviceEventEmitter.emit("groups-updated");
      } else if (state === "background") {
        unsubscribe();
      }
    });

    return () => {
      appStateSub.remove();
      unsubscribe();
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable refs, subscribe once
  }, []);

  return (
    <RealtimeSyncContext.Provider value={null}>
      {children}
    </RealtimeSyncContext.Provider>
  );
}

export function useRealtimeSync() {
  return useContext(RealtimeSyncContext);
}
