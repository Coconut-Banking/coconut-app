import { invalidateSharedData, invalidateSharedDataWithExpense } from "./invalidate-shared-data";

type ApiFetch = (
  path: string,
  opts?: { method?: string; body?: object }
) => Promise<Response>;

/**
 * Wraps any Shared-tab mutation (add expense, settle, edit, delete, etc.)
 * with automatic cache invalidation + event emission on success.
 */
export async function sharedMutation(
  apiFetch: ApiFetch,
  path: string,
  opts: { method?: string; body?: object } = {},
  extraPaths?: string[],
): Promise<Response> {
  const res = await apiFetch(path, opts);
  if (res.ok) {
    invalidateSharedData(extraPaths);
  }
  return res;
}

/** Same as sharedMutation but also emits "expense-added" for home / activity. */
export async function expenseMutation(
  apiFetch: ApiFetch,
  path: string,
  opts: { method?: string; body?: object } = {},
  payload?: Record<string, unknown>,
  extraPaths?: string[],
): Promise<Response> {
  const res = await apiFetch(path, opts);
  if (res.ok) {
    invalidateSharedDataWithExpense(extraPaths, payload);
  }
  return res;
}
