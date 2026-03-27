import { Redirect } from "expo-router";

/**
 * Auth group index — default to sign-in so users land on the form immediately.
 * Sign-in shows the full UI even when Clerk is loading (with disabled buttons).
 */
export default function AuthIndex() {
  return <Redirect href="/(auth)/sign-in" />;
}
