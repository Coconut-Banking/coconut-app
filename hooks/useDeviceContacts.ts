import { useState, useEffect, useCallback, useRef } from "react";

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

async function getContacts() {
  if (_Contacts) return _Contacts;
  try {
    _Contacts = await import("expo-contacts");
    return _Contacts;
  } catch {
    return null;
  }
}

export function useDeviceContacts() {
  const [contacts, setContacts] = useState<DeviceContact[]>([]);
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>("undetermined");
  const [loading, setLoading] = useState(false);
  const fetched = useRef(false);

  const loadContacts = useCallback(async () => {
    const mod = await getContacts();
    if (!mod) return;
    setLoading(true);
    try {
      const { data } = await mod.getContactsAsync({
        fields: [mod.Fields.Emails, mod.Fields.PhoneNumbers, mod.Fields.Name],
        sort: mod.SortTypes.LastName,
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
      setContacts(mapped);
    } catch {
      /* non-fatal */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (fetched.current) return;
    let cancelled = false;
    (async () => {
      try {
        const mod = await getContacts();
        if (!mod || cancelled) return;
        const available = await mod.isAvailableAsync();
        if (!available || cancelled) return;
        const { status } = await mod.getPermissionsAsync();
        if (cancelled) return;
        setPermissionStatus(status === "granted" ? "granted" : status === "denied" ? "denied" : "undetermined");
        if (status === "granted") {
          fetched.current = true;
          await loadContacts();
        }
      } catch {
        /* native module may not be available */
      }
    })();
    return () => { cancelled = true; };
  }, [loadContacts]);

  const requestAccess = useCallback(async (): Promise<boolean> => {
    try {
      const mod = await getContacts();
      if (!mod) return false;
      const available = await mod.isAvailableAsync();
      if (!available) return false;
      const { status } = await mod.requestPermissionsAsync();
      const granted = status === "granted";
      setPermissionStatus(granted ? "granted" : "denied");
      if (granted) {
        fetched.current = true;
        await loadContacts();
      }
      return granted;
    } catch {
      return false;
    }
  }, [loadContacts]);

  return { contacts, permissionStatus, requestAccess, loading };
}
