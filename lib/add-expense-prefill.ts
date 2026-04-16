type PrefillTarget = { key: string; name: string; type: "friend" | "group" } | null;

let _current: PrefillTarget = null;

export function setExpensePrefillTarget(t: PrefillTarget) {
  _current = t;
}

export function getExpensePrefillTarget(): PrefillTarget {
  return _current;
}
