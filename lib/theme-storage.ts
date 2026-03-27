/**
 * Theme preference storage that never crashes at import time.
 * AsyncStorage throws if the native module isn't linked (wrong client, stale dev build).
 * In that case we fall back to in-memory storage so the app still runs — rebuild with
 * `npx expo run:ios` to get real persistence.
 */
import { Platform } from "react-native";

const memory = new Map<string, string>();

type KV = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

function createWebStorage(): KV {
  return {
    getItem: async (key) => {
      try {
        const ls = (globalThis as unknown as { localStorage?: Storage }).localStorage;
        if (ls) return ls.getItem(key);
      } catch {
        /* ignore */
      }
      return memory.get(key) ?? null;
    },
    setItem: async (key, value) => {
      try {
        const ls = (globalThis as unknown as { localStorage?: Storage }).localStorage;
        if (ls) {
          ls.setItem(key, value);
          return;
        }
      } catch {
        /* ignore */
      }
      memory.set(key, value);
    },
  };
}

function createMemoryStorage(): KV {
  return {
    getItem: async (key) => memory.get(key) ?? null,
    setItem: async (key, value) => {
      memory.set(key, value);
    },
  };
}

function resolveStorage(): KV {
  if (Platform.OS === "web") {
    return createWebStorage();
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- intentional lazy load; module throws if native missing
    const mod = require("@react-native-async-storage/async-storage");
    return mod.default as KV;
  } catch {
    if (__DEV__) {
      console.warn(
        "[theme-storage] AsyncStorage native module missing — using in-memory theme only. Rebuild: npx expo run:ios (dev client), do not use Expo Go for this app."
      );
    }
    return createMemoryStorage();
  }
}

const storage = resolveStorage();

export async function themeStorageGet(key: string): Promise<string | null> {
  return storage.getItem(key);
}

export async function themeStorageSet(key: string, value: string): Promise<void> {
  await storage.setItem(key, value);
}
