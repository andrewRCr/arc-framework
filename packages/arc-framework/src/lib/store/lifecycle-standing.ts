/** Standing work-unit holders and typed clashes over a complete lifecycle observation. */
import type { LifecycleEntry } from "./lifecycle-index.js";
import type { RecordReference } from "./identity.js";
import type { ListingDiagnostic } from "./read.js";
import { compareCompletedPlacements } from "./placement.js";

/** Live holders tied at one current-name or former-name tier. */
export interface StandingLifecycleClash {
  slug: string;
  kind: "current-name" | "former-name";
  holders: readonly RecordReference[];
}
/** Standing current names, live clashes, and names withheld by primary diagnostics. */
export interface StandingLifecycleSelection {
  entries: readonly LifecycleEntry[];
  clashes: readonly StandingLifecycleClash[];
  failClosedNames: ReadonlySet<string>;
}

/** Select standing current names without discarding any generation from the source inventory. */
export function selectStandingLifecycleEntries(entries: readonly LifecycleEntry[],
  diagnostics: readonly ListingDiagnostic[]): StandingLifecycleSelection {
  const failClosedNames = new Set(diagnostics.flatMap(diagnostic => {
    const match = /^work-item\/meta:(.+)$/u.exec(diagnostic.key);
    return match?.[1] === undefined ? [] : [match[1]];
  }));
  const standing: LifecycleEntry[] = [], clashes: StandingLifecycleClash[] = [];
  for (const [slug, holders] of groupHolders(entries)) {
    if (failClosedNames.has(slug)) continue;
    const decision = selectSlugStanding(slug, holders);
    if (decision.entry !== undefined) standing.push(decision.entry);
    if (decision.clash !== undefined) clashes.push(decision.clash);
  }
  return { entries: standing, clashes, failClosedNames };
}

function groupHolders(entries: readonly LifecycleEntry[]): Map<string, LifecycleEntry[]> {
  const groups = new Map<string, LifecycleEntry[]>();
  for (const entry of entries) for (const slug of new Set([entry.reference.owner.name, ...(entry.aliases ?? [])])) {
    const holders = groups.get(slug) ?? [];
    holders.push(entry);
    groups.set(slug, holders);
  }
  return groups;
}

function selectSlugStanding(slug: string, holders: readonly LifecycleEntry[]):
  { entry?: LifecycleEntry; clash?: StandingLifecycleClash } {
  const current = holders.filter(entry => entry.reference.owner.name === slug);
  const live = current.filter(entry => entry.location !== "completed");
  if (live.length > 1) return { clash: { slug, kind: "current-name", holders: live.map(entry => entry.reference) } };
  if (live[0] !== undefined) return { entry: live[0] };
  const former = holders.filter(entry => entry.location !== "completed" && entry.reference.owner.name !== slug);
  if (former.length > 1) return { clash: { slug, kind: "former-name", holders: former.map(entry => entry.reference) } };
  if (former.length > 0) return {};
  const entry = current.sort((left, right) => left.placement.kind === "completed" && right.placement.kind === "completed"
    ? compareCompletedPlacements(left.placement, right.placement) : 0).at(-1);
  return entry === undefined ? {} : { entry };
}
