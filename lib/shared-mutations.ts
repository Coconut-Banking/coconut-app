import { DeviceEventEmitter } from "react-native";
import { bumpCacheGeneration } from "./api-cache";
import { clearAllSharedCaches } from "../hooks/useGroups";

type ApiFetch = (
  path: string,
  opts?: { method?: string; body?: object }
) => Promise<Response>;

/**
 * Wraps any Shared-tab mutation (add expense, settle, edit, delete, etc.)
 * with automatic cache invalidation + event emission on success.
 *
 * Replaces the pattern of manually calling invalidateApiCache for 3-5 paths,
 * clearMemSummaryCache, clearMemActivityCache, and DeviceEventEmitter.emit
 * scattered across every mutation call site.
 */
export async function sharedMutation(
  apiFetch: ApiFetch,
  path: string,
  opts: { method?: string; body?: object } = {},
): Promise<Response> {
  const res = await apiFetch(path, opts);
  if (res.ok) {
    bumpCacheGeneration();
    clearAllSharedCaches();
    DeviceEventEmitter.emit("groups-updated");
  }
  return res;
}

/**
 * Same as sharedMutation but also emits "expense-added" with a payload
 * for the home screen strip to react to.
 */
export async function expenseMutation(
  apiFetch: ApiFetch,
  path: string,
  opts: { method?: string; body?: object } = {},
  payload?: Record<string, unknown>,
): Promise<Response> {
  const res = await apiFetch(path, opts);
  if (res.ok) {
    bumpCacheGeneration();
    clearAllSharedCaches();
    DeviceEventEmitter.emit("groups-updated");
    DeviceEventEmitter.emit("expense-added", payload);
  }
  return res;
}
