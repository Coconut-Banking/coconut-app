import { DeviceEventEmitter } from "react-native";
import { bumpCacheGeneration, invalidateApiCache } from "./api";
import { clearAllSharedCaches } from "../hooks/useGroups";

/**
 * After any split mutation — bust RAM + disk API cache and in-memory group hooks
 * so home, activity, splits, and detail screens refetch fresh balances.
 */
export function invalidateSharedData(extraPaths?: string[]) {
  bumpCacheGeneration();
  clearAllSharedCaches();
  for (const path of extraPaths ?? []) {
    invalidateApiCache(path);
  }
  DeviceEventEmitter.emit("groups-updated");
}

export function invalidateSharedDataWithExpense(
  extraPaths?: string[],
  expensePayload?: Record<string, unknown>,
) {
  invalidateSharedData(extraPaths);
  if (expensePayload) {
    DeviceEventEmitter.emit("expense-added", expensePayload);
  }
}
