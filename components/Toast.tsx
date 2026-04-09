import React, { createContext, useContext, useCallback, useState, useRef, useEffect } from "react";
import { Text, StyleSheet, Animated, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { font } from "../lib/theme";
import { sfx } from "../lib/sounds";

type ToastVariant = "success" | "error" | "info";

interface ToastState {
  message: string;
  variant: ToastVariant;
  key: number;
}

interface ToastContextValue {
  show: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue>({ show: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

const ICON_MAP: Record<ToastVariant, keyof typeof Ionicons.glyphMap> = {
  success: "checkmark-circle",
  error: "alert-circle",
  info: "information-circle",
};

const BG_MAP: Record<ToastVariant, string> = {
  success: "#1F2328",
  error: "#7F1D1D",
  info: "#1E3A5F",
};

const ICON_COLOR: Record<ToastVariant, string> = {
  success: "#4ADE80",
  error: "#FCA5A5",
  info: "#93C5FD",
};

const AUTO_DISMISS_MS = 3200;

function ToastBanner({ toast }: { toast: ToastState }) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(-140)).current;
  const scale = useRef(new Animated.Value(0.85)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        friction: 7,
        tension: 65,
      }),
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        friction: 5,
        tension: 100,
      }),
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
  }, [translateY, scale, opacity]);

  const dismiss = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: -140, duration: 280, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 0.9, duration: 280, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [translateY, scale, opacity]);

  useEffect(() => {
    const timer = setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [dismiss]);

  return (
    <Animated.View
      style={[
        s.banner,
        {
          top: insets.top + 10,
          backgroundColor: BG_MAP[toast.variant],
          transform: [{ translateY }, { scale }],
          opacity,
        },
      ]}
      pointerEvents="none"
    >
      <Ionicons name={ICON_MAP[toast.variant]} size={24} color={ICON_COLOR[toast.variant]} />
      <Text style={s.text} numberOfLines={2}>{toast.message}</Text>
    </Animated.View>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const keyRef = useRef(0);

  const show = useCallback((message: string, variant: ToastVariant = "success") => {
    keyRef.current += 1;
    setToast({ message, variant, key: keyRef.current });
    if (variant === "success") sfx.coin();
    else if (variant === "error") sfx.error();
    else sfx.pop();
    setTimeout(() => setToast(null), AUTO_DISMISS_MS + 500);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toast ? <ToastBanner key={toast.key} toast={toast} /> : null}
    </ToastContext.Provider>
  );
}

const s = StyleSheet.create({
  banner: {
    position: "absolute",
    left: 14,
    right: 14,
    zIndex: 9999,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderRadius: 16,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 16 },
      android: { elevation: 12 },
    }),
  },
  text: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 15.5,
    fontFamily: font.semibold,
    lineHeight: 21,
    letterSpacing: 0.1,
  },
});
