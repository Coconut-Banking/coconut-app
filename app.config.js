// Dev variant: EAS development profile OR APP_VARIANT=dev|development (local)
const appVariant = (process.env.APP_VARIANT ?? "").toLowerCase();
const isDev =
  process.env.EAS_BUILD_PROFILE === "development" ||
  process.env.EAS_BUILD_PROFILE === "development-simulator" ||
  appVariant === "dev" ||
  appVariant === "development";

const name = isDev ? "Coconut Dev" : "Coconut";
const bundleId = isDev ? "com.coconut.app.dev" : "com.coconut.app";
const scheme = isDev ? "coconut-dev" : "coconut";

/**
 * Tap to Pay on iPhone requires Apple to attach
 * `com.apple.developer.proximity-reader.payment.acceptance` to your **provisioning profile**.
 * EAS / App Store profiles often do NOT include it until Tap to Pay is fully enabled for your App ID,
 * which makes the build fail with "Entitlement ... not found and could not be included in profile".
 *
 * Set ENABLE_TAP_TO_PAY_IOS=true in EAS env (or local .env) only when your profile includes that entitlement.
 * @see docs/TAP_TO_PAY_BUILD.md
 */
const ENABLE_TAP_TO_PAY_IOS =
  process.env.ENABLE_TAP_TO_PAY_IOS === "true" ||
  process.env.EXPO_PUBLIC_ENABLE_TAP_TO_PAY_IOS === "true";

export default {
  expo: {
    name,
    extra: {
      eas: {
        projectId: "d1b6394a-093c-413c-bf89-ac740a528dbb",
      },
      EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY:
        process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
      EXPO_PUBLIC_API_URL:
        process.env.EXPO_PUBLIC_API_URL || "https://coconut-app.dev",
      EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID:
        process.env.EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID ||
        "986367405156-5svjgdfn9oorkkconv9s2kmf66de836t.apps.googleusercontent.com",
      EXPO_PUBLIC_CLERK_GOOGLE_IOS_CLIENT_ID:
        process.env.EXPO_PUBLIC_CLERK_GOOGLE_IOS_CLIENT_ID ||
        "986367405156-nhpon6mqrm7s093bbe1lag677ncnbpmi.apps.googleusercontent.com",
      EXPO_PUBLIC_CLERK_GOOGLE_IOS_URL_SCHEME:
        process.env.EXPO_PUBLIC_CLERK_GOOGLE_IOS_URL_SCHEME ||
        "com.googleusercontent.apps.986367405156-nhpon6mqrm7s093bbe1lag677ncnbpmi",
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
        NSContactsUsageDescription:
          "Coconut uses your contacts to help you quickly add friends to split expenses with.",
        NSFaceIDUsageDescription:
          "Coconut uses Face ID to securely unlock the app and protect your financial data.",
      },
      ...(ENABLE_TAP_TO_PAY_IOS
        ? {
            entitlements: {
              "com.apple.developer.proximity-reader.payment.acceptance": true,
            },
          }
        : {}),
    },
    android: {
      adaptiveIcon: {
        backgroundColor: "#F5F3F2",
        foregroundImage: "./assets/android-icon-foreground.png",
        backgroundImage: "./assets/android-icon-background.png",
      },
      package: bundleId,
      minSdkVersion: 26,
      permissions: ["INTERNET", "READ_CONTACTS"],
    },
    plugins: [
      "expo-router",
      "@clerk/expo", // Reads EXPO_PUBLIC_CLERK_GOOGLE_IOS_URL_SCHEME from env for native Google Sign-In
      [
        "@stripe/stripe-terminal-react-native/app.plugin",
        {
          bluetoothBackgroundMode: true,
          tapToPayCheck: ENABLE_TAP_TO_PAY_IOS,
          locationWhenInUsePermission:
            "Location access is required to accept payments.",
        },
      ],
      [
        "expo-contacts",
        {
          contactsPermission:
            "Coconut uses your contacts to help you quickly add friends to split expenses with.",
        },
      ],
      ["expo-build-properties", { android: { minSdkVersion: 26 } }],
    ],
    experiments: { typedRoutes: true },
  },
};
