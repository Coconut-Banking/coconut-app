// Dev variant: development EAS profile OR APP_VARIANT=dev (local)
const isDev =
  process.env.EAS_BUILD_PROFILE === "development" ||
  process.env.EAS_BUILD_PROFILE === "development-simulator" ||
  process.env.APP_VARIANT === "dev";

const name = isDev ? "Coconut Dev" : "Coconut";
const bundleId = isDev ? "com.coconut.app.dev" : "com.coconut.app";
const scheme = isDev ? "coconut-dev" : "coconut";

export default {
  expo: {
    name,
    extra: {
      eas: {
        projectId: "d1b6394a-093c-413c-bf89-ac740a528dbb",
      },
      EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY:
        process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ||
        "pk_test_YWJzb2x1dGUtbGVtdXItNjguY2xlcmsuYWNjb3VudHMuZGV2JA",
      EXPO_PUBLIC_API_URL:
        process.env.EXPO_PUBLIC_API_URL || "https://coconut-lemon.vercel.app",
    },
    slug: "coconut-app",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    scheme,
    userInterfaceStyle: "automatic",
    ios: {
      supportsTablet: true,
      bundleIdentifier: bundleId,
      buildNumber: "2",
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      adaptiveIcon: {
        backgroundColor: "#EEF7F2",
        foregroundImage: "./assets/android-icon-foreground.png",
        backgroundImage: "./assets/android-icon-background.png",
      },
      package: bundleId,
      minSdkVersion: 26,
      permissions: ["INTERNET"],
    },
    plugins: [
      "expo-router",
      "@clerk/expo", // Reads EXPO_PUBLIC_CLERK_GOOGLE_IOS_URL_SCHEME from env for native Google Sign-In
      [
        "@stripe/stripe-terminal-react-native/app.plugin",
        {
          bluetoothBackgroundMode: true,
          tapToPayCheck: true,
          locationWhenInUsePermission:
            "Location access is required to accept payments.",
        },
      ],
      ["expo-build-properties", { android: { minSdkVersion: 26 } }],
    ],
    experiments: { typedRoutes: true },
  },
};
