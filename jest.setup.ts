jest.mock("@clerk/expo", () => ({
  useAuth: () => ({
    getToken: jest.fn().mockResolvedValue("mock-token"),
    signOut: jest.fn(),
    isSignedIn: true,
  }),
}));

jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
  },
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
  }),
}));

jest.mock("expo-web-browser", () => ({
  openAuthSessionAsync: jest.fn(),
}));

jest.mock("@expo/vector-icons", () => {
  const { createElement } = require("react");
  const { Text } = require("react-native");
  return {
    Ionicons: (props: any) => createElement(Text, null, props.name),
  };
});
