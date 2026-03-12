export default {
  expo: {
    name: "Coconut",
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
    scheme: "coconut",
    userInterfaceStyle: "automatic",
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.coconut.app",
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
      },
      // Tap to Pay: include only for local dev (CoconutTesting has it). EAS managed profiles don't.
      ...(process.env.EAS_BUILD
        ? {}
        : {
            entitlements: {
              "com.apple.developer.proximity-reader.payment.acceptance": true,
            },
          }),
    },
    android: {
      adaptiveIcon: {
        backgroundColor: "#EEF7F2",
        foregroundImage: "./assets/android-icon-foreground.png",
        backgroundImage: "./assets/android-icon-background.png",
      },
      package: "com.coconut.app",
      minSdkVersion: 24,
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
