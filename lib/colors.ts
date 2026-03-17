export const colors = {
  light: {
    background: "#F7FAF8",
    surface: "#FFFFFF",
    surfaceSecondary: "#F9FAFB",
    surfaceTertiary: "#F3F4F6",

    text: "#1F2937",
    textSecondary: "#374151",
    textTertiary: "#6B7280",
    textQuaternary: "#9CA3AF",

    primary: "#3D8E62",
    primaryLight: "#EEF7F2",
    primaryDark: "#2D7A52",

    border: "#E5E7EB",
    borderLight: "#F3F4F6",

    error: "#DC2626",
    errorLight: "#FEE2E2",
    warning: "#F59E0B",
    warningLight: "#FDE68A",
    success: "#059669",
    successLight: "#D1FAE5",

    // Semantic
    positive: "#059669",
    negative: "#DC2626",

    // Tab bar
    tabBar: "#FFFFFF",
    tabActive: "#3D8E62",
    tabInactive: "#9CA3AF",

    // Card
    card: "#FFFFFF",
    cardBorder: "#E5E7EB",

    // Input
    inputBackground: "#F9FAFB",
    inputBorder: "#D1D5DB",
    inputText: "#1F2937",
    inputPlaceholder: "#9CA3AF",

    // Skeleton
    skeletonBase: "#E5E7EB",
    skeletonHighlight: "#F3F4F6",

    // Modal overlay
    overlay: "rgba(0,0,0,0.5)",

    // Status bar
    statusBarStyle: "dark" as const,
  },
  dark: {
    background: "#111827",
    surface: "#1F2937",
    surfaceSecondary: "#1F2937",
    surfaceTertiary: "#374151",

    text: "#F9FAFB",
    textSecondary: "#E5E7EB",
    textTertiary: "#9CA3AF",
    textQuaternary: "#6B7280",

    primary: "#4ADE80",
    primaryLight: "#1A2E23",
    primaryDark: "#3D8E62",

    border: "#374151",
    borderLight: "#1F2937",

    error: "#F87171",
    errorLight: "#451A1A",
    warning: "#FBBF24",
    warningLight: "#451A00",
    success: "#34D399",
    successLight: "#1A2E23",

    positive: "#34D399",
    negative: "#F87171",

    tabBar: "#1F2937",
    tabActive: "#4ADE80",
    tabInactive: "#6B7280",

    card: "#1F2937",
    cardBorder: "#374151",

    inputBackground: "#374151",
    inputBorder: "#4B5563",
    inputText: "#F9FAFB",
    inputPlaceholder: "#6B7280",

    skeletonBase: "#374151",
    skeletonHighlight: "#4B5563",

    overlay: "rgba(0,0,0,0.7)",

    statusBarStyle: "light" as const,
  },
};

export type ThemeColors = Omit<typeof colors.light, "statusBarStyle"> & { statusBarStyle: "dark" | "light" };
export type ThemeMode = "auto" | "light" | "dark";
