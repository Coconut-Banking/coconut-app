import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { AppState, DeviceEventEmitter } from "react-native";
import { useAuth } from "@clerk/expo";
import { getRealtimeClient } from "./supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

const TABLES = ["split_transactions", "settlements", "group_members"] as const;
const DEBOUNCE_MS = 500;
const TOKEN_REFRESH_MS = 50_000;

const RealtimeSyncContext = createContext<null>(null);

export function RealtimeSyncProvider({ children }: { children: ReactNode }) {
  const { getToken } = useAuth();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tokenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSubscribed = useRef(false);

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
      const token = await getToken();
      if (token) client.realtime.setAuth(token);
    } catch {
      if (__DEV__) console.warn("[realtime-sync] token refresh failed");
    }
  };

  const subscribe = async () => {
    const client = getRealtimeClient();
    if (!client || isSubscribed.current) return;

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
      if (__DEV__) console.log("[realtime-sync] channel status:", status);
      if (status === "SUBSCRIBED") {
        isSubscribed.current = true;
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        isSubscribed.current = false;
      }
    });

    channelRef.current = channel;

    tokenTimer.current = setInterval(() => refreshAuth(), TOKEN_REFRESH_MS);
  };

  const unsubscribe = () => {
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
