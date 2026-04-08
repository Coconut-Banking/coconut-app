import { useState, useEffect, useCallback, useRef } from "react";
import { AppState, Platform } from "react-native";

export type DeviceContact = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  emails: string[];
  phones: string[];
};

type PermissionStatus = "undetermined" | "granted" | "denied";

let _Contacts: typeof import("expo-contacts") | null = null;
let _unavailable = false;

async function getContacts() {
  if (_Contacts) return _Contacts;
  if (_unavailable) return null;
  if (Platform.OS === "web") { _unavailable = true; return null; }
  try {
    const mod = await import("expo-contacts");
    const available = typeof mod.isAvailableAsync === "function"
      ? await mod.isAvailableAsync().catch(() => false)
      : true;
    if (!available) { _unavailable = true; return null; }
    _Contacts = mod;
    return _Contacts;
  } catch {
    _unavailable = true;
    return null;
  }
}

let _permStatus: PermissionStatus = "undetermined";
let _sharedContacts: DeviceContact[] = [];
let _contactsFetched = false;
const _permListeners = new Set<(s: PermissionStatus) => void>();
const _contactsListeners = new Set<(c: DeviceContact[]) => void>();

function _broadcastPerm(s: PermissionStatus) {
  if (_permStatus === s) return;
  _permStatus = s;
  _permListeners.forEach((fn) => fn(s));
}

function _broadcastContacts(c: DeviceContact[]) {
  _sharedContacts = c;
  _contactsListeners.forEach((fn) => fn(c));
}

async function _loadContactsList() {
  const mod = await getContacts();
  if (!mod) return;
  try {
    const { data } = await mod.getContactsAsync({
      fields: [mod.Fields.Emails, mod.Fields.PhoneNumbers, mod.Fields.Name],
      ...(mod.SortTypes?.LastName != null ? { sort: mod.SortTypes.LastName } : {}),
    });
    const mapped: DeviceContact[] = data
      .filter((c) => c.name)
      .map((c) => {
        const emails = (c.emails ?? []).map((e) => e.email ?? "").filter(Boolean);
        const phones = (c.phoneNumbers ?? []).map((p) => p.number ?? "").filter(Boolean);
        return {
          id: c.id ?? c.name ?? "",
          name: c.name ?? "",
          email: emails[0] ?? null,
          phone: phones[0] ?? null,
          emails,
          phones,
        };
      });
    _broadcastContacts(mapped);
  } catch { /* non-fatal */ }
}

async function _checkPermission() {
  const mod = await getContacts();
  if (!mod) return;
  const { status } = await mod.getPermissionsAsync();
  const mapped: PermissionStatus = status === "granted" ? "granted" : status === "denied" ? "denied" : "undetermined";
  _broadcastPerm(mapped);
  if (mapped === "granted" && !_contactsFetched) {
    _contactsFetched = true;
    await _loadContactsList();
  }
}

export function useDeviceContacts() {
  const [contacts, setContacts] = useState<DeviceContact[]>(_sharedContacts);
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>(_permStatus);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    _permListeners.add(setPermissionStatus);
    _contactsListeners.add(setContacts);
    setPermissionStatus(_permStatus);
    setContacts(_sharedContacts);
    return () => { _permListeners.delete(setPermissionStatus); _contactsListeners.delete(setContacts); };
  }, []);

  useEffect(() => {
    _checkPermission();
  }, []);

  // Re-check when app returns to foreground (user may have changed permission in Settings)
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") _checkPermission();
    });
    return () => sub.remove();
  }, []);

  const requestAccess = useCallback(async (): Promise<boolean> => {
    try {
      const mod = await getContacts();
      if (!mod) return false;
      setLoading(true);
      const { status } = await mod.requestPermissionsAsync();
      const granted = status === "granted";
      _broadcastPerm(granted ? "granted" : "denied");
      if (granted && !_contactsFetched) {
        _contactsFetched = true;
        await _loadContactsList();
      }
      return granted;
    } catch {
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return { contacts, permissionStatus, requestAccess, loading };
}
