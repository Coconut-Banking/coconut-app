module.exports = {
  projects: [
    {
      displayName: "unit",
      testMatch: ["<rootDir>/lib/__tests__/**/*.test.ts"],
      transform: {
        "^.+\\.tsx?$": ["babel-jest", { presets: ["babel-preset-expo"] }],
      },
      testEnvironment: "node",
      testPathIgnorePatterns: ["/node_modules/", "/ios/", "/android/"],
    },
    {
      displayName: "components",
      preset: "jest-expo",
      testMatch: ["<rootDir>/components/__tests__/**/*.test.{ts,tsx}"],
      testPathIgnorePatterns: ["/node_modules/", "/ios/", "/android/"],
      transformIgnorePatterns: [
        "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@react-native-async-storage/async-storage)",
      ],
    },
  ],
};
