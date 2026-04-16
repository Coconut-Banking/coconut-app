/**
 * Clerk's native `useSignInWithGoogle` exchanges an ID token via `strategy: "google_one_tap"`.
 * If the Clerk instance / dashboard isn't set up for that path, the API returns
 * `form_param_value_invalid` for `google_one_tap`. Browser OAuth (`oauth_google`) is the fallback.
 */
export function clerkRejectedGoogleOneTap(e: unknown): boolean {
  const err = e as { errors?: Array<{ code?: string; longMessage?: string; message?: string }> };
  return (
    err.errors?.some((x) => {
      const blob = `${x.code ?? ""} ${x.longMessage ?? ""} ${x.message ?? ""}`;
      return (
        x.code === "form_param_value_invalid" || blob.toLowerCase().includes("google_one_tap")
      );
    }) ?? false
  );
}
