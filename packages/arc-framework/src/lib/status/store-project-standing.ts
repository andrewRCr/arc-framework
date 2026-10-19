/** Select one lifecycle entry per visible slug without losing generation identity. */
import type { LifecycleEntry } from "../store/lifecycle-index.js";
import type { ListingDiagnostic } from "../store/read.js";
import type { ProjectReadinessWarning } from "./project-view.js";

/** Standing entries and names withheld by incomplete primary-record evidence. */
export interface StandingLifecycleSelection {
  entries: readonly LifecycleEntry[];
  failClosedNames: ReadonlySet<string>;
  warnings: ProjectReadinessWarning[];
}

/** Select the visible generation for each slug and diagnose ambiguous live holders. */
export function selectStandingLifecycleEntries(
  entries: readonly LifecycleEntry[],
  diagnostics: readonly ListingDiagnostic[],
): StandingLifecycleSelection {
  const failClosedNames = new Set(diagnostics.flatMap(diagnostic => {
    const match = /^work-item\/meta:(.+)$/u.exec(diagnostic.key);
    return match?.[1] === undefined ? [] : [match[1]];
  }));
  const byName = new Map<string, LifecycleEntry[]>();
  for (const entry of entries) {
    const name = entry.reference.owner.name;
    const group = byName.get(name) ?? [];
    group.push(entry);
    byName.set(name, group);
  }
  const standing: LifecycleEntry[] = [];
  const warnings: ProjectReadinessWarning[] = [];
  const liveAliases = new Set<string>(entries.filter(entry => entry.location !== "completed").flatMap(entry => entry.aliases ?? []));
  for (const [name, holders] of byName) {
    if (failClosedNames.has(name)) continue;
    const live = holders.filter(entry => entry.location !== "completed");
    if (live.length > 1) {
      warnings.push(clashWarning(name, live));
      continue;
    }
    if (live.length === 0 && liveAliases.has(name)) continue;
    const selected = live[0] ?? [...holders].sort(compareArchive).at(-1);
    if (selected !== undefined) standing.push(selected);
  }
  return { entries: standing, failClosedNames, warnings };
}

function clashWarning(name: string, holders: readonly LifecycleEntry[]): ProjectReadinessWarning {
  const descriptions = holders.map(entry => {
    const owner = entry.reference.owner;
    const uid = owner.type === "person" ? undefined : owner.uid;
    return `UID ${uid ?? "unavailable"}, owner ${entry.fields.owner ?? "unowned"}, location ${entry.location}`;
  });
  return { code: "slug-clash", workUnit: name,
    rendered: `Slug ${name} has multiple live holders (${descriptions.join("; ")}). The view omits them. Rename one holder to repair the clash.` };
}

function compareArchive(left: LifecycleEntry, right: LifecycleEntry): number {
  if (left.placement.kind !== "completed" || right.placement.kind !== "completed") return 0;
  const quarter = left.placement.quarter.localeCompare(right.placement.quarter);
  if (quarter !== 0) return quarter;
  const leftSequence = "sequence" in left.placement ? BigInt(left.placement.sequence) : 0n;
  const rightSequence = "sequence" in right.placement ? BigInt(right.placement.sequence) : 0n;
  return leftSequence < rightSequence ? -1 : leftSequence > rightSequence ? 1 : 0;
}
