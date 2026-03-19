"use client";

import { useEffect, useRef, useState } from "react";
import { View, Text, ActivityIndicator, Linking, TouchableOpacity, StyleSheet } from "react-native";
import { useAuth } from "@clerk/expo";
import { useSignIn } from "@clerk/expo/legacy";
import { useRouter, useLocalSearchParams } from "expo-router";

const STUCK_TIMEOUT_MS = 5000;
const WEB_APP_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") || "https://coconut-lemon.vercel.app";

/**
 * Handles coconut://auth-handoff?__clerk_ticket=X deep link.
 * Expo Router navigates here when the app opens via that URL.
 * We exchange the ticket for a session and redirect to the dashboard.
 */
export default function AuthHandoffScreen() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ __clerk_ticket?: string }>();
  const processedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    Linking.getInitialURL().then((u) => u && setUrl(u));
  }, []);

  // Escape hatch when stuck (Clerk not loading, or no ticket)
  useEffect(() => {
    const t = setTimeout(() => setStuck(true), STUCK_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, []);

  const ticket =
    (typeof params?.__clerk_ticket === "string" ? params.__clerk_ticket : null) ??
    (url ? (() => {
      const q = url.includes("?") ? url.slice(url.indexOf("?") + 1) : "";
      const p = new URLSearchParams(q);
      return p.get("__clerk_ticket") ?? p.get("_clerk_ticket");
    })() : null);

  useEffect(() => {
    console.log("[AuthHandoff] ticket=", !!ticket, "signIn=", !!signIn, "isLoaded=", isLoaded);
    if (!ticket || !signIn || !setActive || processedRef.current) return;

    processedRef.current = true;
    console.log("[AuthHandoff] exchanging ticket...");

    (async () => {
      try {
        const result = await signIn.create({ strategy: "ticket", ticket } as { strategy: "ticket"; ticket: string });
        const sessionId = result?.createdSessionId;
        if (sessionId && setActive) {
          await setActive({ session: sessionId });
          console.log("[AuthHandoff] session set, navigating to tabs");
          router.replace("/(tabs)");
        } else {
          setError("Session could not be established");
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.toLowerCase().includes("already signed in")) {
          router.replace("/(tabs)");
          return;
        }
        setError(msg || "Sign-in failed");
        processedRef.current = false;
      }
    })();
  }, [ticket, signIn, setActive, router]);

  // No ticket and Clerk loaded — landed here by mistake (stale route), redirect
  useEffect(() => {
    if (!isLoaded || ticket) return;
    const t = setTimeout(() => router.replace(isSignedIn === true ? "/(tabs)" : "/(auth)/sign-in"), 600);
    return () => clearTimeout(t);
  }, [isLoaded, ticket, isSignedIn, router]);

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{error}</Text>
        <Text
          style={styles.link}
          onPress={() => {
            processedRef.current = false;
            setError(null);
            router.replace("/(auth)/sign-in");
          }}
        >
          Back to sign in
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#3D8E62" />
      <Text style={styles.statusText}>Opening your account...</Text>
      {stuck && (
        <View style={styles.stuckContainer}>
          <Text style={styles.stuckText}>
            Taking too long? Check your connection. View your transactions in the browser or go back.
          </Text>
          <TouchableOpacity
            onPress={() => Linking.openURL(`${WEB_APP_URL}/app/transactions`)}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>View transactions in browser</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.replace(isSignedIn === true ? "/(tabs)" : "/(auth)/sign-in")}
            style={styles.secondaryButton}
          >
            <Text style={styles.link}>Go back</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F7FAF8", padding: 24 },
  errorText: { color: "#4B5563", textAlign: "center", marginBottom: 16 },
  link: { color: "#3D8E62", fontWeight: "500" },
  statusText: { color: "#4B5563", marginTop: 16 },
  stuckContainer: { marginTop: 24, alignItems: "center", gap: 12, maxWidth: 280 },
  stuckText: { fontSize: 14, color: "#6B7280", textAlign: "center" },
  primaryButton: { width: "100%", paddingHorizontal: 20, paddingVertical: 10, backgroundColor: "#3D8E62", borderRadius: 12, alignItems: "center" },
  primaryButtonText: { color: "#fff", fontWeight: "500" },
  secondaryButton: { paddingHorizontal: 16, paddingVertical: 8 },
});
