export default {
  expo: {
    name: "Coconut",
    slug: "coconut-app",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    scheme: "coconut",
    userInterfaceStyle: "automatic",
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.coconut.app",
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
      [
        "react-native-square-in-app-payments/app.plugin.js",
        {
          cardEntryStyle: {
            statusBarColor: "#3D8E62",
            actionBarColor: "#3D8E62",
            backgroundColor: "#ffffff",
            textColorHint: "#3D8E62",
            editTextStyle: {
              accentColor: "#3D8E62",
              errorColor: "#DC2626",
              textColor: "#1F2937",
            },
            saveButtonStyle: {
              backgroundColor: "#3D8E62",
              textColor: "#ffffff",
              text: "Pay",
            },
          },
        },
      ],
      ["expo-build-properties", { android: { minSdkVersion: 24 } }],
    ],
    experiments: { typedRoutes: true },
  },
};
