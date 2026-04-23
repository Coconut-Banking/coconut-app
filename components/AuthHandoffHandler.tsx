"use client";

import { useEffect, useRef, useState } from "react";
import { Linking } from "react-native";
import { useSignIn } from "@clerk/expo/legacy";
/**
 * Handles coconut://auth-handoff?__clerk_ticket=X deep link from web.
 * When user signs in on web and gets redirected to the app, we exchange the ticket
 * for a session and navigate to the dashboard.
 */
export function AuthHandoffHandler() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const processedRef = useRef(false);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);

  // Only handle "url" event (app already open, receives new deep link). Cold start is handled by auth-handoff screen.
  useEffect(() => {
    const sub = Linking.addEventListener("url", ({ url }) => setPendingUrl(url));
    return () => sub.remove();
  }, []);

  // Process ticket when we have URL + Clerk loaded
  useEffect(() => {
    if (!pendingUrl || !isLoaded || !signIn || !setActive || processedRef.current) return;

    if (!pendingUrl.includes("auth-handoff")) return;

    const q = pendingUrl.includes("?") ? pendingUrl.slice(pendingUrl.indexOf("?") + 1) : "";
    const params = new URLSearchParams(q);
    const ticket = params.get("__clerk_ticket");
    if (!ticket) return;

    processedRef.current = true;
    setPendingUrl(null);

    (async () => {
      try {
        const result = await signIn.create({ strategy: "ticket", ticket } as { strategy: "ticket"; ticket: string });
        const sessionId = result?.createdSessionId;
        if (sessionId && setActive) {
          await setActive({ session: sessionId });
          await new Promise((r) => setTimeout(r, 400));
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.toLowerCase().includes("already signed in")) return;
        console.error("[AuthHandoff] ticket exchange failed:", e);
        processedRef.current = false;
      }
    })();
  }, [pendingUrl, isLoaded, signIn, setActive]);

  return null;
}
