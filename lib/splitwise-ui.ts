/** Format API `importCompletedAt` for Settings / onboarding copy. */
export function formatSplitwiseImportDate(
  iso: string | null | undefined
): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return null;
  }
}
