import React, { createContext, useContext, useCallback, useState, useRef, useEffect } from "react";
import { View, Text, StyleSheet, Animated, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { font } from "../lib/theme";
import { haptic } from "./ui";

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

const AUTO_DISMISS_MS = 2800;

function ToastBanner({ toast }: { toast: ToastState }) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 8, tension: 80 }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [translateY, opacity]);

  const dismiss = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: -120, duration: 250, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [translateY, opacity]);

  useEffect(() => {
    const timer = setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [dismiss]);

  return (
    <Animated.View
      style={[
        s.banner,
        {
          top: insets.top + 8,
          backgroundColor: BG_MAP[toast.variant],
          transform: [{ translateY }],
          opacity,
        },
      ]}
      pointerEvents="none"
    >
      <Ionicons name={ICON_MAP[toast.variant]} size={20} color={ICON_COLOR[toast.variant]} />
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
    if (variant === "success") haptic.success();
    else if (variant === "error") haptic.error();
    else haptic.light();
    setTimeout(() => setToast(null), AUTO_DISMISS_MS + 400);
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
    left: 16,
    right: 16,
    zIndex: 9999,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 12 },
      android: { elevation: 8 },
    }),
  },
  text: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: font.semibold,
    lineHeight: 19,
  },
});
