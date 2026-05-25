/** Client-side mirror of coconut/lib/group-people-dedupe (demo contacts). */

export type DedupedGroupPerson = {
  displayName: string;
  email: string | null;
  groupId: string;
  groupName: string;
  memberId: string;
  memberCount: number;
  hasAccount?: boolean;
};

function normalizeName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}

function normalizeEmail(email: string | null | undefined): string | null {
  const e = email?.trim().toLowerCase();
  return e && e.includes("@") ? e : null;
}

type Candidate = DedupedGroupPerson & { userId: string | null };

function personScore(c: Candidate): number {
  let score = 0;
  if (c.email) score += 100;
  if (c.userId || c.hasAccount) score += 50;
  if (c.memberCount === 2) score += 10;
  return score;
}

function pickBetter(a: Candidate, b: Candidate): Candidate {
  const sa = personScore(a);
  const sb = personScore(b);
  if (sb > sa) return b;
  if (sa > sb) return a;
  return a.displayName.length >= b.displayName.length ? a : b;
}

export function dedupePeopleList<T extends DedupedGroupPerson>(
  people: T[],
): T[] {
  const buckets = new Map<string, Candidate>();

  const bucketKeyFor = (c: Candidate): string => {
    if (c.userId) return `uid:${c.userId}`;
    if (c.email) return `email:${c.email}`;
    return `name:${normalizeName(c.displayName)}`;
  };

  const findExistingBucket = (c: Candidate): string | null => {
    if (c.userId && buckets.has(`uid:${c.userId}`)) return `uid:${c.userId}`;
    if (c.email && buckets.has(`email:${c.email}`)) return `email:${c.email}`;
    const nameKey = `name:${normalizeName(c.displayName)}`;
    if (buckets.has(nameKey)) return nameKey;
    return null;
  };

  for (const p of people) {
    const raw = p as DedupedGroupPerson & { userId?: string | null };
    const candidate: Candidate = {
      ...p,
      email: normalizeEmail(p.email),
      userId: raw.userId ?? null,
    };

    const existingKey = findExistingBucket(candidate);
    if (existingKey) {
      const existing = buckets.get(existingKey)!;
      const merged = pickBetter(existing, candidate);
      buckets.delete(existingKey);
      buckets.set(bucketKeyFor(merged), merged);
      continue;
    }
    buckets.set(bucketKeyFor(candidate), candidate);
  }

  return Array.from(buckets.values()).map(({ userId: _u, ...rest }) => rest as T);
}
