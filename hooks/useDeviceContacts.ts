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
type AccessPrivileges = "all" | "limited" | "none" | null;

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
let _accessPrivileges: AccessPrivileges = null;
let _sharedContacts: DeviceContact[] = [];
let _contactsFetched = false;
const _permListeners = new Set<(s: PermissionStatus) => void>();
const _accessListeners = new Set<(a: AccessPrivileges) => void>();
const _contactsListeners = new Set<(c: DeviceContact[]) => void>();

function _broadcastPerm(s: PermissionStatus, a?: AccessPrivileges) {
  const permChanged = _permStatus !== s;
  const accessChanged = a !== undefined && _accessPrivileges !== a;
  if (permChanged) { _permStatus = s; _permListeners.forEach((fn) => fn(s)); }
  if (accessChanged) { _accessPrivileges = a!; _accessListeners.forEach((fn) => fn(a!)); }
}

function _broadcastContacts(c: DeviceContact[]) {
  _sharedContacts = c;
  _contactsListeners.forEach((fn) => fn(c));
}

let _loadingContacts = false;

async function _loadContactsList() {
  if (_loadingContacts) return;
  _loadingContacts = true;
  const mod = await getContacts();
  if (!mod) { _loadingContacts = false; return; }
  try {
    const fields = [mod.Fields.Emails, mod.Fields.PhoneNumbers, mod.Fields.Name].filter(Boolean);
    const { data } = await mod.getContactsAsync({
      fields,
      pageSize: 2000,
      pageOffset: 0,
      ...(mod.SortTypes?.LastName != null ? { sort: mod.SortTypes.LastName } : {}),
    });
    const mapped: DeviceContact[] = (data ?? [])
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
  } catch { /* non-fatal */ } finally {
    _loadingContacts = false;
  }
}

async function _checkPermission() {
  const mod = await getContacts();
  if (!mod) return;
  const result = await mod.getPermissionsAsync();
  const mapped: PermissionStatus = result.status === "granted" ? "granted" : result.status === "denied" ? "denied" : "undetermined";
  const access = (result as { accessPrivileges?: string }).accessPrivileges as AccessPrivileges ?? null;
  _broadcastPerm(mapped, access);
  if (mapped === "granted" && !_contactsFetched) {
    _contactsFetched = true;
    setTimeout(() => { _loadContactsList(); }, 600);
  }
}

export function useDeviceContacts() {
  const [contacts, setContacts] = useState<DeviceContact[]>(_sharedContacts);
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>(_permStatus);
  const [accessPrivileges, setAccessPrivileges] = useState<AccessPrivileges>(_accessPrivileges);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    _permListeners.add(setPermissionStatus);
    _accessListeners.add(setAccessPrivileges);
    _contactsListeners.add(setContacts);
    setPermissionStatus(_permStatus);
    setAccessPrivileges(_accessPrivileges);
    setContacts(_sharedContacts);
    return () => {
      _permListeners.delete(setPermissionStatus);
      _accessListeners.delete(setAccessPrivileges);
      _contactsListeners.delete(setContacts);
    };
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

  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  const requestAccess = useCallback(async (): Promise<boolean> => {
    try {
      const mod = await getContacts();
      if (!mod) return false;
      if (mountedRef.current) setLoading(true);
      const result = await mod.requestPermissionsAsync().catch(() => ({ status: "denied" as const }));
      const granted = result.status === "granted";
      const access = (result as { accessPrivileges?: string }).accessPrivileges as AccessPrivileges ?? null;
      _broadcastPerm(granted ? "granted" : "denied", access);
      return granted;
    } catch {
      return false;
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  const presentAccessPicker = useCallback(async (): Promise<"picker" | "settings" | "unavailable"> => {
    try {
      const mod = await getContacts();
      if (!mod || typeof mod.presentAccessPickerAsync !== "function") return "unavailable";
      await mod.presentAccessPickerAsync();
      _loadingContacts = false;
      await _loadContactsList();
      return "picker";
    } catch {
      return "unavailable";
    }
  }, []);

  return { contacts, permissionStatus, accessPrivileges, requestAccess, presentAccessPicker, loading };
}
